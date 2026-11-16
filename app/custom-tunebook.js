/* Gestionnaire Edit Set Lists : création, renommage, édition, tri numéroté et simulation .abct.
   Compatible avec les modes http(s)://, serveur local et file://. */
(function () {
    "use strict";

    let initialized = false;
    let editingDbk = null;
    let editingTunes = [];
    let selectedTuneIdx = -1;
    let opQueue = Promise.resolve();

    const ui = {};

    function getBridge() {
        return window.__rsBridge || null;
    }

    function enqueueOp(fn) {
        opQueue = opQueue.then(fn, fn).catch(function (err) {
            console.error("Set list operation error:", err);
        });
        return opQueue;
    }

    function todayStr() {
        return new Date().toLocaleDateString("en-GB");
    }

    function buildInitials(name) {
        const cleaned = String(name || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9\s]/g, " ")
            .trim();
        if (!cleaned) return "SL";
        const parts = cleaned.split(/\s+/).filter(Boolean);
        return parts.map(function (w) { return w.charAt(0).toUpperCase(); }).join("").slice(0, 2) || "SL";
    }

    function isLocalSetListTb(tb) {
        return !!(tb && tb.setlist === true && tb.source === "" && String(tb.dbk || "").startsWith("f:"));
    }

    function stripNumberPrefix(title) {
        const raw = String(title || "").trim();
        const stripped = raw.replace(/^\d+\.\s+/, "").trim();
        return stripped || raw;
    }

    function normalizeSearch(text) {
        const bridge = getBridge();
        if (bridge && typeof bridge.normalizeSearch === "function") {
            return bridge.normalizeSearch(String(text || ""));
        }
        return String(text || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]/g, "")
            .toLowerCase();
    }

    function compareTitles(a, b) {
        return String(a || "").localeCompare(String(b || ""), "en", {
            sensitivity: "base",
            numeric: true
        });
    }

    function normalizeSingleTuneAbc(rawAbc, tuneNum, numberedTitle) {
        let text = String(rawAbc || "").replace(/\r\n?/g, "\n");
        text = text.replace(/^(?:\s*%@[^\n]*\n)+/, "").trim();
        if (!/^X:/m.test(text)) {
            text = "X:" + tuneNum + "\n" + text;
        } else {
            text = text.replace(/^X:.*$/m, "X:" + tuneNum);
        }
        if (/^T:/m.test(text)) {
            text = text.replace(/^T:.*$/m, "T:" + numberedTitle);
        } else {
            text = text.replace(/^(X:[^\n]*)/m, "$1\nT:" + numberedTitle);
        }
        return text;
    }

    function buildSimulatedAbct(setListName, tunes) {
        const header = [
            "%@ title: " + setListName,
            "%@ author: -",
            "%@ lastupdate: " + todayStr(),
            "%@ iconcolor: #bbbbbb"
        ].join("\n");
        if (!tunes.length) {
            return header + "\n";
        }
        const blocks = tunes.map(function (item, idx) {
            const num = idx + 1;
            const numberedTitle = num + ". " + item.baseTitle;
            const normalizedAbc = normalizeSingleTuneAbc(item.abc, num, numberedTitle);
            item.abc = normalizedAbc;
            return normalizedAbc;
        });
        return header + "\n\n" + blocks.join("\n\n") + "\n";
    }

    function collectDom() {
        ui.menuItem = document.getElementById("menuEditSetLists");
        ui.navPage = document.getElementById("navSetLists");
        ui.backBtn = document.getElementById("setListsToTuneList");
        ui.newNameInput = document.getElementById("newSetListName");
        ui.newBtn = document.getElementById("newSetListBtn");
        ui.setListSelect = document.getElementById("setListSelect");
        ui.deleteBtn = document.getElementById("deleteSetListBtn");
        ui.editor = document.getElementById("setListEditor");
        ui.editNameInput = document.getElementById("editSetListName");
        ui.tuneSearch = document.getElementById("setListTuneSearch");
        ui.tbFilter = document.getElementById("setListTbFilter");
        ui.nrOfTunes = document.getElementById("setListNrOfTunes");
        ui.searchResults = document.getElementById("setListSearchResults");
        ui.moveUpBtn = document.getElementById("setListMoveUpBtn");
        ui.moveDownBtn = document.getElementById("setListMoveDownBtn");
        ui.deleteTuneBtn = document.getElementById("setListDeleteTuneBtn");
        ui.setListTunes = document.getElementById("setListTunes");

        return Boolean(
            ui.menuItem &&
            ui.navPage &&
            ui.newNameInput &&
            ui.newBtn &&
            ui.setListSelect &&
            ui.deleteBtn &&
            ui.editor &&
            ui.editNameInput &&
            ui.tuneSearch &&
            ui.tbFilter &&
            ui.searchResults &&
            ui.moveUpBtn &&
            ui.moveDownBtn &&
            ui.deleteTuneBtn &&
            ui.setListTunes
        );
    }

    function refreshSetListDropdown(preferredDbk) {
        const bridge = getBridge();
        if (!bridge || !ui.setListSelect) return;

        const prevVal = preferredDbk !== undefined ? preferredDbk : ui.setListSelect.value;
        const setLists = bridge.getTunebooks().filter(isLocalSetListTb);

        ui.setListSelect.innerHTML = "";
        if (setLists.length === 0) {
            const emptyOpt = document.createElement("option");
            emptyOpt.value = "";
            emptyOpt.disabled = true;
            emptyOpt.selected = true;
            emptyOpt.textContent = "(No set lists)";
            ui.setListSelect.appendChild(emptyOpt);
            ui.deleteBtn.disabled = true;
            return;
        }

        let matched = false;
        setLists.forEach(function (tb) {
            const opt = document.createElement("option");
            opt.value = tb.dbk;
            opt.textContent = tb.name;
            if (prevVal && tb.dbk === prevVal) {
                opt.selected = true;
                matched = true;
            }
            ui.setListSelect.appendChild(opt);
        });

        if (!matched && ui.setListSelect.options.length > 0) {
            ui.setListSelect.options[0].selected = true;
        }
        ui.deleteBtn.disabled = false;
    }

    function refreshTbFilter() {
        const bridge = getBridge();
        if (!bridge || !ui.tbFilter) return;

        const prevVal = ui.tbFilter.value || "all";
        while (ui.tbFilter.options.length > 4) {
            ui.tbFilter.remove(4);
        }

        const tbList = bridge.getTunebooks();
        for (let i = 0; i < tbList.length; i++) {
            const opt = document.createElement("option");
            opt.value = String(i);
            let label = String(tbList[i].name || "");
            if (label.length > 20) {
                label = label.slice(0, 27) + "...";
            }
            opt.textContent = label;
            ui.tbFilter.appendChild(opt);
        }

        const hasPrev = Array.from(ui.tbFilter.options).some(function (o) {
            return !o.disabled && o.value === prevVal;
        });
        ui.tbFilter.value = hasPrev ? prevVal : "all";
    }

    function renderSearchResults() {
        const bridge = getBridge();
        if (!bridge || !ui.searchResults || !ui.tbFilter) return;

        const index = bridge.getIndex();
        const tbList = bridge.getTunebooks();
        const filterVal = ui.tbFilter.value || "all";
        const rawQuery = ui.tuneSearch ? ui.tuneSearch.value : "";
        const queryNorm = normalizeSearch(rawQuery);
        const useLyrics = rawQuery.trim().length > 10 && queryNorm !== "";

        ui.searchResults.innerHTML = "";
        if (!index.length) {
            if (ui.nrOfTunes) ui.nrOfTunes.textContent = "(0)";
            const empty = document.createElement("div");
            empty.className = "rs-setlist-empty";
            empty.textContent = "No tunes loaded.";
            ui.searchResults.appendChild(empty);
            return;
        }

        const items = [];
        if (filterVal === "last") {
            const lastViewed = typeof bridge.getLastViewed === "function" ? bridge.getLastViewed() : [];
            lastViewed.forEach(function (title) {
                const hit = index.find(function (e) { return e.title === title; });
                if (hit) items.push(hit);
            });
            if (ui.nrOfTunes) ui.nrOfTunes.textContent = " (" + items.length + ")";
        } else if (filterVal === "fav") {
            const settings = typeof bridge.getUserSettings === "function" ? bridge.getUserSettings() : [];
            const favTitles = new Set(
                settings.filter(function (s) { return s && s.fav; }).map(function (s) { return s.title; })
            );
            index.forEach(function (e) {
                if (favTitles.has(e.title)) items.push(e);
            });
            items.sort(function (a, b) { return compareTitles(a.title, b.title); });
            if (ui.nrOfTunes) {
                const favCount = typeof bridge.getFavoritesCount === "function" ? bridge.getFavoritesCount() : items.length;
                ui.nrOfTunes.textContent = " (" + favCount + ")";
            }
        } else if (filterVal === "all") {
            index.forEach(function (e) { items.push(e); });
            items.sort(function (a, b) { return compareTitles(a.title, b.title); });
            if (ui.nrOfTunes) ui.nrOfTunes.textContent = " (" + items.length + ")";
        } else {
            const tb = tbList[Number(filterVal)];
            const tbDbk = tb ? tb.dbk : null;
            index.forEach(function (e) {
                if (e.tb === tbDbk) items.push(e);
            });
            items.sort(function (a, b) { return compareTitles(a.title, b.title); });
            if (ui.nrOfTunes) ui.nrOfTunes.textContent = " (" + items.length + ")";
        }

        const frag = document.createDocumentFragment();
        let shown = 0;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const title = String(item.title || "");
            const composer = String(item.composer || "").trim();
            if (queryNorm !== "" && !normalizeSearch(title).includes(queryNorm) && !normalizeSearch(composer).includes(queryNorm) && !(useLyrics && window.rsMatchLyricsCached && window.rsMatchLyricsCached(item.id, queryNorm))) {
                continue;
            }
            const a = document.createElement("a");
            a.href = "#";
            a.className = "rs-setlist-item rs-setlist-result-item";
            a.dataset.id = item.id;
            a.textContent = composer ? title + " — " + composer : title;
            frag.appendChild(a);
            shown++;
        }

        if (shown === 0) {
            const empty = document.createElement("div");
            empty.className = "rs-setlist-empty";
            empty.textContent = "No matching tunes.";
            ui.searchResults.appendChild(empty);
        } else {
            ui.searchResults.appendChild(frag);
        }
        if (window.rsSearchLyricsAsync) {
            window.rsSearchLyricsAsync(useLyrics ? items.map(function (it) { return it.id; }) : null, queryNorm, renderSearchResults, "setlist");
        }
    }

    function renderSetListTunes() {
        if (!ui.setListTunes) return;
        ui.setListTunes.innerHTML = "";

        if (!editingTunes.length) {
            const empty = document.createElement("div");
            empty.className = "rs-setlist-empty";
            empty.textContent = "No tunes in this set list.";
            ui.setListTunes.appendChild(empty);
            return;
        }

        const frag = document.createDocumentFragment();
        let selectedEl = null;
        for (let i = 0; i < editingTunes.length; i++) {
            const item = editingTunes[i];
            const displayTitle = (i + 1) + ". " + item.baseTitle;
            const a = document.createElement("a");
            a.href = "#";
            a.className = "rs-setlist-item rs-setlist-tune-item";
            if (i === selectedTuneIdx) {
                a.classList.add("rs-setlist-item-selected");
                selectedEl = a;
            }
            a.dataset.idx = String(i);
            a.textContent = displayTitle;
            frag.appendChild(a);
        }
        ui.setListTunes.appendChild(frag);
        if (selectedEl) {
            selectedEl.scrollIntoView({ block: "nearest" });
        }
    }

    function closeEditor() {
        editingDbk = null;
        editingTunes = [];
        selectedTuneIdx = -1;
        if (ui.editor) ui.editor.style.display = "none";
        if (ui.editNameInput) ui.editNameInput.value = "";
        if (ui.setListTunes) ui.setListTunes.innerHTML = "";
    }

    async function persistEditingSetList() {
        const bridge = getBridge();
        if (!bridge || !editingDbk) return;

        const tbList = bridge.getTunebooks();
        const tb = tbList.find(function (t) { return t.dbk === editingDbk; });
        if (!tb) return;

        const abctContent = buildSimulatedAbct(tb.name, editingTunes);
        const records = editingTunes.length ? await bridge.encryptAbcTunebook(abctContent) : [];

        tb.lastupdate = todayStr();
        localStorage.setItem("RealSheetTb", JSON.stringify(tbList));

        await bridge.saveTunebookRecords(editingDbk, records);
        await bridge.reloadIndex();

        const lastId = localStorage.getItem("RealSheetLastTitleNum") || "";
        let needRedraw = false;
        if (lastId.startsWith(editingDbk + "|")) {
            const stillPresent = bridge.getIndex().some(function (t) { return t.id === lastId; });
            if (!stillPresent) {
                const firstOfTb = bridge.getIndex().find(function (t) { return t.tb === editingDbk; });
                localStorage.setItem("RealSheetLastTitleNum", firstOfTb ? firstOfTb.id : "-1");
                needRedraw = true;
            }
        }

        bridge.renderManageList();
        bridge.renderTbFilter();
        bridge.renderTuneList();
        refreshTbFilter();
        renderSearchResults();
        renderSetListTunes();
        if (needRedraw) {
            await bridge.redrawSheet();
        }
    }

    function openEditorForDbk(dbk) {
        return enqueueOp(async function () {
            const bridge = getBridge();
            if (!bridge || !dbk) return;

            const tb = bridge.getTunebooks().find(function (t) { return t.dbk === dbk; });
            if (!tb) {
                closeEditor();
                return;
            }

            editingDbk = dbk;
            selectedTuneIdx = -1;
            ui.editNameInput.value = tb.name;

            const tbTunes = bridge.getIndex()
                .filter(function (t) { return t.tb === dbk; })
                .sort(function (a, b) { return compareTitles(a.title, b.title); });

            const loaded = [];
            for (let i = 0; i < tbTunes.length; i++) {
                const entry = tbTunes[i];
                const abcText = await bridge.decryptTune(entry.id);
                loaded.push({
                    baseTitle: stripNumberPrefix(entry.title),
                    composer: entry.composer || "",
                    abc: abcText
                });
            }

            editingTunes = loaded;
            ui.editor.style.display = "block";
            refreshTbFilter();
            renderSearchResults();
            renderSetListTunes();
        });
    }

    function handleCreateSetList() {
        return enqueueOp(async function () {
            const bridge = getBridge();
            if (!bridge) return;

            const name = ui.newNameInput.value.trim();
            if (!name) {
                window.alert("Please enter a set list name.");
                ui.newNameInput.focus();
                return;
            }

            const tbList = bridge.getTunebooks();
            const targetDbk = "f:" + name;
            const existingIdx = tbList.findIndex(function (tb) {
                return tb.dbk === targetDbk || (isLocalSetListTb(tb) && String(tb.name || "").trim().toLowerCase() === name.toLowerCase());
            });

            if (existingIdx !== -1) {
                const existing = tbList[existingIdx];
                if (!window.confirm('"' + existing.name + '" already exists. Replace it?')) {
                    return;
                }
                if (existing.dbk && existing.dbk !== targetDbk) {
                    await bridge.deleteTunebookRecords(existing.dbk);
                }
            }

            await bridge.saveTunebookRecords(targetDbk, []);

            const metaObj = {
                name: name,
                id: Math.floor(Math.random() * 1e7),
                source: "",
                type: "t",
                info: "",
                initials: buildInitials(name),
                author: "-",
                lastupdate: todayStr(),
                iconcolor: "#bbbbbb",
                setlist: true,
                dbk: targetDbk
            };

            if (existingIdx !== -1) {
                tbList[existingIdx] = metaObj;
            } else {
                tbList.push(metaObj);
            }
            localStorage.setItem("RealSheetTb", JSON.stringify(tbList));

            await bridge.reloadIndex();
            bridge.renderManageList();
            bridge.renderTbFilter();
            bridge.renderTuneList();

            ui.newNameInput.value = "";
            editingDbk = targetDbk;
            editingTunes = [];
            selectedTuneIdx = -1;
            ui.editNameInput.value = name;
            ui.editor.style.display = "block";

            refreshSetListDropdown(targetDbk);
            refreshTbFilter();
            renderSearchResults();
            renderSetListTunes();
        });
    }

    function handleDeleteSetList() {
        return enqueueOp(async function () {
            const bridge = getBridge();
            if (!bridge || !ui.setListSelect) return;

            const dbk = ui.setListSelect.value;
            if (!dbk) return;

            const tbList = bridge.getTunebooks();
            const idx = tbList.findIndex(function (tb) { return tb.dbk === dbk; });
            if (idx === -1) return;

            const name = tbList[idx].name;
            if (!window.confirm('Delete "' + name + '"?')) return;

            tbList.splice(idx, 1);
            localStorage.setItem("RealSheetTb", JSON.stringify(tbList));

            const lastId = localStorage.getItem("RealSheetLastTitleNum") || "";
            const deletedCurrentSheet = lastId.startsWith(dbk + "|");
            if (deletedCurrentSheet) {
                localStorage.setItem("RealSheetLastTitleNum", "-1");
            }

            await bridge.deleteTunebookRecords(dbk);
            await bridge.reloadIndex();

            if (editingDbk === dbk) {
                closeEditor();
            }

            bridge.renderManageList();
            bridge.renderTbFilter();
            bridge.renderTuneList();
            refreshSetListDropdown();
            refreshTbFilter();
            renderSearchResults();
            if (deletedCurrentSheet) {
                await bridge.redrawSheet();
            }
        });
    }

    function handleRenameSetList() {
        return enqueueOp(async function () {
            const bridge = getBridge();
            if (!bridge || !editingDbk) return;

            const tbList = bridge.getTunebooks();
            const idx = tbList.findIndex(function (tb) { return tb.dbk === editingDbk; });
            if (idx === -1) return;

            const tb = tbList[idx];
            const newName = ui.editNameInput.value.trim();
            if (!newName) {
                ui.editNameInput.value = tb.name;
                return;
            }
            if (newName === tb.name) return;

            const newDbk = "f:" + newName;
            const conflict = tbList.some(function (other, otherIdx) {
                if (otherIdx === idx) return false;
                return other.dbk === newDbk || (isLocalSetListTb(other) && String(other.name || "").trim().toLowerCase() === newName.toLowerCase());
            });
            if (conflict) {
                window.alert('A set list or local tunebook named "' + newName + '" already exists.');
                ui.editNameInput.value = tb.name;
                return;
            }

            const oldDbk = editingDbk;
            const lastId = localStorage.getItem("RealSheetLastTitleNum") || "";
            if (lastId.startsWith(oldDbk + "|")) {
                localStorage.setItem("RealSheetLastTitleNum", newDbk + "|" + lastId.slice(oldDbk.length + 1));
            }

            tb.name = newName;
            tb.initials = buildInitials(newName);
            tb.lastupdate = todayStr();
            tb.dbk = newDbk;
            localStorage.setItem("RealSheetTb", JSON.stringify(tbList));

            editingDbk = newDbk;
            await bridge.deleteTunebookRecords(oldDbk);
            await persistEditingSetList();
            refreshSetListDropdown(newDbk);
        });
    }

    function handleAddTuneById(tuneId) {
        return enqueueOp(async function () {
            const bridge = getBridge();
            if (!bridge || !editingDbk || !tuneId) return;

            const entry = bridge.getIndex().find(function (t) { return t.id === tuneId; });
            if (!entry) return;

            const sourceTb = bridge.getTunebooks().find(function (tb) { return tb.dbk === entry.tb; });
            const fromSetList = isLocalSetListTb(sourceTb);
            const baseTitle = fromSetList ? stripNumberPrefix(entry.title) : String(entry.title || "").trim();

            const abcText = await bridge.decryptTune(entry.id);
            editingTunes.push({
                baseTitle: baseTitle,
                composer: entry.composer || "",
                abc: abcText
            });

            renderSetListTunes();
            if (ui.setListTunes) {
                ui.setListTunes.scrollTop = ui.setListTunes.scrollHeight;
            }
            await persistEditingSetList();
        });
    }

    function handleMoveSelectedTune(delta) {
        return enqueueOp(async function () {
            if (!editingDbk) return;
            const targetIdx = selectedTuneIdx + delta;
            if (selectedTuneIdx < 0 || selectedTuneIdx >= editingTunes.length) return;
            if (targetIdx < 0 || targetIdx >= editingTunes.length) return;

            const moved = editingTunes[selectedTuneIdx];
            editingTunes[selectedTuneIdx] = editingTunes[targetIdx];
            editingTunes[targetIdx] = moved;
            selectedTuneIdx = targetIdx;

            renderSetListTunes();
            await persistEditingSetList();
        });
    }

    function handleDeleteSelectedTune() {
        return enqueueOp(async function () {
            if (!editingDbk) return;
            if (selectedTuneIdx < 0 || selectedTuneIdx >= editingTunes.length) return;

            editingTunes.splice(selectedTuneIdx, 1);
            selectedTuneIdx = -1;

            renderSetListTunes();
            await persistEditingSetList();
        });
    }

    function openSetListsPage() {
        const bridge = getBridge();
        if (!bridge) return;
        refreshSetListDropdown(editingDbk || undefined);
        refreshTbFilter();
        if (editingDbk && !bridge.getTunebooks().some(function (t) { return t.dbk === editingDbk; })) {
            closeEditor();
        }
        if (editingDbk) {
            renderSearchResults();
            renderSetListTunes();
        } else if (ui.setListSelect.value) {
            openEditorForDbk(ui.setListSelect.value);
        }
        bridge.showNavPage("setlists");
    }


    /* ---- Export .abct d'un tunebook (icône share90.png dans la liste Edit tunebooks) ---- */

    function safeFileName(name) {
        const cleaned = String(name || "")
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);
        return cleaned || "tunebook";
    }

    function xNumber(abc) {
        const m = /^X:\s*(\d+)/m.exec(abc);
        return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    }

    async function buildTunebookAbct(tb) {
        const bridge = getBridge();
        const entries = bridge.getIndex().filter(function (t) { return t.tb === tb.dbk; });
        const tunes = [];
        for (let i = 0; i < entries.length; i++) {
            const raw = await bridge.decryptTune(entries[i].id);
            const abc = String(raw || "")
                .replace(/\r\n?/g, "\n")
                .replace(/^(?:\s*%@[^\n]*\n)+/, "")
                .trim();
            if (abc) tunes.push({ abc: abc, title: entries[i].title || "" });
        }
        tunes.sort(function (a, b) {
            const d = xNumber(a.abc) - xNumber(b.abc);
            return d !== 0 ? d : compareTitles(a.title, b.title);
        });
        const header = [
            "%@ title: " + (tb.name || ""),
            "%@ author: " + (tb.author || "-"),
            "%@ lastupdate: " + (tb.lastupdate || todayStr()),
            "%@ iconcolor: " + (tb.iconcolor || "#bbbbbb")
        ].join("\n");
        return tunes.length
            ? header + "\n\n" + tunes.map(function (t) { return t.abc; }).join("\n\n") + "\n"
            : header + "\n";
    }

    function downloadText(fileName, text) {
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);
    }

    function isAndroid() {
        return /Android/i.test(navigator.userAgent || "");
    }

    function exportTunebookAbct(tbIndex) {
        /* Sous Android, le téléchargement part sans retour visible : on demande confirmation
           avant (de façon synchrone, dans le geste utilisateur, avant tout travail asynchrone). */
        if (isAndroid()) {
            const tbPreview = getBridge() && getBridge().getTunebooks()[tbIndex];
            if (!tbPreview) return;
            const fileName = safeFileName(tbPreview.name) + ".abct";
            if (!window.confirm('Download \"' + fileName + '\"?')) return;
        }
        return enqueueOp(async function () {
            const bridge = getBridge();
            if (!bridge) return;
            const tb = bridge.getTunebooks()[tbIndex];
            if (!tb) return;
            const text = await buildTunebookAbct(tb);
            downloadText(safeFileName(tb.name) + ".abct", text);
        });
    }

    function decorateTunebookList() {
        const listEl = document.querySelector(".tuneBookList");
        if (!listEl) return;
        const items = listEl.children;
        for (let i = 0; i < items.length; i++) {
            const li = items[i];
            if (li.tagName !== "LI" || li.querySelector(".tuneBookListShare")) continue;
            const img = document.createElement("img");
            img.className = "tuneBookListShare";
            img.src = "img/share90.png";
            img.title = "Export .abct";
            img.alt = "Export .abct";
            img.addEventListener("click", function (e) {
                e.stopPropagation();
                const idx = Array.prototype.indexOf.call(listEl.children, li);
                if (idx >= 0) exportTunebookAbct(idx);
            });
            const trash = li.querySelector('img[src*="trash"]');
            if (trash) {
                li.insertBefore(img, trash);
            } else {
                li.appendChild(img);
            }
        }
    }

    function bindEvents() {
        ui.menuItem.addEventListener("click", openSetListsPage);

        if (ui.backBtn) {
            ui.backBtn.addEventListener("click", function () {
                const bridge = getBridge();
                if (bridge) bridge.showNavPage("tunelist");
            });
        }

        ui.newBtn.addEventListener("click", handleCreateSetList);
        ui.newNameInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                handleCreateSetList();
            }
        });

        ui.setListSelect.addEventListener("change", function () {
            const dbk = ui.setListSelect.value;
            if (dbk) openEditorForDbk(dbk);
        });

        ui.deleteBtn.addEventListener("click", handleDeleteSetList);

        ["fileInput", "setlistFileInput"].forEach(function (id) {
            const input = document.getElementById(id);
            if (input) input.addEventListener("change", closeEditor);
        });

        ui.editNameInput.addEventListener("change", handleRenameSetList);
        ui.editNameInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                ui.editNameInput.blur();
            }
        });

        ui.tuneSearch.addEventListener("input", renderSearchResults);
        ui.tuneSearch.addEventListener("click", function (e) {
            const rect = ui.tuneSearch.getBoundingClientRect();
            if (e.clientX > rect.right - 24 && ui.tuneSearch.value !== "") {
                ui.tuneSearch.value = "";
                renderSearchResults();
                e.preventDefault();
            }
        });
        ui.tbFilter.addEventListener("change", renderSearchResults);

        ui.searchResults.addEventListener("click", function (e) {
            const link = e.target.closest("a.rs-setlist-result-item");
            if (!link) return;
            e.preventDefault();
            handleAddTuneById(link.dataset.id);
        });

        ui.setListTunes.addEventListener("click", function (e) {
            const link = e.target.closest("a.rs-setlist-tune-item");
            if (!link) return;
            e.preventDefault();
            const idx = Number(link.dataset.idx);
            if (!Number.isInteger(idx)) return;
            selectedTuneIdx = (selectedTuneIdx === idx) ? -1 : idx;
            renderSetListTunes();
        });

        ui.moveUpBtn.addEventListener("click", function () {
            handleMoveSelectedTune(-1);
        });
        ui.moveDownBtn.addEventListener("click", function () {
            handleMoveSelectedTune(1);
        });
        ui.deleteTuneBtn.addEventListener("click", handleDeleteSelectedTune);

        const syncFromExternal = function () {
            const bridge = getBridge();
            if (!bridge) return;
            decorateTunebookList();
            if (editingDbk && !bridge.getTunebooks().some(function (t) { return t.dbk === editingDbk; })) {
                closeEditor();
            }
            refreshSetListDropdown(editingDbk || undefined);
            refreshTbFilter();
            if (editingDbk) {
                renderSearchResults();
            }
        };

        const tbListEl = document.querySelector(".tuneBookList");
        if (tbListEl) {
            new MutationObserver(syncFromExternal).observe(tbListEl, { childList: true });
        }
        const noTuneListInfo = document.getElementById("noTuneListInfo");
        if (noTuneListInfo) {
            new MutationObserver(syncFromExternal).observe(noTuneListInfo, { childList: true });
        }
    }

    window.rsInitCustomTunebook = function () {
        if (initialized) return;
        if (!collectDom()) return;
        initialized = true;
        bindEvents();
        refreshSetListDropdown();
        refreshTbFilter();
        decorateTunebookList();
    };
})();

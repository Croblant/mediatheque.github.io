/* Éditeur ABC intégré : édition en direct, suivi visuel du curseur et sauvegarde dans le tunebook local "#Edit Tunes".
   Compatible http(s)://, serveur local et file://. */
(function () {
    "use strict";

    var EDIT_TB_NAME = "#Edit Tunes";
    var EDIT_TB_DBK = "f:#Edit Tunes";
    var ED_PREFIX = "#Ed - ";

    var editDock = null;
    var textarea = null;
    var btnSave = null, btnTempo = null;
    var btnCancel = null;
    var savedPaperStyle = null; /* styles inline de #paperframe avant le mode édition (marginTop posé par main.js au démarrage) */
    var btnDelete = null;
    var editBtn = null;

    var editingOriginalId = null;
    var editingBaseTitle = "";
    var editingEdTitle = "";
    var editingLiveAbc = null;
    var renderTimer = null;
    var topExtra = 0;             /* espace ajouté au-dessus de la partition pour pouvoir centrer les premières notes */
    var renderInFlight = false;   /* redessin de la partition en cours */
    var lastInputTs = 0;          /* dernière saisie (ms) */
    var lastSizing = null;        /* dernières mesures de updateLayoutSizing */
    var measureTa = null;         /* textarea invisible pour mesurer la hauteur sans toucher au vrai */
    var opBusy = false;

    function getBridge() {
        return window.__rsBridge || null;
    }

    function todayStr() {
        return new Date().toLocaleDateString("en-GB");
    }

    function getBaseTitle(title) {
        var raw = String(title || "").trim();
        if (raw.indexOf(ED_PREFIX) === 0) {
            return raw.slice(ED_PREFIX.length).trim() || raw;
        }
        return raw;
    }

    function getEdTitle(baseTitle) {
        return ED_PREFIX + String(baseTitle || "").trim();
    }

    function findEditTunebook(bridge) {
        if (!bridge) return null;
        var list = bridge.getTunebooks() || [];
        return list.find(function (tb) {
            return tb && (tb.dbk === EDIT_TB_DBK || tb.name === EDIT_TB_NAME);
        }) || null;
    }

    function findEdEntry(bridge, edTitle) {
        if (!bridge) return null;
        var tb = findEditTunebook(bridge);
        if (!tb) return null;
        var idx = bridge.getIndex() || [];
        var exact = idx.find(function (e) {
            return e.tb === tb.dbk && String(e.title || "").trim() === edTitle;
        });
        if (exact) return exact;
        var lower = edTitle.toLowerCase();
        return idx.find(function (e) {
            return e.tb === tb.dbk && String(e.title || "").trim().toLowerCase() === lower;
        }) || null;
    }

    function stopPlaybackIfRunning() {
        var playBtn = document.getElementById("rsPlaybackPlay");
        if (playBtn && playBtn.dataset.playing === "true") {
            playBtn.click();
        }
    }

    function isTuneOpen() {
        var hideSpan = document.getElementById("menuHideOnNoTitle");
        var paper = document.getElementById("paper");
        var lastId = localStorage.getItem("RealSheetLastTitleNum");
        if (!lastId || lastId === "-1") return false;
        if (!paper || !paper.querySelector("svg")) return false;
        if (hideSpan && window.getComputedStyle(hideSpan).display === "none") return false;
        return true;
    }

    function ensureEditButton() {
        var menu = document.getElementById("menu");
        if (!menu) return;
        if (!editBtn) {
            editBtn = document.getElementById("rsAbcEditBtn");
        }
        if (!editBtn) {
            editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.id = "rsAbcEditBtn";
            editBtn.title = "Edit ABC";
            editBtn.setAttribute("aria-label", "Edit ABC");
            var img = document.createElement("img");
            img.src = "img/edit.png";
            img.alt = "Edit";
            editBtn.appendChild(img);
            editBtn.addEventListener("click", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                if (window.__rsAbcEditMode) {
                    closeEditMode(true);
                } else {
                    openEditMode();
                }
            });
            menu.appendChild(editBtn);
        } else if (editBtn.parentNode !== menu) {
            menu.appendChild(editBtn);
        }
        editBtn.style.display = isTuneOpen() ? "inline-flex" : "none";
    }

    function buildUi() {
        if (editDock) return;

        editDock = document.createElement("div");
        editDock.id = "rsAbcEditDock";
        editDock.setAttribute("aria-hidden", "true");

        textarea = document.createElement("textarea");
        textarea.id = "rsAbcEditTextarea";
        textarea.setAttribute("autocomplete", "off");
        textarea.setAttribute("autocorrect", "off");
        textarea.setAttribute("autocapitalize", "off");
        textarea.setAttribute("spellcheck", "false");

        var bar = document.createElement("div");
        bar.id = "rsAbcEditBar";

        btnSave = document.createElement("button");
        btnSave.type = "button";
        btnSave.id = "rsAbcEditSave";
        btnSave.className = "rs-abc-edit-action";
        btnSave.innerHTML = '<img src="img/save.png" class="rs-abc-edit-icon" alt=""><span>Save</span>';

        btnTempo = document.createElement("button");
        btnTempo.type = "button";
        btnTempo.id = "rsAbcEditTempo";
        btnTempo.className = "rs-abc-edit-action";
        btnTempo.innerHTML = '<span>\u2669 Tempo</span>';
        btnTempo.setAttribute("aria-label", "Tempo");
        /* ne pas retirer le focus du textarea (le clavier reste ouvert) */
        btnTempo.addEventListener("mousedown", function (e) { e.preventDefault(); });

        btnCancel = document.createElement("button");
        btnCancel.type = "button";
        btnCancel.id = "rsAbcEditCancel";
        btnCancel.className = "rs-abc-edit-action";
        btnCancel.innerHTML = '<span>Cancel</span>';

        btnDelete = document.createElement("button");
        btnDelete.type = "button";
        btnDelete.id = "rsAbcEditDelete";
        btnDelete.className = "rs-abc-edit-action";
        btnDelete.innerHTML = '<img src="img/trash.png" class="rs-abc-edit-icon" alt=""><span>Delete</span>';

        bar.append(btnSave, btnTempo, btnCancel, btnDelete);
        editDock.append(textarea, bar);
        document.body.appendChild(editDock);

        textarea.addEventListener("input", onTextareaInput);
        textarea.addEventListener("click", function () { highlightAtCursor("smooth"); });
        textarea.addEventListener("mouseup", function () { highlightAtCursor("smooth"); });
        textarea.addEventListener("select", function () { highlightAtCursor("smooth"); });
        textarea.addEventListener("keyup", function () { highlightAtCursor("smooth"); });
        textarea.addEventListener("touchend", function () {
            setTimeout(function () { highlightAtCursor("smooth"); }, 20);
        });
        document.addEventListener("selectionchange", function () {
            if (window.__rsAbcEditMode && document.activeElement === textarea) {
                highlightAtCursor("auto");
            }
        });

        btnSave.addEventListener("click", handleSave);
        btnTempo.addEventListener("click", handleTempo);
        btnCancel.addEventListener("click", function () { closeEditMode(true); });
        btnDelete.addEventListener("click", handleDelete);

        window.addEventListener("resize", function () {
            if (window.__rsAbcEditMode) {
                updateLayoutSizing();
                highlightAtCursor("auto");
            }
        });
        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", function () {
                if (window.__rsAbcEditMode) {
                    updateLayoutSizing();
                    highlightAtCursor("auto");
                }
            });
            window.visualViewport.addEventListener("scroll", function () {
                if (window.__rsAbcEditMode) {
                    updateLayoutSizing();
                }
            });
        }
    }

    var PAPER_STYLE_PROPS = ["position", "left", "right", "top", "height", "marginTop", "paddingTop"];

    function savePaperStyle() {
        if (savedPaperStyle) return; /* déjà sauvegardé : ne pas écraser avec les styles du mode édition */
        var pf = document.getElementById("paperframe");
        if (!pf) return;
        savedPaperStyle = {};
        PAPER_STYLE_PROPS.forEach(function (p) { savedPaperStyle[p] = pf.style[p] || ""; });
    }

    function restorePaperStyle() {
        var pf = document.getElementById("paperframe");
        if (!pf) { savedPaperStyle = null; return; }
        if (savedPaperStyle) {
            PAPER_STYLE_PROPS.forEach(function (p) { pf.style[p] = savedPaperStyle[p]; });
        } else {
            /* Pas de sauvegarde : remettre le décalage sous la barre de menu (fixe) comme au démarrage */
            PAPER_STYLE_PROPS.forEach(function (p) { pf.style[p] = ""; });
            var menu = document.getElementById("menu");
            if (menu) pf.style.marginTop = menu.clientHeight + "px";
        }
        savedPaperStyle = null;
        topExtra = 0;
        pf.style.paddingTop = "";
        pf.scrollTop = 0;
    }

    /* Firefox peut garder une zone blanche (cache de peinture périmé) après le retour du mode édition :
       on force un reflow + repaint complet du cadre de la partition. */
    function forceRepaint() {
        var pf = document.getElementById("paperframe");
        if (!pf) return;
        /* 0) Firefox garde l'ancien cadre « fixed » du mode édition (zone de défilement / couche) :
              on retire puis réinsère le nœud pour détruire et reconstruire ses frames */
        try {
            var par = pf.parentNode, nxt = pf.nextSibling;
            if (par) {
                par.removeChild(pf);
                par.insertBefore(pf, nxt);
            }
            var prevOv = pf.style.overflow, prevPos = pf.style.position;
            pf.style.overflow = "visible";
            pf.style.position = "relative";
            void pf.offsetHeight;
            pf.style.overflow = prevOv;
            pf.style.position = prevPos;
        } catch (e) {}
        /* 1) reflow complet du cadre */
        var prevDisplay = pf.style.display;
        pf.style.display = "none";
        void pf.offsetHeight;
        pf.style.display = prevDisplay;
        /* 2) nouvelle couche de composition pour la partition */
        var paper = document.getElementById("paper");
        if (paper) {
            paper.style.transform = "translateZ(0)";
            void paper.offsetHeight;
            paper.style.transform = "";
        }
        /* 3) vrai défilement asynchrone de 1 px (aller puis retour sur deux images) : dans Firefox, la zone blanche
              disparaît dès qu'on défile, car cela recalcule la zone peinte de la fenêtre */
        try {
            var sy = window.scrollY || 0;
            var alt = sy > 0 ? sy - 1 : sy + 1;
            window.scrollTo(0, alt);
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    if (!window.__rsAbcEditMode) window.scrollTo(0, sy);
                });
            });
        } catch (e) {}
        /* 4) invalider la peinture du cadre */
        pf.style.opacity = "0.999";
        requestAnimationFrame(function () {
            pf.style.opacity = "";
        });
    }

    /* Repaint étalé dans le temps : Firefox peut re-périmer la zone après un premier repaint */
    function scheduleRepaints() {
        [0, 120, 400, 900].forEach(function (d) {
            setTimeout(function () {
                if (!window.__rsAbcEditMode) forceRepaint();
            }, d);
        });
    }

    function updateLayoutSizing() {
        if (!editDock || !textarea) return;
        var menu = document.getElementById("menu");
        var menuH = menu ? Math.ceil(menu.getBoundingClientRect().height) : 44;
        document.documentElement.style.setProperty("--rs-edit-menu-h", menuH + "px");

        var vv = window.visualViewport;
        var vvH = vv ? vv.height : (window.innerHeight || document.documentElement.clientHeight || 800);
        var vvTop = vv ? vv.offsetTop : 0;
        var layoutH = window.innerHeight || document.documentElement.clientHeight || vvH;
        var visibleTop = Math.max(menuH, vvTop);
        var visibleBottom = vvTop + vvH;
        var bottomOffset = Math.max(0, Math.round(layoutH - visibleBottom));

        var isTablet = window.matchMedia && window.matchMedia("(min-width: 768px)").matches;
        var availH = Math.max(120, Math.floor(visibleBottom - visibleTop));
        var maxDockRatio = isTablet ? 0.35 : 0.48;
        var maxDockH = Math.max(100, Math.floor(availH * maxDockRatio));
        var barEl = document.getElementById("rsAbcEditBar");
        var barH = barEl ? Math.ceil(barEl.getBoundingClientRect().height) : 44;
        var maxTextareaH = Math.max(56, maxDockH - barH);

        /* Mesure sur un textarea invisible : réduire le vrai textarea à « auto » à chaque frappe fait réagir
           Android (défilement de la page / du viewport visuel en boucle) */
        if (!measureTa) {
            measureTa = document.createElement("textarea");
            measureTa.setAttribute("aria-hidden", "true");
            measureTa.tabIndex = -1;
            measureTa.readOnly = true;
            measureTa.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;height:0;min-height:0;overflow:hidden;";
            document.body.appendChild(measureTa);
        }
        var cs = window.getComputedStyle(textarea);
        ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "whiteSpace", "wordBreak", "overflowWrap",
         "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "borderTopWidth", "borderBottomWidth",
         "borderLeftWidth", "borderRightWidth", "boxSizing", "tabSize"].forEach(function (k) { measureTa.style[k] = cs[k]; });
        measureTa.style.width = textarea.getBoundingClientRect().width + "px";
        measureTa.value = textarea.value;
        var contentH = measureTa.scrollHeight;
        var targetH = Math.min(maxTextareaH, Math.max(56, contentH));
        var sig = [menuH, vvTop, vvH, layoutH, targetH, maxTextareaH, barH].join("|");
        if (lastSizing === sig) return; /* rien n'a changé : ne pas retoucher la mise en page */
        lastSizing = sig;
        textarea.style.height = targetH + "px";
        textarea.style.maxHeight = maxTextareaH + "px";

        editDock.style.bottom = bottomOffset + "px";
        editDock.style.maxHeight = maxDockH + "px";

        /* La partition reste dans le flux normal de la page (plus de position:fixed ni de cadre défilant, qui laissaient
           une zone blanche dans Firefox au retour) : on réserve seulement la place du dock en bas de la page. */
        var dockH = targetH + barH;
        document.documentElement.style.setProperty("--rs-edit-dock-h", dockH + "px");
    }

    function clearHighlights() {
        document.querySelectorAll("#paper .abcjs-highlight").forEach(function (el) {
            el.classList.remove("abcjs-highlight");
        });
    }

    function collectParsedNotes(abcText) {
        var notes = [];
        if (!window.ABCJS || typeof ABCJS.parseOnly !== "function") return notes;
        try {
            var parsed = ABCJS.parseOnly(abcText);
            if (!parsed || !parsed[0] || !parsed[0].lines) return notes;
            parsed[0].lines.forEach(function (line) {
                if (!line.staff) return;
                line.staff.forEach(function (staff) {
                    if (!staff.voices) return;
                    staff.voices.forEach(function (voice) {
                        if (!Array.isArray(voice)) return;
                        voice.forEach(function (el) {
                            if (el && el.el_type === "note" && el.pitches && el.pitches.length > 0 &&
                                typeof el.startChar === "number" && typeof el.endChar === "number") {
                                notes.push({ startChar: el.startChar, endChar: el.endChar });
                            }
                        });
                    });
                });
            });
        } catch (e) { /* ignore parse errors while typing */ }
        return notes;
    }

    function collectVisualNotes(visualObj) {
        var notes = [];
        if (!visualObj || !visualObj.lines) return notes;
        visualObj.lines.forEach(function (line) {
            if (!line.staff) return;
            line.staff.forEach(function (staff) {
                if (!staff.voices) return;
                staff.voices.forEach(function (voice) {
                    if (!Array.isArray(voice)) return;
                    voice.forEach(function (el) {
                        if (el && el.el_type === "note" && el.pitches && el.pitches.length > 0) {
                            var elems = (el.abselem && Array.isArray(el.abselem.elemset)) ? el.abselem.elemset : [];
                            notes.push(elems);
                        }
                    });
                });
            });
        });
        return notes;
    }

    function getLineBoundsAt(text, pos) {
        var start = text.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
        var end = text.indexOf("\n", pos);
        if (end === -1) end = text.length;
        return { start: start, end: end, text: text.slice(start, end) };
    }

    function tokenizeLyricLine(lineText, lineStart) {
        var tokens = [];
        var m = lineText.match(/^\s*w\s*:\s*/);
        var i = m ? m[0].length : 0;
        var len = lineText.length;
        while (i < len) {
            var ch = lineText[i];
            if (ch === " " || ch === "\t") {
                i++;
                continue;
            }
            if (ch === "|") {
                var barStart = i;
                while (i < len && (lineText[i] === "|" || lineText[i] === ":" || lineText[i] === "]")) i++;
                tokens.push({ isBar: true, startChar: lineStart + barStart, endChar: lineStart + i });
                continue;
            }
            if (ch === "_" || ch === "*") {
                tokens.push({ isBar: false, startChar: lineStart + i, endChar: lineStart + i + 1 });
                i++;
                continue;
            }
            var tokStart = i;
            while (i < len) {
                var c = lineText[i];
                if (c === "\\" && i + 1 < len) {
                    i += 2;
                    continue;
                }
                if (c === " " || c === "\t" || c === "|" || c === "_" || c === "*") {
                    break;
                }
                if (c === "-") {
                    i++;
                    break;
                }
                i++;
            }
            if (i > tokStart) {
                tokens.push({ isBar: false, startChar: lineStart + tokStart, endChar: lineStart + i });
            } else {
                i++;
            }
        }
        return tokens;
    }

    function findNotesForLyricCursor(abcText, parsedNotes, selStart, selEnd) {
        var line = getLineBoundsAt(abcText, selStart);
        if (!/^\s*w\s*:/.test(line.text)) return null;

        // Remonter jusqu'à la ligne de musique correspondante (en sautant d'éventuelles autres lignes w: ou %)
        var scanPos = line.start - 1;
        var musicLine = null;
        while (scanPos >= 0) {
            var prev = getLineBoundsAt(abcText, scanPos);
            var trimmed = prev.text.trim();
            if (trimmed !== "" && !/^\s*w\s*:/.test(prev.text) && trimmed[0] !== "%") {
                // Vérifier que cette ligne contient au moins une note parsée
                var hasNotes = parsedNotes.some(function (n) {
                    return n.startChar >= prev.start && n.startChar < prev.end;
                });
                if (hasNotes) {
                    musicLine = prev;
                    break;
                }
                // Si c'est un autre en-tête (K:, M:, etc.), arrêter
                if (/^[A-Za-z]\s*:/.test(trimmed)) break;
            }
            scanPos = prev.start - 1;
        }
        if (!musicLine) return null;

        var lineNoteIndices = [];
        for (var i = 0; i < parsedNotes.length; i++) {
            if (parsedNotes[i].startChar >= musicLine.start && parsedNotes[i].startChar < musicLine.end) {
                lineNoteIndices.push(i);
            }
        }
        if (!lineNoteIndices.length) return null;

        var tokens = tokenizeLyricLine(line.text, line.start);
        if (!tokens.length) return [];

        var hasBars = tokens.some(function (t) { return t.isBar; });
        var mappedNoteIndices = [];

        if (hasBars) {
            // Grouper les notes de la ligne musicale par mesure (séparateurs |)
            var noteMeasures = [[]];
            var curPos = musicLine.start;
            var mText = abcText;
            var barOffsets = [];
            for (var p = musicLine.start; p < musicLine.end; p++) {
                var mc = mText[p];
                if (mc === "%") break;
                if (mc === '"') {
                    p++;
                    while (p < musicLine.end && mText[p] !== '"') {
                        if (mText[p] === "\\" && p + 1 < musicLine.end) p++;
                        p++;
                    }
                    continue;
                }
                if (mc === "|" || (mc === ":" && mText[p + 1] === ":")) {
                    barOffsets.push(p);
                    while (p + 1 < musicLine.end && (mText[p + 1] === "|" || mText[p + 1] === ":" || mText[p + 1] === "]")) {
                        p++;
                    }
                }
            }
            var barPtr = 0;
            for (var k = 0; k < lineNoteIndices.length; k++) {
                var nIdx = lineNoteIndices[k];
                var nChar = parsedNotes[nIdx].startChar;
                while (barPtr < barOffsets.length && nChar > barOffsets[barPtr]) {
                    barPtr++;
                    noteMeasures.push([]);
                }
                noteMeasures[noteMeasures.length - 1].push(nIdx);
            }
            // Ignorer une mesure vide initiale si la ligne commence par |
            if (noteMeasures.length > 1 && noteMeasures[0].length === 0) {
                noteMeasures.shift();
            }

            var measIdx = 0;
            var sylInMeas = 0;
            for (var t = 0; t < tokens.length; t++) {
                var tok = tokens[t];
                if (tok.isBar) {
                    if (t > 0 || sylInMeas > 0) {
                        measIdx++;
                        sylInMeas = 0;
                    }
                    tok.noteIdx = -1;
                } else {
                    var measNotes = noteMeasures[Math.min(measIdx, noteMeasures.length - 1)] || [];
                    tok.noteIdx = measNotes.length ? measNotes[Math.min(sylInMeas, measNotes.length - 1)] : -1;
                    sylInMeas++;
                }
            }
        } else {
            var sylIdx = 0;
            for (var t2 = 0; t2 < tokens.length; t2++) {
                var tok2 = tokens[t2];
                tok2.noteIdx = lineNoteIndices[Math.min(sylIdx, lineNoteIndices.length - 1)];
                sylIdx++;
            }
        }

        var sylTokens = tokens.filter(function (t) { return !t.isBar && t.noteIdx >= 0; });
        if (!sylTokens.length) return [];

        if (selEnd > selStart) {
            for (var s = 0; s < sylTokens.length; s++) {
                if (sylTokens[s].endChar > selStart && sylTokens[s].startChar < selEnd) {
                    if (mappedNoteIndices.indexOf(sylTokens[s].noteIdx) === -1) {
                        mappedNoteIndices.push(sylTokens[s].noteIdx);
                    }
                }
            }
        }

        if (!mappedNoteIndices.length) {
            var bIdx = -1;
            var aIdx = -1;
            for (var u = 0; u < sylTokens.length; u++) {
                if (sylTokens[u].startChar < selStart) bIdx = sylTokens[u].noteIdx;
                if (aIdx === -1 && sylTokens[u].endChar > selStart) aIdx = sylTokens[u].noteIdx;
            }
            if (bIdx >= 0) mappedNoteIndices.push(bIdx);
            if (aIdx >= 0 && mappedNoteIndices.indexOf(aIdx) === -1) mappedNoteIndices.push(aIdx);
        }
        return mappedNoteIndices;
    }

    /* ---- Bouton Tempo : place le curseur sur la ligne de tempo, ou en crée une (Q:1/4=120 / Q:3/8=120 en ternaire) ---- */
    function scrollTextareaToIndex(idx) {
        try {
            var before = textarea.value.slice(0, idx);
            var lineNo = before.split("\n").length - 1;
            var lh = parseFloat(window.getComputedStyle(textarea).lineHeight) || 18;
            var y = lineNo * lh;
            if (y < textarea.scrollTop || y > textarea.scrollTop + textarea.clientHeight - lh * 2) {
                textarea.scrollTop = Math.max(0, y - textarea.clientHeight / 2);
            }
        } catch (e) {}
    }

    function handleTempo() {
        if (!window.__rsAbcEditMode || !textarea) return;
        var text = textarea.value;
        /* Priorité : ligne Q: active (une ligne %Q: commentée est ignorée), sinon ligne R: 1/4=… */
        var found = /^[ \t]*(Q:[^\n]*)/m.exec(text) ||
                    /^[ \t]*(R:[ \t]*(?:"[^"\n]*"[ \t]*)?\d+\/\d+[ \t]*=[^\n]*)/m.exec(text);
        var caret;
        if (found) {
            /* tempo déjà présent : curseur en fin de cette ligne */
            caret = found.index + found[0].replace(/[ \t\r]+$/, "").length;
            textarea.focus();
            textarea.setSelectionRange(caret, caret);
        } else {
            var ternary = false;
            var mm = /^M:[ \t]*(\d+)\/(\d+)/m.exec(text);
            if (mm && parseInt(mm[2], 10) === 8 && parseInt(mm[1], 10) % 3 === 0) ternary = true;
            var line = ternary ? "Q:3/8=120" : "Q:1/4=120";
            /* insertion avant la ligne K: (dernier champ de l'en-tête) ; sinon après M:, sinon en tête */
            var insertAt = 0;
            var kk = /^K:/m.exec(text);
            var mLine = /^M:[^\n]*\n?/m.exec(text);
            if (kk) insertAt = kk.index;
            else if (mLine) insertAt = mLine.index + mLine[0].length;
            var prefix = "";
            if (insertAt > 0 && text.charAt(insertAt - 1) !== "\n") prefix = "\n";
            var ins = prefix + line + "\n";
            textarea.focus();
            textarea.setSelectionRange(insertAt, insertAt);
            var ok = false;
            try { ok = document.execCommand("insertText", false, ins); } catch (e) { ok = false; }
            if (!ok || textarea.value.indexOf(line) === -1) {
                textarea.setRangeText(ins, insertAt, insertAt, "end");
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
            }
            caret = insertAt + prefix.length + line.length;
            textarea.setSelectionRange(caret, caret);
        }
        scrollTextareaToIndex(caret);
        updateLayoutSizing();
    }

    function highlightAtCursor(scrollBehavior) {
        if (!window.__rsAbcEditMode || !textarea) return;
        /* Entre la frappe et le redessin, la partition affichée ne correspond plus au texte : les index de notes
           seraient faux (défilement vers une mauvaise note). On attend le redessin, qui rappelle cette fonction. */
        if (renderTimer || renderInFlight) return;
        /* Pendant la saisie, pas de défilement « smooth » (il s'entrecroise avec les autres recentrages) */
        if (Date.now() - lastInputTs < 1500) scrollBehavior = "auto";
        clearHighlights();

        var visual = window.__rsCurrentVisual;
        if (!visual) return;

        var abcText = textarea.value;
        var selStart = typeof textarea.selectionStart === "number" ? textarea.selectionStart : 0;
        var selEnd = typeof textarea.selectionEnd === "number" ? textarea.selectionEnd : selStart;
        var parsedNotes = collectParsedNotes(abcText);
        var visualNotes = collectVisualNotes(visual);
        if (!parsedNotes.length || !visualNotes.length) return;

        var targetIndices = findNotesForLyricCursor(abcText, parsedNotes, selStart, selEnd);

        if (targetIndices === null) {
            targetIndices = [];
            if (selEnd > selStart) {
                for (var s = 0; s < parsedNotes.length; s++) {
                    if (parsedNotes[s].endChar > selStart && parsedNotes[s].startChar < selEnd) {
                        targetIndices.push(s);
                    }
                }
            }
            if (!targetIndices.length) {
                var beforeIdx = -1;
                var bestBeforeChar = -1;
                var afterIdx = -1;
                var bestAfterChar = Infinity;
                for (var i = 0; i < parsedNotes.length; i++) {
                    var n = parsedNotes[i];
                    if (n.startChar < selStart && n.startChar >= bestBeforeChar) {
                        bestBeforeChar = n.startChar;
                        beforeIdx = i;
                    }
                    if (n.endChar > selStart && n.endChar < bestAfterChar) {
                        bestAfterChar = n.endChar;
                        afterIdx = i;
                    }
                }
                if (beforeIdx >= 0) targetIndices.push(beforeIdx);
                if (afterIdx >= 0 && targetIndices.indexOf(afterIdx) === -1) targetIndices.push(afterIdx);
            }
        }

        var highlightedEls = [];
        targetIndices.forEach(function (idx) {
            if (idx >= 0 && idx < visualNotes.length) {
                visualNotes[idx].forEach(function (el) {
                    if (el && el.classList) {
                        el.classList.add("abcjs-highlight");
                        highlightedEls.push(el);
                    }
                });
            }
        });

        var targetEl = null;
        var noteRect = null;
        for (var hi = 0; hi < highlightedEls.length; hi++) {
            var r = highlightedEls[hi].getBoundingClientRect();
            if (r && (r.height > 0 || r.width > 0)) {
                targetEl = highlightedEls[hi];
                noteRect = r;
                break;
            }
        }
        if (targetEl && noteRect && (selStart > 0 || selEnd > 0)) {
            /* Centre la note dans la zone visible (entre le menu et le dock) en faisant défiler la page */
            var menuEl = document.getElementById("menu");
            var topLimit = menuEl ? Math.round(menuEl.getBoundingClientRect().height) : 0; /* hauteur (pas le bas) : le menu se masque quand on défile */
            var bottomLimit = editDock ? editDock.getBoundingClientRect().top : (window.innerHeight || 800);
            /* Android : avec le clavier, la zone réellement visible est le viewport visuel (décalé / réduit) */
            var vv = window.visualViewport;
            if (vv) {
                topLimit = Math.max(topLimit, Math.round(vv.offsetTop));
                bottomLimit = Math.min(bottomLimit, vv.offsetTop + vv.height);
            }
            if (bottomLimit > topLimit + 40) {
                var wantedY = topLimit + (bottomLimit - topLimit) / 2;
                var delta = (noteRect.top + noteRect.height / 2) - wantedY;
                /* Première(s) note(s) : pas assez de place au-dessus pour les centrer (scrollY ne peut pas être < 0).
                   On ajoute un espace en haut de la partition (retiré à la sortie du mode édition). */
                var room = window.pageYOffset || document.documentElement.scrollTop || 0;
                if (delta < -4 && -delta > room + 1) {
                    var pfEl = document.getElementById("paperframe");
                    if (pfEl) {
                        topExtra += Math.min(Math.ceil(-delta - room), window.innerHeight || 800);
                        pfEl.style.paddingTop = topExtra + "px";
                        var nr = targetEl.getBoundingClientRect();
                        delta = (nr.top + nr.height / 2) - wantedY;
                    }
                }
                if (Math.abs(delta) > 4) {
                    try {
                        window.scrollBy({ top: delta, left: 0, behavior: scrollBehavior === "smooth" ? "smooth" : "auto" });
                    } catch (e) { window.scrollBy(0, delta); }
                }
            }
        }
    }

    function onTextareaInput() {
        if (!window.__rsAbcEditMode || !textarea) return;
        editingLiveAbc = textarea.value;
        lastInputTs = Date.now();
        updateLayoutSizing();

        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(async function () {
            renderTimer = null;
            if (!window.__rsAbcEditMode) return;
            var bridge = getBridge();
            if (!bridge) return;
            renderInFlight = true;
            try {
                window.__rsLastRenderW = -1;
                await bridge.redrawSheet();
            } catch (err) {
                /* Laisser l'utilisateur continuer à taper si le code ABC est temporairement invalide */
            }
            renderInFlight = false;
            /* Le redessin remplace le SVG (surlignage perdu, hauteur de page modifiée) : recentrer la note du curseur */
            if (window.__rsAbcEditMode) {
                highlightAtCursor("auto");
                requestAnimationFrame(function () {
                    highlightAtCursor("auto");
                    setTimeout(function () { if (window.__rsAbcEditMode) highlightAtCursor("auto"); }, 120);
                });
            }
        }, 180);
    }

    function updateDeleteButtonState(bridge) {
        if (!btnDelete) return;
        var hasEd = !!findEdEntry(bridge, editingEdTitle);
        btnDelete.disabled = !hasEd;
    }

    async function openEditMode() {
        var bridge = getBridge();
        if (!bridge || opBusy) return;
        var currentId = localStorage.getItem("RealSheetLastTitleNum");
        if (!currentId || currentId === "-1") return;

        var entry = (bridge.getIndex() || []).find(function (t) { return t.id === currentId; });
        if (!entry) return;

        opBusy = true;
        try {
            stopPlaybackIfRunning();
            buildUi();
            lastSizing = null;

            editingOriginalId = currentId;
            editingBaseTitle = getBaseTitle(entry.title);
            editingEdTitle = getEdTitle(editingBaseTitle);

            var edEntry = findEdEntry(bridge, editingEdTitle);
            var sourceId = edEntry ? edEntry.id : currentId;
            var loadedAbc = await bridge.decryptTune(sourceId);
            loadedAbc = String(loadedAbc || "").replace(/\r\n?/g, "\n");

            editingLiveAbc = loadedAbc;
            window.__rsAbcEditMode = true;
            document.body.classList.add("rs-abc-edit-mode");
            editDock.setAttribute("aria-hidden", "false");

            textarea.value = loadedAbc;
            updateDeleteButtonState(bridge);
            savePaperStyle();
            updateLayoutSizing();

            if (edEntry && edEntry.id !== currentId) {
                window.__rsLastRenderW = -1;
                await bridge.redrawSheet();
            } else {
                highlightAtCursor("auto");
            }
            textarea.focus();
            setTimeout(function () {
                if (window.__rsAbcEditMode) {
                    updateLayoutSizing();
                    highlightAtCursor("auto");
                }
            }, 300);
        } catch (err) {
            console.error("ABC Editor open error:", err);
        } finally {
            opBusy = false;
        }
    }

    async function closeEditMode(redraw) {
        lastSizing = null;
        if (renderTimer) {
            clearTimeout(renderTimer);
            renderTimer = null;
        }
        window.__rsAbcEditMode = false;
        editingLiveAbc = null;
        document.documentElement.style.removeProperty("--rs-edit-dock-h");
        editingOriginalId = null;
        if (textarea && typeof textarea.blur === "function") {
            try { textarea.blur(); } catch (e) {}
        }
        document.body.classList.remove("rs-abc-edit-mode");
        if (editDock) {
            editDock.setAttribute("aria-hidden", "true");
            editDock.style.bottom = "";
            editDock.style.maxHeight = "";
        }
        clearHighlights();

        restorePaperStyle();
        try { window.scrollTo(0, 0); } catch (e) {}

        if (redraw) {
            var bridge = getBridge();
            if (bridge) {
                window.__rsLastRenderW = -1;
                await bridge.redrawSheet();
            }
            scheduleRepaints();
            setTimeout(function () {
                if (window.__rsAbcEditMode) return;
                try { window.scrollTo(0, 0); } catch (e) {}
                var pf = document.getElementById("paperframe");
                if (pf) pf.scrollTop = 0;
                var b = getBridge();
                if (b) {
                    window.__rsLastRenderW = -1;
                    var pr = b.redrawSheet();
                    if (pr && typeof pr.then === "function") {
                        pr.then(scheduleRepaints);
                    } else {
                        setTimeout(scheduleRepaints, 150);
                    }
                }
            }, 300);
        }
    }

    function extractAbcTitle(rawAbc) {
        var m = String(rawAbc || "").replace(/\r\n?/g, "\n").match(/^T:[ \t]*(.*)$/m);
        return m ? m[1].trim() : "";
    }

    function normalizeEditedTuneAbc(rawAbc, tuneNum, title) {
        var text = String(rawAbc || "").replace(/\r\n?/g, "\n").trim();
        text = text.replace(/^(?:\s*%@[^\n]*\n)+/, "").trim();
        if (!/^X:/m.test(text)) {
            text = "X:" + tuneNum + "\n" + text;
        } else {
            text = text.replace(/^X:.*$/m, "X:" + tuneNum);
        }
        if (/^T:/m.test(text)) {
            text = text.replace(/^T:.*$/m, "T:" + title);
        } else {
            text = text.replace(/^(X:[^\n]*)/m, "$1\nT:" + title);
        }
        return text;
    }

    function buildAbctFile(tbName, tunes) {
        var header = [
            "%@ title: " + tbName,
            "%@ author: -",
            "%@ lastupdate: " + todayStr(),
            "%@ iconcolor: #bbbbbb"
        ].join("\n");
        if (!tunes.length) return header + "\n";
        var blocks = tunes.map(function (t, i) {
            return normalizeEditedTuneAbc(t.abc, i + 1, t.title);
        });
        return header + "\n\n" + blocks.join("\n\n") + "\n";
    }

    async function loadEditTunesList(bridge, dbk) {
        var entries = (bridge.getIndex() || []).filter(function (e) { return e.tb === dbk; });
        var result = [];
        for (var i = 0; i < entries.length; i++) {
            var raw = await bridge.decryptTune(entries[i].id);
            result.push({
                id: entries[i].id,
                title: String(entries[i].title || "").trim(),
                abc: String(raw || "")
            });
        }
        return result;
    }

    async function handleSave() {
        var bridge = getBridge();
        if (!bridge || !textarea || opBusy) return;
        opBusy = true;
        try {
            var tbList = bridge.getTunebooks() || [];
            var tb = findEditTunebook(bridge);
            if (!tb) {
                tb = {
                    name: EDIT_TB_NAME,
                    id: Math.floor(Math.random() * 1e7),
                    source: "",
                    type: "t",
                    info: "",
                    initials: "ET",
                    author: "-",
                    lastupdate: todayStr(),
                    iconcolor: "#bbbbbb",
                    setlist: false,
                    dbk: EDIT_TB_DBK
                };
                tbList.push(tb);
            } else {
                tb.lastupdate = todayStr();
            }

            var tunes = await loadEditTunesList(bridge, tb.dbk);
            var editedAbc = textarea.value;
            var rawTitle = extractAbcTitle(editedAbc);
            var targetBaseTitle = getBaseTitle(rawTitle) || editingBaseTitle;
            var targetEdTitle = getEdTitle(targetBaseTitle);
            var targetLower = targetEdTitle.toLowerCase();
            var existingIdx = tunes.findIndex(function (t) {
                return t.title.toLowerCase() === targetLower;
            });

            if (existingIdx !== -1) {
                tunes[existingIdx].title = targetEdTitle;
                tunes[existingIdx].abc = editedAbc;
            } else {
                tunes.push({
                    title: targetEdTitle,
                    abc: editedAbc
                });
            }

            var abctContent = buildAbctFile(tb.name, tunes);
            var records = await bridge.encryptAbcTunebook(abctContent);
            localStorage.setItem("RealSheetTb", JSON.stringify(tbList));
            await bridge.saveTunebookRecords(tb.dbk, records);
            if (window.rsClearLyricsCache) window.rsClearLyricsCache();
            await bridge.reloadIndex();

            var savedEntry = findEdEntry(bridge, targetEdTitle);
            if (savedEntry) {
                localStorage.setItem("RealSheetLastTitleNum", savedEntry.id);
            }

            bridge.renderManageList();
            bridge.renderTbFilter();
            bridge.renderTuneList();

            await closeEditMode(true);
        } catch (err) {
            console.error("ABC Editor save error:", err);
            window.alert("Error saving tune: " + (err && err.message ? err.message : err));
        } finally {
            opBusy = false;
        }
    }

    async function handleDelete() {
        var bridge = getBridge();
        if (!bridge || opBusy) return;
        var tb = findEditTunebook(bridge);
        if (!tb) return;
        var edEntry = findEdEntry(bridge, editingEdTitle);
        if (!edEntry) return;

        opBusy = true;
        try {
            var tbList = bridge.getTunebooks() || [];
            var tunes = await loadEditTunesList(bridge, tb.dbk);
            var edLower = editingEdTitle.toLowerCase();
            var remaining = tunes.filter(function (t) {
                return t.title.toLowerCase() !== edLower;
            });

            var lastId = localStorage.getItem("RealSheetLastTitleNum") || "";
            if (lastId === edEntry.id) {
                var orig = (bridge.getIndex() || []).find(function (e) {
                    return e.tb !== tb.dbk && String(e.title || "").trim() === editingBaseTitle;
                });
                localStorage.setItem("RealSheetLastTitleNum", orig ? orig.id : "-1");
            }

            if (remaining.length > 0) {
                tb.lastupdate = todayStr();
                var abctContent = buildAbctFile(tb.name, remaining);
                var records = await bridge.encryptAbcTunebook(abctContent);
                localStorage.setItem("RealSheetTb", JSON.stringify(tbList));
                await bridge.saveTunebookRecords(tb.dbk, records);
            } else {
                var idx = tbList.findIndex(function (t) { return t.dbk === tb.dbk; });
                if (idx !== -1) tbList.splice(idx, 1);
                localStorage.setItem("RealSheetTb", JSON.stringify(tbList));
                await bridge.deleteTunebookRecords(tb.dbk);
            }

            await bridge.reloadIndex();
            bridge.renderManageList();
            bridge.renderTbFilter();
            bridge.renderTuneList();

            await closeEditMode(true);
        } catch (err) {
            console.error("ABC Editor delete error:", err);
            window.alert("Error deleting edited tune: " + (err && err.message ? err.message : err));
        } finally {
            opBusy = false;
        }
    }

    window.__rsGetEditAbc = function (tuneId) {
        if (window.__rsAbcEditMode) {
            if (editingOriginalId !== null && tuneId !== editingOriginalId) {
                closeEditMode(false);
                return null;
            }
            if (editingLiveAbc !== null && tuneId === editingOriginalId) {
                return editingLiveAbc;
            }
        }
        return null;
    };

    window.__rsOnSheetRendered = function () {
        ensureEditButton();
        if (window.__rsAbcEditMode) {
            highlightAtCursor("auto");
        }
    };

    document.addEventListener("DOMContentLoaded", function () {
        var paperframe = document.getElementById("paperframe");
        if (paperframe) {
            ["touchstart", "touchmove", "touchend"].forEach(function (evtName) {
                paperframe.addEventListener(evtName, function (ev) {
                    if (window.__rsAbcEditMode) {
                        ev.stopImmediatePropagation();
                    }
                }, true);
            });
            paperframe.addEventListener("click", function (ev) {
                if (window.__rsAbcEditMode) {
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                }
            }, true);
        }

        var showTitlesMenu = document.getElementById("showTitlesMenu");
        if (showTitlesMenu) {
            showTitlesMenu.addEventListener("click", function () {
                if (window.__rsAbcEditMode) {
                    closeEditMode(false);
                }
            }, true);
        }

        var menu = document.getElementById("menu");
        if (menu && typeof MutationObserver === "function") {
            var obs = new MutationObserver(function () {
                ensureEditButton();
            });
            obs.observe(menu, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
        }
        ensureEditButton();
    });
})();

/* Conversion visuelle des noms d'accords : ABCJS doit d'abord interpréter C/D
   comme des accords internationaux, puis on remplace uniquement leur libellé SVG. */
(function () {
    "use strict";
    var KEY = "rsChordNamesSolfege";
    var SIMPLIFY_KEY = "rsSimplifyChords";
    var TO_SOLFEGE = { C: "Do", D: "Ré", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };
    var TO_LETTERS = { Do: "C", Ré: "D", Mi: "E", Fa: "F", Sol: "G", La: "A", Si: "B" };

    // Racine : notation française seulement si le mode Do/Ré est actif (sinon "Fadd9" serait lu "Fa" + "dd9").
    var ROOT_LETTERS = /^[A-G][#b♯♭]?/;
    var ROOT_SOLFEGE = /^(?:Do|Ré|Mi|Fa|Sol|La|Si)[#b♯♭]?/;

    function simplifyChordLabel(label, solfege) {
        label = String(label || "");
        var root = (solfege ? ROOT_SOLFEGE : ROOT_LETTERS).exec(label);
        if (!root) return label;
        var head = root[0];
        var suffix = label.slice(head.length);
        var slash = suffix.indexOf("/");
        var bass = slash >= 0 ? suffix.slice(slash) : "";
        var q = slash >= 0 ? suffix.slice(0, slash) : suffix;
        var quality;

        // On garde seulement la nature de base : majeur, m, dim, aug, sus.
        // Tout le reste (6, 69, 7, 9, 11, 13, maj7, add9, 7b9, 7#11, 5...) devient l'accord majeur.
        if (/^(?:m7b5|m7\(b5\)|m\(b5\)|ø|dim|°|˚)/i.test(q) && !/^(?:maj|ma(?![a-z]))/i.test(q)) {
            quality = "dim";
        } else if (/^(?:maj|ma(?:\d|$)|M|Δ|∆)/.test(q)) {
            quality = "";                       // maj7, M7, Δ7, maj9...
        } else if (/^(?:m|min|mi(?!n)|-)/.test(q)) {
            quality = "m";                      // m, m6, m7, m9, m11, m13, m(maj7), min7, -7...
        } else if (/^(?:aug|\+)/i.test(q)) {
            quality = "aug";
        } else if (/^sus/i.test(q)) {
            quality = /^sus2/i.test(q) ? "sus2" : (/^sus4/i.test(q) ? "sus4" : "sus");
        } else if (/^(?:6|7|9|11|13|5)?sus(2|4)?/i.test(q)) {
            var sm = /sus(2|4)?/i.exec(q);      // 7sus4, 9sus4, 13sus4...
            quality = "sus" + (sm[1] || "");
        } else {
            quality = "";                       // 6, 69, 7, 9, 13, add9, 7b9, 7#11...
        }

        return head + quality + bass;
    }

    function convertChordLabel(label, toSolfege) {
        label = String(label || "");
        var match = label.match(/^([A-G])([#b♯♭]?)(.*)$/);
        if (toSolfege && match) {
            var tail = match[3].replace(/\/([A-G])([#b♯♭]?)(?=$|[^A-Za-z])/g,
                function (_, bass, accidental) { return "/" + TO_SOLFEGE[bass] + accidental; });
            return TO_SOLFEGE[match[1]] + match[2] + tail;
        }
        if (!toSolfege) {
            match = label.match(/^(Do|Ré|Mi|Fa|Sol|La|Si)([#b♯♭]?)(.*)$/);
            if (match) {
                var rest = match[3].replace(/\/(Do|Ré|Mi|Fa|Sol|La|Si)([#b♯♭]?)(?=$|[^A-Za-z])/g,
                    function (_, bass, accidental) { return "/" + TO_LETTERS[bass] + accidental; });
                return TO_LETTERS[match[1]] + match[2] + rest;
            }
        }
        return label;
    }

    // Taille des accords en notation Do/Ré. Le bouton « Large Chords » injecte une règle
    // `.abcjs-chord { font-size: 1.3em | 1.7em !important; }` : seul un style en ligne
    // `!important` peut la surpasser. Do/Ré = 1 em (C/D = 1,3 em) ; si Large Chords est actif
    // (libellé « Small Chords »), on garde le même rapport : 1,3 em au lieu de 1,7 em.
    function solfegeChordSize() {
        var li = document.getElementById("displayLargeChords");
        var large = !!(li && /small\s+chords/i.test(li.textContent || ""));
        return large ? "1.3em" : "1em";
    }

    function applyChordSizes() {
        var toSolfege = localStorage.getItem(KEY) === "1";
        var size = solfegeChordSize();
        var root = document.getElementById("paper") || document;
        root.querySelectorAll(".abcjs-chord").forEach(function (el) {
            if (toSolfege) el.style.setProperty("font-size", size, "important");
            else el.style.removeProperty("font-size");
        });
    }

    window.rsApplyChordNamesToSvg = function () {
        var toSolfege = localStorage.getItem(KEY) === "1";
        var simplify = localStorage.getItem(SIMPLIFY_KEY) === "1";
        document.documentElement.classList.toggle("rs-solfege-chords", toSolfege);
        var root = document.getElementById("paper") || document;
        root.querySelectorAll(".abcjs-chord").forEach(function (el) {
            if (!el.dataset.rsOriginalChord) el.dataset.rsOriginalChord = el.textContent || "";
            var original = el.dataset.rsOriginalChord;
            var converted = convertChordLabel(original, toSolfege);
            el.textContent = simplify ? simplifyChordLabel(converted, toSolfege) : converted;
        });
        applyChordSizes();
    };

    // Bouton « Large Chords » : son libellé bascule entre « Large Chords » et « Small Chords »
    // (anciennement « Normal Chords »). Seuls les noeuds texte sont modifiés (l'icône est conservée).
    function relabelLargeChords(el) {
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        var node;
        while ((node = walker.nextNode())) {
            var t = node.nodeValue;
            var n = t.replace(/Normal\s+chords/i, "Small Chords").replace(/Large\s+chords/i, "Large Chords");
            if (n !== t) node.nodeValue = n;
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        var largeItem = document.getElementById("displayLargeChords");
        if (largeItem) {
            relabelLargeChords(largeItem);
            if (window.MutationObserver) {
                new MutationObserver(function () { relabelLargeChords(largeItem); applyChordSizes(); })
                    .observe(largeItem, { childList: true, characterData: true, subtree: true });
            }
        }
    });

    document.addEventListener("DOMContentLoaded", function () {
        var item = document.getElementById("displayChordNames");
        if (!item) return;
        function refresh() {
            var solfege = localStorage.getItem(KEY) === "1";
            item.innerHTML = '<img class="icon-sm" src="img/large-chords.png">' +
                (solfege ? "C/D Chords" : "Do/Ré Chords");
            item.setAttribute("aria-pressed", solfege ? "true" : "false");
        }
        refresh();

        var simplifyItem = document.getElementById("displaySimplifyChords");
        function refreshSimplify() {
            if (!simplifyItem) return;
            var simplify = localStorage.getItem(SIMPLIFY_KEY) === "1";
            simplifyItem.innerHTML = '<img class="icon-sm" src="img/large-chords.png">' +
                (simplify ? "Normal Chords" : "Simplify Chords");
            simplifyItem.setAttribute("aria-pressed", simplify ? "true" : "false");
        }
        refreshSimplify();
        if (simplifyItem) {
            simplifyItem.addEventListener("click", function (event) {
                event.preventDefault();
                var simplify = localStorage.getItem(SIMPLIFY_KEY) === "1";
                localStorage.setItem(SIMPLIFY_KEY, simplify ? "0" : "1");
                refreshSimplify();
                if (window.rsApplyChordNamesToSvg) window.rsApplyChordNamesToSvg();
            });
        }

        item.addEventListener("click", function (event) {
            event.preventDefault();
            var solfege = localStorage.getItem(KEY) === "1";
            localStorage.setItem(KEY, solfege ? "0" : "1");
            refresh();
            if (window.rsApplyChordNamesToSvg) window.rsApplyChordNamesToSvg();
        });
    });
})();

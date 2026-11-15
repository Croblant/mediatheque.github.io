/* Option "Hide / Show empty lines" (menu Staff Size).
   Masque les portees qui n'ont ni note ni accord (silences seuls, lignes vides) : une ligne peut donc
   avoir une ou plusieurs portees, et une ligne entierement vide disparait.
   Principe : directive abcjs "%%staffnonote 0", ajoutee au texte ABC juste avant le rendu.
   abcjs garde une portee si elle contient une note, ou un silence portant un accord.
   Etat : localStorage "rsHideEmptyLines" ("0" = lignes vides affichees ; absent ou "1" = masquees, defaut). Compatible file:// (script classique). */
(function () {
    "use strict";

    var KEY = "rsHideEmptyLines";

    function isEnabled() {
        try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; }
    }

    /* Appele par app/main.js (prétraitement ABC) quand l'option est active. */
    window.rsHideEmptyLines = function (abc) {
        var text = String(abc || "");
        if (/^%%staffnonote\b/m.test(text)) return text;
        var m = /^K:/m.exec(text);
        if (!m) return text;
        return text.slice(0, m.index) + "%%staffnonote 0\n" + text.slice(m.index);
    };

    /* Lignes de paroles vides (ex. "w: ||") : retirees avant chaque rendu abcjs, que l'option Hide/Show empty lines soit
       active ou non (elle ne concerne que les portees vides). abcjs ne compte pas ces lignes dans la hauteur reservee
       aux paroles mais les dessine : la derniere ligne de paroles debordait sur la portee du dessous. */
    if (window.ABCJS && typeof ABCJS.renderAbc === "function" && !ABCJS.renderAbc.__rsNoBlankLyrics) {
        var rsRenderAbc = ABCJS.renderAbc;
        ABCJS.renderAbc = function (target, abc) {
            var args = Array.prototype.slice.call(arguments);
            if (typeof abc === "string") args[1] = window.rsStripBlankLyrics ? window.rsStripBlankLyrics(abc) : abc.replace(/^w:[ \t|]*(?:\r?\n|$)/gm, "");
            return rsRenderAbc.apply(this, args);
        };
        ABCJS.renderAbc.__rsNoBlankLyrics = true;
    }

    /* Objet abcjs utilise pour la SYNTHESE audio. Avec "Hide empty lines", %%staffnonote retire les portees vides du modele :
       les voix concernees (ex. basse qui ne commence qu'a la ligne 4) n'ont plus de silences avant leur 1re note et abcjs les
       jouait depuis le debut du morceau. On synthetise donc depuis l'ABC complet (main.js : window.__rsFullAbc) ; l'affichage et le
       suivi visuel (TimingCallbacks, corriges dans lib/abc.js) restent ceux du rendu avec lignes masquees. */
    window.rsAudioVisual = function () {
        var visual = window.__rsCurrentVisual;
        if (!isEnabled() || !visual || typeof window.__rsFullAbc !== "string" || !window.ABCJS || !ABCJS.parseOnly) return visual;
        try {
            var cache = window.__rsAudioCache;
            if (!cache || cache.abc !== window.__rsFullAbc) {
                var full = ABCJS.parseOnly(window.__rsFullAbc)[0];
                cache = window.__rsAudioCache = { abc: window.__rsFullAbc, visual: full };
            }
            return cache.visual || visual;
        } catch (e) { return visual; }
    };

    function refresh(item) {
        var enabled = isEnabled();
        /* Le libelle indique l'action disponible, comme Hide/Show lyrics. */
        item.innerHTML = '<img class="icon-sm" src="img/' + (enabled ? "show-lyrics.png" : "hide-lyrics.png") + '">' +
            (enabled ? "Show empty lines" : "Hide empty lines");
        item.setAttribute("aria-pressed", enabled ? "true" : "false");
    }

    document.addEventListener("DOMContentLoaded", function () {
        var item = document.getElementById("displayHideEmptyLines");
        if (!item) return;
        refresh(item);
        item.addEventListener("click", function (event) {
            event.preventDefault();
            try { localStorage.setItem(KEY, isEnabled() ? "0" : "1"); } catch (e) { /* sans effet */ }
            refresh(item);
            /* Redessin sans recharger la page : meme chemin qu'un vrai redimensionnement
               (la garde de largeur de main.js ignore sinon un resize a largeur constante). */
            window.__rsLastRenderW = -1;
            window.dispatchEvent(new Event("resize"));
        });
    });
})();

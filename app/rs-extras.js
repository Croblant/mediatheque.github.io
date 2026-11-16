/*
 * RealSheet - extensions en clair.
 * Import .txt et choix de clés d’ut. Les clés d’ut modifient la notation
 * via ABCJS sans transposer les notes : les hauteurs sonores restent identiques.
 */
(function () {
  'use strict';

  // Les choix C - Ut 3 / C - Ut 4 utilisent la même hauteur réelle que
  // l'instrument en ut. On ne transpose donc aucun nom de note : on change
  // uniquement la clé ABC, ce qui conserve aussi le MIDI et la lecture audio.
  function selectedClef() {
    var select = document.getElementById('steps2');
    var value = select ? select.value : '';
    if (value === '0000') return 'alto1';
    if (value === '00000') return 'alto2';
    if (value === '00') return 'alto3';
    if (value === '000') return 'alto4';
    return '';
  }
  function applyInstrumentClef(source) {
    var clef = selectedClef();
    if (!clef || typeof source !== 'string') return source;
    var changed = false;
    // ABC accepte l'attribut clef dans K:. Le contenu des notes est intact.
    source = source.replace(/(^|\n)(\s*K:\s*[^\n]*)/g, function (all, start, field) {
      changed = true;
      field = field.replace(/\s+clef=(?:treble|bass|alto[1-5]?|tenor|perc|none)(?:\s+octave=-?\d+)?/gi, '');
      return start + field + ' clef=' + clef;
    });
    // Cas d'une partition ABC atypique sans champ K: : on crée un champ neutre.
    if (!changed) source = 'K:C clef=' + clef + '\n' + source;
    return source;
  }
  if (window.ABCJS && typeof window.ABCJS.renderAbc === 'function' && !window.ABCJS.renderAbc.__rsClefWrapped) {
    var originalRenderAbc = window.ABCJS.renderAbc;
    var wrappedRenderAbc = function () {
      var args = Array.prototype.slice.call(arguments);
      // Appel « analyse seule » (cible "*") : NE PAS modifier l'ABC. main.js s'en sert pour
      // calculer les positions (startChar/endChar) qui alimentent ensuite ABCJS.strTranspose()
      // sur le texte d'origine. Ajouter " clef=..." ici décalait ces positions : certaines notes
      // et certains accords étaient transposés au mauvais endroit, ou le rendu échouait
      // ("redraw failed ... reading '1'"), surtout avec une clé étendue (±13 à ±24) + clé d'ut.
      if (args[0] === '*') return originalRenderAbc.apply(this, args);
      if (typeof args[1] === 'string') args[1] = applyInstrumentClef(args[1]);
      else if (Array.isArray(args[1])) args[1] = args[1].map(applyInstrumentClef);
      return originalRenderAbc.apply(this, args);
    };
    wrappedRenderAbc.__rsClefWrapped = true;
    window.ABCJS.renderAbc = wrappedRenderAbc;
  }

  // Lignes de paroles vides (ex. "w: ||||") : seules celles qui terminent un bloc de lignes w: sont retirees
  // (abcjs les dessine sans reserver leur hauteur : debordement sur la portee du dessous).
  // Une ligne vide placee AVANT une ligne non vide est conservee : c'est un couplet vide qui fixe le numero de
  // couplet, donc la ligne de paroles sur laquelle s'affichent les suivantes (ex. voix 2 : "w: ||||" puis "w: texte"
  // = couplet 2 ; sans cette ligne le texte de la voix 2 passait en couplet 1 et se superposait a celui de la voix 1).
  window.rsStripBlankLyrics = function (abc) {
    if (typeof abc !== 'string') return abc;
    var lines = abc.split('\n'), out = [], i = 0;
    var isLyric = function (l) { return /^w:/.test(l); };
    var isBlank = function (l) { return /^w:[ \t|]*\r?$/.test(l); };
    while (i < lines.length) {
      if (!isLyric(lines[i])) { out.push(lines[i++]); continue; }
      var j = i;
      while (j < lines.length && isLyric(lines[j])) j++;
      var end = j;
      while (end > i && isBlank(lines[end - 1])) end--;
      for (var k = i; k < end; k++) out.push(lines[k]);
      i = j;
    }
    return out.join('\n');
  };

  // Tempo écrit hors champ Q: : "R:1/4=145" ou "%Q:1/4=145" (ligne commentée) est lu comme "Q:1/4=145".
  // Appelé par main.js avant l'injection du tempo par défaut : rendu ET lecture utilisent alors ce tempo.
  // Seule la forme "durée=battements" est reconnue (R: sert normalement au rythme : reel, jig...).
  // Sans effet si un vrai champ Q: existe déjà. Seule la première ligne trouvée est convertie ; les
  // autres lignes équivalentes (ex. R: puis %Q: identiques) sont mises en commentaire (pas de doublon).
  window.rsNormalizeTempo = function (abc) {
    if (typeof abc !== 'string') return abc;
    if (/^[ \t]*Q[ \t]*:/mi.test(abc)) return abc;
    var pattern = /^[ \t]*%?[ \t]*[QR][ \t]*:[ \t]*((?:"[^"\n]*"[ \t]*)?(?:\d+\/\d+[ \t]+)*\d+\/\d+[ \t]*=[ \t]*\d+(?:[ \t]*"[^"\n]*")?)[ \t]*$/;
    var done = false;
    return abc.split('\n').map(function (line) {
      var m = pattern.exec(line.replace(/\r$/, ''));
      if (!m) return line;
      var cr = /\r$/.test(line) ? '\r' : '';
      if (!done) { done = true; return 'Q:' + m[1] + cr; }
      return '%' + line.replace(/^[ \t]*%?/, '');
    }).join('\n');
  };

  function rsTxtImportName(name) {
    if (!/\\.txt$/i.test(name)) return null;
    var base = name.slice(0, -4);
    if (/\\.abct?$/i.test(base)) return base;
    return base + '.abct';
  }
  function replaceFirstFile(input, file) {
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      if (input.files && input.files[0] && input.files[0].name === file.name) return true;
    } catch (e) {}
    try {
      var fake = { 0: file, length: 1, item: function (i) { return i === 0 ? file : null; } };
      Object.defineProperty(input, 'files', { configurable: true, get: function () { return fake; } });
      return true;
    } catch (e2) { return false; }
  }
  document.addEventListener('change', function (ev) {
    var input = ev.target;
    if (!input || (input.id !== 'fileInput' && input.id !== 'setlistFileInput')) return;
    var f = input.files && input.files[0];
    if (!f) return;
    var newName = rsTxtImportName(f.name);
    if (!newName) return;
    try {
      var renamed = new File([f], newName, { type: f.type || 'text/plain', lastModified: f.lastModified });
      replaceFirstFile(input, renamed);
    } catch (e) {}
  }, true);
  // Croix (pseudo-bouton Clear dessine en CSS) du champ "Title or composer" de la liste des morceaux.
  // Le bouton natif de Chrome ne couvre qu une partie de la croix dessinee et n existe pas sur Firefox/certains mobiles :
  // un clic dans les 28 px de droite du champ efface donc le texte et relance le filtre (evenements input + search).
  document.addEventListener('click', function (ev) {
    var el = ev.target;
    if (!el || el.id !== 'tuneSearch' || el.value === '') return;
    var r = el.getBoundingClientRect();
    if (ev.clientX < r.right - 28) return;
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('search', { bubbles: true }));
    el.focus();
    ev.preventDefault();
  }, true);

  var rsLyricsCache = new Map();
  var rsLyricsSearchTokens = {};

  function rsNormSearch(text) {
    var b = typeof window !== 'undefined' && window.__rsBridge;
    if (b && typeof b.normalizeSearch === 'function') {
      return b.normalizeSearch(String(text || ''));
    }
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  }

  window.rsExtractNormalizedLyrics = function (abcText) {
    if (typeof abcText !== 'string' || !abcText) return '';
    var lines = abcText.match(/^[ \t]*[wW][ \t]*:.*$/gm);
    if (!lines || !lines.length) return '';
    var joined = lines.map(function (line) {
      return line.replace(/^[ \t]*[wW][ \t]*:[ \t]*/, '').replace(/\\-/g, '').replace(/-/g, '');
    }).join(' ');
    return rsNormSearch(joined);
  };

  window.rsMatchLyricsCached = function (id, queryNorm) {
    if (!id || !queryNorm) return false;
    var cached = rsLyricsCache.get(id);
    return typeof cached === 'string' && cached.length > 0 && cached.indexOf(queryNorm) !== -1;
  };

  window.rsClearLyricsCache = function (id) {
    if (id) rsLyricsCache.delete(id);
    else rsLyricsCache.clear();
  };

  window.rsSearchLyricsAsync = function (ids, queryNorm, onMatch, scope) {
    var key = scope || 'tunes';
    var token = (rsLyricsSearchTokens[key] || 0) + 1;
    rsLyricsSearchTokens[key] = token;
    var bridge = typeof window !== 'undefined' && window.__rsBridge;
    if (!bridge || typeof bridge.decryptTune !== 'function' || !ids || !ids.length || !queryNorm) return;

    var pending = [];
    for (var i = 0; i < ids.length; i++) {
      if (ids[i] && !rsLyricsCache.has(ids[i])) pending.push(ids[i]);
    }
    if (!pending.length) return;

    (async function () {
      var foundNew = false;
      for (var j = 0; j < pending.length; j++) {
        if (rsLyricsSearchTokens[key] !== token) return;
        var id = pending[j];
        if (!rsLyricsCache.has(id)) {
          try {
            var raw = await bridge.decryptTune(id);
            if (rsLyricsSearchTokens[key] !== token) return;
            var norm = window.rsExtractNormalizedLyrics(String(raw || ''));
            rsLyricsCache.set(id, norm);
            if (norm && norm.indexOf(queryNorm) !== -1) foundNew = true;
          } catch (e) {
            rsLyricsCache.set(id, '');
          }
        }
      }
      if (foundNew && rsLyricsSearchTokens[key] === token && typeof onMatch === 'function') {
        onMatch();
      }
    })();
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = { rsTxtImportName: rsTxtImportName };
})();

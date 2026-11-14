/*
 * RealSheet - mode "fichier local" (double-clic sur realsheet.html, sans serveur ni Python).
 *
 * Les navigateurs interdisent fetch()/XHR sur file://. Ce script ne s'active QUE si la page est
 * ouverte en file:// (il ne fait rien quand l'app est hebergee en http/https) et il :
 *   1. sert les fichiers .json de donnees (lang.json, forum.json, tunebooks/*.json) via un
 *      fichier voisin "<nom>.json.js" charge par <script> (ce qui, lui, est autorise en file://) ;
 *   2. envoie la demande de cle (api/getkey.php) directement a realsheet.net, sans relais local ;
 *   3. neutralise l'enregistrement du service worker (impossible en file://, inutile ici).
 */
(function () {
  'use strict';
  if (!window.fetch) return;

  var REMOTE_GETKEY = 'https://realsheet.net/api/getkey.php';

  // --- MODE HEBERGE (http/https, ex. GitHub Pages) -------------------------------------------
  // Hors file://, le script ne touche qu'a une chose : api/getkey.php n'existe pas sur un
  // hebergement statique (404/405) -> la demande de cle est renvoyee directement a realsheet.net.
  // Les tunebooks sont toujours lus sur l'URL indiquee dans forum.json.
  if (location.protocol !== 'file:') {
    var hostedFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      var abs;
      try { abs = new URL(url, location.href); } catch (e) { return hostedFetch(input, init); }

      if (/\/api\/getkey\.php$/i.test(abs.pathname) && abs.origin === location.origin) {
        return hostedFetch(input, init).then(function (r) {
          if (r.ok) return r;
          return hostedFetch(REMOTE_GETKEY, init);
        }, function () {
          return hostedFetch(REMOTE_GETKEY, init);
        }).catch(function () {
          throw new Error('realsheet.net could not be reached (offline, or the server refuses requests ' +
            'coming from this site). Importing encrypted tunebooks needs this one-time online key request');
        });
      }

      return hostedFetch(input, init);
    };
    return;
  }
  // --- MODE FICHIER LOCAL (file://) -----------------------------------------------------------
  var FILES = (window.__RS_FILES__ = window.__RS_FILES__ || {});
  var realFetch = window.fetch.bind(window);

  function baseName(pathname) {
    var n = pathname.substring(pathname.lastIndexOf('/') + 1);
    try { return decodeURIComponent(n); } catch (e) { return n; }
  }

  // Charge "<url>.js" (sidecar) ; il enregistre son contenu dans window.__RS_FILES__[<nom>].
  function loadSidecar(cleanHref) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = cleanHref + '.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new TypeError('Failed to fetch')); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function methodOf(input, init) {
    return ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var abs;
    try { abs = new URL(url, location.href); } catch (e) { return realFetch(input, init); }
    if (abs.protocol !== 'file:') return realFetch(input, init);

    // 2. cle de dechiffrement des tunebooks : directement chez realsheet.net
    if (/\/api\/getkey\.php$/i.test(abs.pathname)) {
      return realFetch(REMOTE_GETKEY, init).catch(function () {
        throw new Error('realsheet.net could not be reached (offline, or the server refuses requests ' +
          'coming from a local file). Importing encrypted tunebooks needs this one-time online key request');
      });
    }

    // 1. fichiers de donnees .json -> sidecar .json.js
    var name = baseName(abs.pathname);
    if (/\.json$/i.test(name)) {
      var respond = function () {
        var head = methodOf(input, init) === 'HEAD';
        return new Response(head ? null : JSON.stringify(FILES[name]), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      };
      if (Object.prototype.hasOwnProperty.call(FILES, name)) return Promise.resolve(respond());
      return loadSidecar(abs.href.split(/[?#]/)[0]).then(function () {
        if (!Object.prototype.hasOwnProperty.call(FILES, name)) throw new TypeError('Failed to fetch');
        return respond();
      });
    }

    return realFetch(input, init);
  };

  // XHR vers un fichier local (ex. ../api/d.php) : impossible en file://, on echoue tout de suite
  // et proprement (le code appelant l'entoure d'un try/catch) au lieu d'une erreur CORS en console.
  try {
    var realOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      var abs = null;
      try { abs = new URL(url, location.href); } catch (e) { /* ignore */ }
      if (abs && abs.protocol === 'file:') throw new Error('Local files are not readable via XHR in file mode');
      return realOpen.apply(this, arguments);
    };
  } catch (e) { /* ignore */ }

  // 3. service worker : non supporte en file:// -> on evite l'erreur d'enregistrement
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = function () {
        return Promise.resolve({ scope: location.href, fileMode: true });
      };
    }
  } catch (e) { /* ignore */ }
})();

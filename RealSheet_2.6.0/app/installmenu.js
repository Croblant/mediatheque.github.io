/*
 * RealSheet - onglet "Install RealSheet" du menu principal.
 *
 * L'onglet n'apparait QUE si l'app est lancee depuis le web (http/https)
 * sur un appareil Android ou iOS, et si elle n'est pas deja installee
 * (mode standalone / ajoutee a l'ecran d'accueil). En mode file:// (double-clic
 * local) ou sur ordinateur de bureau, l'onglet reste masque.
 *
 * - Android : installe la PWA (manifest.json) via beforeinstallprompt si le
 *   navigateur le permet (bouton "Install the App"), sinon instructions
 *   "Ajouter a l'ecran d'accueil".
 * - iOS : raccourci Safari "Add to Home Screen" (les navigateurs iOS ne
 *   proposent pas d'installation PWA).
 *
 * NB : les clics sont geres par DELEGATION au niveau du document (phase de
 * capture), car le moteur de traduction de l'app remplace les elements
 * data-i18n et supprimerait ainsi les ecouteurs poses directement dessus.
 */
(function () {
  'use strict';

  // --- Conditions d'affichage -------------------------------------------------

  function isWebLaunch() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  // 'android' | 'ios' | null
  function mobilePlatform() {
    var ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipod|ipad/i.test(ua)) return 'ios';
    // iPadOS 13+ se presente comme un Mac avec ecran tactile
    if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
    return null;
  }

  // Deja lancee en tant qu'app installee (PWA ou raccourci ecran d'accueil) ?
  function isStandalone() {
    try {
      return window.matchMedia('(display-mode: standalone)').matches
        || window.matchMedia('(display-mode: fullscreen)').matches
        || window.matchMedia('(display-mode: minimal-ui)').matches
        || window.navigator.standalone === true;
    } catch (e) {
      return false;
    }
  }

  function showTab() {
    return isWebLaunch() && !!mobilePlatform() && !isStandalone();
  }

  // --- Service worker ----------------------------------------------------------
  // Chrome n'emet 'beforeinstallprompt' (bouton d'installation natif) que si la
  // page est controlee par un service worker. On l'enregistre ici (http/https
  // uniquement), avec une portée relative au dossier app/.
  function registerServiceWorker() {
    if (!isWebLaunch() || !('serviceWorker' in navigator)) return;
    var go = function () {
      try {
        navigator.serviceWorker.register('service-worker.js', { scope: './' })
          .catch(function (err) { console.warn('SW registration failed:', err); });
      } catch (e) { /* ignore */ }
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go);
  }
  registerServiceWorker();

  // --- Ecran d'installation ----------------------------------------------------

  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    // Si les instructions manuelles sont affichees, proposer le bouton natif.
    var android = document.getElementById('installAndroid');
    if (android && android.style.display === 'block'
        && document.getElementById('installScreen').style.display === 'block') {
      showHelp('installStart');
    }
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    if (document.getElementById('installScreen').style.display === 'block') {
      showHelp('installSuccess');
    }
  });

  function showHelp(id) {
    var blocks = document.querySelectorAll('#installScreen .installHelp');
    for (var i = 0; i < blocks.length; i++) {
      var on = blocks[i].id === id;
      blocks[i].style.display = on ? 'block' : 'none';
      blocks[i].setAttribute('aria-hidden', on ? 'false' : 'true');
    }
  }

  function openInstallScreen() {
    var scr = document.getElementById('installScreen');
    if (!scr) return;
    var plat = mobilePlatform();
    if (plat === 'ios') {
      showHelp('installIos');
    } else if (deferredPrompt) {
      showHelp('installStart');
    } else {
      showHelp('installAndroid');
    }
    scr.style.display = 'block';
    scr.setAttribute('aria-hidden', 'false');

    // Refermer le volet latéral sideNav
    var sn = document.getElementById('sideNav');
    if (sn) {
      sn.style.left = '-800px';
      sn.setAttribute('aria-hidden', 'true');
    }
  }

  function closeInstallScreen() {
    var scr = document.getElementById('installScreen');
    if (!scr) return;
    scr.style.display = 'none';
    scr.setAttribute('aria-hidden', 'true');
  }

  function installButtonClicked() {
    if (deferredPrompt) {
      showHelp('installWait');
      var dp = deferredPrompt;
      deferredPrompt = null;   // un prompt ne peut etre utilise qu'une fois
      try {
        dp.prompt();
        dp.userChoice.then(function (choice) {
          // Si l'utilisateur annule, on revient aux instructions manuelles
          // (si l'installation reussit, 'appinstalled' affiche le succes).
          if (!choice || choice.outcome !== 'accepted') showHelp('installAndroid');
        }).catch(function () { showHelp('installAndroid'); });
      } catch (e) {
        showHelp('installAndroid');
      }
    } else {
      // Pas de prompt natif disponible : montrer les instructions.
      showHelp(mobilePlatform() === 'ios' ? 'installIos' : 'installAndroid');
    }
  }

// --- Gestion tactile et clic pour mobile ---
  var lastTouchTime = 0;

  function closestWithId(el, id) {
    while (el && el.nodeType === 1) {
      if (el.id === id) return el;
      el = el.parentNode;
    }
    return null;
  }

  function handleInteraction(e) {
    var t = e.target;
    if (!t || t.nodeType !== 1) return;

    if (e.type === 'touchend') {
      lastTouchTime = Date.now();
    } else if (e.type === 'click' && (Date.now() - lastTouchTime < 500)) {
      return; // Évite le double déclenchement
    }

    if (closestWithId(t, 'menuInstall')) {
      e.preventDefault();
      e.stopPropagation();
      openInstallScreen();
      return;
    }
    if (closestWithId(t, 'installButton')) {
      e.preventDefault();
      e.stopPropagation();
      installButtonClicked();
      return;
    }
    if (closestWithId(t, 'installCloseLink')) {
      e.preventDefault();
      e.stopPropagation();
      closeInstallScreen();
      return;
    }
  }

  document.addEventListener('touchend', handleInteraction, { capture: true, passive: false });
  document.addEventListener('click', handleInteraction, true);

  // --- Initialisation ----------------------------------------------------------

  function applyVisibility() {
    var item = document.getElementById('menuInstall');
    if (!item) return;
    // L'onglet peut etre re-remplace par le moteur de traduction : on force
    // l'etat voulu a DOMContentLoaded, au load, et apres chaque cycle court.
    item.style.display = showTab() ? '' : 'none';
  }

  function init() {
    applyVisibility();
    window.addEventListener('load', applyVisibility);
    // Le menu peut etre reconstruit plus tard (chargement des tunebooks,
    // traduction) : re-appliquer la visibilite plusieurs fois.
    var tries = 0;
    var timer = setInterval(function () {
      applyVisibility();
      if (++tries >= 20) clearInterval(timer);   // ~10 s
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

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

  function isSafari() {
    var ua = navigator.userAgent || '';
    return /safari/i.test(ua) && !/chrome|crios|crmo|fxios|edgios|edg|opr|opera|android/i.test(ua);
  }

  function isMacSafari() {
    var ua = navigator.userAgent || '';
    return isSafari() && /macintosh/i.test(ua) && !(navigator.maxTouchPoints > 1);
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
    return isWebLaunch() && (!!mobilePlatform() || isMacSafari()) && !isStandalone();
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

  function closeSideNav() {
    var sn = document.getElementById('sideNav');
    if (sn) {
      sn.style.left = '-800px';
      sn.setAttribute('aria-hidden', 'true');
    }
  }

  function showScreen(helpId) {
    var scr = document.getElementById('installScreen');
    if (!scr) return;
    showHelp(helpId);
    scr.style.display = 'block';
    scr.setAttribute('aria-hidden', 'false');
  }

  // Lance directement l'installation native de Chrome (equivalent du menu
  // Chrome "Installer l'application"), dans le geste de l'utilisateur.
  function launchNativeInstall() {
    var dp = deferredPrompt;
    deferredPrompt = null;   // un prompt ne peut etre utilise qu'une fois
    try {
      dp.prompt();
      dp.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') {
          showScreen('installSuccess');
        } else {
          showScreen('installAndroid');   // annule : instructions manuelles
        }
      }).catch(function () { showScreen('installAndroid'); });
    } catch (e) {
      showScreen('installAndroid');
    }
  }

  function isFrenchUi() {
    var lang = '';
    try {
      lang = localStorage.getItem('RealSheetLang') || document.documentElement.lang || navigator.language || '';
    } catch (e) {
      lang = navigator.language || '';
    }
    return /^fr/i.test(String(lang));
  }

  // Remplit #installIos avec des instructions visuelles adaptees a Safari (iOS ou macOS).
  // NB : navigator.share() sur iOS ouvre une feuille de partage sans l'option "Sur l'ecran d'accueil" ;
  // il faut passer par le bouton Partager de la barre d'outils de Safari.
  function populateSafariInstructions() {
    var box = document.getElementById('installIos');
    if (!box) return;
    var fr = isFrenchUi();
    var mac = isMacSafari();

    var title = mac
      ? (fr ? 'Installer RealSheet avec Safari (Mac)' : 'Install RealSheet with Safari (Mac)')
      : (fr ? 'Installer RealSheet avec Safari (iPhone / iPad)' : 'Install RealSheet with Safari (iPhone / iPad)');

    var stepsHtml;
    if (mac) {
      stepsHtml = fr
        ? '<b>1. Cliquez sur le bouton Partager</b> <img src="img/share90.png" class="iconInstall" alt="Partager"> dans la barre d’outils de Safari (ou ouvrez le menu <b>Fichier</b>)<br><br>' +
          '<b>2. Choisissez « Ajouter au Dock… »</b><br><br>' +
          'Ouvrez ensuite RealSheet depuis le Dock comme une application.'
        : '<b>1. Click the Share button</b> <img src="img/share90.png" class="iconInstall" alt="Share"> in Safari’s toolbar (or open the <b>File</b> menu)<br><br>' +
          '<b>2. Select "Add to Dock…"</b><br><br>' +
          'Then launch RealSheet directly from your Dock.';
    } else {
      stepsHtml = fr
        ? '<b>1. Appuyez sur le bouton Partager de Safari</b> <img src="img/share90.png" class="iconInstall" alt="Partager"> (dans la barre d’outils en bas sur iPhone, ou en haut à droite sur iPad)<br><br>' +
          '<b>2. Faites défiler et choisissez « Sur l’écran d’accueil »</b> <img src="img/plus90.png" class="iconInstall" alt="+"><br><br>' +
          '<b>3. Appuyez sur « Ajouter »</b>, puis fermez cet onglet et ouvrez RealSheet depuis son icône.'
        : '<b>1. Tap Safari’s Share button</b> <img src="img/share90.png" class="iconInstall" alt="Share"> (in the bottom toolbar on iPhone, or top-right on iPad)<br><br>' +
          '<b>2. Scroll down and tap "Add to Home Screen"</b> <img src="img/plus90.png" class="iconInstall" alt="+"><br><br>' +
          '<b>3. Tap "Add"</b>, then close this tab and open RealSheet from its Home Screen icon.';
    }

    var noteHtml = (!mac && !isSafari())
      ? (fr
          ? 'Remarque : sur iPhone/iPad, utilisez <b>Safari</b> si « Sur l’écran d’accueil » n’apparaît pas dans votre navigateur actuel.'
          : 'Note: on iPhone/iPad, use <b>Safari</b> if "Add to Home Screen" is not available in your current browser.')
      : (fr
          ? 'Remarque : sur Safari, l’option « Sur l’écran d’accueil » n’est disponible que depuis le bouton Partager de la barre d’outils de Safari.'
          : 'Note: in Safari, "Add to Home Screen" is only available from Safari’s own toolbar Share button.');

    box.innerHTML =
      '<h2>' + title + '</h2><br>' +
      '<div class="installText">' + stepsHtml + '</div><br><br>' +
      '<div class="installText">' + noteHtml + '</div>';
  }

  // Clic sur l'onglet "Install" : sur Android/Chrome, on declenche tout de
  // suite l'installation (sans ecran intermediaire). Sur Safari (iOS/Mac) :
  // guide visuel Safari + acces direct au menu Partager si disponible.
  function openInstallScreen() {
    var plat = mobilePlatform();
    closeSideNav();
    if (plat === 'ios' || isMacSafari()) {
      populateSafariInstructions();
      showScreen('installIos');
    } else if (deferredPrompt) {
      launchNativeInstall();
    } else {
      showScreen('installAndroid');
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
      launchNativeInstall();
    } else {
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

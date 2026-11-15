# Rapport d'Audit Technique — RealSheet (`2.6.17`)

Date de l'audit : 14 novembre 2026  
Périmètre inspecté : dépôt local `RealSheet` (version applicative déclarée `#realsheetVersion` = `RealSheet v 142.261028`, extraite de `RealSheet_2_6_17.zip`) et comparaison runtime entre le serveur local (`http://localhost:8000`) et l'instance distante (`https://realsheettest.fwh.is`).

---

## 1. Synthèse exécutive

Résultat du script automatique [audit-project.mjs](file:///g:/Mon%20Drive/Sites%20web/RealSheet/.agents/skills/realsheet-audit/scripts/audit-project.mjs) : **11 PASS, 5 WARN, 0 FAIL**.

- **Points forts vérifiés** :
  - Zéro dépendance externe cassée : toutes les ressources référencées dans [main.html](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html) (40 locales), [forum.html](file:///g:/Mon%20Drive/Sites%20web/RealSheet/forum/forum.html) (6 locales) et [main.html](file:///g:/Mon%20Drive/Sites%20web/RealSheet/main.html) (1 locale) existent sur disque.
  - Les paires `.json` ↔ `.json.js` (`app/lang.json` et `forum/forum.json`) sont synchronisées pour le mode `file://`.
  - Le rendu ABC (`window.rsApplyAllKeyAccidentals`, `window.rsFlattenNestedTuplets`, `#displayAllSharp`) et le lecteur audio intégré (`#rsPlaybackControls`, `#rsPlaybackPlay`, `window.__rsAutoFollow`) fonctionnent en environnement local sans erreur JavaScript bloquante, avec mise en surbrillance des mesures et défilement automatique.
  - Les 51 entrées actuelles de `PRECACHE_URLS` dans [service-worker.js](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/service-worker.js) existent toutes dans `app/`.
- **Risques majeurs identifiés** :
  1. **Requêtes `XMLHttpRequest` synchrones (`async = false`)** sur le thread principal et appels à des endpoints absents (`../api/d.php` en 404).
  2. **Bugs dans IndexedDB et les patchs ABC en clair** (`name: "AES-GCM"` dans `$7` bloquant potentiellement la re-récupération de clé `$1` ; fuite globale `window.major` dans `rsApplyAllKeyAccidentals` ; parseur `[...]` vorace sur crochets de reprise `[1` dans `rsFlattenNestedTuplets`).
  3. **Manques dans le Service Worker** (`img/book-download.png` utilisé à l'exécution mais absent de `PRECACHE_URLS`) et **collisions/anomalies HTML/CSS** (IDs dupliqués, balises orphelines, propriétés CSS invalides).
  4. **Incompatibilité sur hébergement `realsheettest.fwh.is`** due au paramètre anti-bot `?i=1` et au blocage des requêtes `fetch` côté hébergeur.

---

## 2. Constats Critiques & Majeurs

### 2.1 JavaScript applicatif ([main.js](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js))

1. **Requêtes XHR synchrones (`async = false`) sur le thread principal**
   - [main.js#L1747](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L1747) : `e.open("GET", "../api/d.php", !1)` exécute un XHR synchrone au démarrage (`load()`), générant systématiquement une **404 Not Found** observée sur `http://localhost:8000/api/d.php` (le fichier PHP étant absent du dépôt).
   - [main.js#L1816](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L1816) : `e.open("HEAD", "https://realsheet.net/web/img/r-logo-180.png?t=" + Date.now(), !1)` bloque le thread UI lorsque `navigator.connection` est absent.
   - [main.js#L2224](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L2224) : `o.open("GET", "https://realsheet.net/import/checkimports.php?fid=" + d, !1)` appelle de façon synchrone un endpoint externe absent localement.

2. **Écrasement du nom du tunebook par `"AES-GCM"` dans IndexedDB (`$7`)**
   - Dans [main.js#L2724-L2732](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L2724-L2732), `objectStore("tunes").put(...)` écrit littéralement `name: "AES-GCM"` au lieu du nom logique du tunebook (`W.name`, pourtant préparé dans `WQ` en L4330).
   - Conséquence : dans `$1(x)` ([main.js#L2631-L2636](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L2631-L2636)), si la clé `x.kref` manque dans l'`objectStore("meta")`, l'application appelle `$C(x.name)` — qui enverrait `name=AES-GCM` à `getkey.php` au lieu du nom réel du catalogue (`1_PD`, `2_Jazz_Tunes`, etc.).

3. **Fuite globale et cas limite modal dans `window.rsApplyAllKeyAccidentals`**
   - [main.js#L30](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L30) : `var tonic = letter + accidental;` est déclarée puis inutilisée.
   - [main.js#L41-L42](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L41-L42) et [L46](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L46) : `major` est assigné sans `var` ni `let`, provoquant une fuite sur `window.major`.
   - [main.js#L44-L47](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L44-L47) : pour `K:Abm`, `relativeValue === 11` renvoie `'B'` (5 dièses) car `'11':'Cb'` n'est pas présent dans `flatEnharmonic`.

4. **Risque de capture abusive sur crochets non fermés dans `window.rsFlattenNestedTuplets`**
   - [main.js#L154-L158](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L154-L158) : tout caractère `[` non suivi de `[A-Za-z]:` cherche le prochain `]` via `text.indexOf("]", i + 1)`. Une barre de reprise `[1` ou `[|` sans `]` fermant correspondant sur la même portée peut absorber l'ensemble des notes jusqu'au prochain `]` (ou fin de texte), faussant le comptage de nuplets imbriqués.

5. **Doublons possibles d'importation par URL différente**
   - Constaté visuellement lors du test navigateur (capture `final_step_266.png`) : deux entrées *« La Bible du Pipeau »* coexistent dans `Edit Tunebooks` car `Wp(x)` ([main.js#L4386](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L4386)) indexe par `"u:" + x` (URL brute avec ou sans préfixe `proxy.php` / paramètres).

### 2.2 PWA & Service Worker ([service-worker.js](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/service-worker.js))

- **Image active absente du précache** : `img/book-download.png` est référencée en clair et préchargée dans [main.js#L904](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L904), [L1864](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L1864) et [L3571](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L3571) pour les tunebooks locaux, mais manque dans `PRECACHE_URLS` (`img/up.png` et `img/down.png` présentes dans `app/img/` sont également absentes du précache et non référencées en clair).
- **Couplage racine dans le SW** : `url.pathname.startsWith('/forum/')` dans [service-worker.js](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/service-worker.js) suppose que l'application est hébergée à la racine du domaine et échouerait à exclure `/forum/` si déployée dans un sous-dossier.

---

## 3. Constats HTML, DOM & Accessibilité

### 3.1 [app/main.html](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html)

- **Identifiants HTML dupliqués** :
  - `id="hamburger1"` présent deux fois : dans `#navBackup` ([L251](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L251)) et `#navAbout` ([L275](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L275)).
  - `id="hideSettingsLayer"` présent deux fois : dans `#info` ([L358](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L358)) et `#abc` ([L364](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L364)).
  - Impact vérifié : les clics restent fonctionnels en runtime car [main.js](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js) utilise `querySelectorAll(".hamburger")` ([L4464](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L4464)) et `querySelectorAll("#hideSettingsLayer")` ([L4880](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L4880)), mais cela reste invalide vis-à-vis des sélecteurs `getElementById` et de l'accessibilité.
- **Balises malformées / orphelines** :
  - [L228](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L228) : balise de fermeture `</input>` invalide sur `<input type="search" id="tuneSearch">`.
  - [L283](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L283) : `</a>` orphelin à l'intérieur de `<span class="logoText ...">`.
  - [L306](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L306) : caractères parasites `">` dans le texte du lien `#showSysInfo`.
  - [L353-L354](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L353-L354) : `</div>` fermant excédentaire.
  - [L370](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L370) : `</p>` fermant orphelin dans `#abc`.
- **Dépendances explicites vers `realsheet.net`** : liens codés en dur aux lignes [L293](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L293), [L295](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L295), [L495](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L495), [L499](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L499) et [main.js#L4831](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L4831).

### 3.2 [forum/forum.html](file:///g:/Mon%20Drive/Sites%20web/RealSheet/forum/forum.html)

- [L38-L40](file:///g:/Mon%20Drive/Sites%20web/RealSheet/forum/forum.html#L38-L40) : balise non standard `<xp>`.
- [L61-L94](file:///g:/Mon%20Drive/Sites%20web/RealSheet/forum/forum.html#L61-L94) : nombreuses balises `<br>` consécutives utilisées comme espaceur vertical avant `#foldout`.
- [L95-L100](file:///g:/Mon%20Drive/Sites%20web/RealSheet/forum/forum.html#L95-L100) : bloc `#foldout` pointant vers `3_fiveStar.json` (absent du dépôt) et vers le domaine externe `goreallyreal.lima.zone/tb/`.

---

## 4. Constats CSS ([player.css](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/css/player.css) & [forum.css](file:///g:/Mon%20Drive/Sites%20web/RealSheet/forum/css/forum.css))

- **[app/css/player.css](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/css/player.css)** :
  - [L27](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/css/player.css#L27) : propriété invalide `xxfont-display: swap;`.
  - [L390](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/css/player.css#L390) : `.abcjs-symbol` définit `padding:-10px;` (rejeté en CSS, padding négatif interdit).
  - [L403](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/css/player.css#L403) : `.abcjs-lyric` définit `font-size: 0.9;` sans unité (`em` manquant -> ignoré par le parseur CSS).
  - [L735](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/css/player.css#L735) : `button, .button` utilise `vertical-align:center;` (mot-clé invalide, attendu `middle`).
  - [L786](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/css/player.css#L786) : `select option` utilise `line-height: 20;` sans unité (= 2000 %).
  - [L931](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/css/player.css#L931) et [L990](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/css/player.css#L990) : `font-size: 0.9 em;` et `font-size: 1 em;` avec espace avant `em` (rejetés par le navigateur).
  - Absence de règle `@media (prefers-color-scheme: dark)` bien que `<meta name="color-scheme" content="light dark">` soit déclaré dans [main.html#L11](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L11).
- **[forum/css/forum.css](file:///g:/Mon%20Drive/Sites%20web/RealSheet/forum/css/forum.css)** :
  - [L28](file:///g:/Mon%20Drive/Sites%20web/RealSheet/forum/css/forum.css#L28) : `xxfont-display: swap;`.
  - [L37-L38](file:///g:/Mon%20Drive/Sites%20web/RealSheet/forum/css/forum.css#L37-L38) : `margin: 0 px;` / `margin-top: 0 px;` (espace invalide avant `px`).
  - [L59-L62](file:///g:/Mon%20Drive/Sites%20web/RealSheet/forum/css/forum.css#L59-L62) : règle globale `div { page-break-inside: avoid; page-break-before: always; }` pouvant provoquer un saut de page par `<div>` à l'impression.
  - [L341](file:///g:/Mon%20Drive/Sites%20web/RealSheet/forum/css/forum.css#L341) : `vertical-align:center;`.

---

## 5. Code mort, redondances et hygiène du dépôt

- [main.js#L4929-L4937](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.js#L4929-L4937) : variable `rsPlaying` inutilisée (`L4930`) et bloc conditionnel `L4935-L4936` inatteignable après le `return` inconditionnel de `L4931` (`if (window.__rsLastRenderW === window.innerWidth) return;`).
- [app/playback.js](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/playback.js) définit `RealSheetPlayback`, mais la classe n'est jamais instanciée (le lecteur actif est implémenté dans `main.js`).
- `window.tricktrack` est appelé à de multiples endroits dans `main.js` (L1937-2140, L4041-5596) et neutralisé par le stub no-op [main.html#L32](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/main.html#L32) ; `TT_SCRIPT_REL = '../tricktrack/tricktrack.js'` reste présent dans [service-worker.js#L10](file:///g:/Mon%20Drive/Sites%20web/RealSheet/app/service-worker.js#L10).
- Dossiers de sauvegarde inutilisés à l'exécution occupant ~2,1 Mo dans `app/lib/` : `app/lib/github/` (7 fichiers, 1069 Ko) et `app/lib/lib initiale/` (7 fichiers, 1078 Ko).

---

## 6. Comparaison runtime (`https://realsheettest.fwh.is` vs `http://localhost:8000`)

Vérifications effectuées via le navigateur automatisé sur les origines autorisées `https://realsheettest.fwh.is` et `http://localhost:8000` (capture locale vérifiée : [final_step_266.png](file:///C:/Users/snake/.gemini/antigravity/brain/5fc9982d-3a31-4def-bced-c0fa48f7316b/browser_evidence/be13fe83-5ece-487f-bced-c0fa48f7316b/final_step_266.png)) :

| Critère | Instance distante (`realsheettest.fwh.is`) | Instance locale (`localhost:8000`) |
|---|---|---|
| **URL finale** | Redirigée vers `?i=1` par l'hébergeur | `http://localhost:8000/app/main.html` |
| **Chargement de l'app** | Déclenche une invite `"Import tunebook 1?"` liée au `?i=1` ; polices `.woff2` en échec | Fonctionnel ; partition `'S wonderful` rendue en SVG (`#paper`) ; lecture + surbrillance OK |
| **Chargement du Forum** | Bloqué sur `"Loading tunebooks…"` (`forum.json` non récupérable côté hébergeur) | 6 tunebooks chargés depuis `forum.json`, 0 image cassée (7/7), liens fonctionnels |
| **Option `#displayAllSharp`** | Non présente/initialisée sur l'instance distante observée | Présente dans `#display-dropdown`, fonctionnelle sans erreur console |
| **Requête `../api/d.php`** | Non résolue | `404 Not Found` (attendue, fichier PHP omis du dépôt) |

---

## 7. Plan d'amélioration priorisé

1. **Fiabilité & Performance** : passer `d.php` / `r-logo-180.png` / `checkimports.php` en `fetch` asynchrone (ou les conditionner/supprimer proprement) ; corriger `name: W.name || "AES-GCM"` dans `$7` (`main.js#L2730`) ; déclarer `var major;` et gérer `[1`/`[|` dans `rsApplyAllKeyAccidentals` / `rsFlattenNestedTuplets`.
2. **PWA & Hors-ligne** : ajouter `img/book-download.png` (et tout nouveau module JS) à `PRECACHE_URLS` ; utiliser un chemin dérivé de `SCOPE_PATH` pour `/forum/` et retirer `TT_SCRIPT_REL` obsolète.
3. **HTML / CSS** : supprimer les IDs dupliqués (`hamburger1`, `hideSettingsLayer`), corriger les balises fermantes orphelines et corriger les typos CSS (`xxfont-display`, `0.9 em` -> `0.9em`, `0 px` -> `0px`, `vertical-align: middle`).
4. **Nettoyage** : déplacer ou exclure `app/lib/github/` et `app/lib/lib initiale/` hors du package de production web, et retirer/unifier `playback.js` si le lecteur inline de `main.js` fait foi.

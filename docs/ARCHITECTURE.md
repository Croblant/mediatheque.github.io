# Architecture de RealSheet (v2.6.22.1)

RealSheet est une application web progressive (PWA) de lecture et de transposition de grilles et partitions au format ABC (`abcjs`), conçue pour fonctionner sans build step ni backend obligatoire, aussi bien en hébergement web (`https://realsheettest.fwh.is/app/main.html`), via un serveur local (`node serve.mjs` / `python3 serve.py`), qu'en ouverture directe par double-clic (`file://`).

---

## 1. Arborescence du projet

```text
RealSheet/
├── main.html            # Redirection racine vers app/main.html
├── README.txt                # Notes de version et d'installation (2.6.17)
├── GEMINI.md                 # Règles d'ingénierie Antigravity pour ce repo
├── serve.mjs                 # Serveur de dev Node.js (statique + proxy + relais getkey)
├── serve.py                  # Équivalent Python 3 du serveur local
├── convertir-abct.html       # Outil navigateur : déchiffrer un tunebook .json -> .abct
├── convertir-abct.mjs        # Outil Node.js : déchiffrer un tunebook .json -> .abct
├── docs/
│   └── ARCHITECTURE.md       # Ce document
├── api/                      # Emplacement pour relais PHP optionnels (proxy.php, getkey.php)
├── app/                      # Application principale (portée PWA)
│   ├── main.html        # Shell HTML de l'application (menus, calques, feuille)
│   ├── main.js          # Cœur applicatif (5718 lignes : patchs en clair + cœur obfusqué)
│   ├── filemode.js           # Adaptateur file:// (sidecars .json.js) et fallback getkey.php en http(s)
│   ├── installmenu.js        # Gestion de l'onglet "Install RealSheet" (PWA Android/iOS) + enregistrement SW
│   ├── rs-extras.js          # Import .txt (load from local) + cles d'ut 3/4 (instruments "C - Ut 3/4") ; charge avant main.js
│   ├── playback.js           # Classe RealSheetPlayback (actuellement non instanciée ; lecteur intégré dans main.js)
│   ├── service-worker.js     # Service Worker (précache offline + circuit breaker)
│   ├── manifest.json         # Manifest PWA relatif (./main.html)
│   ├── lang.json             # Dictionnaire i18n (écran d'installation)
│   ├── lang.json.js          # Sidecar file:// de lang.json (window.__RS_FILES__["lang.json"])
│   ├── css/player.css        # Feuille de styles principale + règles @media print
│   ├── font/                 # Polices WOFF2 locales (Roboto, Roboto Slab, Barlow Condensed, Luckiest Guy, Noto Music)
│   ├── img/                  # Icônes UI et icônes PWA
│   └── lib/                  # Bibliothèques tierces embarquées
│       ├── abc.js            # abcjs-basic-min.js v6.7.2 patché (nuplets multi-chiffres & gracenotes)
│       ├── jszip.min.js      # Export / manipulation ZIP
│       ├── dom-to-image.min.js
│       ├── jspdf.umd.min.js  # Export PDF
│       ├── pako.min.js
│       ├── UPNG.js           # Export PNG
│       ├── ua-parser.min.js
│       ├── github/           # Copies de référence (non chargées par l'app)
│       └── lib initiale/     # Copies originales avant patchs (non chargées par l'app)
└── forum/                    # Bibliothèque / catalogue de tunebooks
    ├── index.html
    ├── forum.html            # Interface du catalogue
    ├── forum.js              # Chargement local + fusion distante (realsheet.net/forum/forum.json)
    ├── forum.json            # Catalogue local des tunebooks
    ├── forum.json.js         # Sidecar file:// de forum.json
    ├── convertir-json.html   # Convertisseur manuel .json -> .json.js
    ├── css/forum.css
    ├── font/
    ├── img/
    └── tunebooks/            # Dépôt éventuel de tunebooks locaux (.json / .json.js / .abct)
```

---

## 2. Les trois modes d'exécution

### Mode A : Hébergement Web statique ou PHP (`http(s)://`, ex. `realsheettest.fwh.is`)
1. `app/installmenu.js` enregistre `app/service-worker.js` avec le scope `./` (`/app/`).
2. `service-worker.js` met en cache les ressources listées dans `PRECACHE_URLS` et applique une stratégie *network-first* (timeout 3 s) avec *circuit breaker* (15 s de cache direct après échec réseau).
3. `app/filemode.js` détecte `location.protocol !== 'file:'` et intercepte uniquement les `fetch()` vers `/api/getkey.php` : si l'endpoint local échoue (404/405 sur hébergement statique), il bascule automatiquement vers `https://realsheet.net/api/getkey.php`.
4. Le chargement de tunebooks externes par URL tente d'abord un `fetch()` direct (CORS), puis bascule sur `/api/proxy.php` si disponible.

### Mode B : Serveur local de développement (`node serve.mjs` ou `python3 serve.py`)
- Sert les fichiers statiques sur `http://127.0.0.1:8000` (sans Python requis avec `node serve.mjs`).
- Fournit `GET /api/proxy.php?url=...` (et `/api/proxy.php/<nom>?url=...`) avec protection anti-SSRF (refus des IP privées/loopback/link-local) et plafond de 5 Mo.
- Fournit `POST /api/getkey.php` en relayant vers `https://realsheet.net/api/getkey.php`.

### Mode C : Ouverture directe par double-clic (`file://`)
- Les navigateurs bloquent `fetch()`, `XHR` local et `ServiceWorker` sur `file://`.
- `app/filemode.js` intercepte `fetch()` sur `*.json` et injecte dynamiquement `<script src="<chemin>.json.js">` qui peuple `window.__RS_FILES__["<nom>.json"]`, puis renvoie une `Response` synthétique 200.
- Toute modification d'un `.json` (`app/lang.json`, `forum/forum.json`, `forum/tunebooks/*.json`) nécessite donc la mise à jour de son `.json.js` : elle est automatique avec `node serve.mjs` (surveillance de `forum.json` et `lang.json`), ou avec `sync-sidecars.mjs --watch` / `sync-forum.bat` sans serveur (Node.js uniquement ; `serve.py` ne fait pas cette synchro).

---

## 3. Cartographie de `app/main.js`

`app/main.js` (5718 lignes) combine un cœur hérité obfusqué (décodeur RC4/Base64 `_0x30a7` aux lignes 205–253 et dictionnaire `_0x3e41` aux lignes 5699–5718) avec des correctifs et fonctionnalités ajoutés en clair :

| Lignes | Symbole / Zone | Rôle |
| --- | --- | --- |
| `1–122` | `window.rsApplyAllKeyAccidentals(abc)` | Mode `All #/b` : explicite les altérations à la clé devant chaque note concernée, en tenant compte des barres de mesure et des changements de tonalité `[K:...]`. |
| `124–203` | `window.rsFlattenNestedTuplets(text)` | Aplatit les nuplets imbriqués ABC (ex. `(17:8:35 ... (3EFG`) en tronçons successifs compatibles avec `abcjs`. |
| `205–253` | `_0x30a7` | Décodeur de chaînes du code obfusqué. |
| `254–5698` | `load()` | Initialisation globale, gestion `localStorage`, menus, import/export, rendu et lecteur audio. |
| `2906–2919` | Tempo par défaut | Injecte `Q:3/8=120` (mesures composées en `/8`) ou `Q:1/4=120` si absent, et applique `.rs-hide-tempo` sur `<body>`. |
| `2933–2943` | Prétraitement ABC | Correction `"Cb`/`"Fb`, `rsFlattenNestedTuplets`, transposition via `ABCJS`, normalisation des accords jazz (`m7b5`→`ø7`, `maj7`→`Δ7`, `-7`→`m7`, etc.), `rsApplyAllKeyAccidentals`. |
| `2945–3005` | Double rendu `ABCJS.renderAbc` | Passe 1 cachée (`"*"`) pour calculer la largeur naturelle, puis passe 2 dans `#paper` avec `oneSvgPerLine: true`. |
| `3006–3015` | `.abcjs-repeat` | Marque les annotations `D.C.`, `D.S.`, `Fine`, `Coda` pour leur positionnement CSS. |
| `3016–3287` | Lecteur audio `#rsPlaybackControls` | Crée `#rsPlaybackPlay` et `#rsPlaybackStatus` dans `#menu`, pilote `ABCJS.synth.CreateSynth` + `ABCJS.TimingCallbacks`, gère le suivi visuel (`window.__rsAutoFollow`) et la reprise après rotation d'écran (`rsSameTune`). |
| `4219–4232` | `Wq(x)` | Extrait le nom de fichier réel d'une URL, y compris à travers `proxy.php?url=...`. |
| `4929–4937` | Garde `resize` mobile | Mémorise `window.__rsLastRenderW` et ignore les redimensionnements uniquement verticaux (barre d'adresse ou clavier virtuel Android). |
| `5699–5718` | `_0x3e41()` | Table de chaînes encodées. **Ne pas modifier les index existants.** |

---

## 4. Patchs de `app/lib/abc.js`

Par rapport à `app/lib/lib initiale/abc.js` (abcjs v6.7.2 standard), `app/lib/abc.js` (`?v=1001-shortbar`) embarque quatre correctifs critiques :
1. **Nuplets à plusieurs chiffres** (ligne 3) : boucle de lecture de tous les chiffres après `(` pour supporter les nuplets >= 10 (ex. `(17:8:35`).
2. **Durée des notes d'ornement (`gracenotes` / `acciaccatura`)** (lignes 4–19) : calcul proportionnel avec plancher temporel (`floorSeconds`: `0.018` ou `0.045`) et soustraction de `graceTotal` sur la note principale au lieu d'une simple division par 2.
3. **Voies d'accords (`chordLines`)** : `e.staff.specialY.chordLines` est fusionné (maximum) entre les voix d'une même portée (paramètre `rsPrevLines`). Sans cela, la dernière voix (sans accords) écrasait le nombre de voies calculé pour la voix 1 : dès qu'une annotation `"^texte"` partageait une note avec un accord, les accords descendaient sur la portée.
4. **Lignes sans portée** (`cleanUp`) : avec `%%staffnonote 0`, une ligne dont toutes les portées sont retirées est supprimée ; sans cela abcjs plante au rendu (`redraw failed`). Utilisé par l'option *Hide empty lines* (`app/emptylines.js`, clé `localStorage` `rsHideEmptyLines`).

---

## 5. Points d'attention identifiés à la reprise (v2.6.17)

L'audit initial met en lumière quelques éléments à traiter ou surveiller lors des prochaines évolutions :
- `app/img/book-download.png` est utilisé dans `app/main.js` (ligne 904) mais absent de `PRECACHE_URLS` dans `app/service-worker.js`.
- `app/img/up.png` et `app/img/down.png` sont présents dans `app/img/` depuis la 2.6.17 mais ne sont pas encore câblés dans l'interface.
- `app/playback.js` (`RealSheetPlayback`) est chargé par `main.html` et précaché par `service-worker.js`, alors que le lecteur actif est implémenté inline dans `main.js`.
- `app/lib/github/` et `app/lib/lib initiale/` contiennent des copies de sauvegarde volumineuses (~2 Mo) inutilisées à l'exécution (à exclure lors de la préparation de builds de déploiement si nécessaire).

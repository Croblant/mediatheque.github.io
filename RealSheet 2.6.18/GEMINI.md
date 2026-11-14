# Règles d'ingénierie — RealSheet

Ces règles s'appliquent à toute modification, audit ou ajout de fonctionnalité dans le projet RealSheet (`app/`, `forum/`, `api/`, et scripts racine).

## 1. Préservation des trois modes d'exécution
Toute évolution doit rester compatible sans étape de compilation (*no-build*, vanilla JS/HTML/CSS) avec les 3 environnements :
1. **Hébergement Web (`http://` / `https://`, ex. `realsheettest.fwh.is`)** : PWA complète avec Service Worker et fallback `filemode.js` pour `/api/getkey.php`.
2. **Serveur local (`node serve.mjs` ou `python3 serve.py`)** : utilise Node.js (`v24+`, sans dépendances npm externes) ou Python 3 pour servir les fichiers et relayer `/api/proxy.php` et `/api/getkey.php`.
3. **Mode local sans serveur (`file://`)** : double-clic sur `RealSheet.html` ou `app/realsheet.html`. Ne jamais introduire de `fetch()` direct vers un fichier local non couvert par `app/filemode.js`, ni de `<script type="module">` incompatible avec `file://`.

## 2. Synchronisation obligatoire `.json` ↔ `.json.js`
En mode `file://`, seuls les sidecars `<nom>.json.js` (`window.__RS_FILES__`) sont lus.
- Après toute modification de `app/lang.json`, `forum/forum.json` ou d'un fichier `forum/tunebooks/*.json`, exécuter :
  ```bash
  node .agents/skills/realsheet-tunebooks-sync/scripts/sync-sidecars.mjs
  ```
- Ne jamais modifier un `.json` sans régénérer son `.json.js`, ni inversement.

## 3. Cache-busting et Service Worker (`app/service-worker.js`)
Toute modification d'un fichier statique dans `app/` (`realsheet.html`, `realsheet.js`, `css/player.css`, `filemode.js`, `installmenu.js`, `lib/*.js`, `img/*`, `font/*`, `lang.json`) impose :
1. Mettre à jour le paramètre de version `?v=...` correspondant dans `app/realsheet.html` (et `forum/forum.html` pour `filemode.js` / `forum.js` / `forum.css`).
2. Mettre à jour `CACHE_NAME` dans `app/service-worker.js` pour forcer l'invalidation du cache chez les clients PWA.
3. Si un nouveau fichier statique dans `app/` est ajouté ou supprimé, mettre à jour `PRECACHE_URLS` dans `app/service-worker.js` (un seul fichier en 404 dans `PRECACHE_URLS` fait échouer tout l'install du Service Worker).

## 4. Règles d'intervention sur `app/realsheet.js` et `app/lib/abc.js`
- **`app/realsheet.js`** contient une table de chaînes obfusquées (`_0x3e41` / `_0x30a7`). **Ne jamais réindenter, minifier ou décaler les index de `_0x3e41`**, ni réécrire les fonctions obfusquées sans nécessité absolue.
- Isoler toute nouvelle fonctionnalité dans des fonctions clairement nommées en clair (`window.rs...`) ou dans un nouveau fichier JS dédié chargé par `app/realsheet.html` (et ajouté à `PRECACHE_URLS`).
- Préserver impérativement les patchs existants en clair : `rsApplyAllKeyAccidentals`, `rsFlattenNestedTuplets`, tempo par défaut `.rs-hide-tempo`, `.abcjs-repeat`, `#rsPlaybackControls` / `window.__rsAutoFollow`, `Wq(x)` pour `proxy.php?url=`, et la garde de `resize` mobile `window.__rsLastRenderW`.
- **`app/lib/abc.js`** est un `abcjs-basic-min.js` v6.7.2 patché (nuplets multi-chiffres et calcul proportionnel des `gracenotes` / `graceTotal`). **Ne jamais le remplacer par une version standard d'abcjs** sans reporter ces deux correctifs.

## 5. Vérification systématique
Avant de livrer toute modification, exécuter :
```bash
node .agents/skills/realsheet-audit/scripts/audit-project.mjs
node .agents/skills/realsheet-tunebooks-sync/scripts/sync-sidecars.mjs --check
```

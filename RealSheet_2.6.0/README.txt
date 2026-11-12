RealSheet - version navigateur (tous navigateurs / toutes plateformes)

STRUCTURE : trois dossiers cote a cote : app/ (l'application), forum/ (bibliotheque de
  tunebooks), api/ (relais PHP optionnel).

LANCER EN LOCAL (sans Python, sans serveur)
  Double-cliquer sur RealSheet.html (a la racine) ou directement sur app/realsheet.html.
  Fonctionne dans Chrome, Edge et Firefox. Gardez les dossiers app/, forum/ et api/ cote a cote.
  - Fichiers .abc locaux (Advanced options > choisir un fichier) : fonctionnent hors ligne.
  - Bibliotheque (Add tunebook) : le catalogue et les tunebooks sont embarques ; l'import des
    tunebooks chiffres (1_PD, 2_Jazz_Tunes) demande UNE FOIS la cle a realsheet.net : il faut
    donc une connexion Internet pour ce premier import (ensuite tout est hors ligne).
  - Chargement par URL : ne marche que si le site distant autorise le CORS (ex. GitHub raw).
  - Comment ca marche : app/filemode.js (actif seulement en file://) remplace fetch() des
    fichiers .json par un fichier voisin <nom>.json.js (lang.json.js, forum/forum.json.js,
    forum/tunebooks/*.json.js), car les navigateurs interdisent fetch() sur file://.
    En double-clic, seul <nom>.json.js est lu (pas le .json) : apres avoir modifie forum.json ou
    ajoute un tunebook .json, ouvrez forum/convertir-json.html, choisissez le .json, et remplacez
    l'ancien <nom>.json.js par celui qui est telecharge (ou editez forum.json.js a la main).
  - Optionnel : python3 serve.py 8000 reste disponible (http://localhost:8000/app/realsheet.html)
    et fournit le relais local pour le chargement par URL.

HEBERGER
  Copier les dossiers "app", "forum" ET "api" tels quels sur n'importe quel hebergement statique
  (GitHub Pages, Netlify, Apache, nginx...). HTTPS requis, sauf sur localhost,
  pour le mode hors ligne (service worker). En file:// (double-clic), le service worker est desactive
  (impossible) mais tout fonctionne grace a app/filemode.js.

MODIFICATIONS
  - realsheet.js : la verification "application installee" qui redirigeait vers
    realsheet.net est neutralisee (return !0). L'app demarre dans n'importe quel navigateur.
  - lib/abc.js = abcjs-basic-min.js v6.7.2 renomme.
  - realsheet.html (ex app.html), realsheet.js deplaces a la racine de /app/.
  - lang.json recree (textes de l'ecran d'installation), icones ic_launcher-*.png
    et info.png regeneres.
  - manifest.json rendu relatif (plus de realsheet.net).
  - Script de statistiques tricktrack retire.
  - Chargement par URL (Edit tunebooks > Advanced options > Download) retabli :
    l'app lit d'abord l'URL directement (marche si le site autorise le CORS, ex. GitHub raw),
    sinon passe par le relais /api/proxy.php. Ce relais est fourni en deux versions :
    api/proxy.php (hebergement PHP) et serve.py (local, Python 3). Les deux refusent les
    adresses privees/locales, n'acceptent que http/https et limitent a 5 Mo.
    Sur un hebergement sans PHP et sans serve.py, seules les URL autorisant le CORS fonctionnent.
  - Non fournis (serveur d'origine) : import/checkimports.php, api/d.php (sans consequence).
  - Bibliotheque (dossier forum/, fournie dans RealSheet_9da5c8.rar) rendue autonome : redirections
    vers realsheet.net et e.php retirees, liens relatifs, suivi retire. Le catalogue est lu dans
    forum/forum.json (absent de l'archive d'origine : une entree de demo est fournie).
    Le catalogue (forum/forum.json) et les tunebooks (forum/tunebooks/1_PD.json, 2_Jazz_Tunes.json)
    proviennent de RealSheet_6b6873.rar.
    ATTENTION : les morceaux de ces tunebooks sont chiffres. L'app demande la cle au service
    /api/getkey.php (POST name + pub, reponse {wrapped, keyId}), qui n'est pas fourni : sans lui
    l'import affiche "Key request failed". Les tunebooks .abc simples n'en ont pas besoin.
  - Comportement d'origine : "Add tunebook" ouvre forum/forum.html. Fichier .abc local et URL restent
    disponibles dans Advanced options.
  - forum.html lit forum/forum.json (fetchAndRender dans forum.js). Les tunebooks pointent vers
    https://realsheet.net/forum/tunebooks/1_PD.json et 2_Jazz_Tunes.json ; liste de secours integree si forum.json est illisible.

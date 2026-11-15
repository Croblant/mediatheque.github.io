RealSheet - version navigateur (tous navigateurs / toutes plateformes)

STRUCTURE : trois dossiers cote a cote : app/ (l'application), forum/ (bibliotheque de
  tunebooks), api/ (relais PHP optionnel).

LANCER EN LOCAL (sans Python, sans serveur)
  Double-cliquer sur main.html (a la racine) ou directement sur app/main.html.
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
  - Optionnel : python3 serve.py 8000 reste disponible (http://localhost:8000/app/main.html)
    et fournit le relais local pour le chargement par URL.

HEBERGER
  Copier les dossiers "app", "forum" ET "api" tels quels sur n'importe quel hebergement statique
  (GitHub Pages, Netlify, Apache, nginx...). HTTPS requis, sauf sur localhost,
  pour le mode hors ligne (service worker). En file:// (double-clic), le service worker est desactive
  (impossible) mais tout fonctionne grace a app/filemode.js.

MODIFICATIONS
  - main.js : la verification "application installee" qui redirigeait vers
    realsheet.net est neutralisee (return !0). L'app demarre dans n'importe quel navigateur.
  - lib/abc.js = abcjs-basic-min.js v6.7.2 renomme.
  - main.html (ex app.html), main.js deplaces a la racine de /app/.
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

HEBERGEMENT (GitHub Pages) - tunebooks chiffres (1_PD, 2_Jazz_Tunes)
  - Les tunebooks sont toujours lus sur l'URL indiquee dans forum/forum.json (aucun fichier local requis).
  - app/filemode.js (mode http/https) : si api/getkey.php est absent (hebergement statique), la
    demande de cle est envoyee directement a https://realsheet.net/api/getkey.php.

VERSION 2.6.22.1 - MODIFICATIONS
  - Renommage : app/realsheet.html -> app/main.html, app/realsheet.js -> app/main.js,
    RealSheet.html (racine) -> main.html. Toutes les references (service worker, manifest, forum,
    serve.mjs/serve.py, scripts d'audit, docs) ont ete mises a jour.
  - forum.json -> forum.json.js automatique : serve.mjs (Node.js) surveille forum/forum.json
    (et app/lang.json) et regenere le sidecar .json.js a chaque modification (un JSON invalide
    en cours d'edition ne remplace pas l'ancien sidecar). Sans serveur (double-clic), double-cliquer sync-forum.bat (Windows) ou sync-forum.sh (Mac/Linux), ou lancer :
        node .agents/skills/realsheet-tunebooks-sync/scripts/sync-sidecars.mjs --watch
    (ou sans --watch pour une synchronisation unique).
  - Import .txt (Load from local device : Select Tunebook File / Select Setlist File) :
        fichier.abct.txt -> importe comme fichier.abct
        fichier.abc.txt  -> importe comme fichier.abc
        fichier.txt      -> importe comme fichier.abct
  - Nouveaux instruments "C - Ut 3" et "C - Ut 4" (pas de transposition) : la cle d'alto (Ut 3) ou de
    tenor (Ut 4) est appliquee seulement si le ABC ne specifie aucune cle (clef=..., K:C alto, etc.).
    Valeurs du selecteur : "00" (Ut 3) et "000" (Ut 4), neutres pour le coeur (= 0).
  - Ces deux fonctions sont dans le nouveau fichier app/rs-extras.js (charge avant main.js).

VERSION 2.6.22.6 - CORRECTIONS
  - Bug "clé > +12 / < -12 avec clé d'ut" : rs-extras.js ajoutait " clef=..." aussi aux appels
    ABCJS.renderAbc("*", ...) (analyse seule). main.js utilise ces positions pour ABCJS.strTranspose()
    sur le texte d'origine : les positions décalées faisaient transposer certaines notes/accords au
    mauvais endroit ou échouer le rendu (erreur "redraw failed ... reading '1'"). Ces appels ne sont
    plus modifiés ; la clé d'ut n'est appliquée qu'au rendu final.
  - Liste des clés (#steps) : reste une liste native identique à celle de l'instrument (#steps2) ;
    (Std.) garde son surlignage (player.css). Pas de centrage forcé : impossible avec la liste native.

VERSION 2.6.23.1 - TEMPO
  - "R:1/4=145" ou "%Q:1/4=145" (ligne commentée) est lu comme "Q:1/4=145", dans le rendu (tempo
    affiche) ET dans la lecture (BPM). Fonction rsNormalizeTempo() dans app/rs-extras.js, appelee par
    main.js juste avant l'injection du tempo par defaut. Seule la forme "duree=battements" est
    reconnue (R: reste le champ rythme : reel, jig...). Sans effet si un vrai Q: existe deja.
    Si plusieurs lignes equivalentes existent (R: puis %Q:), la premiere devient Q:, les autres
    sont mises en commentaire.

VERSION 2.6.24.1 - CORRECTION PARTITIONS AVEC LIGNES w: VIDES
- Bug : une partition contenant des lignes de paroles vides (ex. "w: |||||", comme Acclamez_le_Seigneur.abc)
  ne s affichait plus (console : "redraw failed ... Cannot read properties of null (reading 1)").
- Cause : emptylines.js retirait ces lignes dans le wrapper de ABCJS.renderAbc, y compris pour l appel
  "analyse seule" renderAbc("*") dont main.js utilise les positions (startChar/endChar) avec ABCJS.strTranspose
  sur le texte d origine. Positions decalees -> strTranspose echouait.
- Correctif : main.js retire ces lignes une seule fois, au debut du pretraitement ABC (juste apres
  rsNormalizeTempo). Le wrapper de emptylines.js reste en place (sans effet, le texte est deja nettoye).
- Cache : service-worker app-cache-v85-v2.6.24.1, main.js?v=2.6.24.1.

VERSION 2.6.24.2 - CROIX DU CHAMP "Title or composer"
- Bug : la croix du champ de recherche de la liste des morceaux n effacait pas le texte (ou seulement sur une
  partie de la croix : zone du bouton natif de Chrome, ~12-20 px du bord droit ; rien sur Firefox/certains mobiles).
- Correctif : rs-extras.js efface le champ (et relance le filtre : evenements input + search) pour tout clic ou
  tap dans les 28 px de droite de #tuneSearch ; player.css masque le bouton natif (une seule croix, la dessinee).
- Cache : service-worker app-cache-v86-v2.6.24.2, rs-extras.js?v=2.6.24.2, player.css?v=2.6.24.2.

VERSION 2.6.24.3 - CORRECTION LECTURE AVEC "HIDE EMPTY LINES"
- Symptome : avec les lignes vides masquees, la lecture jouait et surlignait des lignes qui ne devaient pas l'etre
  (ex. la basse de la derniere ligne demarrait des le debut du morceau).
- Cause : %%staffnonote 0 retire les portees vides du modele abcjs ; les voix concernees perdent leurs silences
  initiaux et leur horloge repart de 0 (audio ET surlignage).
- Audio : app/emptylines.js (window.rsAudioVisual) synthetise depuis l'ABC complet (window.__rsFullAbc, memorise par main.js
  juste avant l'ajout de %%staffnonote). L'affichage reste celui des lignes masquees.
- Surlignage : lib/abc.js (setupEvents + cleanUp) recale chaque voix sur le debut de ligne de la voix 0 et reporte la duree
  des portees/lignes masquees (line.rsHiddenDur / line.rsSkip). Les temps sont identiques a ceux du mode "Show empty lines".
- Cache : service-worker app-cache-v87-v2.6.24.3, lib/abc.js?v=1004-staffnonote-sync, main.js et emptylines.js ?v=2.6.24.3.

VERSION 2.6.24.4 - FLECHES PARTITION PRECEDENTE / SUIVANTE (PC)
- Sur appareil sans ecran tactile, deux fleches (gauche / droite de la partition) remplacent le glissement du doigt.
  Nouveau fichier app/navarrows.js : declenche le meme clic (quart gauche / droit de #paperframe) que gere main.js.
  Absentes sur tactile (matchMedia hover:none / pointer:coarse, maxTouchPoints) ; masquees hors affichage d'une partition.
- Cache : service-worker app-cache-v88-v2.6.24.4 (navarrows.js ajoute a PRECACHE_URLS), navarrows.js?v=2.6.24.4.

VERSION 2.6.24.6 - PAROLES SUPERPOSEES (VOIX 1 + 2 SUR UNE MEME PORTEE)
- Symptome (ex. "Tu es devenu enfant de Dieu") : les paroles de la voix 1 et de la voix 2 se superposaient, puis la 2e ligne
  touchait la portee du dessous.
- Cause 1 : toutes les lignes "w: ||||" etaient supprimees, y compris celles qui servent de couplet vide AVANT une ligne
  non vide (voix 2 : "w: ||||" puis "w: texte" = couplet 2). Le texte passait en couplet 1, sur la ligne de la voix 1.
  Desormais seules les lignes vides en FIN de bloc w: sont retirees (rs-extras.js : window.rsStripBlankLyrics, utilisee par
  main.js et emptylines.js).
- Cause 2 : abcjs dessine mais ne compte pas dans la hauteur reservee une ligne de paroles vide placee avant une ligne non
  vide (getBBox ignore les tspans vides). lib/abc.js (addLyric) remplace ces syllabes vides par une espace insecable.
- Cache : service-worker app-cache-v90-v2.6.24.6, abc.js?v=1005-lyric-blank-lines, rs-extras/main/emptylines ?v=2.6.24.5.

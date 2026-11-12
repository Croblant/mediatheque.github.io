//----------------------------------------------------------------------------
// external links 
//----------------------------------------------------------------------------

function copyLinkToClipboard(url) {
  function onSuccess() {
    alert('Link copied. Please open it in your browser.');
    goBackWhenReturning();
  }

  function fallbackCopy() {
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, 99999); // iOS fix
    document.execCommand('copy');
    document.body.removeChild(input);
    onSuccess();
  }

  // Modern Clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(onSuccess).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

document.getElementById('openInBrowser').addEventListener('click', function (e) {
  e.preventDefault();
  copyLinkToClipboard(this.href);
});

document.querySelectorAll('.copy-link').forEach(function (link) {
  link.addEventListener('click', function (e) {
    e.preventDefault();
    copyLinkToClipboard(link.href);
  });
});

//---------------------------------------------------------
// go back to app when returning from bg
//---------------------------------------------------------

function goBackWhenReturning() {
  let wasHidden = false;

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      wasHidden = true;
    } else if (document.visibilityState === 'visible' && wasHidden) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (window.history.length > 1) {
        window.history.back();
      } else {
        //window.location.href = '/'; // fallback if there's no previous page
      }
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
}

//---------------------------------------------------------

// liens relatifs : fonctionne quel que soit l'hebergement (dossiers /app/ et /forum/ cote a cote)
const linkToApp = new URL("../app/realsheet.html", window.location.href).href;

// Ordre de preference : relais same-origin ../api/proxy.php (si heberge avec PHP / serve.py),
// sinon copie locale dans tunebooks/ (c'est le cas en double-clic file://, via app/filemode.js),
// sinon URL distante directe.
async function importTb(URL, title) {
  const isAbs = /^https?:\/\//i.test(URL);
  let src = isAbs ? URL : new window.URL("../forum/" + URL, window.location.href).href;

  if (isAbs) {
    const fileName = URL.substring(URL.lastIndexOf("/") + 1);
    // L'app n'accepte que les chemins finissant par .json / .abc : le nom du fichier est donc place dans le chemin
    // (proxy.php/<fichier>.json?url=...), le relais ignore ce suffixe.
    const proxyUrl = new window.URL("../api/proxy.php/" + encodeURIComponent(fileName) + "?url=" + encodeURIComponent(URL), window.location.href).href;
    const localUrl = new window.URL("tunebooks/" + fileName, window.location.href).href;
    const ctrl = new AbortController();
    try {
      const r = await fetch(proxyUrl, { signal: ctrl.signal, cache: "no-store" });
      ctrl.abort(); // on a seulement besoin de savoir que le relais repond
      if (r.ok) src = proxyUrl;
      else throw new Error("proxy " + r.status);
    } catch (e) {
      try {
        const l = await fetch(localUrl, { method: "HEAD", cache: "no-store" });
        if (l.ok) src = localUrl;
      } catch (e2) { /* on garde l'URL distante */ }
    }
  }
  window.location.href = linkToApp + "?i=" + encodeURIComponent(src) + "&n=" + encodeURIComponent(title || "");
}

// Extract the filename from the URL
function getFilename(url) {
  return url.substring(url.lastIndexOf("/") + 1);
}

// Get Last-Modified date from the URL with time
async function getLastModified(url) {
  if (window.location.protocol === "file:") return "--"; // mode fichier local : pas de requete HEAD (CORS)
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const lastModified = response.headers.get('Last-Modified');
    if (lastModified) {
      const date = new Date(lastModified);
      const formattedDate = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(date);
      return formattedDate;
    } else {
      return "--";
    }
  } catch {
    return "--";
  }
}

// Liste de secours (utilisée si forum.json est introuvable ou invalide)
const FALLBACK_LIST = [
  {
    title: "RealSheet Public Domain Jazz Collection",
    description: "This is a collection of classic jazz tunes. These tunes are in the public domain in the United States and many other countries because they were originally published here more than 95 years ago.",
    category: "RealSheet Public Domain Tunebooks",
    contributor: "realsheet.net",
    url: "https://realsheet.net/forum/tunebooks/1_PD.json",
    image: "img/r-book.png"
  },
  {
    title: "Jazz Tunes",
    description: "More Jazz Standards.",
    category: "External Tunebooks",
    contributor: "MidnightJam",
    url: "https://realsheet.net/forum/tunebooks/2_Jazz_Tunes.json",
    image: "img/book-globe.png"
  }
];

//---------------------------------------------------------
// Catalogue distant + fusion avec le catalogue local

const REMOTE_FORUM_URL = "https://realsheet.net/forum/forum.json";
const REMOTE_BASE = "https://realsheet.net/forum/";

async function fetchRemoteForum() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(REMOTE_FORUM_URL + "?t=" + Date.now(), { cache: "no-store", signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error("remote forum.json must contain an array");
    // chemins relatifs du catalogue distant -> resolus par rapport a realsheet.net
    return data.filter(e => e && e.url).map(e => {
      const out = Object.assign({}, e);
      out.url = new URL(e.url, REMOTE_BASE).href;
      if (e.image && !/^(https?:|data:)/i.test(e.image)) out.image = new URL(e.image, REMOTE_BASE).href;
      return out;
    });
  } catch (e) {
    console.warn("Remote forum.json unavailable, using local catalogue only:", e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function sameTunebook(a, b) {
  const norm = u => String(u || "").split(/[?#]/)[0].toLowerCase();
  return norm(a.url) === norm(b.url);
}

async function mergeWithRemote(local) {
  const remote = await fetchRemoteForum();
  if (!remote.length) return local;
  const merged = local.map(e => Object.assign({}, e));
  for (const r of remote) {
    const m = merged.find(e => sameTunebook(e, r));
    if (m) {
      for (const k of Object.keys(r)) {
        if (m[k] === undefined || m[k] === null || m[k] === "") m[k] = r[k];
      }
    } else {
      merged.push(r);
    }
  }
  return merged;
}

//---------------------------------------------------------
// Fetch forum.json and render one block per tunebook

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function fetchAndRender() {
  const container = document.getElementById('tbContainer');
  if (!container) return;

  try {
    let database;
    try {
      const response = await fetch("forum.json?t=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      database = await response.json();
      if (!Array.isArray(database)) throw new Error("forum.json must contain an array");
    } catch (e) {
      console.warn("forum.json unavailable, using built-in list:", e);
      database = FALLBACK_LIST;
    }

    // Croisement avec le catalogue distant (realsheet.net) : union par URL de tunebook.
    // Pour une entree presente des deux cotes, les champs non vides du forum.json LOCAL priment,
    // le distant complete les champs manquants (ex. "update"). Les entrees uniquement distantes
    // sont ajoutees apres les locales. Si le distant est injoignable, on garde le local seul.
    database = await mergeWithRemote(database);

    container.innerHTML = "";

    // Group entries by category (order of first appearance in forum.json)
    const groups = new Map();
    for (const entry of database) {
      const cat = entry.category || "Tunebooks";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(entry);
    }

    // Last-update dates: use "update" from forum.json, otherwise ask the server (in parallel)
    const dates = new Map();
    await Promise.all(database.map(async entry => {
      dates.set(entry, entry.update || await getLastModified(entry.url));
    }));

    for (const [category, entries] of groups) {
      const categoryHeader = document.createElement('h2');
      categoryHeader.textContent = category;
      container.appendChild(categoryHeader);

      for (const entry of entries) {
        const block = document.createElement('div');
        block.className = 'container';

        const leftColumn = document.createElement('div');
        leftColumn.className = 'left-column';
        const image = document.createElement('img');
        image.src = entry.image || "img/r-book.png";
        image.alt = entry.title || "";
        image.className = 'bookCover';
        leftColumn.appendChild(image);

        const rightColumn = document.createElement('div');
        rightColumn.className = 'right-column';
        const description = document.createElement('div');
        description.className = 'tunebookDescription';

        const title = document.createElement('h2');
        title.textContent = entry.title || getFilename(entry.url);

        const descriptionText = document.createElement('p');
        descriptionText.innerHTML =
          escapeHtml(entry.description) + "<br><br>" +
          "File: " + escapeHtml(getFilename(entry.url)) + "<br>" +
          "Contributor: " + escapeHtml(entry.contributor || "--") + "<br>" +
          "Last Update: " + escapeHtml(dates.get(entry));

        const importButton = document.createElement('button');
        importButton.innerHTML = '&nbsp; Import into the app &nbsp;';
        importButton.onclick = () => importTb(entry.url, entry.title);

        description.appendChild(title);
        description.appendChild(descriptionText);
        description.appendChild(importButton);
        rightColumn.appendChild(description);

        block.appendChild(leftColumn);
        block.appendChild(rightColumn);
        container.appendChild(block);
        container.appendChild(document.createElement('hr'));
      }
    }
  } catch (error) {
    console.error("Failed to load or render database:", error);
    container.textContent = "Could not load the tunebook list (forum.json / forum.json.js).";
  }
}

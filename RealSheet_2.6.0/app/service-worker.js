// Change version to force cache replacement on all clients
const CACHE_NAME = 'app-cache-v42-install';
const NETWORK_TIMEOUT_MS = 3000;   // max wait for network on static files
const OFFLINE_WINDOW_MS = 15000;   // after a failure, serve from cache first for this long

// This file lives in /app/, so the scope is /app/ (register with { scope: '/app/' })
const SCOPE_PATH = new URL(self.registration.scope).pathname; // "/app/"
const SHELL_URL = new URL('realsheet.html', self.registration.scope).href;

const TT_SCRIPT_REL = '../tricktrack/tricktrack.js';
const TT_SCRIPT_PATH = new URL(TT_SCRIPT_REL, self.registration.scope).pathname; // "/tricktrack/tricktrack.js"

// Circuit breaker state: while Date.now() < offlineUntil, skip the network
let offlineUntil = 0;

// All URLs are relative to the SW script location
const PRECACHE_URLS = [
  './',
  'realsheet.html',
  'css/player.css',
  'realsheet.js',
  'filemode.js',
  'installmenu.js',
  'playback.js',
  'lib/abc.js',
  'lib/jszip.min.js',
  'lib/dom-to-image.min.js',
  'lib/pako.min.js',
  'lib/jspdf.umd.min.js',
  'lib/ua-parser.min.js',
  'lib/UPNG.js',
  'img/error-100.png',
  'img/ic_launcher-192.png',
  'img/ic_launcher-512.png',
  'img/ic_launcher-144.png',
  'img/heartxl.png',
  'img/heartxlb.png',
  'img/trash.png',
  'img/r-book.png',
  'img/book-globe.png',
  'img/refresh256.png',
  'img/back.png',
  'img/fit-vertical.png',
  'img/size-5-lines.png',
  'img/size-4-lines.png',
  'img/size-3-lines.png',
  'img/large-chords.png',
  'img/more.png',
  'img/comment-100.png',
  'img/print.png',
  'img/png-100.png',
  'img/info.png',
  'img/edit.png',
  'img/plus90.png',
  'img/share90.png',
  'img/r-logo-500.png',
  'img/r-logo-180.png',
  'img/hide-lyrics.png',
  'img/show-lyrics.png',
  'lang.json',
  'font/roboto-latin.woff2',
  'font/roboto-500-latin.woff2',
  'font/Barlow-Condensed-Regular.woff2',
  'font/luckiest-guy-400.woff2',
  'font/noto-music-v19-latin_latin-ext_music-regular.woff2',
  'font/roboto-slab-latin.woff2',
];
//  'manifest.json',

function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // cache: 'no-cache' = revalidate with the server, never answer from the HTTP cache
  return fetch(request, { signal: controller.signal, cache: 'no-cache' })
    .finally(() => clearTimeout(timeoutId));
}

// INSTALL: all-or-nothing precache, bypassing the HTTP cache.
// If any file fails, install fails and the previous SW/cache stays in charge.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(
      PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
    );
    await self.skipWaiting(); // only after a complete precache
  })());
});

// ACTIVATE: remove old caches, take control of open pages
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

// FETCH: network first (with timeout + circuit breaker), cache as fallback
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only GET is handled. This also means the POST to end.php (tracking + queue flush)
  // is never intercepted: offline it fails naturally, which is what the queue relies on.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Inside /app/, plus the one out-of-scope file we need offline (tricktrack.js)
  const inScope = url.pathname.startsWith(SCOPE_PATH) || url.pathname === TT_SCRIPT_PATH;
  if (!inScope) return;

  // proxy.php: don't intercept at all. The browser talks to the network directly,
  // so nothing is cached and the SW adds no timeouts or fake responses.
  if (url.pathname.includes('proxy.php')) return;
  if (url.pathname.startsWith('/forum/')) return;

  event.respondWith(handleStatic(event, url));
});

async function handleStatic(event, url) {
  const req = event.request;
  const cache = await caches.open(CACHE_NAME);
  // Cache key ignores the query string (so tricktrack.js?v=3 matches the precached copy)
  const key = new Request(url.origin + url.pathname);
  const fromCache = () => cache.match(key, { ignoreVary: true });

  // Circuit breaker: recently offline -> answer from cache right away
  if (Date.now() < offlineUntil) {
    const hit = await fromCache();
    if (hit) return hit;
  }

  try {
    const res = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
    offlineUntil = 0;

    if (res.status === 200 && res.type === 'basic' && !res.redirected) {
      event.waitUntil(cache.put(key, res.clone()));
    }
    return res;
  } catch (err) {
    // Network failed or timed out
    offlineUntil = Date.now() + OFFLINE_WINDOW_MS;

    const hit = await fromCache();
    if (hit) return hit;

    // Navigation fallback to the app shell
    if (req.mode === 'navigate') {
      const shell = await cache.match(SHELL_URL, { ignoreVary: true });
      if (shell) return shell;
    }

    return Response.error();
  }
}
#!/usr/bin/env node
/**
 * Serveur local Node.js pour RealSheet : fichiers statiques + relais /api/proxy.php et /api/getkey.php
 * Equivalent de serve.py pour les postes sans Python.
 * Usage : node serve.mjs [port]   puis ouvrir http://localhost:8000/app/main.html
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8000;
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 15000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.abc': 'text/plain; charset=utf-8',
  '.abct': 'text/plain; charset=utf-8',
  '.tunebook': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function sendError(res, code, message) {
  const body = Buffer.from(`${code} ${message}\n`, 'utf8');
  res.writeHead(code, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
}

function isDisallowedIp(address) {
  if (!net.isIP(address)) return true;
  // Normalize IPv4-mapped IPv6 addresses (::ffff:127.0.0.1)
  const ip = address.startsWith('::ffff:') ? address.slice(7) : address;

  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8 ("this network")
    if (a === 10) return true; // 10.0.0.0/8 (private)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (private)
    if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24 (IETF protocol)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (private)
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmark)
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true; // unspecified / loopback
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local address
  if (lower.startsWith('ff')) return true; // multicast
  return false;
}

async function readBodyLimited(req, limitBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      throw new Error('Request body too large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readResponseLimited(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) {
    const ab = await response.arrayBuffer();
    if (ab.byteLength > maxBytes) throw new Error('File too large');
    return Buffer.from(ab);
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('File too large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function handleProxy(reqUrl, res) {
  const targetRaw = reqUrl.searchParams.get('url') || '';
  let parsed;
  try {
    parsed = new URL(targetRaw);
  } catch {
    return sendError(res, 400, 'URL invalide');
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    return sendError(res, 400, 'URL invalide');
  }

  try {
    const records = await dns.lookup(parsed.hostname, { all: true });
    if (!records.length || records.some((r) => isDisallowedIp(r.address))) {
      return sendError(res, 403, 'Adresse refusee');
    }
  } catch (err) {
    console.log(`[proxy] ECHEC DNS ${targetRaw} : ${err.message}`);
    return sendError(res, 502, `Echec du telechargement : ${err.name}`);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(parsed.href, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RealSheet)' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!upstream.ok) {
      throw new Error(`HTTP ${upstream.status}`);
    }
    const data = await readResponseLimited(upstream, MAX_BYTES);
    console.log(`[proxy] OK ${targetRaw} (${data.length} octets)`);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': data.length,
    });
    res.end(data);
  } catch (err) {
    console.log(`[proxy] ECHEC ${targetRaw} : ${err.message}`);
    const msg = err.message === 'File too large'
      ? 'Fichier trop gros'
      : `Echec du telechargement : ${err.name}`;
    return sendError(res, 502, msg);
  } finally {
    clearTimeout(timer);
  }
}

async function handleGetKey(req, res) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const body = await readBodyLimited(req, 65536);
    const upstream = await fetch('https://realsheet.net/api/getkey.php', {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; RealSheet)',
      },
      body,
      signal: ctrl.signal,
    });
    const data = await readResponseLimited(upstream, MAX_BYTES);
    console.log(`[getkey] realsheet.net a repondu HTTP ${upstream.status} (${data.length} octets)`);
    res.writeHead(upstream.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': data.length,
    });
    res.end(data);
  } catch (err) {
    console.log(`[getkey] ECHEC : ${err.message}`);
    return sendError(res, 502, `Echec du relais getkey : ${err.name}`);
  } finally {
    clearTimeout(timer);
  }
}

async function handleStatic(reqUrl, reqMethod, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(reqUrl.pathname);
  } catch {
    return sendError(res, 400, 'Bad request');
  }

  const relPath = pathname.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT_DIR, relPath);
  if (resolved !== ROOT_DIR && !resolved.startsWith(ROOT_DIR + path.sep)) {
    return sendError(res, 403, 'Forbidden');
  }

  let filePath = resolved;
  let stat;
  try {
    stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      // Redirect directory without trailing slash or serve index.html
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: pathname + '/' + reqUrl.search });
        return res.end();
      }
      filePath = path.join(filePath, 'index.html');
      stat = await fs.stat(filePath);
    }
  } catch {
    return sendError(res, 404, 'Not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Last-Modified': stat.mtime.toUTCString(),
    'Cache-Control': 'no-cache',
  });

  if (reqMethod === 'HEAD') {
    return res.end();
  }

  const content = await fs.readFile(filePath);
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (reqUrl.pathname === '/api/proxy.php' || reqUrl.pathname.startsWith('/api/proxy.php/')) {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end();
      }
      return handleProxy(reqUrl, res);
    }
    return handleStatic(reqUrl, req.method, res);
  }

  if (req.method === 'POST') {
    if (reqUrl.pathname === '/api/getkey.php') {
      return handleGetKey(req, res);
    }
    return sendError(res, 404, 'Not found');
  }

  return sendError(res, 405, 'Method not allowed');
});

// Mise a jour automatique des sidecars .json.js (forum.json -> forum.json.js, etc.) pour le mode file://
function startSidecarWatcher() {
  const script = path.join(ROOT_DIR, '.agents', 'skills', 'realsheet-tunebooks-sync', 'scripts', 'sync-sidecars.mjs');
  const child = spawn(process.execPath, [script, '--watch'], { stdio: 'inherit' });
  child.on('error', (err) => console.log(`[sync] surveillance impossible : ${err.message}`));
  process.on('exit', () => child.kill());
  process.on('SIGINT', () => process.exit(0));
}

server.listen(PORT, '127.0.0.1', () => {
  startSidecarWatcher();
  console.log('Serveur RealSheet (Node.js) demarre. Ctrl+C pour arreter.');
  console.log(`Forum : http://localhost:${PORT}/forum/forum.html`);
  console.log(`App   : http://localhost:${PORT}/app/main.html`);
});

// Usage : node convertir-abct.mjs forum/tunebooks/1_PD.json [forum/tunebooks/2_Jazz_Tunes.json ...]
// Option : GETKEY_URL=https://realsheet.net/api/getkey.php (valeur par defaut)
// Necessite Node 18+ (fetch et WebCrypto integres). Aucune dependance.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { webcrypto as c } from 'node:crypto';

const URL_KEY = process.env.GETKEY_URL || 'https://realsheet.net/api/getkey.php';
const b64 = s => Uint8Array.from(Buffer.from(s, 'base64'));

async function getKey(name, keyId) {
  const pair = await c.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-1' },
    false, ['unwrapKey', 'decrypt']);
  const spki = Buffer.from(await c.subtle.exportKey('spki', pair.publicKey)).toString('base64');
  const r = await fetch(URL_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (compatible; RealSheet)' },
    body: new URLSearchParams({ name, pub: spki })
  });
  if (!r.ok) throw new Error('Key request failed (' + r.status + ') : ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  if (!j || !j.wrapped) throw new Error('Reponse sans "wrapped" : ' + JSON.stringify(j).slice(0, 200));
  if (keyId && j.keyId && j.keyId !== keyId) console.warn('Attention : keyId', j.keyId, '!=', keyId);
  return c.subtle.unwrapKey('raw', b64(j.wrapped), pair.privateKey,
    { name: 'RSA-OAEP' }, { name: 'AES-GCM' }, false, ['decrypt']);
}

const files = process.argv.slice(2);
if (!files.length) { console.error('Usage : node convertir-abct.mjs tunebook.json [...]'); process.exit(1); }

for (const f of files) {
  const d = JSON.parse(readFileSync(f, 'utf8'));
  console.log(`${basename(f)} : ${d.tunes.length} morceaux, cle ${d.keyId}`);
  const key = await getKey(d.name, d.keyId);
  const out = [];
  for (const t of d.tunes) {
    try {
      const p = await c.subtle.decrypt({ name: 'AES-GCM', iv: b64(t.iv) }, key, b64(t.data));
      out.push(new TextDecoder().decode(p).replace(/\r\n?/g, '\n').trim());
    } catch { console.warn('  echec :', t.title); }
  }
  const dest = join(dirname(f), basename(f).replace(/\.json$/i, '') + '.abct');
  writeFileSync(dest, out.join('\n\n') + '\n', 'utf8');
  console.log(`OK : ${dest} (${out.length}/${d.tunes.length})`);
}

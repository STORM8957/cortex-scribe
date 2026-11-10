// Cortex Scribe Word link: the bridge on your computer (npm run word).
// It serves the Cortex Scribe panel to Word (word-addin/) and connects it with the app over a local WebSocket
// (wss://localhost:PORT/link). It keeps the master copy of the linked document and merges the changes from both
// sides with the shared core in src/48_wordsync.js. Only this computer can connect (it listens on 127.0.0.1 and ::1),
// and only from the Word panel, the desktop app, or the browser version with the code it prints.
// Settings (environment): CS_WORD_PORT (3456), CS_WORD_CERT / CS_WORD_KEY (default: the certificate from
// `npm run word:setup` in ~/.office-addin-dev-certs), CS_WORD_CODE (fixed code instead of the saved random one).
import https from 'node:https';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { homedir } from 'node:os';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.CS_WORD_PORT || 3456);
const QUIET = !!process.env.CS_WORD_QUIET;
const log = (...a) => { if (!QUIET) console.log(new Date().toTimeString().slice(0, 8), ...a); };
const WordSync = new Function(readFileSync(join(root, 'src/48_wordsync.js'), 'utf8') + '\nreturn WordSync;')();

// --- certificate (Word only loads add-ins over https) ---
const certDir = join(homedir(), '.office-addin-dev-certs');
const certFile = process.env.CS_WORD_CERT || join(certDir, 'localhost.crt');
const keyFile = process.env.CS_WORD_KEY || join(certDir, 'localhost.key');
if (!existsSync(certFile) || !existsSync(keyFile)) {
  console.log('\nThe Word link needs a safe local certificate first. Run this once:\n\n    npm run word:setup\n\nthen start the link again with:  npm run word\n');
  process.exit(1);
}
// --- the code for the browser version (a page opened from a file can't be told apart from other pages) ---
let CODE = process.env.CS_WORD_CODE;
if (!CODE) {
  const dir = join(homedir(), '.cortex-scribe'), f = join(dir, 'word-code.txt');
  try { CODE = readFileSync(f, 'utf8').trim(); } catch {}
  if (!/^\d{6}$/.test(CODE || '')) { CODE = String(randomInt(100000, 1000000)); try { mkdirSync(dir, { recursive: true }); writeFileSync(f, CODE); } catch {} }
}

// --- files for Word ---
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.xml': 'text/xml; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const FILES = new Set(['taskpane.html', 'taskpane.js', 'commands.html', 'icon-16.png', 'icon-32.png', 'icon-64.png', 'icon-80.png', 'manifest.xml']);
function serve(req, res) {
  const url = new URL(req.url, 'https://localhost');
  const name = url.pathname.replace(/^\/word\//, '');
  let body = null;
  if (url.pathname === '/word/sync-core.js') body = readFileSync(join(root, 'src/48_wordsync.js'));
  else if (url.pathname.startsWith('/word/') && FILES.has(name)) body = readFileSync(join(root, 'word-addin', name));
  else if (url.pathname === '/' || url.pathname === '/word/') { res.writeHead(302, { Location: '/word/taskpane.html' }); return res.end(); }
  if (!body) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(name)] || (url.pathname.endsWith('.js') ? TYPES['.js'] : 'application/octet-stream'), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

// --- who may connect ---
const PANEL = new Set(['https://localhost:' + PORT, 'https://127.0.0.1:' + PORT]);
// the desktop app: its own address, or Tauri's built-in web server (port 1430) when started in an older way
const APP = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'http://localhost:1430', 'http://127.0.0.1:1430']);
function originKind(o) { if (PANEL.has(o)) return 'panel'; if (APP.has(o)) return 'app'; if (o === 'null' || o === 'file://') return 'file'; return null; }

// --- linked documents: key → { doc, ver, hist (ver → doc), wordBase (what Word has) } ---
const docs = new Map();
const words = new Map();         // the Word windows with the panel open: key → { ws, key, name, url } (several documents at once)
const apps = new Set();          // { ws, key, page }
const send = (ws, msg) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); } catch {} };
function status() {
  const list = [...words.values()].map((w) => ({ connected: true, key: w.key, name: w.name, url: w.url, font: w.font || null }));
  const linked = [...apps].filter((a) => a.key).map((a) => ({ key: a.key, page: a.page || '' }));
  const msg = { type: 'status', words: list, word: list[list.length - 1] || { connected: false }, apps: linked };
  for (const w of words.values()) send(w.ws, msg);
  for (const a of apps) send(a.ws, msg);
}
function remember(st, doc) {
  st.ver++; st.doc = doc; st.hist.set(st.ver, doc);
  if (st.hist.size > 300) st.hist.delete(st.hist.keys().next().value);
}
function broadcast(key, st, by) {
  const msg = { type: 'doc', key, ver: st.ver, doc: st.doc, by: by || '' };
  const w = words.get(key);
  if (w) { send(w.ws, msg); st.wordBase = st.doc; }
  for (const a of apps) if (a.key === key) send(a.ws, msg);
}

const server = https.createServer({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, serve);
const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const kind = originKind(req.headers.origin || '');
  if (new URL(req.url, 'https://localhost').pathname !== '/link' || !kind) {
    log('Refused a connection from “' + (req.headers.origin || 'no address') + '” (only the Word panel, the Cortex Scribe app and the browser version may connect)');
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => welcome(ws, kind));
});

function welcome(ws, kind) {
  let me = null;
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let m; try { m = JSON.parse(String(data)); } catch { return; }
    if (!m || typeof m !== 'object') return;
    try { handle(m); } catch (e) { console.log('Problem with a message (the link keeps running):', (e && e.stack) || e); send(ws, { type: 'error', why: 'internal' }); }
  });
  function handle(m) {
    if (m.type === 'hello') {
      if (m.role === 'word') {
        if (kind !== 'panel') return send(ws, { type: 'error', why: 'origin' });
        const key = String(m.url || m.name || 'unsaved').slice(0, 500);
        const old = words.get(key);   // the same document in another Word window: the newer window takes over
        if (old && old.ws !== ws) { send(old.ws, { type: 'error', why: 'same-doc' }); old.ws.close(); }
        const doc = WordSync.norm(m.doc);
        const font = m.font && typeof m.font.name === 'string' && m.font.size > 0 && m.font.size < 100 ? { name: m.font.name.slice(0, 60), size: +m.font.size } : null;
        me = { ws, key, name: String(m.name || 'Document').slice(0, 200), url: String(m.url || '').slice(0, 500), font, role: 'word' };
        words.set(key, me);
        let st = docs.get(key);
        if (!st) { st = { ver: 0, doc: [], hist: new Map(), wordBase: null }; docs.set(key, st); remember(st, doc); }
        else {   // Word comes back: keep what the app changed meanwhile and what was changed in Word itself
          const r = WordSync.merge3(st.wordBase || st.doc, doc, st.doc, 'mine');
          remember(st, r.doc);
        }
        log('Word connected:', me.name, '(' + doc.length + ' parts)');
        broadcast(key, st, '');
        status();
      } else {
        if (kind === 'panel') return send(ws, { type: 'error', why: 'origin' });
        if (kind === 'file' && String(m.code || '') !== CODE) { send(ws, { type: 'error', why: 'code' }); return ws.close(); }
        me = { ws, key: m.key ? String(m.key).slice(0, 500) : null, page: String(m.page || '').slice(0, 200), role: 'app' };
        apps.add(me);
        log('Cortex Scribe connected' + (me.key ? ' (page “' + me.page + '”)' : ''));
        send(ws, { type: 'welcome' });
        status();
        const st = me.key && docs.get(me.key);
        if (st) send(ws, { type: 'doc', key: me.key, ver: st.ver, doc: st.doc, by: '' });
      }
      return;
    }
    if (!me) return;
    if (m.type === 'link' && me.role === 'app') {      // the app opened (or left) a linked page
      me.key = m.key ? String(m.key).slice(0, 500) : null; me.page = String(m.page || '').slice(0, 200);
      status();
      const st = me.key && docs.get(me.key);
      if (st) send(ws, { type: 'doc', key: me.key, ver: st.ver, doc: st.doc, by: '' });
      return;
    }
    if (m.type === 'push') {
      const key = me.role === 'word' ? me.key : me.key;
      const st = key && docs.get(key);
      if (!st) return send(ws, { type: 'error', why: 'nodoc' });
      const base = st.hist.get(m.base) || st.doc;
      const r = WordSync.merge3(base, m.doc, st.doc, 'mine');   // the side that pushed is the one typing: it wins a clash
      if (WordSync.same(r.doc, st.doc)) { send(ws, { type: 'doc', key, ver: st.ver, doc: st.doc, by: m.by || '' }); return; }
      remember(st, r.doc);
      log((me.role === 'word' ? 'Word' : 'Cortex Scribe') + ' changed “' + ((words.get(key) || {}).name || key) + '”' + (r.conflicts ? ' (same paragraph changed on both sides: kept the newer one)' : ''));
      broadcast(key, st, m.by);
      if (me.role === 'word' || r.conflicts) status();
    }
  }
  ws.on('close', () => {
    if (me && me.role === 'word' && words.get(me.key) === me) { words.delete(me.key); log('Word closed the link for', me.name); status(); }
    if (me && me.role === 'app') { apps.delete(me); status(); }
  });
}
// whatever happens, write it down and keep the link running
process.on('uncaughtException', (e) => console.log('Unexpected problem (the link keeps running):', (e && e.stack) || e));
process.on('unhandledRejection', (e) => console.log('Unexpected problem (the link keeps running):', (e && e.stack) || e));
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch {} } }, 15000).unref();

let listening = 0;
for (const host of ['127.0.0.1', '::1']) {
  const s = host === '127.0.0.1' ? server : https.createServer({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, serve);
  if (s !== server) s.on('upgrade', (...a) => server.emit('upgrade', ...a));
  s.on('error', (e) => { if (host === '127.0.0.1') { console.log(e.code === 'EADDRINUSE' ? '\nPort ' + PORT + ' is already in use: is the Word link already running in another window?\n' : String(e)); process.exit(1); } });
  s.listen(PORT, host, () => {
    if (++listening === 1 && !QUIET) {
      console.log('\n  Cortex Scribe Word link is running.  Leave this window open.\n');
      console.log('  In Word:            Home tab → Cortex Scribe');
      console.log('  In Cortex Scribe:   Home → Word link → Open it here');
      console.log('  Code for the browser version (inkling.html):  ' + CODE + '\n');
    }
    if (QUIET) console.log('READY ' + PORT);
  });
}

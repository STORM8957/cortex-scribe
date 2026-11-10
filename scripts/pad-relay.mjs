// Cortex Scribe pad relay: a phone or tablet on the same Wi-Fi becomes the drawing pad of the desktop app (or of the
// browser version) without Claude. Start it with  npm run pad  (the desktop app starts it by itself: pad_link_start).
// - http://<this computer>:3457/  serves Cortex Scribe (inkling.html) to the phone; the QR code in the app leads there
//   (with #pad=<code>), and the page there becomes the pad straight away.
// - ws://…/padlink passes the pad's messages between the screens that joined the same pad code (the notebook and the
//   pad). The code is the secret: only screens that know it see the messages. Nothing is stored.
// No certificate is needed (plain http on the home network). Settings: CS_PAD_PORT (3457), CS_PAD_QUIET=1 (prints
// "READY <port>" only, for the tests and the desktop app), CS_PAD_IPS (the addresses to offer, for the tests).
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.CS_PAD_PORT || 3457;
const QUIET = process.env.CS_PAD_QUIET === '1';
const log = (...a) => { if (!QUIET) console.log(new Date().toLocaleTimeString(), ...a); };

/* this computer's addresses on the home network (the phone reaches it there) */
function addresses() {
  if (process.env.CS_PAD_IPS) return process.env.CS_PAD_IPS.split(',').map((x) => x.trim()).filter(Boolean);   // for the tests
  const out = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || /^169\.254\./.test(a.address)) continue;
      const virtual = /vmware|virtualbox|vbox|hyper-v|vethernet|docker|wsl|tailscale|zerotier|loopback/i.test(name);
      out.push({ ip: a.address, name, virtual, home: /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address) });
    }
  }
  return out.sort((x, y) => (x.virtual - y.virtual) || (y.home - x.home)).map((a) => a.ip);
}

/* the app for the phone: the built inkling.html, marked so it knows it came from here */
let page = null, pageAt = 0;
function appHtml() {
  const file = [join(root, 'inkling.html'), join(root, 'dist', 'index.html')].find((f) => existsSync(f));
  if (!file) return null;
  const t = statSync(file).mtimeMs;
  if (!page || t !== pageAt) {
    const html = readFileSync(file, 'utf8');
    const mark = '<script>window.CS_PAD_RELAY = 1;</script>';
    page = html.includes('<head>') ? html.replace('<head>', '<head>' + mark) : mark + html;
    pageAt = t;
  }
  return page;
}
function serve(req, res) {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/' || path === '/index.html' || path === '/pad') {
    const html = appHtml();
    if (!html) { res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Cortex Scribe isn’t built yet: run  node scripts/build.mjs  in the Cortex Scribe folder.'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(html); return;
  }
  if (path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not here.');
}

/* which pages may join: the desktop app, the browser version (a file) and the app served from here */
const APP = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'http://localhost:1430', 'http://127.0.0.1:1430']);
function allowed(origin, host) {
  if (!origin || APP.has(origin) || origin === 'null' || origin === 'file://') return true;
  try { const u = new URL(origin); return u.protocol === 'http:' && +u.port === PORT && (u.host === host || ['localhost', '127.0.0.1', ...addresses()].includes(u.hostname)); } catch { return false; }
}

const rooms = new Map();     // pad code → Set of sockets
const server = http.createServer(serve);
const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin || '';
  if (new URL(req.url, 'http://x').pathname !== '/padlink' || !allowed(origin, req.headers.host || '')) {
    log('Refused a connection from “' + (origin || 'no address') + '”');
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => welcome(ws));
});
const send = (ws, m) => { try { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); } catch {} };
function welcome(ws) {
  let code = null;
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  send(ws, { type: 'info', port: PORT, ips: addresses() });
  ws.on('message', (data) => {
    let m; try { m = JSON.parse(String(data)); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'join') {
      const c = String(m.code || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
      if (c.length < 4) return send(ws, { type: 'error', why: 'code' });
      if (code) leave();
      code = c;
      if (!rooms.has(code)) rooms.set(code, new Set());
      rooms.get(code).add(ws);
      log('A screen joined pad', code, '(' + rooms.get(code).size + ' there now, as ' + String(m.side || '?').slice(0, 10) + ')');
      send(ws, { type: 'joined', code, here: rooms.get(code).size });
    } else if (m.type === 'msg' && code && m.env) {
      const out = JSON.stringify({ type: 'msg', env: m.env });
      for (const o of rooms.get(code) || []) if (o !== ws) send(o, out);
    } else if (m.type === 'info') send(ws, { type: 'info', port: PORT, ips: addresses() });
  });
  function leave() { const r = rooms.get(code); if (r) { r.delete(ws); if (!r.size) rooms.delete(code); } }
  ws.on('close', () => { if (code) leave(); });
}
setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch {} } }, 15000).unref();
process.on('uncaughtException', (e) => console.log('Unexpected problem (the pad relay keeps running):', (e && e.stack) || e));

server.on('error', (e) => { console.log(e.code === 'EADDRINUSE' ? '\nPort ' + PORT + ' is already in use: is the pad relay already running?\n' : String(e)); process.exit(1); });
server.listen(PORT, '0.0.0.0', () => {
  if (QUIET) { console.log('READY ' + PORT); return; }
  const ips = addresses();
  console.log('\n  Cortex Scribe pad relay is running.  Leave this window open.\n');
  console.log('  In Cortex Scribe: Handwriting panel → Other screen → scan the QR code with your phone.');
  console.log('  The phone must be on the same Wi-Fi as this computer' + (ips.length ? ' (this computer: ' + ips.map((ip) => 'http://' + ip + ':' + PORT).join(', ') + ').' : '. (No network found yet.)'));
  console.log('  If Windows asks whether Node.js may use the network, allow it for private networks.\n');
});

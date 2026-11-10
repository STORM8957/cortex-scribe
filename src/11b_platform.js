
/* ================= PLATFORM LAYER =================
   Everything that depends on WHERE Cortex Scribe runs goes through this file
   (plus Store in 11_store.js for personal notes).
   Two hosts today: inside Claude (window.claude capabilities) and the desktop app
   (Tauri, `Desk` in 11_store.js; its Rust side is src-tauri/src/lib.rs).
   Every object below keeps the same shape on both:
     AI        text(input, opts) / json(input, opts) / ok / img / name   (11c_ai.js, the AI connector)
     Files     upload(blob) / put(blob) / url(src) / blob(src)
     Shared    ok / get(path) / set(path, data) / del(path) / watch(path, onData, onErr)
     Live      ok / join(room)
     Me        profiles(ids)
     Downloads save(filename, blob)
     Capture   ok / allowed() / screen()   (share a tab, app window or screen)
   Storage keys and data shapes are described in ARCHITECTURE.md. */
/* add-on libraries the desktop app ships next to index.html (dist/lib, copied by scripts/build.mjs) */
const LOCAL_LIBS = { pdf: 'pdf.min.js', pdfw: 'pdf.worker.min.js', mammoth: 'mammoth.browser.min.js', xlsx: 'xlsx.full.min.js', three: 'three.min.js', qr: 'qrcode.js' };
if (Desk) for (const [k, f] of Object.entries(LOCAL_LIBS)) if (LIBS[k]) LIBS[k].unshift('lib/' + f);   // local copy first, so it works offline

const Platform = {
  /* 'claude' (an artifact inside Claude), 'desktop' (the Tauri app) or 'browser' (the file opened in a browser) */
  get host() { return Desk ? 'desktop' : (window.claude && typeof window.claude.use === 'function') ? 'claude' : 'browser'; },
  get name() { return this.host; },
  get desktop() { return !!Desk; },
  /* where a missing feature works, for messages like “AI features work … ” */
  get aiWhere() { return this.host === 'claude' ? 'when this app is open in Claude' : 'once you connect an AI (AI settings, bottom left)'; },
  get shareWhere() { return Desk ? 'Live sharing isn’t in the desktop app yet. It comes in a later version.' : null; },
  /* the address another device can open to reach this Cortex Scribe (for the pad link and its QR code), or null.
     Inside Claude the page runs in a frame that can't see its own claude.ai link, so the owner's link is the
     default; it can be changed in the pad dialog (saved as the 'homeLink' preference). */
  get homeLink() { return this.host === 'claude' ? (prefs.get('homeLink', '') || INKLING_ONLINE_LINK) : null; },
  /* opens this Cortex Scribe as a drawing pad in a new tab (browser) or window (desktop app); false if it can't */
  openPadWindow(code) {
    if (Desk) return deskCall('open_pad_window', { code }).then(() => true, () => false);
    if (this.host === 'claude') return Promise.resolve(false);   // a tab opened from Claude's page can't load claude.ai (blocked); the pad dialog offers the link to paste instead
    const w = window.open(location.href.split('#')[0] + '#pad=' + code, '_blank');
    return Promise.resolve(!!w);
  },
  async init() {
    if (Desk) return deskInit();
    const [sample, assets, room, downloads] = await Promise.all([useCap('sample'), useCap('assets'), useCap('room'), useCap('downloads')]);
    caps.sample = sample; caps.assets = assets; caps.room = room; caps.downloads = downloads;
    if (sample && sample.limits) { try { const l = await sample.limits(); caps.img = l && l.images ? l.images : null; } catch {} }
  },
};

/* ---- desktop app: save before the window closes, open web links in the normal browser ---- */
function deskInit() {
  try {
    Desk.event.listen('inkling-close', async () => {
      try { await Saver.drain(6000); } catch {}
      deskCall('close_now').catch(() => {});
    });
  } catch (e) { console.error('close hook', e); }
  const openOutside = (url) => deskCall('plugin:opener|open_url', { url }).catch(() => toast('That link couldn’t be opened.'));
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (a.closest('[contenteditable=""],[contenteditable="true"]') && !(e.ctrlKey || e.metaKey)) return;   // editing text: no jump
    const url = a.href || '';
    if (/^(https?:|mailto:)/i.test(url) && !url.startsWith(location.origin)) { e.preventDefault(); e.stopPropagation(); openOutside(url); }
  }, true);
  window.open = (url) => { if (url && /^(https?:|mailto:)/i.test(String(url))) openOutside(String(url)); return null; };
}

/* the online Cortex Scribe (a Claude artifact). Change this for your own copy. */
const INKLING_ONLINE_LINK = 'https://claude.ai/artifact/AY4ibHNpV7EB3Kyptp6xsR';

/* ---- AI: see 11c_ai.js (the AI connector) ---- */

/* ---- PadLink: messages between a notebook and a drawing pad on another screen ----
   PadLink.open(code, side, onMsg) → { kind, send(msg), close() }   side is 'main' (the notebook) or 'pad'
   kind 'shared': other devices too, through Claude's shared database (two documents, one per direction:
                  padm/<code> written by the notebook, padp/<code> written by the pad)
   kind 'local':  other tabs or windows on this computer (BroadcastChannel, with localStorage as a fallback)
   The messages themselves are described in 37_pad.js. */
const PadLink = {
  get remote() { return Shared.ok; },
  open(code, side, onMsg) { return Shared.ok ? padLinkShared(code, side, onMsg) : padLinkLocal(code, side, onMsg, Platform.desktop || PadRelay.here || PadRelay.seen); },
};
/* ---- the pad relay on this computer (scripts/pad-relay.mjs): a phone or tablet on the same Wi-Fi is the pad without
   Claude. The desktop app starts it (pad_link_start); the browser version uses it when it runs (npm run pad); the page
   a phone opens from the QR code is served by it (window.CS_PAD_RELAY). ---- */
const PadRelay = {
  get here() { return !!window.CS_PAD_RELAY; },
  seen: false,
  get port() { return +prefs.get('padPort', 3457) || 3457; },
  get usable() { return !Shared.ok && (Platform.desktop || Platform.host === 'browser' || PadRelay.here); },
  url() { return PadRelay.here ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/padlink' : 'ws://127.0.0.1:' + PadRelay.port + '/padlink'; },
  async ensure() {
    if (!Desk) return { state: 'browser' };
    try { return await deskCall('pad_link_start', { port: PadRelay.port }); } catch (e) { return { state: 'failed', detail: String((e && e.message) || e) }; }
  },
  /* this computer's addresses from the relay: { ips, port }, or null when it doesn't answer */
  info(ms) {
    return new Promise((res) => {
      let ws = null;
      const end = (v) => { clearTimeout(t); try { if (ws) ws.close(); } catch {} if (v) PadRelay.seen = true; res(v); };
      const t = setTimeout(() => end(null), ms || 2500);
      try {
        ws = new WebSocket(PadRelay.url());
        ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.type === 'info') end({ ips: Array.isArray(m.ips) ? m.ips : [], port: m.port || PadRelay.port }); } catch {} };
        ws.onerror = () => end(null);
      } catch { end(null); }
    });
  },
};
function padLinkRelay(code, side, take) {
  let ws = null, closed = false, tries = 0; const queue = [];
  const later = () => { if (!closed) setTimeout(open, Math.min(8000, 700 * ++tries)); };
  function open() {
    if (closed) return;
    try { ws = new WebSocket(PadRelay.url()); } catch { ws = null; later(); return; }
    ws.onopen = () => { tries = 0; ws.send(JSON.stringify({ type: 'join', code, side })); for (const q of queue.splice(0)) ws.send(q); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m && m.type === 'msg' && m.env) take(m.env); };
    ws.onclose = () => { ws = null; later(); };
    ws.onerror = () => {};
  }
  open();
  return {
    send(env) { const s = JSON.stringify({ type: 'msg', env }); if (ws && ws.readyState === 1) ws.send(s); else { queue.push(s); if (queue.length > 40) queue.shift(); } },
    close() { closed = true; try { if (ws) ws.close(); } catch {} },
  };
}
function padLinkLocal(code, side, onMsg, relay) {
  const name = 'inkling-pad-' + code, key = 'inkling:' + name, seen = new Set();
  const take = (env) => { if (!env || env.from === side || seen.has(env.id)) return; seen.add(env.id); if (seen.size > 400) seen.clear(); try { onMsg(env.m); } catch (e) { console.error(e); } };
  let bc = null; try { bc = new BroadcastChannel(name); bc.onmessage = (e) => take(e.data); } catch {}
  const onStorage = (e) => { if (e.key === key && e.newValue) { try { take(JSON.parse(e.newValue)); } catch {} } };
  addEventListener('storage', onStorage);
  let rl = relay ? padLinkRelay(code, side, take) : null;   // also through the pad relay: a phone on the same Wi-Fi
  return {
    get kind() { return rl ? 'relay' : 'local'; },
    useRelay() { if (!rl) rl = padLinkRelay(code, side, take); },
    send(m) { const env = { id: newId('pm'), from: side, m }; try { if (bc) bc.postMessage(env); } catch {} try { localStorage.setItem(key, JSON.stringify(env)); } catch {} if (rl) rl.send(env); },
    close() { try { if (bc) bc.close(); } catch {} removeEventListener('storage', onStorage); if (rl) rl.close(); },
  };
}
function padLinkShared(code, side, onMsg) {
  const mine = (side === 'main' ? 'padm/' : 'padp/') + code, theirs = (side === 'main' ? 'padp/' : 'padm/') + code;
  const tag = newId('pl');   // messages are known by tag + number, so clocks that differ between devices don't matter
  let buf = [], cnt = 0, timer = null, seen = null, closed = false;
  let unsub = null;
  try {
    unsub = Shared.watch(theirs, (d) => {
      const msgs = (d && Array.isArray(d.msgs)) ? d.msgs.filter((x) => x && x.k).sort((a, b) => a.n - b.n) : [];
      if (seen == null) { seen = new Set(msgs.map((x) => x.k)); return; }   // what is already there is history
      for (const x of msgs) if (!seen.has(x.k)) { seen.add(x.k); try { onMsg(x.m); } catch (e) { console.error(e); } }
      if (seen.size > 600) seen = new Set(msgs.map((x) => x.k));
    }, () => {});
  } catch (e) { console.error(e); }
  const flush = () => {
    timer = null; if (closed) return;
    let msgs = buf.slice(-12);
    while (msgs.length > 1 && JSON.stringify(msgs).length > 180000) msgs = msgs.slice(1);
    buf = msgs;
    Shared.set(mine, { u: now(), msgs }).catch(() => {});
  };
  return {
    kind: 'shared',
    send(m) { cnt++; buf.push({ k: tag + '.' + cnt, n: cnt, m }); if (!timer) timer = setTimeout(flush, 60); },
    close() { closed = true; try { if (unsub) unsub(); } catch {} },
  };
}

/* ---- Files: pictures, recordings, uploads. A "src" is '/_blob/…' (Claude), 'inkf:…' (desktop: a file in
   Documents/Inkling/media), 'idb:…' (this browser) or a data: URL.
   Desktop: pictures inside pages stay data: URLs (upload() returns null, as in a browser) because they are
   drawn straight from the src; recordings, screenshots and files of windows go to the media folder (put()). ---- */
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'video/webm': 'webm', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'audio/webm': 'weba', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'application/pdf': 'pdf', 'application/json': 'json' };
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]));
const extOf = (type) => MIME_EXT[String(type || '').split(';')[0].trim().toLowerCase()] || 'bin';
async function deskPut(blob) {
  const name = newId('md') + '.' + extOf(blob.type);
  await deskCall('file_put', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-name': name } });
  return 'inkf:' + name;
}
async function deskBlob(src) {
  const name = String(src).slice(5);
  const buf = await deskCall('file_get', { name });
  return new Blob([buf], { type: EXT_MIME[name.split('.').pop()] || '' });
}
let idbP = null;
function mediaDB() {
  if (!idbP) idbP = new Promise((res, rej) => { try { const r = indexedDB.open('inkling-media', 1); r.onupgradeneeded = () => r.result.createObjectStore('m'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
  return idbP;
}
const mediaURLs = new Map();
const Files = {
  async upload(blob) {
    if (Desk || !caps.assets || !blob) return null;
    try { const u = await caps.assets.upload(blob); return u.id ? '/_blob/' + u.id : u.url; } catch { return null; }
  },
  async put(blob) {
    if (!blob) return null;
    if (Desk) { try { return await deskPut(blob); } catch (e) { console.error('file save', e); } }   // falls back to the browser store
    const up = await Files.upload(blob); if (up) return up;
    try {
      const db = await mediaDB(), key = newId('md');
      await new Promise((res, rej) => { const tx = db.transaction('m', 'readwrite'); tx.objectStore('m').put(blob, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      return 'idb:' + key;
    } catch { return null; }
  },
  async idbBlob(key) {
    const db = await mediaDB();
    return new Promise((res, rej) => { const rq = db.transaction('m').objectStore('m').get(key); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); });
  },
  async url(src) {
    if (!src) return null;
    const isF = String(src).startsWith('inkf:');
    if (!isF && !String(src).startsWith('idb:')) return resolveSrc(src);
    if (mediaURLs.has(src)) return mediaURLs.get(src);
    try { const b = isF ? (Desk ? await deskBlob(src) : null) : await Files.idbBlob(src.slice(4)); if (!b) return null; const u = URL.createObjectURL(b); mediaURLs.set(src, u); return u; } catch { return null; }
  },
  async blob(src) {
    if (!src) return null;
    src = String(src);
    if (src.startsWith('data:')) return dataURLtoBlob(src);
    if (src.startsWith('idb:')) return Files.idbBlob(src.slice(4)).catch(() => null);
    if (src.startsWith('inkf:')) return Desk ? deskBlob(src).catch(() => null) : null;
    try { const r = await fetch(resolveSrc(src)); return r.ok ? await r.blob() : null; } catch { return null; }
  },
};
const mediaPut = (blob) => Files.put(blob);
const mediaURL = (src) => Files.url(src);

/* ---- Shared documents (live shared pages) ---- */
const Shared = {
  get ok() { return !!caps.db; },
  async get(path) { const s = await caps.db.doc(path).get(); return s.exists ? deep(s.data() || null) : null; },
  set(path, data) { return caps.db.doc(path).set(data); },
  del(path) { return caps.db.doc(path).delete(); },
  watch(path, onData, onErr) {
    return caps.db.doc(path).onSnapshot((snap) => onData(snap.exists ? deep(snap.data() || {}) : null, !!(snap.metadata && snap.metadata.hasPendingWrites)), onErr || (() => {}));
  },
};

/* ---- Live presence (who is here, cursors) ---- */
const Live = {
  get ok() { return !!caps.room; },
  join(name) { return caps.room.join(name); },
};

/* ---- People ---- */
const Me = {
  get id() { return caps.uid || null; },
  async profiles(ids) { if (!caps.user || !caps.user.profiles || !ids.length) return {}; try { return (await caps.user.profiles(ids)) || {}; } catch { return {}; } },
};

/* ---- Capture: share a browser tab, app window or the whole screen ---- */
const Capture = {
  get ok() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia); },
  allowed() {
    try { const pp = document.permissionsPolicy || document.featurePolicy; if (pp && pp.allowsFeature) return pp.allowsFeature('display-capture'); } catch {}
    return null;   // unknown
  },
  screen() { return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false }); },
  /* the microphone, for sound recordings and window recordings with sound */
  get micOk() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
  micAllowed() {
    try { const pp = document.permissionsPolicy || document.featurePolicy; if (pp && pp.allowsFeature) return pp.allowsFeature('microphone'); } catch {}
    return null;   // unknown
  },
  mic() { return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); },
};

/* ---- Downloads: offer a file to save ---- */
const Downloads = {
  async save(filename, blob) {
    if (Desk) {
      const ok = await deskCall('save_as', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-filename': encodeURIComponent(filename) } });
      if (!ok) throw { code: 'declined' };
      return { saved: true };
    }
    if (caps.downloads) return caps.downloads.save({ filename, data: blob });
    const u = URL.createObjectURL(blob);
    const a = h('a', { href: u, download: filename, style: { display: 'none' } });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
    return { saved: true };
  },
};

/* ---- Word link: the bridge on this computer (npm run word, scripts/word-bridge.mjs) ----
   A WebSocket to wss://localhost:PORT/link. Works in the desktop app and the browser version; a page inside Claude
   can't reach programs on the computer. The browser version (a file) also sends the code the bridge prints. */
const WordBridge = {
  get available() { return Platform.host !== 'claude'; },
  get needsCode() { return Platform.host === 'browser' && (location.protocol === 'file:' || location.origin === 'null'); },
  get port() { const p = +prefs.get('wordPort', 3456); return p > 0 && p < 65536 ? p : 3456; },
  /* the desktop app starts the bridge itself (src-tauri: word_link_start) → { state, detail } or null elsewhere */
  async ensure() {
    if (!Desk) return null;
    try { return await deskCall('word_link_start', { port: this.port }); } catch (e) { return { state: 'failed', detail: String((e && e.message) || e) }; }
  },
  /* the desktop app can search the Word files on this computer (Documents, Desktop, Downloads, OneDrive) and open one
     in Word (src-tauri: word_find, word_open) */
  get canFind() { return !!Desk; },
  async findDocs(query) { if (!Desk) return []; const r = await deskCall('word_find', { query: String(query || '').slice(0, 100) }); return Array.isArray(r) ? r : []; },
  async openDoc(path) { if (!Desk) throw new Error('only in the desktop app'); return deskCall('word_open', { path }); },
  /* handlers: { open(), message(obj), close(wasOpen) }; returns { send(obj), close() } */
  connect(handlers) {
    let ws, wasOpen = false;
    try { ws = new WebSocket('wss://localhost:' + this.port + '/link'); } catch { setTimeout(() => handlers.close && handlers.close(false), 0); return { send() {}, close() {} }; }
    ws.onopen = () => { wasOpen = true; if (handlers.open) handlers.open(); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } if (handlers.message) handlers.message(m); };
    ws.onclose = () => { if (handlers.close) handlers.close(wasOpen); };
    ws.onerror = () => {};
    return { send(m) { try { if (ws.readyState === 1) ws.send(JSON.stringify(m)); } catch {} }, close() { try { ws.close(); } catch {} } };
  },
};

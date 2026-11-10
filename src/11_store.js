
/* ================= host =================
   Cortex Scribe runs in two places, chosen at start:
   - inside Claude (an artifact): window.claude capabilities, notes in Claude's database;
   - the desktop app (Tauri): window.__TAURI__, notes as files in Documents/Inkling.
   Opened as a plain file in a browser, it falls back to this browser's storage. */
const Desk = (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') ? window.__TAURI__ : null;
const deskCall = (cmd, args, opts) => Desk.core.invoke(cmd, args, opts);

/* ================= capabilities ================= */
const caps = { db: null, user: null, sample: null, assets: null, room: null, img: null, canWrite: null, uid: null };
const useCap = (n) => (window.claude && typeof window.claude.use === 'function')
  ? Promise.resolve().then(() => window.claude.use(n)).catch(() => null)
  : Promise.resolve(null);

/* ================= storage ================= */
const MAX_DOC = 250000;          // Claude's database limit per document
const MAX_DOC_DESKTOP = 40000000; // desktop files: pictures stay inside the page, so allow much more
function byteSize(o) { const s = JSON.stringify(o); return s.length < 120000 ? s.length : new Blob([s]).size; }
const Store = {
  mode: 'local', col: null, uid: null, reason: '', folder: '',
  lk: (k) => 'inkling:data:' + k,
  get maxDoc() { return this.mode === 'desktop' ? MAX_DOC_DESKTOP : MAX_DOC; },
  async init() {
    if (Desk) {
      try { const info = await deskCall('store_info'); this.folder = (info && info.folder) || ''; this.mode = 'desktop'; return; }
      catch (e) { console.error('desktop storage', e); this.reason = 'desktop_failed'; }   // falls back to this window's storage
    }
    const [db, user] = await Promise.all([useCap('db'), useCap('user')]);
    caps.db = db; caps.user = user;
    if (user) { try { caps.canWrite = await user.can('data.write'); } catch { caps.canWrite = null; } }
    if (db && user) {
      try {
        const id = await user.id();
        if (id) {
          caps.uid = id; this.uid = id;
          if (caps.canWrite === false) { this.mode = 'local'; this.reason = 'readonly'; }
          else { this.col = db.collection('data/users/' + id); this.mode = 'db'; }
        }
      } catch {}
    }
  },
  async get(k) {
    if (this.mode === 'desktop') { const s = await deskCall('store_get', { key: k }); return s == null ? null : JSON.parse(s); }
    if (this.mode === 'db') {
      try { const s = await this.col.doc(k).get(); return s.exists ? deep(s.data() || null) : null; }
      catch (e) { if (e && e.code === 'unavailable') { await sleep(600 + Math.random() * 600); const s = await this.col.doc(k).get(); return s.exists ? deep(s.data() || null) : null; } throw e; }
    }
    try { const v = localStorage.getItem(this.lk(k)); return v ? JSON.parse(v) : null; } catch { return null; }
  },
  async set(k, data) {
    if (byteSize(data) > this.maxDoc) throw { code: 'too_big' };
    if (this.mode === 'desktop') {
      try { return await deskCall('store_set', { key: k, data: JSON.stringify(data) }); }
      catch (e) { console.error('save', k, e); throw { code: 'disk', detail: String(e) }; }
    }
    if (this.mode === 'db') {
      try { return await this.col.doc(k).set(data); }
      catch (e) {
        if (e && (e.code === 'invalid_argument' || e.code === 'not_granted')) { this.goLocal(); return this.set(k, data); }
        throw e;
      }
    }
    try { localStorage.setItem(this.lk(k), JSON.stringify(data)); }
    catch { throw { code: 'local_full' }; }
  },
  async del(k) {
    if (this.mode === 'desktop') { try { await deskCall('store_del', { key: k }); } catch {} return; }
    if (this.mode === 'db') { try { await this.col.doc(k).delete(); } catch {} return; }
    try { localStorage.removeItem(this.lk(k)); } catch {}
  },
  /* onData(data) runs when the key is changed in another tab or on another device (and once at the start in
     Claude's database); returns a stop function, or null where that isn't possible (desktop app) */
  watch(k, onData) {
    if (this.mode === 'db') {
      try { return this.col.doc(k).onSnapshot((s) => onData(s.exists ? deep(s.data() || null) : null), () => {}); } catch { return null; }
    }
    if (this.mode === 'local') {
      const key = this.lk(k), fn = (e) => { if (e.key === key) { try { onData(e.newValue ? JSON.parse(e.newValue) : null); } catch {} } };
      addEventListener('storage', fn); return () => removeEventListener('storage', fn);
    }
    return null;
  },
  goLocal() {
    if (this.mode === 'local') return;
    this.mode = 'local'; this.reason = 'readonly'; caps.canWrite = false;
    showStoreNote();
    toast('You can’t save into this app’s shared storage, so your notes are kept in this browser instead.');
  },
};
function showStoreNote() {
  const sn = $('#storeNote');
  if (Store.mode === 'db' || Store.mode === 'desktop') { sn.hidden = true; return; }
  sn.hidden = false;
  sn.textContent = Store.reason === 'desktop_failed'
    ? 'Cortex Scribe couldn’t open its folder in Documents, so for now your notes are saved inside the app window only. Export them before closing (Backup and move).'
    : Store.reason === 'readonly'
    ? 'You have view-only access to this app, so your own notebooks are saved in this browser only. Ask the owner for Editor or Contributor access to save them in your account.'
    : 'Saved in this browser only. Open the app in Claude to keep it in your account.';
}

/* one write at a time per document, debounced; data may be a function (built at write time).
   Each change waits for a short pause, but a change is never kept waiting longer than MAX_WAIT,
   so someone working without a break is still saved every few seconds. */
const SAVE_MAX_WAIT = 3000;
const Saver = {
  q: new Map(), running: new Set(), failed: false, tooBig: false,
  schedule(key, data, write, delay = 800) {
    const old = this.q.get(key);
    if (old) clearTimeout(old.timer);
    const first = old ? old.first : Date.now();
    const it = { data, write, tries: 0, first };
    it.timer = setTimeout(() => this.flush(key), Math.max(0, Math.min(delay, first + SAVE_MAX_WAIT - Date.now())));
    this.q.set(key, it);
    setStatus();
  },
  latest(key) { const it = this.q.get(key); if (!it) return undefined; return typeof it.data === 'function' ? it.data() : it.data; },
  async flush(key) {
    const it = this.q.get(key); if (!it) return;
    clearTimeout(it.timer);
    if (this.running.has(key)) { it.timer = setTimeout(() => this.flush(key), 250); return; }
    this.q.delete(key); this.running.add(key);
    try {
      const data = typeof it.data === 'function' ? it.data() : it.data;
      await it.write(data); this.failed = false; this.tooBig = false;
    } catch (e) {
      this.failed = true;
      if (e && e.code === 'too_big') { this.tooBig = true; toast('This page is too big to save. Move some pictures or drawings to a new page.'); }
      else if (e && (e.code === 'not_granted' || e.code === 'revoked' || e.code === 'invalid_argument')) { onWriteRefused(key); }
      else if (e && e.code === 'disk') toast('Cortex Scribe couldn’t write to its folder (' + (Store.folder || 'Documents/Inkling') + '). Check that the disk isn’t full and the folder isn’t read-only.');
      else if (e && e.code === 'quota_exceeded') toast('The app’s storage is full. Delete some old pages to free up space.');
      else if (!this.q.has(key) && it.tries < 3) { it.tries++; it.timer = setTimeout(() => this.flush(key), 4000 * it.tries); this.q.set(key, it); }
    } finally { this.running.delete(key); setStatus(); }
  },
  flushAll() { return Promise.all([...this.q.keys()].map((k) => this.flush(k))); },
  /* write everything that is waiting, including writes already running; gives up after ms */
  async drain(ms = 6000) {
    const end = Date.now() + ms;
    while ((this.q.size || this.running.size) && Date.now() < end) { await this.flushAll(); await sleep(60); }
    return !(this.q.size || this.running.size);
  },
};
function setStatus() {
  const el = $('#status');
  const busy = Saver.q.size || Saver.running.size;
  el.classList.toggle('err', Saver.failed && !busy);
  if (busy) el.textContent = 'Saving…';
  else if (Saver.tooBig) el.textContent = 'Too big to save';
  else if (Saver.failed) el.textContent = 'Not saved yet. Check your connection.';
  else if (cur && cur.ro) el.textContent = 'View only';
  else el.textContent = Store.mode === 'db' || Store.mode === 'desktop' ? 'Saved' : 'Saved in this browser';
  if (Store.mode === 'desktop' && Store.folder) el.title = 'Your notes are saved on this computer, in ' + Store.folder;
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Saver.flushAll(); });
addEventListener('pagehide', () => Saver.flushAll());

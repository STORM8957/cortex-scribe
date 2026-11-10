// Stand-in for Claude's runtime where several tabs share ONE database, like a notebook and a phone signed in to
// the same account: documents live in localStorage under "__mockdb:", and a change in one tab reaches the
// others through the "storage" event (onSnapshot). Used by test21 for the pad on another screen.
(() => {
  const P = '__mockdb:';
  const subs = new Map();
  const freeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
  const read = (p) => { const v = localStorage.getItem(P + p); return v == null ? undefined : JSON.parse(v); };
  const snapOf = (p) => { const v = read(p); return { exists: v !== undefined, data: () => freeze(v === undefined ? null : v), metadata: { hasPendingWrites: false } }; };
  const fire = (p) => (subs.get(p) || []).slice().forEach((f) => { try { f(snapOf(p)); } catch (e) { console.error(e); } });
  addEventListener('storage', (e) => { if (e.key && e.key.startsWith(P)) fire(e.key.slice(P.length)); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const docRef = (p) => ({
    get: async () => { await wait(10); return snapOf(p); },
    set: async (d) => { const s = JSON.stringify(d); if (s.length > 262144) throw { code: 'invalid_argument' }; localStorage.setItem(P + p, s); setTimeout(() => fire(p)); },
    update: async (d) => { localStorage.setItem(P + p, JSON.stringify({ ...(read(p) || {}), ...d })); setTimeout(() => fire(p)); },
    delete: async () => { localStorage.removeItem(P + p); setTimeout(() => fire(p)); },
    onSnapshot: (cb) => { if (!subs.has(p)) subs.set(p, []); subs.get(p).push(cb); setTimeout(() => cb(snapOf(p)), 30); return () => { const l = subs.get(p) || []; const i = l.indexOf(cb); if (i >= 0) l.splice(i, 1); }; },
  });
  const db = { doc: (p) => docRef(p), collection: (c) => ({ doc: (k) => docRef(c + '/' + k) }) };
  const user = { id: async () => 'u1', can: async () => true, profiles: async (ids) => Object.fromEntries([].concat(ids).map((i) => [i, { name: 'Kawi' }])) };
  window.__asked = [];
  const sample = async (input) => {
    await wait(40);
    const s = typeof input === 'string' ? input : JSON.stringify(input);
    window.__asked.push(s.slice(0, 60));
    if (s.includes('Transcribe exactly')) return { text: 'Hallo', truncated: false };
    if (s.includes('standalone SVG')) return { text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#ffffff"/><circle cx="200" cy="150" r="80" fill="#E5383B"/></svg>', truncated: false };
    return { text: 'ok', truncated: false };
  };
  sample.json = async () => ({});
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 5e6, mediaTypes: ['image/png', 'image/jpeg'] } });
  window.claude = { use: async (n) => { await wait(20); return ({ db, user, sample })[n] || null; } };
})();

(() => {
  const store = new Map();
  const subs = new Map();
  const now = Date.now();
  store.set('data/users/u1/tree', { nodes: { nb1: { id: 'nb1', type: 'folder', name: 'Biologie', parent: null, order: 1, created: now, updated: now }, n1: { id: 'n1', type: 'note', name: 'Zellen', parent: 'nb1', order: 2, created: now, updated: now } }, session: 'old', v: 1 });
  store.set('data/users/u1/note_n1', { html: '<h2>Zelle</h2><p>Die Zelle ist klein.</p><p><img src="/_blob/abc123" alt="x"></p>', updated: now, session: 'old' });
  const freeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
  const snapOf = (p) => ({ exists: store.has(p), data: () => freeze(JSON.parse(JSON.stringify(store.get(p) || null))), metadata: { hasPendingWrites: false } });
  const docRef = (p) => ({
    get: async () => { await new Promise(r => setTimeout(r, 30)); return snapOf(p); },
    set: async (d) => { const s = JSON.stringify(d); if (s.length > 262144) throw { code: 'invalid_argument' }; store.set(p, JSON.parse(s)); (subs.get(p) || []).forEach(f => f(snapOf(p))); },
    update: async (d) => { store.set(p, { ...(store.get(p) || {}), ...d }); },
    delete: async () => { store.delete(p); },
    onSnapshot: (cb, err) => { if (!subs.has(p)) subs.set(p, []); subs.get(p).push(cb); setTimeout(() => cb(snapOf(p)), 40); return () => {}; },
  });
  const db = { doc: (p) => docRef(p), collection: (c) => ({ doc: (k) => docRef(c + '/' + k) }) };
  const user = { id: async () => 'u1', can: async () => true, isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries([].concat(ids).map(i => [i, { name: 'Friend' }])) };
  const sample = async () => ({ text: 'ok' }); sample.json = async () => ({}); sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5 } });
  window.__store = store;
  window.claude = { use: async (n) => { await new Promise(r => setTimeout(r, 60)); return ({ db, user, sample })[n] || null; } };
})();

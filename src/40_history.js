/* ================= Recently deleted and page history =================
   Deleting a page, folder or notebook moves it to Recently deleted for 30 days: its tree nodes keep
   deleted: true plus trashed (when) and trashRoot (the id of what you deleted), and its pages stay
   stored. Restore brings them back; after 30 days (or “Delete forever”) they are removed for good.
   Page history: ver_<pageId> = { items: [{ id, t, why, words, things, lines, sig }] } and
   verd_<versionId> = { main, ink }. A version is kept when you open a page and then change it,
   every 10 minutes while you work, before Tidy up, changing the page type or restoring, and when
   you press “Save a version now”. The newest 25 are kept per page. */
const TRASH_DAYS = 30, VER_MAX = 25, VER_EVERY = 10 * 60 * 1000;
const DAY = 24 * 3600 * 1000;

/* ---------- Recently deleted ---------- */
const trashRoots = () => Object.values(tree.nodes).filter((n) => n && n.deleted && n.trashed && n.trashRoot === n.id);
const trashMembers = (root) => Object.values(tree.nodes).filter((n) => n && n.deleted && n.trashed && n.trashRoot === root.id);
function moveToTrash(n) {
  const all = [n, ...(n.type === 'folder' ? descendants(n.id) : [])], t = now();
  for (const x of all) { x.deleted = true; x.trashed = t; x.trashRoot = n.id; touch(x); }
  return all;
}
/* removes pages for good (what deleting did before Recently deleted existed) */
function purgeTrash(root) {
  const all = trashMembers(root);
  for (const x of all) {
    if (x.type === 'note' && !x.shared) { Store.del('note_' + x.id).catch(() => {}); Store.del('ink_' + x.id).catch(() => {}); Store.del('fc_' + x.id).catch(() => {}); dropVersions(x.id); }
    if (x.type === 'note' && x.shared && x.owner && Shared.ok) { Shared.del('shared/' + x.shared).catch(() => {}); Shared.del('sharedink/' + x.shared).catch(() => {}); }
    if (x.type === 'folder' && !x.parent) { for (const k of ['chat_', 'studio_', 'scores_']) Store.del(k + x.id).catch(() => {}); deleteAllSources(x.id); }
    delete x.trashed; delete x.trashRoot; touch(x);
  }
  return all.length;
}
function purgeOldTrash() {
  let n = 0;
  for (const r of trashRoots()) if (now() - r.trashed > TRASH_DAYS * DAY) n += purgeTrash(r);
  if (n) saveTree();
}
function restoreTrash(root) {
  if (!root || !root.trashed) return;
  if (root.parent && !live(tree.nodes[root.parent])) {
    if (root.type === 'folder') root.parent = null;
    else {
      let nb = Object.values(tree.nodes).find((x) => live(x) && x.type === 'folder' && !x.parent && x.name === 'Restored pages');
      if (!nb) nb = mkNode('folder', 'Restored pages', null);
      root.parent = nb.id; openSet.add(nb.id); persistOpen();
    }
  }
  for (const x of trashMembers(root)) { x.deleted = false; delete x.trashed; delete x.trashRoot; touch(x); }
  saveTree(); renderTree(); renderCrumbs();
  toast('Brought back “' + root.name + '”.', root.type === 'note' ? { label: 'Open it', fn: () => openNote(root.id) } : null);
}
function fmtWhen(t) {
  const d = new Date(t), td = new Date(), tm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(td) - day(d)) / DAY);
  return diff === 0 ? 'Today, ' + tm : diff === 1 ? 'Yesterday, ' + tm : d.toLocaleDateString() + ', ' + tm;
}
function openTrash() {
  purgeOldTrash();
  const body = h('div', { class: 'trash-win' });
  let m = null;
  const render = () => {
    body.textContent = '';
    const roots = trashRoots().sort((a, b) => b.trashed - a.trashed);
    body.append(h('p', { class: 'hint' }, 'Pages, folders and notebooks you delete stay here for ' + TRASH_DAYS + ' days. Then they’re gone for good.'));
    if (!roots.length) { body.append(h('p', { class: 'hint' }, 'Nothing here right now.')); return; }
    body.append(h('div', { class: 'mlist' }, roots.map((r) => {
      const inside = trashMembers(r).length - 1, left = Math.max(1, Math.ceil((r.trashed + TRASH_DAYS * DAY - now()) / DAY));
      const what = r.type === 'note' ? (KIND_LABEL[r.kind] || 'Page') : !r.parent ? 'Notebook' : 'Folder';
      return h('div', { class: 'mrow', 'data-id': r.id },
        h('div', { class: 'mthumb blk' }, svg(r.type === 'note' ? (KIND_ICON[r.kind] || 'page') : !r.parent ? 'book' : 'folder')),
        h('div', { class: 'minfo' }, h('b', null, r.name), h('small', null, [what + (inside > 0 ? ', ' + inside + ' item' + (inside === 1 ? '' : 's') + ' inside' : ''), 'deleted ' + fmtWhen(r.trashed), left + ' day' + (left === 1 ? '' : 's') + ' left'].join(' · '))),
        h('div', { class: 'macts' },
          h('button', { class: 'btn small primary', onclick: () => { restoreTrash(r); render(); } }, svg('undo'), 'Restore'),
          h('button', { class: 'btn small', onclick: async () => { if (!(await confirmModal('Delete “' + r.name + '” for good?', 'This can’t be undone.', 'Delete forever', true))) return; purgeTrash(r); saveTree(); render(); } }, 'Delete forever')));
    })));
  };
  render();
  m = modal({ title: 'Recently deleted', wide: true, body: [body], actions: [
    { label: 'Empty Recently deleted', kind: 'danger', fn: async () => {
      const roots = trashRoots(); if (!roots.length) return false;
      if (!(await confirmModal('Delete everything in Recently deleted for good?', roots.length + ' item' + (roots.length === 1 ? '' : 's') + '. This can’t be undone.', 'Delete forever', true))) return false;
      for (const r of roots) purgeTrash(r); saveTree(); render(); return false;
    } },
    { label: 'Close' }] });
}
$('#trashBtn').append(svg('trash'), 'Recently deleted');
$('#trashBtn').addEventListener('click', openTrash);

/* ---------- page history ---------- */
let verState = null; // { id, base, done, last }
function verCapture() { return doc && cur ? { main: serializeMain(doc, cur.id), ink: serializeInk(doc).ink } : null; }
function verSig(data) {
  const s = JSON.stringify([data.main.kind, data.main.bg, data.main.pcol || null, data.main.flows, Object.values(data.main.objs || {}).filter((o) => o && !o.del).map((o) => { const { u, ...r } = o; return r; }), Object.keys(data.ink || {}).sort()]);
  let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0;
  return s.length + ':' + (x >>> 0).toString(36);
}
async function loadVersions(pid) { const d = await Store.get('ver_' + pid).catch(() => null); return d && Array.isArray(d.items) ? d.items.map(deep) : []; }
function dropVersions(pid) { loadVersions(pid).then((items) => { for (const it of items) Store.del('verd_' + it.id).catch(() => {}); Store.del('ver_' + pid).catch(() => {}); }); }
/* one version at a time: two saves at the same moment (opening the page and an AI edit) must not overwrite each other */
let verQueue = Promise.resolve();
function saveVersion(pid, data, why) {
  const run = () => saveVersionNow(pid, data, why);
  const p = verQueue.then(run, run); verQueue = p.catch(() => false);
  return p;
}
async function saveVersionNow(pid, data, why) {
  if (!data || !data.main) return false;
  const items = await loadVersions(pid), sig = verSig(data);
  if (items[0] && items[0].sig === sig) return false;
  const live0 = Object.values(data.main.objs || {}).filter((o) => o && !o.del);
  const text = (data.main.flows || []).map(htmlStrToText).join(' ') + ' ' + live0.filter((o) => o.html).map((o) => htmlStrToText(o.html)).join(' ');
  const vid = newId('v');
  try { await Store.set('verd_' + vid, { main: data.main, ink: data.ink || {} }); } catch { return false; }
  items.unshift({ id: vid, t: now(), why, sig, words: (text.match(/\S+/g) || []).length, things: live0.filter((o) => o.t !== 'conn').length, lines: Object.values(data.ink || {}).filter((s) => s && !s.del).length });
  while (items.length > VER_MAX) { const old = items.pop(); Store.del('verd_' + old.id).catch(() => {}); }
  try { await Store.set('ver_' + pid, { items }); } catch { return false; }
  return true;
}
function verOnOpen(fresh) {
  verState = cur && doc && !cur.ro ? { id: cur.id, base: fresh ? null : verCapture(), done: !!fresh, last: fresh ? now() : 0 } : null;
}
/* called whenever the page is saved */
function verOnSave() {
  const v = verState; if (!v || !cur || v.id !== cur.id || cur.ro || !doc) return;
  if (!v.done) { v.done = true; v.last = now(); const b = v.base; v.base = null; saveVersion(v.id, b, 'When you opened it'); return; }
  if (now() - v.last >= VER_EVERY) { v.last = now(); saveVersion(v.id, verCapture(), 'While you worked'); }
}
/* before big changes (Tidy up, changing the page type) */
function verBefore(why) { if (cur && doc && !cur.ro) saveVersion(cur.id, verCapture(), why); }
async function restoreVersion(pid, it, asCopy) {
  const d = await Store.get('verd_' + it.id).catch(() => null);
  if (!d || !d.main) return toast('That version couldn’t be loaded.');
  const data = deep(d), n = tree.nodes[pid]; if (!n) return;
  if (asCopy) {
    const c = mkNode('note', n.name + ' (' + fmtWhen(it.t) + ')', n.parent); c.kind = data.main.kind || n.kind;
    try { await Store.set('note_' + c.id, { ...data.main, title: c.name, session: SESSION, u: now() }); await Store.set('ink_' + c.id, { ink: data.ink || {}, u: now() }); }
    catch { delete tree.nodes[c.id]; return toast('The copy couldn’t be made.'); }
    saveTree(); renderTree(); await openNote(c.id);
    toast('Opened the version from ' + fmtWhen(it.t) + ' as a new page.');
    return;
  }
  if (!cur || cur.id !== pid) await openNote(pid);
  if (!cur || cur.id !== pid || !doc) return;
  if (cur.ro) return toast('This page is view only.');
  await Saver.flushAll();
  await saveVersion(pid, verCapture(), 'Before you went back to an older one');
  const main = normalizeMain(data.main, doc.kind), sameKind = main.kind === doc.kind;
  if (sameKind) pushUndo(true);
  restoreSnap(JSON.stringify({ objs: main.objs, ink: data.ink || {}, flows: main.flows }));
  doc.bg = main.bg; doc.margin = main.margin; if (main.pcol) doc.pcol = main.pcol; else delete doc.pcol; copyPageSetup(main, doc); doc.mu = now();
  clearSel();
  if (sameKind) view.rebuild();
  else {
    doc.kind = main.kind; n.kind = main.kind; touch(n); saveTree();
    view = new View(doc.kind); view.build(); setTool(defaultTool());
    if (doc.kind === 'a4') for (let i = 0; i < doc.flows.length; i++) view.reflow(i);
    hist.undo = []; hist.redo = []; renderRibbon(); renderCrumbs(); renderTree();
  }
  saveDoc(); markInk();
  if (verState && verState.id === pid) verState.last = now();
  toast('The page is back to how it was ' + fmtWhen(it.t).replace(/^(Today|Yesterday)/, (x) => x.toLowerCase()) + '.', sameKind ? { label: 'Undo', fn: undoObjs } : null);
}
async function openHistory(pid) {
  pid = pid || (cur && cur.id); const n = tree.nodes[pid]; if (!n) return;
  if (cur && cur.id === pid) await Saver.flushAll();
  const body = h('div', { class: 'hist-win' });
  let m = null;
  const render = async () => {
    const items = await loadVersions(pid);
    body.textContent = '';
    const here = cur && cur.id === pid && !cur.ro;
    body.append(h('p', { class: 'hint' }, 'Cortex Scribe keeps versions of this page: when you open it and change it, every 10 minutes while you work, and before big changes like Tidy up. The newest ' + VER_MAX + ' are kept.'));
    if (here) body.append(h('div', { class: 'btnrow' }, h('button', { class: 'btn small', id: 'verSaveNow', onclick: async () => { await Saver.flushAll(); const ok = await saveVersion(pid, verCapture(), 'Saved by you'); toast(ok ? 'Version saved.' : 'Nothing changed since the last version.'); render(); } }, svg('plus'), 'Save a version now')));
    if (!items.length) { body.append(h('p', { class: 'hint' }, 'No versions yet. They appear once you change the page.')); return; }
    body.append(h('div', { class: 'mlist' }, items.map((it) => h('div', { class: 'mrow', 'data-id': it.id },
      h('div', { class: 'mthumb blk' }, svg('clock')),
      h('div', { class: 'minfo' }, h('b', null, fmtWhen(it.t)), h('small', null, [it.why, it.words + ' word' + (it.words === 1 ? '' : 's'), it.things + ' box' + (it.things === 1 ? '' : 'es') + ' and pictures', it.lines + ' drawing line' + (it.lines === 1 ? '' : 's')].join(' · '))),
      h('div', { class: 'macts' },
        here ? h('button', { class: 'btn small primary', onclick: async () => { if (!(await confirmModal('Go back to the version from ' + fmtWhen(it.t) + '?', 'The page as it is now is kept as a version too, so you can come back to it.', 'Go back'))) return; m.close(); restoreVersion(pid, it); } }, svg('undo'), 'Go back to this') : null,
        h('button', { class: 'btn small', onclick: () => { m.close(); restoreVersion(pid, it, true); } }, 'Open as a copy'))))));
  };
  m = modal({ title: 'Page history: ' + n.name, wide: true, body: [body], actions: [{ label: 'Close' }] });
  render();
}

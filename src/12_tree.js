
/* ================= tree ================= */
let tree = { nodes: {} };
let cur = null; // { id, loading, ro, code }
const openSet = new Set(prefs.get('open', []));
const persistOpen = () => prefs.set('open', [...openSet]);
const live = (n) => n && !n.deleted;
function touch(n) { n.updated = now(); }
function saveTree() { Saver.schedule('tree', () => ({ nodes: tree.nodes, session: SESSION, v: 2 }), (d) => Store.set('tree', d), 500); }
function kids(pid) {
  return Object.values(tree.nodes).filter((n) => live(n) && (n.parent || null) === pid)
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) || (a.order || 0) - (b.order || 0));
}
function ancestors(id) { const out = []; let n = tree.nodes[id]; while (n && n.parent) { n = tree.nodes[n.parent]; if (n) out.unshift(n); } return out; }
function notebookOf(id) { let n = tree.nodes[id]; while (n && n.parent && tree.nodes[n.parent]) n = tree.nodes[n.parent]; return n; }
function descendants(id) { const out = []; const walk = (pid) => { for (const c of kids(pid)) { out.push(c); if (c.type === 'folder') walk(c.id); } }; walk(id); return out; }
function mkNode(type, name, parent) {
  const n = { id: newId(type === 'folder' ? 'f' : 'n'), type, name, parent: parent || null, order: now(), created: now(), updated: now() };
  tree.nodes[n.id] = n;
  return n;
}
const KIND_ICON = { a4: 'a4', endless: 'page', board: 'board' };
const KIND_LABEL = { a4: 'A4 pages', endless: 'Endless page', board: 'Drawing board' };
function renderTree() {
  if (noteSearchQ()) return renderNoteSearch();
  const t = $('#tree'); t.textContent = '';
  const roots = kids(null);
  if (!roots.length) { t.append(h('p', { class: 'tree-empty' }, 'No notebooks yet.')); return; }
  const ul = h('ul', { class: 't-list', role: 'tree' });
  for (const n of roots) ul.append(renderNode(n, 0));
  t.append(ul);
}
function renderNode(n, depth) {
  const isF = n.type === 'folder';
  const open = isF && openSet.has(n.id);
  const li = h('li', { role: 'treeitem', 'aria-expanded': isF ? String(open) : null });
  const row = h('div', { class: 't-row' + (depth === 0 ? ' top' : '') + (cur && cur.id === n.id ? ' active' : ''), style: '--d:' + depth });
  if (isF) row.append(h('button', { class: 't-caret', 'aria-label': (open ? 'Close ' : 'Open ') + n.name, onclick: () => toggleFolder(n.id) }, svg('caret')));
  else row.append(h('span', { class: 't-spacer' }));
  const ic = isF ? (depth === 0 ? (n.inbox ? 'shared' : 'book') : 'folder') : (n.shared ? 'shared' : (KIND_ICON[n.kind] || 'page'));
  row.append(h('button', { class: 't-name', title: n.name, onclick: () => (isF ? toggleFolder(n.id) : openNote(n.id)) }, svg(ic), h('span', null, n.name || 'Untitled')));
  const acts = h('div', { class: 't-acts' });
  if (isF) acts.append(h('button', { class: 'icon-btn', 'aria-label': 'Add to ' + n.name, title: 'Add a page or subfolder', onclick: (e) => openMenu(e.currentTarget, [
    { label: 'New page…', icon: 'page', fn: () => newPage(n.id) },
    { label: 'New subfolder', icon: 'folder', fn: () => newFolder(n.id) },
  ]) }, svg('plus')));
  acts.append(h('button', { class: 'icon-btn', 'aria-label': 'More for ' + n.name, title: 'More', onclick: (e) => openMenu(e.currentTarget, nodeMenu(n)) }, svg('dots')));
  row.append(acts);
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(pointAnchor(e.clientX, e.clientY), nodeMenu(n)); });
  wireTreeDrag(row, n);
  li.append(row);
  if (open) {
    const ch = kids(n.id);
    const ul = h('ul', { class: 't-list', role: 'group' });
    if (!ch.length) ul.append(h('li', null, h('div', { class: 't-row t-empty', style: '--d:' + (depth + 1) }, h('span', { class: 't-spacer' }),
      h('button', { class: 't-name', onclick: () => newPage(n.id) }, svg('plus'), h('span', null, 'Add a page')),
      h('button', { class: 't-name t-addf', onclick: () => newFolder(n.id) }, svg('folder'), h('span', null, 'Add a subfolder')))));
    for (const c of ch) ul.append(renderNode(c, depth + 1));
    li.append(ul);
  }
  return li;
}
function nodeMenu(n) {
  const items = [];
  if (n.type === 'folder') items.push({ label: 'New page…', icon: 'page', fn: () => newPage(n.id) }, { label: 'New subfolder', icon: 'folder', fn: () => newFolder(n.id) }, { sep: true });
  items.push({ label: 'Rename', icon: 'edit', fn: () => renameNode(n) });
  items.push({ label: 'Move to…', icon: 'move', fn: () => moveNode(n) });
  if (n.parent) items.push({ label: 'Put in a new folder…', icon: 'folder', fn: () => intoNewFolder(n) });
  if (n.type === 'note') {
    items.push({ label: 'Duplicate', icon: 'dup', fn: () => duplicateNote(n) });
    items.push({ label: 'Save as a block', icon: 'blocks', fn: () => saveBlockFromPage(n.id) });
    items.push({ label: 'Page history…', icon: 'clock', fn: () => openHistory(n.id) });
    items.push({ label: 'Download as PDF', icon: 'download', fn: () => exportPdf(n.id) });
    items.push({ label: n.shared ? 'Sharing…' : 'Share live…', icon: 'shared', fn: async () => { if (!cur || cur.id !== n.id) await openNote(n.id); shareModal(); } });
  }
  items.push({ label: 'Delete', icon: 'trash', danger: true, fn: () => deleteNode(n) });
  return items;
}
function toggleFolder(id) { if (openSet.has(id)) openSet.delete(id); else openSet.add(id); persistOpen(); renderTree(); }

async function newNotebook() {
  const name = await promptModal('New notebook', 'Name', '', 'Create notebook', 'e.g. Modul 334');
  if (name == null) return;
  const nb = mkNode('folder', name.trim() || 'Untitled notebook', null);
  openSet.add(nb.id); persistOpen(); saveTree(); renderTree();   // shown right away, also if the page dialog is cancelled
  await newPage(nb.id);
}
/* a new folder next to n (in the same place), with n inside it */
async function intoNewFolder(n) {
  const name = await promptModal('Put “' + n.name + '” in a new folder', 'Folder name', '', 'Create folder');
  if (name == null) return;
  const f = mkNode('folder', name.trim() || 'Untitled folder', n.parent);
  f.order = n.order;
  treeMove(n, f.id, null, false);
  toast('“' + n.name + '” is now in the folder “' + f.name + '”.');
}
/* moves n into parent (null = top level, a notebook), before or after the sibling ref (or at the end) */
function treeMove(n, parent, ref, after) {
  parent = parent || null;
  if (n.type === 'folder' && (parent === n.id || descendants(n.id).some((d) => d.id === parent))) { toast('A folder can’t go inside itself.'); return false; }
  if (n.type === 'note' && !parent) { toast('Pages live inside a notebook or folder.'); return false; }
  const nbBefore = cur ? notebookOf(cur.id) : null;
  n.parent = parent;
  const sibs = kids(parent).filter((x) => x.id !== n.id && x.type === n.type);
  let i = sibs.length;
  if (ref) { const j = sibs.findIndex((x) => x.id === ref); if (j >= 0) i = j + (after ? 1 : 0); }
  sibs.splice(i, 0, n);
  sibs.forEach((x, k) => { const o = (k + 1) * 1000; if (x.order !== o || x === n) { x.order = o; touch(x); } });
  if (parent) openSet.add(parent);
  persistOpen(); saveTree(); renderTree(); renderCrumbs();
  if (cur) { const nbAfter = notebookOf(cur.id); if (nbAfter !== nbBefore) loadNotebookSide(nbAfter && nbAfter.id); }
  return true;
}
/* drag pages and folders in the list: onto a folder = into it; onto the top or bottom edge of a row = before or after it */
let treeDragId = null;
function treeDropSpot(row, n, e) {
  const d = tree.nodes[treeDragId]; if (!d || d.id === n.id) return null;
  const r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height;
  if (n.type === 'folder' && (y > 0.25 && y < 0.75 || (!n.parent && d.type === 'note'))) return { into: n.id };
  if (d.type === 'note' && !n.parent) return null;
  return { parent: n.parent || null, ref: n.id, after: y >= 0.5 };
}
function wireTreeDrag(row, n) {
  row.draggable = true;
  row.addEventListener('dragstart', (e) => { treeDragId = n.id; row.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', n.name); e.dataTransfer.effectAllowed = 'move'; } catch {} });
  row.addEventListener('dragend', () => { treeDragId = null; row.classList.remove('dragging'); $$('.t-row.drop-in,.t-row.drop-before,.t-row.drop-after').forEach((x) => x.classList.remove('drop-in', 'drop-before', 'drop-after')); });
  const clear = () => row.classList.remove('drop-in', 'drop-before', 'drop-after');
  row.addEventListener('dragover', (e) => {
    if (!treeDragId) return;
    const s = treeDropSpot(row, n, e); clear(); if (!s) return;
    e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch {}
    row.classList.add(s.into ? 'drop-in' : s.after ? 'drop-after' : 'drop-before');
  });
  row.addEventListener('dragleave', clear);
  row.addEventListener('drop', (e) => {
    const d = tree.nodes[treeDragId], s = d && treeDropSpot(row, n, e); clear();
    if (!s) return;
    e.preventDefault(); treeDragId = null;
    if (s.into) treeMove(d, s.into, null, false); else treeMove(d, s.parent, s.ref, s.after);
  });
}
async function newFolder(pid) {
  const name = await promptModal('New subfolder', 'Name', '', 'Create folder');
  if (name == null) return;
  const f = mkNode('folder', name.trim() || 'Untitled folder', pid);
  openSet.add(pid); openSet.add(f.id); persistOpen(); saveTree(); renderTree();
}

/* ---- new page chooser ---- */
const TEMPLATES = {
  blank: { label: 'Blank', kinds: ['a4', 'endless', 'board'] },
  cornell: { label: 'Cornell notes', kinds: ['a4', 'endless'] },
  vocab: { label: 'Vocabulary list', kinds: ['a4', 'endless'] },
  plan: { label: 'Study plan', kinds: ['a4', 'endless'] },
  mindmap: { label: 'Mind map', kinds: ['board'] },
  brainstorm: { label: 'Brainstorm', kinds: ['board'] },
};
function newPage(pid) {
  return new Promise((resolve) => {
    let kind = prefs.get('newKind', 'endless'), tpl = 'blank';
    const name = h('input', { class: 'field', placeholder: 'Untitled page', 'aria-label': 'Page name', maxlength: 140 });
    const kindsEl = h('div', { class: 'kinds', role: 'group', 'aria-label': 'Page type' });
    const tplsEl = h('div', { class: 'tpls', role: 'group', 'aria-label': 'Template' });
    const preview = (k) => {
      const pv = h('div', { class: 'pv' });
      if (k === 'a4') pv.append(h('div', { style: { position: 'absolute', left: '30%', top: '8px', width: '26%', height: '48px', background: 'var(--sheet)', border: '1px solid var(--line)' } }), h('div', { style: { position: 'absolute', left: '60%', top: '8px', width: '26%', height: '48px', background: 'var(--sheet)', border: '1px solid var(--line)', opacity: '.6' } }));
      else if (k === 'endless') pv.append(h('div', { style: { position: 'absolute', left: '22%', right: '22%', top: '8px', bottom: '-10px', background: 'var(--sheet)', border: '1px solid var(--line)', borderBottom: '0' } }));
      else pv.append(h('div', { style: { position: 'absolute', inset: '0', backgroundImage: 'radial-gradient(var(--muted) 1px, transparent 1.3px)', backgroundSize: '10px 10px', opacity: '.5' } }), h('div', { style: { position: 'absolute', left: '18%', top: '14px', width: '26%', height: '22px', background: 'var(--st-yellow)', borderRadius: '3px' } }), h('div', { style: { position: 'absolute', left: '56%', top: '30px', width: '28%', height: '22px', background: 'var(--sheet)', border: '1px solid var(--line)', borderRadius: '5px' } }));
      return pv;
    };
    const desc = { a4: 'Paper pages like Word. Add more pages when you need them.', endless: 'One page that keeps growing downwards.', board: 'An endless whiteboard in every direction.' };
    const draw = () => {
      kindsEl.textContent = '';
      for (const k of ['a4', 'endless', 'board']) kindsEl.append(h('button', { class: 'kind', 'aria-pressed': String(k === kind), onclick: () => { kind = k; if (!TEMPLATES[tpl].kinds.includes(k)) tpl = 'blank'; draw(); } }, preview(k), h('b', null, KIND_LABEL[k]), h('small', null, desc[k])));
      tplsEl.textContent = '';
      for (const [k, t] of Object.entries(TEMPLATES)) if (t.kinds.includes(kind)) tplsEl.append(h('button', { class: 'chip', 'aria-pressed': String(k === tpl), onclick: () => { tpl = k; draw(); } }, t.label));
    };
    draw();
    let done = false;
    const create = async () => {
      done = true;
      prefs.set('newKind', kind);
      const n = mkNode('note', name.value.trim() || (tpl !== 'blank' ? TEMPLATES[tpl].label : 'Untitled page'), pid);
      n.kind = kind;
      openSet.add(pid); persistOpen(); saveTree();
      pendingTemplate = { id: n.id, kind, tpl };
      await openNote(n.id);
      resolve(n);
    };
    const m = modal({ title: 'New page', wide: true, body: [name, h('h3', { style: { margin: '6px 0 0', font: '700 15px var(--ff-d)' } }, 'Page type'), kindsEl, h('h3', { style: { margin: '0', font: '700 15px var(--ff-d)' } }, 'Start from'), tplsEl],
      actions: [{ label: 'Cancel', fn: () => { done = true; resolve(null); } }, { label: 'Create page', kind: 'primary', fn: create }], onClose: () => { if (!done) resolve(null); } });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); m.close(); create(); } });
  });
}
let pendingTemplate = null;

async function renameNode(n) {
  const name = await promptModal('Rename', 'Name', n.name, 'Rename');
  if (name == null || !name.trim()) return;
  n.name = name.trim(); touch(n); saveTree(); renderTree(); renderCrumbs();
  if (cur && cur.id === n.id) { const ti = $('#titleIn'); if (ti) ti.value = n.name; if (n.shared) saveDoc(); }
}
function moveNode(n) {
  const forbidden = new Set([n.id, ...descendants(n.id).map((d) => d.id)]);
  const sel = h('select', { class: 'field', 'aria-label': 'Destination' });
  if (n.type === 'folder') sel.append(h('option', { value: '' }, 'Top level (make it a notebook)'));
  const walk = (pid, depth) => {
    for (const f of kids(pid).filter((k) => k.type === 'folder')) {
      if (forbidden.has(f.id)) continue;
      sel.append(h('option', { value: f.id }, '\u2003'.repeat(depth) + f.name));
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  if (!sel.options.length) return toast('Make a notebook first.');
  sel.value = n.parent || '';
  modal({
    title: 'Move “' + n.name + '”', body: [h('p', null, 'Where should it go?'), sel],
    actions: [{ label: 'Cancel' }, { label: 'Move', kind: 'primary', fn: () => {
      const before = cur ? notebookOf(cur.id) : null;
      n.parent = sel.value || null; n.order = now(); touch(n);
      if (sel.value) openSet.add(sel.value); persistOpen();
      saveTree(); renderTree(); renderCrumbs();
      if (cur) { const after = notebookOf(cur.id); if (after !== before) loadNotebookSide(after && after.id); }
    } }],
  });
}
async function duplicateNote(n) {
  await Saver.flushAll();
  const d = await loadDocData(n.id);
  const c = mkNode('note', n.name + ' (copy)', n.parent);
  c.kind = d.main.kind;
  try {
    await Store.set('note_' + c.id, { ...d.main, session: SESSION, u: now() });
    await Store.set('ink_' + c.id, { ink: d.ink || {}, u: now() });
  } catch { toast('Couldn’t copy the page.'); return; }
  saveTree(); renderTree(); openNote(c.id);
}
async function deleteNode(n) {
  const many = n.type === 'folder' ? descendants(n.id).length : 0;
  const ok = await confirmModal('Delete “' + n.name + '”?', (n.type === 'folder'
    ? (many ? 'This deletes the ' + (n.parent ? 'folder' : 'notebook') + ' and the ' + many + ' item' + (many === 1 ? '' : 's') + ' inside it.' : 'This deletes the empty ' + (n.parent ? 'folder.' : 'notebook.'))
    : 'This deletes the page.') + ' It stays in Recently deleted for ' + TRASH_DAYS + ' days, so you can bring it back.', 'Delete', true);
  if (!ok) return;
  const all = moveToTrash(n);
  if (linkMode && all.some((x) => x.id === linkMode.sourceId)) endLinkMode();
  saveTree();
  if (cur && all.some((x) => x.id === cur.id)) { await closeNote(); showEmpty(); }
  renderTree(); renderCrumbs();
  toast('“' + n.name + '” is in Recently deleted.', { label: 'Undo', fn: () => restoreTrash(n) });
}

/* sync the tree between devices */
function watchTree() {
  if (Store.mode !== 'db') return;
  try {
    Store.col.doc('tree').onSnapshot((snap) => {
      if (!snap.exists || (snap.metadata && snap.metadata.hasPendingWrites)) return;
      const d = deep(snap.data() || null);
      if (!d || !d.nodes || d.session === SESSION) return;
      let changed = false;
      for (const [id, rn] of Object.entries(d.nodes)) {
        const ln = tree.nodes[id];
        if (!ln || (rn.updated || 0) > (ln.updated || 0)) { tree.nodes[id] = rn; changed = true; }
      }
      if (!changed) return;
      renderTree(); renderCrumbs();
      if (cur && !live(tree.nodes[cur.id])) { closeNote(); showEmpty(); }
      else if (cur) { const ti = $('#titleIn'); if (ti && document.activeElement !== ti) ti.value = tree.nodes[cur.id].name; }
    }, () => {});
  } catch {}
}

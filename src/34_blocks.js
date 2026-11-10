
/* ================= Blocks and Paste =================
   A block is a saved copy of something (note boxes and other objects, a window, a whole page,
   or selected text) kept in the Blocks folder and pasted again anywhere.
   The Paste button in the bottom bar repeats the chosen action: paste a block, or make an
   instant screenshot / video / copy window from a window on the page.
   Storage: 'blocks' = index, 'block_<id>' = the content. */
let blocksIndex = { items: [], folders: [], loaded: false };
let blocksP = null;
/* the sections of the Blocks window (also inside each folder): [key, title, icon] */
const BLOCK_CATS = [['note', 'Notes', 'note'], ['paper', 'Papers', 'a4'], ['tbox', 'Text boxes', 'tbox'], ['text', 'Texts', 'textT'], ['window', 'Windows', 'cube'], ['page', 'Pages', 'page'], ['other', 'Other and mixed', 'blocks']];
const BLOCK_CAT_ICON = Object.fromEntries(BLOCK_CATS.map(([k, , i]) => [k, i]));
const blockCatName = (c) => (BLOCK_CATS.find((x) => x[0] === c) || BLOCK_CATS[BLOCK_CATS.length - 1])[1];
/* blocks saved before sections existed have no cat: work it out from kind, sub and info */
function blockCat(b) {
  if (b.cat && BLOCK_CAT_ICON[b.cat]) return b.cat;
  if (b.kind === 'page') return 'page';
  if (b.kind === 'text') return 'text';
  if (b.sub === 'window') return 'window';
  if (b.sub === 'sheet') return 'paper';
  if (b.info === 'Note box' || b.info === 'Sticky note') return 'note';
  if (b.info === 'Text box') return 'tbox';
  return 'other';
}
const blockIcon = (b) => BLOCK_CAT_ICON[blockCat(b)] || 'blocks';
const blockFolder = (id) => (id ? blocksIndex.folders.find((f) => f.id === id) || null : null);
function loadBlocks() {
  if (blocksIndex.loaded) return Promise.resolve(blocksIndex);
  if (!blocksP) blocksP = Store.get('blocks').catch(() => null).then((d) => {
    blocksIndex = { items: d && Array.isArray(d.items) ? d.items.map(deep) : [], folders: d && Array.isArray(d.folders) ? d.folders.filter((f) => f && f.id && f.name).map(deep) : [], loaded: true };
    blocksP = null; return blocksIndex;
  });
  return blocksP;
}
function saveBlocksIndex() { Saver.schedule('blocks', { items: blocksIndex.items.slice(0, 500), folders: blocksIndex.folders.slice(0, 100) }, (x) => Store.set('blocks', x), 300); }
function addBlockFolder(name) {
  name = String(name || '').trim().slice(0, 60) || 'Folder';
  const same = blocksIndex.folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (same) return same;
  const f = { id: newId('bf'), name, created: now() };
  blocksIndex.folders.push(f); saveBlocksIndex();
  return f;
}
async function saveBlock(meta, data) {
  await loadBlocks();
  const id = newId('bl');
  try { await Store.set('block_' + id, data); } catch { return toast('That’s too big to save as one block. Try a smaller part.'); }
  if (!meta.folder) delete meta.folder;
  blocksIndex.items.unshift({ id, created: now(), ...meta }); saveBlocksIndex();
  const f = blockFolder(meta.folder);
  toast('Saved as a block' + (f ? ' in “' + f.name + '”' : '') + ': “' + meta.name + '” (' + blockCatName(meta.cat) + ').', { label: 'Use it for Paste', fn: () => armPaste({ type: 'block', id, name: meta.name }) });
}
/* the save dialog: a name, a folder (or a new one), and which section it goes into */
function saveBlockModal(title, defName, cat) {
  return loadBlocks().then(() => new Promise((resolve) => {
    let done = false;
    const name = h('input', { class: 'field', value: defName || '', 'aria-label': 'Name', maxlength: 80 });
    const last = prefs.get('blockFolder', '');
    const fsel = h('select', { class: 'field', id: 'blFolder', 'aria-label': 'Folder' },
      h('option', { value: '' }, 'No folder'),
      blocksIndex.folders.map((f) => h('option', { value: f.id, selected: f.id === last ? true : null }, f.name)),
      h('option', { value: '+' }, 'New folder…'));
    const fnew = h('input', { class: 'field', id: 'blNewFolder', placeholder: 'Name of the new folder', 'aria-label': 'Name of the new folder', maxlength: 60, hidden: true });
    fsel.addEventListener('change', () => { fnew.hidden = fsel.value !== '+'; if (!fnew.hidden) fnew.focus(); });
    const finish = () => {
      const n = name.value.trim(); if (!n) { name.focus(); return false; }
      let folder = fsel.value;
      if (folder === '+') { const fn = fnew.value.trim(); if (!fn) { fnew.focus(); return false; } folder = addBlockFolder(fn).id; }
      prefs.set('blockFolder', folder);
      done = true; resolve({ name: n.slice(0, 80), folder: folder || null });
      return true;
    };
    const m = modal({ title, body: [h('label', { class: 'blk-lab' }, 'Name'), name, h('label', { class: 'blk-lab' }, 'Folder'), fsel, fnew,
      h('p', { class: 'hint blk-where' }, svg(BLOCK_CAT_ICON[cat] || 'blocks'), h('span', null, 'It goes into the section “' + blockCatName(cat) + '”.'))],
    actions: [{ label: 'Cancel', fn: () => { done = true; resolve(null); } }, { label: 'Save', kind: 'primary', fn: finish }], onClose: () => { if (!done) resolve(null); } });
    const onEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (finish()) m.close(); } };
    name.addEventListener('keydown', onEnter); fnew.addEventListener('keydown', onEnter);
    setTimeout(() => name.select());
  }));
}

/* ---------- saving ---------- */
function blockCatOf(things, ink, sheet, one) {
  if (sheet) return 'paper';
  if (one) return one.t === 'm3d' || one.t === 'scr' ? 'window' : one.t === 'note' || one.t === 'sticky' ? 'note' : one.t === 'text' ? 'tbox' : 'other';
  if (things.length && !ink.length && things.every((o) => o.t === 'note' || o.t === 'sticky')) return 'note';
  if (things.length && !ink.length && things.every((o) => o.t === 'text')) return 'tbox';
  return 'other';
}
async function saveBlockFromSel() {
  if (!sel.has || !doc) return;
  const ids = [...sel.ids], inkIds = [...sel.ink];
  expandWithSheets(ids, inkIds);
  const data = gatherCopy(ids, inkIds);
  const picked = selObjs().filter((o) => o.t !== 'conn' && o.t !== 'group');
  const things = data.objs.filter((o) => o.t !== 'conn' && o.t !== 'group');
  const sheet = picked.length === 1 && picked[0].t === 'paper' ? picked[0] : null;
  const one = !sheet && things.length === 1 && !data.ink.length ? things[0] : null;
  const sub = sheet ? 'sheet' : one && (one.t === 'm3d' || one.t === 'scr') ? 'window' : 'mixed';
  const cat = blockCatOf(things, data.ink, sheet, one);
  const src = sheet || one;
  const words = src && src.html ? htmlStrToText(src.html).replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  const r = await saveBlockModal('Save as a block', words || (src ? objDisplayName(src) : (things.length + data.ink.length) + ' things'), cat);
  if (!r) return;
  const extra = things.length - 1 + data.ink.length;
  const info = sheet ? (sheet.size || 'A4') + (sheet.land ? ' landscape' : '') + ' sheet' + (extra > 0 ? ', ' + extra + ' thing' + (extra === 1 ? '' : 's') + ' on it' : '')
    : one ? (OBJ[one.t] || {}).label || 'Item'
    : [things.length ? things.length + ' item' + (things.length === 1 ? '' : 's') : null, data.ink.length ? data.ink.length + ' drawing line' + (data.ink.length === 1 ? '' : 's') : null].filter(Boolean).join(', ');
  await saveBlock({ kind: 'objects', sub, cat, name: r.name, folder: r.folder, info }, data);
}
async function saveBlockFromPage(nid) {
  const n = tree.nodes[nid]; if (!n || n.type !== 'note') return;
  let main, ink;
  if (cur && cur.id === nid && doc) { await Saver.flushAll(); main = serializeMain(doc, nid); ink = deep(doc.ink); }
  else { try { const d = await loadDocData(nid); main = serializeMain(d.main, nid); ink = d.ink; } catch { return toast('That page couldn’t be loaded.'); } }
  const r = await saveBlockModal('Save the page as a block', n.name, 'page');
  if (!r) return;
  const count = Object.values(main.objs || {}).filter((o) => o && !o.del && o.t !== 'conn').length;
  await saveBlock({ kind: 'page', cat: 'page', name: r.name, folder: r.folder, info: (KIND_LABEL[n.kind] || 'Page') + (count ? ', ' + count + ' item' + (count === 1 ? '' : 's') : '') }, { kind: n.kind, main, ink });
}
function textSelectionIn(s) {
  const sl = getSelection(); if (!sl || !sl.rangeCount || sl.isCollapsed) return null;
  const r = sl.getRangeAt(0), root = r.commonAncestorContainer, box = root.nodeType === 1 ? root : root.parentElement;
  if (!box || !s.el.contains(box) || !box.closest('.flow,.otext')) return null;
  const d = h('div'); d.append(r.cloneContents());
  const text = sl.toString().trim(); if (!text) return null;
  return { html: sanitize(d.innerHTML), text };
}
async function saveBlockText(ts) {
  const r = await saveBlockModal('Save the text as a block', ts.text.replace(/\s+/g, ' ').slice(0, 40), 'text');
  if (!r) return;
  await saveBlock({ kind: 'text', cat: 'text', name: r.name, folder: r.folder, info: ts.text.replace(/\s+/g, ' ').slice(0, 60) }, { html: ts.html, text: ts.text });
}
function textMenuItems(ts) {
  return [{ label: 'Selected text', header: true },
    { label: 'Copy', icon: 'copy', fn: () => { let ok = false; try { ok = document.execCommand('copy'); } catch {} if (!ok && navigator.clipboard) navigator.clipboard.writeText(ts.text).catch(() => {}); toast('Copied.'); } },
    { label: 'Tag it… (jump between places with the same tag)', icon: 'tag', fn: () => tagSelection() },
    { label: 'Save as a block…', icon: 'blocks', fn: () => saveBlockText(ts) }];
}
function pageMenuItems(s, at) {
  return [{ label: 'This page', header: true },
    { label: 'Paste here', icon: 'paste', sub: () => pasteMenuItems({ surf: s, x: at.x, y: at.y }) },
    { label: 'Save this page as a block…', icon: 'blocks', fn: () => saveBlockFromPage(cur.id) },
    { label: 'Saved blocks…', icon: 'blocks', fn: () => openBlocks() }];
}

/* ---------- pasting ---------- */
let lastEditRange = null;
document.addEventListener('selectionchange', () => {
  const sl = getSelection(); if (!sl || !sl.rangeCount) return;
  const n = sl.anchorNode, e = n && (n.nodeType === 1 ? n : n.parentElement);
  if (e && e.closest && e.closest('.flow[contenteditable="true"],.otext[contenteditable="true"]')) lastEditRange = sl.getRangeAt(0).cloneRange();
});
function insertBlockObjects(data, at) {
  const c = at && at.surf ? at : view.visibleCenter();
  const s = c.surf;
  pushUndo();
  const map = {}, ids = [], inkIds = [];
  const ox = Math.round(c.x - (data.w || 0) / 2), oy = Math.round(c.y - (data.h || 0) / 2);
  for (const o of data.objs || []) if (o.t !== 'conn') map[o.id] = newId('o');
  for (const o of data.objs || []) {
    const n = deep(o);
    if (n.t === 'conn') {
      for (const k of ['a', 'b']) { if (n[k] && n[k].id) n[k] = map[n[k].id] ? { ...n[k], id: map[n[k].id] } : null; else if (n[k]) n[k] = { x: n[k].x + ox, y: n[k].y + oy }; }
      if (!n.a || !n.b) continue;
      n.id = newId('o');
    } else {
      n.id = map[o.id]; n.x += ox; n.y += oy;
      if (n.g) { if (map[n.g]) n.g = map[n.g]; else delete n.g; }
      if (n.camOf && map[n.camOf]) n.camOf = map[n.camOf];
      if (n.notes) n.notes = n.notes.map((x) => ({ ...x, id: newId('wn') }));
      delete n.lock;
    }
    n.sh = s.sheet; delete n.z;
    addObj(n); if (n.t !== 'conn') ids.push(n.id);
  }
  for (const st of data.ink || []) {
    const n = deep(st); if (n.g) { if (map[n.g]) n.g = map[n.g]; else delete n.g; }
    n.id = newId('k'); n.sh = s.sheet; n.p = n.p.map((v, i) => round1(v + (i % 2 ? oy : ox))); n.u = now();
    doc.ink[n.id] = n; inkIds.push(n.id);
  }
  view.renderAll(); selectOnly(s, ids, inkIds); saveDoc('main'); if (inkIds.length) markInk();
}
function pasteTextBlock(data) {
  const r = lastEditRange, host = r && r.startContainer && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
  const ed = host && host.isConnected && host.closest('.flow[contenteditable="true"],.otext[contenteditable="true"]');
  if (ed && view && view.el && view.el.contains(ed)) {
    ed.focus();
    const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
    document.execCommand('insertHTML', false, sanitize(data.html || ''));
    return;
  }
  insertObj({ t: 'text', html: sanitize(data.html || ''), w: 360, h: 60, ah: true });
}
async function pastePageBlock(b, data) {
  const curNode = cur && tree.nodes[cur.id];
  const parent = curNode ? curNode.parent : (kids(null).find((x) => x.type === 'folder') || {}).id;
  if (!parent) return toast('Make a notebook first.');
  const n = mkNode('note', b.name, parent); n.kind = data.kind || 'endless';
  openSet.add(parent); persistOpen(); saveTree();
  const main = normalizeMain(deep(data.main), n.kind);
  try { await Store.set('note_' + n.id, serializeMain(main, n.id)); await Store.set('ink_' + n.id, { ink: deep(data.ink || {}), u: now() }); }
  catch { toast('The page couldn’t be pasted.'); return; }
  renderTree(); await openNote(n.id);
  toast('Pasted the page “' + n.name + '”.');
}
async function pasteBlock(id, at) {
  await loadBlocks();
  const b = blocksIndex.items.find((x) => x.id === id); if (!b) return toast('That block was deleted. Choose another with ▾ next to Paste.');
  if (b.kind !== 'page' && (!cur || !doc || cur.ro)) return toast('Open a page you can edit first.');
  const data = await Store.get('block_' + id).catch(() => null); if (!data) return toast('That block couldn’t be loaded.');
  b.used = now(); saveBlocksIndex();
  if (b.kind === 'page') return pastePageBlock(b, data);
  if (b.kind === 'text') { pasteTextBlock(data); return; }
  insertBlockObjects(data, at);
  toast('Pasted “' + b.name + '”.');
}

/* ---------- windows: instant copies, screenshot and video windows ---------- */
function spawnMediaWindow(id, disp, vmode, label, patch) {
  const o = doc && doc.objs[id]; if (!o || !cur || cur.ro) return null;
  const n = deep(o);
  for (const k of ['id', 'z', 'lock', 'g', 'u', 'newWin', 'spin', 'recId']) delete n[k];
  n.notes = (o.notes || []).map((x) => ({ ...deep(x), id: newId('wn') }));
  if (patch) Object.assign(n, patch);
  if (disp) { n.disp = disp; if (vmode) n.vmode = vmode; }
  n.name = (o.name || 'Window') + ' ' + label;
  const k = o.sc || 1;
  let x = Math.round(o.x + o.w + 60 * k), y = o.y, guard = 0;
  const busy = () => objList((q) => (q.t === 'm3d' || q.t === 'scr') && q.id !== o.id && (q.sh || 0) === (o.sh || 0) && x < q.x + q.w && x + o.w > q.x && y < q.y + q.h && y + o.h > q.y).length;
  while (busy() && guard++ < 30) y = Math.round(y + o.h + 30 * k);
  pushUndo();
  const added = addObj({ ...n, x, y });
  addObj({ t: 'conn', a: { id: o.id }, b: { id: added.id }, cs: 'curve', ar: 'end', dash: true, label, sh: o.sh, sw: round1(2 * k) });
  view.renderAll();
  const s = view.kind === 'a4' ? view.surf(o.sh || 0) : view.surf(0);
  selectOnly(s, [added.id]); saveDoc('main');
  toast('New window: “' + added.name + '”.');
  return added;
}
function showOrSpawn(o, disp, vmode) {
  if (o.newWin && disp !== 'live') return spawnMediaWindow(o.id, disp, vmode, disp === 'img' ? 'screenshot' : vmode === 'gif' ? 'GIF' : 'video');
  setDisp(o, disp, vmode);
}
function gifOrSpawn(o) { if (o.newWin && o.gif) return spawnMediaWindow(o.id, 'video', 'gif', 'GIF'); showGif(o.id); }
function afterShot(id) {
  const o = doc && doc.objs[id]; if (!o) return;
  if (o.newWin) { spawnMediaWindow(id, 'img', null, 'screenshot'); return; }
  toast('Screenshot taken.', { label: 'Show it in the window', fn: () => setDisp(doc.objs[id], 'img') });
}
async function captureWindow(id) {
  const o = doc && doc.objs[id], el = findObjEl(id); if (!o || !el) return null;
  const mode = w3Mode(o);
  if (mode === 'img' && o.shot) return o.shot;
  let c = null;
  if (o.t === 'm3d' && mode === 'live') {
    const v = w3View(id), b = el._w3 && el._w3.body;
    if (v && b) { c = v.capture(clamp(Math.round(b.clientWidth * 2), 200, 2400), clamp(Math.round(b.clientHeight * 2), 150, 1800)); v.draw(); }
  }
  if (!c) {
    const m = [...el.querySelectorAll('.w3-stage video, .w3-stage img')].find((x) => !x.hidden && (x.videoWidth || x.naturalWidth));
    if (!m) { toast('That window has nothing to photograph yet.'); return null; }
    const vw = m.videoWidth || m.naturalWidth, vh = m.videoHeight || m.naturalHeight, k = Math.min(1, 2400 / Math.max(vw, vh));
    c = document.createElement('canvas'); c.width = Math.round(vw * k); c.height = Math.round(vh * k);
    try { c.getContext('2d').drawImage(m, 0, 0, c.width, c.height); } catch { toast('That window can’t be photographed.'); return null; }
  }
  const blob = await new Promise((r) => { try { c.toBlob(r, 'image/png'); } catch { r(null); } });
  if (!blob) { toast('The screenshot didn’t work.'); return null; }
  return (await Files.put(blob)) || c.toDataURL('image/jpeg', 0.85);
}
async function quickWindow(winId, mode) {
  const o = doc && doc.objs[winId]; if (!o || !cur || cur.ro) return;
  if (mode === 'copy') return spawnMediaWindow(winId, null, null, 'copy');
  if (mode === 'video') {
    if (!o.rec && !o.gif) return toast('That window has no recording yet. Right-click it → Recording.');
    return spawnMediaWindow(winId, 'video', o.rec ? 'video' : 'gif', 'video');
  }
  const src = await captureWindow(winId); if (!src) return;
  libAdd(winId, { kind: 'shot', src });
  return spawnMediaWindow(winId, 'img', null, 'screenshot', { shot: src });
}

/* ---------- the Paste button ---------- */
function armPaste(a) { prefs.set('pasteArm', a); if (typeof renderDock === 'function') renderDock(); }
function pasteLabel() { const a = prefs.get('pasteArm', null); return 'Paste' + (a ? ': ' + a.name : '') + ' (Ctrl+Shift+V)'; }
async function pasteArmed(at) {
  if (!cur || !doc || cur.ro) return toast('Open a page you can edit first.');
  const a = prefs.get('pasteArm', null);
  if (!a) { const b = $('#dock .dock-caret'); if (b) openMenu(b, pasteMenuItems(at)); return; }
  if (a.type === 'block') return pasteBlock(a.id, at);
  if (a.type === 'paper') {
    if (!doc.objs[a.id] || doc.objs[a.id].del) return toast('That sheet isn’t on this page. Choose another with ▾ next to Paste.');
    return quickPaper(a.id, a.mode, a.dir);
  }
  if (a.type === 'newpaper') return insertPaper(a.size, a.land);
  if (a.type === 'win') {
    if (!doc.objs[a.win] || doc.objs[a.win].del) return toast('That window isn’t on this page. Choose another with ▾ next to Paste.');
    return quickWindow(a.win, a.mode);
  }
}
function pasteMenuItems(at) {
  const arm = prefs.get('pasteArm', null), items = [];
  const wins = doc ? objList((o) => o.t === 'm3d' || o.t === 'scr') : [];
  if (wins.length) {
    items.push({ label: 'Instant window from a window', header: true });
    for (const w of wins) items.push({ label: objDisplayName(w), icon: w.t === 'm3d' ? 'cube' : 'screen', sub: () => [
      ['shot', 'Screenshot window', 'with its notes'], ['video', 'Video window', 'latest recording'], ['copy', 'Copy of the window', null]].map(([m, l, x]) => ({
        label: l + (x ? ' (' + x + ')' : ''), checked: !!(arm && arm.type === 'win' && arm.win === w.id && arm.mode === m),
        fn: () => { armPaste({ type: 'win', win: w.id, mode: m, name: l + ': ' + objDisplayName(w) }); quickWindow(w.id, m); } })) });
  }
  const sheets = doc ? objList((o) => o.t === 'paper') : [];
  if (sheets.length) {
    items.push({ label: 'Sheets on this page', header: true });
    for (const pp of sheets) items.push({ label: objDisplayName(pp), icon: pp.size === 'A3' ? 'a3' : 'a4', sub: () => [['copy', 'right', 'Copy with everything on it'], ['copy', 'below', 'Copy below, with everything on it'], ['blank', 'right', 'Empty sheet like this one'], ['blank', 'below', 'Empty sheet like this one, below']].map(([m, d, l]) => ({
      label: l, checked: !!(arm && arm.type === 'paper' && arm.id === pp.id && arm.mode === m && (arm.dir || 'right') === d),
      fn: () => { armPaste({ type: 'paper', id: pp.id, mode: m, dir: d, name: l + ': ' + objDisplayName(pp) }); quickPaper(pp.id, m, d); } })) });
  }
  items.push({ label: 'New blank sheet', icon: 'a4', sub: () => [['A4', false, 'A4 portrait (upright)'], ['A4', true, 'A4 landscape (sideways)'], ['A3', false, 'A3 portrait (upright)'], ['A3', true, 'A3 landscape (sideways)']].map(([sz, ld, l]) => ({
    label: l, checked: !!(arm && arm.type === 'newpaper' && arm.size === sz && !!arm.land === ld),
    fn: () => { armPaste({ type: 'newpaper', size: sz, land: ld, name: 'New ' + l + ' sheet' }); insertPaper(sz, ld); } })) });
  const bItem = (b) => ({ label: b.name, icon: blockIcon(b), checked: !!(arm && arm.type === 'block' && arm.id === b.id), fn: () => { armPaste({ type: 'block', id: b.id, name: b.name }); pasteBlock(b.id, at); } });
  const all = blocksIndex.items;
  if (!all.length) items.push({ label: 'Saved blocks', header: true }, { label: 'Nothing saved yet: right-click something → Save as a block', header: true });
  const used = recentUsed(all), added = recentAdded(all).filter((b) => !used.includes(b));
  if (used.length) items.push({ label: 'Recently used blocks', header: true }, ...used.map(bItem));
  if (added.length) items.push({ label: 'Recently added blocks', header: true }, ...added.map(bItem));
  const inside = (fid) => {
    const list = all.filter((b) => (fid ? b.folder === fid : !blockFolder(b.folder))), out = [];
    for (const [c, label] of BLOCK_CATS) { const l = list.filter((b) => blockCat(b) === c); if (l.length) out.push({ label, header: true }, ...l.map(bItem)); }
    return out.length ? out : [{ label: 'Empty', header: true }];
  };
  if (blocksIndex.folders.length) {
    items.push({ label: 'Block folders', header: true });
    for (const f of blocksIndex.folders) items.push({ label: f.name, icon: 'folder', sub: () => inside(f.id) });
    if (all.some((b) => !blockFolder(b.folder))) items.push({ label: 'Not in a folder', icon: 'blocks', sub: () => inside(null) });
  } else if (all.length > used.length + added.length) items.push({ label: 'All blocks by kind', icon: 'blocks', sub: () => inside(null) });
  items.push({ sep: true }, { label: 'All saved blocks…', icon: 'blocks', fn: () => openBlocks() });
  if (arm) items.push({ label: 'Clear the Paste button', icon: 'close', fn: () => armPaste(null) });
  return items;
}
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== 'v' || !cur) return;
  const a = document.activeElement;
  if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
  e.preventDefault(); pasteArmed();
}, true);

/* ---------- the Blocks folder ----------
   Folders you make (blocksIndex.folders), “Recently used” and “Recently added” (4 each),
   and inside every folder one section per kind: Notes, Papers (with new blank sheets),
   Text boxes, Texts, Windows, Pages, Other. */
const blocksView = { folder: 'all', q: '' };
/* these sections always show (with how to fill them), the others only when they have blocks */
const BLOCK_CAT_HOW = { note: 'Right-click a note box or sticky note → “Save as a block”.', paper: 'Right-click a sheet → “Save as a block” to keep it here, with everything on it.', tbox: 'Right-click a text box → “Save as a block”.', text: 'Select text on a page, right-click it → “Save as a block”.' };
const recentUsed = (list) => list.filter((b) => b.used).sort((a, b) => b.used - a.used).slice(0, 4);
const recentAdded = (list) => list.slice().sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 4);
function moveBlock(b, folder) { if (folder) b.folder = folder; else delete b.folder; saveBlocksIndex(); }
function blockMoveItems(b, after) {
  return [{ label: 'Move “' + b.name + '” to', header: true },
    { label: 'No folder', icon: 'blocks', checked: !blockFolder(b.folder), fn: () => { moveBlock(b, null); after(); } },
    ...blocksIndex.folders.map((f) => ({ label: f.name, icon: 'folder', checked: b.folder === f.id, fn: () => { moveBlock(b, f.id); toast('Moved to “' + f.name + '”.'); after(); } })),
    { sep: true },
    { label: 'New folder…', icon: 'plus', fn: async () => { const n = await promptModal('New folder for blocks', 'Name', '', 'Make folder'); if (n && n.trim()) { const f = addBlockFolder(n); moveBlock(b, f.id); toast('Moved to “' + f.name + '”.'); after(); } } }];
}
async function deleteBlockFolder(f) {
  const inside = blocksIndex.items.filter((b) => b.folder === f.id);
  let what = 'keep';
  if (inside.length) {
    what = await choiceModal('Delete the folder “' + f.name + '”?', 'It has ' + inside.length + ' block' + (inside.length === 1 ? '' : 's') + ' in it.', [
      { label: 'Cancel', value: null }, { label: 'Delete the folder, keep the blocks', value: 'keep', kind: 'primary' }, { label: 'Delete the folder and its blocks', value: 'all', kind: 'danger' }]);
    if (!what) return false;
  } else if (!(await confirmModal('Delete the folder “' + f.name + '”?', 'It’s empty.', 'Delete folder', true))) return false;
  const arm = prefs.get('pasteArm', null);
  for (const b of inside) {
    if (what === 'all') { Store.del('block_' + b.id).catch(() => {}); if (arm && arm.type === 'block' && arm.id === b.id) armPaste(null); }
    else delete b.folder;
  }
  if (what === 'all') blocksIndex.items = blocksIndex.items.filter((b) => b.folder !== f.id);
  blocksIndex.folders = blocksIndex.folders.filter((x) => x !== f);
  saveBlocksIndex();
  return true;
}
async function openBlocks(folder) {
  await loadBlocks();
  if (typeof folder === 'string') blocksView.folder = folder;
  const body = h('div', { class: 'blk-win' });
  let m = null;
  const close = () => m && m.close();
  const needPage = () => { if (!cur || !doc || cur.ro) { toast('Open a page you can edit first.'); return true; } return false; };
  const render = () => {
    if (blocksView.folder !== 'all' && blocksView.folder !== 'none' && !blockFolder(blocksView.folder)) blocksView.folder = 'all';
    const sel0 = blocksView.folder, f0 = blockFolder(sel0);
    const count = (id) => blocksIndex.items.filter((b) => (id === 'none' ? !blockFolder(b.folder) : b.folder === id)).length;
    body.textContent = '';
    const chip = (id, label, n, icon) => h('button', { class: 'blk-chip', 'aria-pressed': String(sel0 === id), 'data-folder': id, onclick: () => { blocksView.folder = id; render(); } }, svg(icon), h('span', null, label), h('small', null, String(n)));
    const loose = count('none');
    body.append(h('div', { class: 'blk-folders', role: 'toolbar', 'aria-label': 'Block folders' },
      chip('all', 'All blocks', blocksIndex.items.length, 'blocks'),
      blocksIndex.folders.map((f) => chip(f.id, f.name, count(f.id), 'folder')),
      blocksIndex.folders.length && loose ? chip('none', 'Not in a folder', loose, 'blocks') : null,
      h('button', { class: 'blk-chip add', id: 'blkNewFolder', onclick: async () => { const n = await promptModal('New folder for blocks', 'Name', '', 'Make folder'); if (n && n.trim()) { blocksView.folder = addBlockFolder(n).id; render(); } } }, svg('plus'), h('span', null, 'New folder'))));
    if (f0) body.append(h('div', { class: 'blk-fhead' }, svg('folder'), h('b', null, f0.name),
      h('button', { class: 'btn small', onclick: async () => { const n = await promptModal('Rename folder', 'Name', f0.name, 'Rename'); if (n && n.trim()) { f0.name = n.trim().slice(0, 60); saveBlocksIndex(); render(); } } }, 'Rename folder'),
      h('button', { class: 'btn small', onclick: async () => { if (await deleteBlockFolder(f0)) { blocksView.folder = 'all'; render(); } } }, 'Delete folder')));
    const search = h('input', { class: 'field blk-search', type: 'search', placeholder: 'Search blocks…', 'aria-label': 'Search blocks', value: blocksView.q });
    const lists = h('div', { class: 'blk-lists' });
    search.addEventListener('input', () => { blocksView.q = search.value; fill(); });
    body.append(search, lists);
    const fill = () => {
      lists.textContent = '';
      const arm = prefs.get('pasteArm', null);
      const q = blocksView.q.trim().toLowerCase();
      const scope = blocksIndex.items.filter((b) => (sel0 === 'all' ? true : sel0 === 'none' ? !blockFolder(b.folder) : b.folder === sel0));
      const match = (b) => !q || (b.name + ' ' + (b.info || '') + ' ' + blockCatName(blockCat(b))).toLowerCase().includes(q);
      const paste = (b) => { if (b.kind !== 'page' && needPage()) return; close(); pasteBlock(b.id); };
      const tile = (b) => {
        const f = blockFolder(b.folder);
        const t = h('button', { class: 'blk-tile', 'data-id': b.id, title: 'Paste “' + b.name + '”', onclick: () => paste(b) },
          h('span', { class: 'blk-ticon' }, svg(blockIcon(b))), h('b', null, b.name), h('small', null, blockCatName(blockCat(b)) + (f && sel0 === 'all' ? ' · ' + f.name : '')));
        t.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(t, blockMoveItems(b, render)); });
        return t;
      };
      const row = (b) => {
        const f = blockFolder(b.folder), armed = arm && arm.type === 'block' && arm.id === b.id;
        return h('div', { class: 'mrow', 'data-id': b.id },
          h('div', { class: 'mthumb blk' }, svg(blockIcon(b))),
          h('div', { class: 'minfo' }, h('b', null, b.name + (armed ? '  · on the Paste button' : '')), h('small', null, [b.info, f && sel0 === 'all' ? 'in ' + f.name : null, new Date(b.created).toLocaleDateString()].filter(Boolean).join(' · '))),
          h('div', { class: 'macts' },
            h('button', { class: 'btn small primary', onclick: () => paste(b) }, svg('paste'), b.kind === 'page' ? 'Paste as a new page' : 'Paste'),
            h('button', { class: 'btn small', onclick: () => { armPaste({ type: 'block', id: b.id, name: b.name }); toast('The Paste button now pastes “' + b.name + '”.'); fill(); } }, 'Use for Paste'),
            h('button', { class: 'btn small blk-move', title: 'Move it to another folder', onclick: (e) => openMenu(e.currentTarget, blockMoveItems(b, render)) }, svg('folder'), 'Move'),
            h('button', { class: 'btn small', onclick: async () => { const n = await promptModal('Rename block', 'Name', b.name, 'Rename'); if (n && n.trim()) { b.name = n.trim().slice(0, 80); saveBlocksIndex(); fill(); } } }, 'Rename'),
            h('button', { class: 'btn small', onclick: async () => { if (!(await confirmModal('Delete the block “' + b.name + '”?', 'Things you already pasted stay where they are.', 'Delete', true))) return; blocksIndex.items = blocksIndex.items.filter((x) => x !== b); saveBlocksIndex(); Store.del('block_' + b.id).catch(() => {}); if (armed) armPaste(null); render(); } }, 'Delete')));
      };
      if (!q && scope.length) {
        const used = recentUsed(scope), added = recentAdded(scope);
        const rec = h('div', { class: 'blk-recent' });
        if (used.length) rec.append(h('div', { class: 'blk-rcol', 'data-recent': 'used' }, h('div', { class: 'mgroup' }, svg('clock'), 'Recently used'), h('div', { class: 'blk-tiles' }, used.map(tile))));
        rec.append(h('div', { class: 'blk-rcol', 'data-recent': 'added' }, h('div', { class: 'mgroup' }, svg('star'), 'Recently added'), h('div', { class: 'blk-tiles' }, added.map(tile))));
        lists.append(rec);
      }
      let shown = 0;
      for (const [c, label, icon] of BLOCK_CATS) {
        const list = scope.filter((b) => blockCat(b) === c && match(b));
        shown += list.length;
        const papers = c === 'paper' && !q;
        if (!list.length && (q || !BLOCK_CAT_HOW[c])) continue;
        const sec = h('section', { class: 'blk-cat', 'data-cat': c }, h('div', { class: 'mgroup' }, svg(icon), label + ' (' + list.length + ')'));
        if (papers) sec.append(h('div', { class: 'blk-newpaper' }, h('span', { class: 'hint' }, 'New sheet:'),
          [['A4', false, 'A4 upright'], ['A4', true, 'A4 sideways'], ['A3', false, 'A3 upright'], ['A3', true, 'A3 sideways']].map(([sz, ld, l]) =>
            h('button', { class: 'btn small', onclick: () => { if (needPage()) return; close(); insertPaper(sz, ld); } }, svg(sz === 'A3' ? 'a3' : 'a4'), l)),
          h('button', { class: 'btn small', onclick: (e) => stylePop(e.currentTarget, 'paper', prefs.get('paperStyle', null), (st) => prefs.set('paperStyle', st ? deep(st) : null)) }, svg('palette'), 'Colours for new sheets')));
        if (list.length) sec.append(h('div', { class: 'mlist' }, list.map(row)));
        else sec.append(h('p', { class: 'hint blk-empty' }, BLOCK_CAT_HOW[c]));
        lists.append(sec);
      }
      if (q && !shown) lists.append(h('p', { class: 'hint' }, 'No blocks match “' + blocksView.q.trim() + '”.'));
      if (!scope.length) lists.append(h('p', { class: 'hint' }, sel0 === 'all' ? 'No blocks yet. Right-click a note box, a text box, a sheet, a window, a selection, selected text or an empty spot of a page → “Save as a block”. Pages can also be saved from the … menu in the list on the left.' : 'Nothing in this folder yet. Choose it when you save a block, or use “Move” on a block.'));
    };
    fill();
  };
  m = modal({ title: 'Saved blocks', wide: true, body: [body], actions: [{ label: 'Close' }] });
  render();
}
$('#blocksBtn').append(svg('blocks'), 'Saved blocks');
$('#blocksBtn').addEventListener('click', () => openBlocks());

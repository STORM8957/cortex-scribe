
/* ================= mind maps ================= */
const MM_LAYOUTS = [['right', 'Grow to the right'], ['balanced', 'Both sides'], ['left', 'Grow to the left'], ['down', 'Grow downwards']];
const MM_STYLES = [{ name: 'Classic' }, { name: 'Soft colours' }, { name: 'Outline' }, { name: 'Minimal' }];
let mmSel = null;       // { oid, nid }
let mmEditing = null;   // { oid, nid, el, before }
function mmFind(n, id, parent, idx) {
  if (n.id === id) return { node: n, parent: parent || null, idx: idx || 0 };
  for (let i = 0; i < (n.ch || []).length; i++) { const r = mmFind(n.ch[i], id, n, i); if (r) return r; }
  return null;
}
function mmFromOutline(center, branches) {
  const mk = (t, ch) => ({ id: newId('m'), text: String(t || '').slice(0, 200), ch: ch || [] });
  return mk(center, (branches || []).map((b) => mk(typeof b === 'string' ? b : b.label, (Array.isArray(b.children) ? b.children : []).map((c) => mk(typeof c === 'string' ? c : (c.label || c.text), (c && Array.isArray(c.children) ? c.children : []).map((d) => mk(typeof d === 'string' ? d : (d.label || d.text))))))));
}
function mmToText(n, depth) { depth = depth || 0; let s = '  '.repeat(depth) + '- ' + n.text + '\n'; for (const c of n.ch || []) s += mmToText(c, depth + 1); return s; }
const MM = {
  create(o, s) { const el = h('div'); el._s = s; return el; },
  update(el, o, s) {
    el.textContent = '';
    const tr = o.tree || (o.tree = { id: newId('m'), text: 'Main topic', ch: [] });
    const lay = o.lay || 'right', sty = o.sty || 0;
    const pal = PALETTES.ink;
    const lines = sv('svg', { class: 'mm-lines', style: 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none' });
    el.append(lines);
    const nodes = [];
    const walk = (n, depth, branch, side) => {
      const ne = h('div', { class: 'mm-node' + (depth === 0 ? ' root' : ''), 'data-nid': n.id, role: 'button', tabindex: '-1' });
      ne.textContent = n.text || '';
      const color = depth === 0 ? 'var(--accent)' : pal[branch % pal.length];
      if (sty === 0) { if (depth === 0) Object.assign(ne.style, { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }); else Object.assign(ne.style, { borderColor: color, background: 'var(--sheet)' }); if (depth > 1) ne.style.borderWidth = '1.5px'; }
      else if (sty === 1) { if (depth === 0) Object.assign(ne.style, { background: 'var(--ink)', color: 'var(--sheet)', borderColor: 'var(--ink)' }); else Object.assign(ne.style, { borderColor: 'transparent', background: 'color-mix(in srgb, ' + color + ' ' + (depth === 1 ? 30 : 16) + '%, var(--sheet))' }); }
      else if (sty === 2) { Object.assign(ne.style, { background: 'var(--sheet)', borderColor: 'var(--ink)', borderWidth: depth === 0 ? '3px' : '1.5px' }); }
      else { Object.assign(ne.style, { background: 'transparent', borderColor: 'transparent', borderRadius: '2px', borderBottom: depth === 0 ? '3px solid var(--ink)' : '2px solid ' + color, fontWeight: depth <= 1 ? '700' : '400', color: depth === 1 ? color : '' }); }
      if (mmSel && mmSel.oid === o.id && mmSel.nid === n.id && sel.ids.has(o.id)) ne.classList.add('sel');
      el.append(ne);
      const rec = { n, el: ne, depth, branch, side, color, kids: [] };
      nodes.push(rec);
      if (!n.col) {
        let kids = n.ch || [];
        if (depth === 0) kids.forEach((c, i) => {
          const sd = lay === 'balanced' ? (i < Math.ceil(kids.length / 2) ? 1 : -1) : lay === 'left' ? -1 : 1;
          rec.kids.push(walk(c, 1, i, sd));
        });
        else kids.forEach((c) => rec.kids.push(walk(c, depth + 1, branch, side)));
      }
      return rec;
    };
    const root = walk(tr, 0, 0, 1);
    for (const r of nodes) { r.w = r.el.offsetWidth; r.h = r.el.offsetHeight; }
    const down = lay === 'down';
    const HG = down ? 18 : 56, VG = down ? 46 : 12;
    const span = (r) => { if (!r.kids.length) return down ? r.w : r.h; const t = r.kids.reduce((a, k) => a + span(k), 0) + (down ? HG : VG) * (r.kids.length - 1); return Math.max(down ? r.w : r.h, t); };
    const placeH = (r, xEdge, yTop, dir) => {
      const sp = span(r);
      r.x = dir > 0 ? xEdge : xEdge - r.w; r.y = yTop + sp / 2 - r.h / 2;
      const tot = r.kids.reduce((a, k) => a + span(k), 0) + VG * Math.max(0, r.kids.length - 1);
      let y = yTop + (sp - tot) / 2;
      for (const k of r.kids) { placeH(k, dir > 0 ? r.x + r.w + HG : r.x - HG, y, dir); y += span(k) + VG; }
    };
    const placeD = (r, xLeft, yTop) => {
      const sp = span(r);
      r.x = xLeft + sp / 2 - r.w / 2; r.y = yTop;
      const tot = r.kids.reduce((a, k) => a + span(k), 0) + HG * Math.max(0, r.kids.length - 1);
      let x = xLeft + (sp - tot) / 2;
      for (const k of r.kids) { placeD(k, x, yTop + r.h + VG); x += span(k) + HG; }
    };
    root.x = -root.w / 2; root.y = -root.h / 2;
    if (down) placeD(root, -span(root) / 2, -root.h / 2);
    else {
      const groups = { 1: root.kids.filter((k) => k.side > 0), [-1]: root.kids.filter((k) => k.side < 0) };
      for (const dir of [1, -1]) {
        const g = groups[dir]; if (!g.length) continue;
        const tot = g.reduce((a, k) => a + span(k), 0) + VG * (g.length - 1);
        let y = -tot / 2;
        for (const k of g) { placeH(k, dir > 0 ? root.x + root.w + HG : root.x - HG, y, dir); y += span(k) + VG; }
      }
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of nodes) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    const pad = 14; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    for (const r of nodes) { r.el.style.left = round1(r.x - x0) + 'px'; r.el.style.top = round1(r.y - y0) + 'px'; }
    const lineCol = (r) => sty === 2 ? 'var(--ink)' : sty === 1 && r.depth === 0 ? 'var(--muted)' : r.color;
    for (const r of nodes) for (const k of r.kids) {
      let d;
      if (down) { const ax = r.x + r.w / 2 - x0, ay = r.y + r.h - y0, bx = k.x + k.w / 2 - x0, by = k.y - y0, m = (ay + by) / 2; d = `M${round1(ax)} ${round1(ay)}C${round1(ax)} ${round1(m)} ${round1(bx)} ${round1(m)} ${round1(bx)} ${round1(by)}`; }
      else { const dir = k.side; const ax = (dir > 0 ? r.x + r.w : r.x) - x0, ay = r.y + r.h / 2 - y0, bx = (dir > 0 ? k.x : k.x + k.w) - x0, by = k.y + k.h / 2 - y0, m = (ax + bx) / 2; d = `M${round1(ax)} ${round1(ay)}C${round1(m)} ${round1(ay)} ${round1(m)} ${round1(by)} ${round1(bx)} ${round1(by)}`; }
      lines.append(sv('path', { d, fill: 'none', stroke: lineCol(k), 'stroke-width': r.depth === 0 ? 3 : 2, 'stroke-linecap': 'round' }));
    }
    for (const r of nodes) {
      if (!(r.n.ch || []).length) continue;
      const dir = r.side;
      const t = h('button', { class: 'mm-tog', title: r.n.col ? 'Show ' + r.n.ch.length + ' hidden ideas' : 'Hide ideas', 'aria-label': r.n.col ? 'Expand' : 'Collapse' }, r.n.col ? String(r.n.ch.length) : '−');
      if (down) Object.assign(t.style, { left: round1(r.x + r.w / 2 - x0 - 9) + 'px', top: round1(r.y + r.h - y0 + 2) + 'px' });
      else Object.assign(t.style, { left: round1((dir > 0 ? r.x + r.w + 3 : r.x - 21) - x0) + 'px', top: round1(r.y + r.h / 2 - y0 - 9) + 'px' });
      if (r.depth === 0 && lay === 'balanced') t.hidden = true;
      t.addEventListener('pointerdown', (e) => e.stopPropagation());
      t.addEventListener('click', (e) => { e.stopPropagation(); if (cur.ro) return; pushUndo(); r.n.col = !r.n.col; changed(o); view.renderAll(); saveDoc('main'); });
      el.append(t);
    }
    if (mmSel && mmSel.oid === o.id && sel.ids.has(o.id) && !cur.ro) {
      const r = nodes.find((x) => x.n.id === mmSel.nid);
      if (r) {
        const a = h('button', { class: 'mm-add', title: 'Add an idea (Tab)', 'aria-label': 'Add an idea' }, svg('plus'));
        if (down) Object.assign(a.style, { left: round1(r.x + r.w / 2 - x0 - 11) + 'px', top: round1(r.y + r.h - y0 + 22) + 'px' });
        else { const dir = r.depth === 0 ? (lay === 'left' ? -1 : 1) : r.side; Object.assign(a.style, { left: round1((dir > 0 ? r.x + r.w + 26 : r.x - 48) - x0) + 'px', top: round1(r.y + r.h / 2 - y0 - 11) + 'px' }); }
        a.addEventListener('pointerdown', (e) => e.stopPropagation());
        a.addEventListener('click', (e) => { e.stopPropagation(); MM.addChild(el._s, o, r.n.id); });
        el.append(a);
      }
    }
    const W = Math.round(x1 - x0), H = Math.round(y1 - y0);
    el.style.width = W + 'px'; el.style.height = H + 'px';
    const sc = o.sc || 1;
    const rox = Math.round((-x0 + root.x) * sc), roy = Math.round((-y0 + root.y) * sc);
    if (o.rox != null && (o.rox !== rox || o.roy !== roy)) { o.x = Math.round(o.x + o.rox - rox); o.y = Math.round(o.y + o.roy - roy); }
    o.rox = rox; o.roy = roy; o.w = W * sc; o.h = H * sc;
  },
  down(s, e, o, oel) {
    const ne = e.target.closest('.mm-node'); if (!ne) return false;
    if (ne.isContentEditable) return true;
    e.preventDefault(); blurEditable();
    const nid = ne.dataset.nid;
    const wasSel = sel.surf === s && sel.ids.has(o.id);
    const same = wasSel && mmSel && mmSel.oid === o.id && mmSel.nid === nid;
    if (!wasSel) selectOnly(s, [o.id]);
    mmSel = { oid: o.id, nid };
    s.renderObj(o, true); renderSel(s);
    if (cur.ro) return true;
    moveDrag(s, e, o, false, () => { if (same) MM.edit(s, o, nid); });
    return true;
  },
  dbl(s, e, o) { const ne = e.target.closest('.mm-node'); if (!ne) return; mmSel = { oid: o.id, nid: ne.dataset.nid }; MM.edit(s, o, ne.dataset.nid); },
  edit(s, o, nid) {
    if (cur.ro) return;
    const el = s.objEls.get(o.id); if (!el) return;
    const ne = el.querySelector('.mm-node[data-nid="' + cssq(nid) + '"]'); if (!ne) return;
    const f = mmFind(o.tree, nid); if (!f) return;
    pushUndo();
    try { ne.contentEditable = 'plaintext-only'; } catch {} if (ne.contentEditable !== 'plaintext-only') ne.contentEditable = 'true';
    ne.classList.add('editing');
    mmEditing = { oid: o.id, nid, el: ne, s, before: f.node.text };
    const r = document.createRange(); r.selectNodeContents(ne); const sl = getSelection(); sl.removeAllRanges(); ne.focus(); sl.addRange(r);
    activeEd = ne;
    ne.addEventListener('blur', () => MM.commit(), { once: true });
    ne.addEventListener('input', () => { const o2 = doc.objs[o.id]; if (!o2) return; const ff = mmFind(o2.tree, nid); if (ff) { ff.node.text = ne.innerText.replace(/\n+$/, ''); } lastLocalEdit = now(); });
  },
  keyInEdit(e) {
    if (!mmEditing || document.activeElement !== mmEditing.el) return;
    const { s, oid, nid } = mmEditing;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mmEditing.el.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); const o = doc.objs[oid]; const f = o && mmFind(o.tree, nid); if (f) f.node.text = mmEditing.before; mmEditing.el.textContent = mmEditing.before; mmEditing.el.blur(); }
    else if (e.key === 'Tab') { e.preventDefault(); mmEditing.el.blur(); const o = doc.objs[oid]; if (o) MM.addChild(s, o, nid); }
  },
  commit() {
    const m = mmEditing; if (!m) return; mmEditing = null;
    const o = doc && doc.objs[m.oid]; if (!o) return;
    const f = mmFind(o.tree, m.nid);
    if (f) { const t = m.el.innerText.replace(/\s+$/, '').trim(); f.node.text = t || 'Idea'; }
    changed(o); m.s.renderObj(o, true); renderConns(m.s); renderSel(m.s); saveDoc('main');
  },
  addChild(s, o, nid) {
    pushUndo();
    const f = mmFind(o.tree, nid) || { node: o.tree };
    f.node.col = false;
    const n = { id: newId('m'), text: '', ch: [] };
    (f.node.ch = f.node.ch || []).push(n);
    changed(o); mmSel = { oid: o.id, nid: n.id };
    s.renderObj(o, true); renderConns(s); renderSel(s); saveDoc('main');
    MM.edit(s, o, n.id);
  },
  addSibling(s, o, nid) {
    const f = mmFind(o.tree, nid);
    if (!f || !f.parent) return MM.addChild(s, o, o.tree.id);
    pushUndo();
    const n = { id: newId('m'), text: '', ch: [] };
    f.parent.ch.splice(f.idx + 1, 0, n);
    changed(o); mmSel = { oid: o.id, nid: n.id };
    s.renderObj(o, true); renderConns(s); renderSel(s); saveDoc('main');
    MM.edit(s, o, n.id);
  },
  remove(s, o, nid) {
    const f = mmFind(o.tree, nid); if (!f || !f.parent) return;
    pushUndo();
    f.parent.ch.splice(f.idx, 1);
    changed(o); mmSel = { oid: o.id, nid: f.parent.id };
    s.renderObj(o, true); renderConns(s); renderSel(s); saveDoc('main');
  },
  addChildOfSelected(s, o) { const nid = mmSel && mmSel.oid === o.id ? mmSel.nid : o.tree.id; MM.addChild(s, o, nid); },
  key(e) {
    if (!mmSel || !sel.surf || cur.ro) return false;
    const o = doc.objs[mmSel.oid]; if (!o || o.del || !sel.ids.has(o.id)) { mmSel = null; return false; }
    const s = sel.surf, nid = mmSel.nid, f = mmFind(o.tree, nid); if (!f) return false;
    const go = (id) => { mmSel = { oid: o.id, nid: id }; s.renderObj(o, true); };
    switch (e.key) {
      case 'Tab': e.preventDefault(); MM.addChild(s, o, nid); return true;
      case 'Enter': e.preventDefault(); MM.addSibling(s, o, nid); return true;
      case 'F2': case ' ': e.preventDefault(); MM.edit(s, o, nid); return true;
      case 'Delete': case 'Backspace': if (!f.parent) return false; e.preventDefault(); MM.remove(s, o, nid); return true;
      case 'ArrowRight': case 'ArrowLeft': {
        e.preventDefault();
        const toChild = (e.key === 'ArrowRight') !== (o.lay === 'left');
        if (toChild && f.node.ch && f.node.ch.length && !f.node.col) go(f.node.ch[0].id); else if (!toChild && f.parent) go(f.parent.id);
        return true;
      }
      case 'ArrowUp': case 'ArrowDown': {
        e.preventDefault();
        if (o.lay === 'down') { if (e.key === 'ArrowDown' && f.node.ch && f.node.ch.length) go(f.node.ch[0].id); else if (e.key === 'ArrowUp' && f.parent) go(f.parent.id); return true; }
        if (f.parent) { const i = f.idx + (e.key === 'ArrowDown' ? 1 : -1); if (f.parent.ch[i]) go(f.parent.ch[i].id); }
        return true;
      }
      case 'Escape': mmSel = null; s.renderObj(o, true); return false;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); MM.edit(s, o, nid); const ne = mmEditing && mmEditing.el; if (ne) { ne.textContent = ''; document.execCommand('insertText', false, e.key); } return true; }
    return false;
  },
};
function insertMindMap(treeData, opts) {
  const o = insertObj({ t: 'mm', tree: treeData || { id: newId('m'), text: 'Main topic', ch: [{ id: newId('m'), text: 'Idea', ch: [] }] }, lay: (opts && opts.lay) || prefs.get('mmLay', view && view.kind === 'board' ? 'balanced' : 'right'), sty: (opts && opts.sty) || 0, w: 300, h: 160 }, { at: opts && opts.at });
  if (o) { mmSel = { oid: o.id, nid: o.tree.id }; view.renderAll(); }
  return o;
}

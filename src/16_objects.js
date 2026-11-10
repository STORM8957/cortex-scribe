
/* ================= objects on pages and boards ================= */
const STICKY = { yellow: 'var(--st-yellow)', pink: 'var(--st-pink)', blue: 'var(--st-blue)', green: 'var(--st-green)', orange: 'var(--st-orange)', purple: 'var(--st-purple)' };
const SHAPES = { rect: 'Rectangle', round: 'Rounded box', ellipse: 'Circle / ellipse', tri: 'Triangle', diamond: 'Diamond', hex: 'Hexagon', star: 'Star', arrow: 'Arrow', speech: 'Speech bubble' };
const resolveSrc = (s) => s || '';
function shapePath(kind, w, hh) {
  const W = w, H = hh;
  switch (kind) {
    case 'round': { const r = Math.min(W, H) * 0.18; return `M${r} 0H${W - r}Q${W} 0 ${W} ${r}V${H - r}Q${W} ${H} ${W - r} ${H}H${r}Q0 ${H} 0 ${H - r}V${r}Q0 0 ${r} 0Z`; }
    case 'ellipse': return `M${W / 2} 0A${W / 2} ${H / 2} 0 1 1 ${W / 2 - 0.01} 0Z`;
    case 'tri': return `M${W / 2} 0L${W} ${H}L0 ${H}Z`;
    case 'diamond': return `M${W / 2} 0L${W} ${H / 2}L${W / 2} ${H}L0 ${H / 2}Z`;
    case 'hex': return `M${W * 0.25} 0H${W * 0.75}L${W} ${H / 2}L${W * 0.75} ${H}H${W * 0.25}L0 ${H / 2}Z`;
    case 'star': { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1; d += (i ? 'L' : 'M') + round1(W / 2 + Math.cos(a) * W / 2 * r) + ' ' + round1(H / 2 + Math.sin(a) * H / 2 * r * 1.05 + H * 0.03); } return d + 'Z'; }
    case 'arrow': return `M0 ${H * 0.28}H${W * 0.62}V0L${W} ${H / 2}L${W * 0.62} ${H}V${H * 0.72}H0Z`;
    case 'speech': return `M${W * 0.1} 0H${W * 0.9}Q${W} 0 ${W} ${H * 0.12}V${H * 0.66}Q${W} ${H * 0.78} ${W * 0.9} ${H * 0.78}H${W * 0.36}L${W * 0.16} ${H}L${W * 0.2} ${H * 0.78}H${W * 0.1}Q0 ${H * 0.78} 0 ${H * 0.66}V${H * 0.12}Q0 0 ${W * 0.1} 0Z`;
    default: return `M0 0H${W}V${H}H0Z`;
  }
}
function textBox(ph) {
  const tx = h('div', { class: 'otext rt', 'data-ph': ph || 'Type here…', spellcheck: 'true' });
  tx.addEventListener('input', () => onObjText(tx));
  tx.addEventListener('focusout', () => setTimeout(() => { if (editing && editing.tx === tx && document.activeElement !== tx) exitEdit(); }, 0));
  tx.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tx.blur(); } });
  tx.addEventListener('click', (e) => { const a = e.target.closest('a.xlink'); if (a && !a.classList.contains('pending') && !tx.isContentEditable) { e.preventDefault(); followLink(a); } });
  return tx;
}
const OBJ = {
  image: {
    label: 'Picture', handles: 'all', aspect: true, conn: true, min: 16,
    create: () => h('div', null, h('img', { alt: '', draggable: 'false' })),
    update(el, o) {
      const img = el.firstChild, src = resolveSrc(o.src);
      if (img.getAttribute('src') !== src) img.src = src;
      img.alt = o.alt || 'Picture';
      el.style.opacity = o.op != null ? String(o.op) : '';
      el.style.borderRadius = (o.rad != null ? o.rad : 6) + 'px';
      el.style.boxShadow = o.bd ? '0 0 0 ' + (o.bdw || 2) + 'px ' + o.bd : '';
    },
  },
  note: {
    label: 'Note box', handles: 'all', text: true, conn: true, min: 80,
    create: () => h('div', null, textBox('Type here…')),
    update(el, o) {
      el.firstChild.innerHTML = sanitize(o.html || '');
      el.style.background = o.bg || ''; el.style.color = o.tc || ''; el.style.borderColor = o.bc || '';
      el.classList.toggle('nobd', !!o.nobd); el.classList.toggle('nosh', !!o.nosh); el.classList.toggle('clear', o.bg === 'transparent');
    },
  },
  text: {
    label: 'Text box', handles: 'all', text: true, conn: true, min: 40,
    create: () => h('div', null, textBox('Text')),
    update(el, o) {
      el.firstChild.innerHTML = sanitize(o.html || ''); el.style.color = o.tc || '';
      el.style.background = o.bg ? seeThrough(o.bg, o.fo != null ? o.fo : 0.5) : '';
      el.style.boxShadow = o.bc ? 'inset 0 0 0 ' + (o.bw || 1.5) + 'px ' + o.bc : '';
      el.style.borderRadius = o.rad != null ? o.rad + 'px' : '';
      el.classList.toggle('boxed', !!(o.bg || o.bc));
    },
  },
  sticky: {
    label: 'Sticky note', handles: 'all', text: true, conn: true, min: 60,
    create: () => h('div', null, textBox('Write something…')),
    update(el, o) { el.firstChild.innerHTML = sanitize(o.html || ''); el.style.background = STICKY[o.col] || o.col || STICKY.yellow; el.style.fontSize = (o.fs || 22) + 'px'; },
  },
  shape: {
    label: 'Shape', handles: 'all', text: true, conn: true, min: 20, live: true,
    create() { const s = sv('svg', { class: 'shp', 'aria-hidden': 'true' }); s.append(sv('path')); return h('div', null, s, textBox('')); },
    update(el, o) {
      const s = el.firstChild, p = s.firstChild, sw = o.sw != null ? o.sw : 2, sc = o.sc || 1, OW = o.w / sc, OH = (o.h || 100) / sc;
      const w = Math.max(1, OW - sw), hh = Math.max(1, OH - sw);
      s.setAttribute('viewBox', (-sw / 2) + ' ' + (-sw / 2) + ' ' + OW + ' ' + OH);
      p.setAttribute('d', shapePath(o.k, w, hh));
      p.setAttribute('fill', o.fill === null ? 'none' : (o.fill || 'var(--accent-soft)'));
      p.setAttribute('stroke', o.stroke || 'var(--accent)'); p.setAttribute('stroke-width', String(sw));
      p.setAttribute('stroke-linejoin', 'round');
      el.lastChild.innerHTML = sanitize(o.html || '');
      el.style.color = o.tc || '';
    },
  },
  chart: {
    label: 'Chart', handles: 'all', conn: true, min: 120, live: true,
    create: () => h('div'),
    update(el, o) { el.innerHTML = chartSVG(o.sc && o.sc !== 1 ? { ...o, w: o.w / o.sc, h: o.h / o.sc } : o); el.classList.toggle('bgsheet', (o.chart || {}).bg === 'sheet'); },
  },
  mm: {
    label: 'Mind map', handles: 'none', conn: true, min: 40,
    create: (o, s) => MM.create(o, s),
    update: (el, o, s) => MM.update(el, o, s),
  },
  frame: {
    label: 'Frame', handles: 'all', conn: false, min: 80, live: true,
    create() { const b = h('button', { class: 'ftitle' }); b.addEventListener('click', (e) => { e.stopPropagation(); const o = doc.objs[b.parentNode.dataset.id]; if (o && !cur.ro) renameFrame(o); }); return h('div', null, b); },
    update(el, o) { el.firstChild.textContent = o.title || 'Frame'; el.style.borderColor = o.c || ''; el.style.background = o.fill || ''; },
  },
  m3d: {
    label: '3D window', handles: 'all', norot: true, conn: true, min: 180,
    create: (o, s) => make3DWindow(o, s),
    update: (el, o) => update3DWindow(el, o),
  },
  group: {
    label: 'Group', handles: 'none', conn: false, min: 10,
    create: () => h('div', null, h('span', { class: 'glabel', title: 'Click to select the group' })),
    update(el, o) { el.classList.toggle('circle', o.sty === 'circle'); el.classList.toggle('ghost', o.sty === 'none'); el.firstChild.textContent = (o.name || 'Group') + (o.lock ? ' (locked)' : ''); },
  },
  card: {
    label: 'Page link', handles: 'w', conn: true, min: 140,
    create: () => h('div', null),
    update(el, o) {
      const n = tree.nodes[o.target];
      el.textContent = '';
      el.append(svg(n && n.kind === 'board' ? 'board' : 'page'), h('div', null, h('b', null, n && live(n) ? n.name : 'Missing page'), h('small', null, n && live(n) ? 'Double-click to open' : 'This page was deleted')));
    },
  },
};

/* ---------- selection ---------- */
let editing = null;     // { s, id, el, tx }
function selectOnly(s, ids, inkIds) {
  if (editing && !ids.includes(editing.id)) exitEdit();
  const prev = sel.surf;
  sel.surf = s; sel.ids = new Set(ids); sel.ink = new Set(inkIds || []);
  if (prev && prev !== s) renderSel(prev);
  renderSel(s); updateObjbar(true); refreshFormatSoon();
}
function toggleSel(s, id) {
  if (sel.surf !== s) return selectOnly(s, [id]);
  if (sel.ids.has(id)) sel.ids.delete(id); else sel.ids.add(id);
  renderSel(s); updateObjbar(true); refreshFormatSoon();
}
/* Ctrl + right-click: add the object to the selection (or take it out), to change several windows at once */
function ctrlPick(s, id) {
  const [ids, ink] = expandGroups([id], []);
  if (sel.surf !== s || !sel.has) selectOnly(s, ids, ink);
  else { const all = ids.every((i) => sel.ids.has(i)); for (const i of ids) { if (all) sel.ids.delete(i); else sel.ids.add(i); } renderSel(s); updateObjbar(true); refreshFormatSoon(); }
  const n = selObjs().filter((o) => o.t === 'm3d' || o.t === 'scr').length;
  toast(n >= 2 ? n + ' windows chosen. Right-click one of them: what you choose changes all of them.' : 'Chosen. Ctrl + right-click more windows to change them together.');
}
function clearSel() {
  if (editing) exitEdit();
  const s = sel.surf;
  sel.surf = null; sel.ids = new Set(); sel.ink = new Set(); mmSel = null;
  if (s) renderSel(s);
  updateObjbar(true); refreshFormatSoon();
}
function selObjs() { return [...sel.ids].map((id) => doc && doc.objs[id]).filter((o) => o && !o.del); }
function selBox() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of selObjs()) {
    if (o.t === 'conn') { const e = connEnds(o); if (!e) continue; for (const p of [e.a, e.b]) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } continue; }
    x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + (o.w || 0)); y1 = Math.max(y1, o.y + (o.h || 0));
  }
  for (const id of sel.ink) { const s = doc.ink[id]; if (!s || s.del) continue; const b = strokeBox(s); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const DIRS = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
const CURS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
function renderSel(s) {
  if (!s) return;
  for (const [oid, el] of s.objEls) el.classList.toggle('is-sel', sel.surf === s && sel.ids.has(oid));   // touch: a chosen object moves instead of scrolling the page
  const L = s.L.sel; L.textContent = '';
  if (!s.board) L.style.setProperty('--z', '1');
  if (sel.surf !== s || !sel.has || !doc) return;
  const objs = selObjs();
  const single = objs.length === 1 && !sel.ink.size ? objs[0] : null;
  if (single && single.t === 'conn') {
    const e = connEnds(single); if (!e) return;
    for (const [k, p] of [['a', e.a], ['b', e.b]]) L.append(h('div', { class: 'hnd ep', 'data-h': 'ep-' + k, style: { left: p.x + 'px', top: p.y + 'px', transform: 'translate(-50%,-50%)', width: 'calc(14px / var(--z,1))', height: 'calc(14px / var(--z,1))', cursor: 'move' }, title: 'Drag to reconnect' }));
    return;
  }
  if (single) {
    const o = single, T = OBJ[o.t] || {};
    const box = h('div', { class: 'selbox', style: { left: o.x + 'px', top: o.y + 'px', width: (o.w || 0) + 'px', height: (o.h || 0) + 'px', transform: o.r ? 'rotate(' + o.r + 'deg)' : '', borderWidth: 'calc(1.5px / var(--z,1))' } });
    if (!cur.ro && !o.lock && !(editing && editing.id === o.id && o.t !== 'shape')) {
      const hs = 'calc(12px / var(--z,1))';
      const dirs = T.handles === 'all' ? Object.keys(DIRS) : T.handles === 'w' ? ['e', 'w'] : [];
      for (const d of dirs) {
        const [hx, hy] = DIRS[d];
        box.append(h('div', { class: 'hnd', 'data-h': 'r-' + d, style: { left: ((hx + 1) * 50) + '%', top: ((hy + 1) * 50) + '%', width: hs, height: hs, transform: 'translate(-50%,-50%)', cursor: CURS[d] } }));
      }
      if (T.handles !== 'none' && o.t !== 'frame' && !T.norot) box.append(h('div', { class: 'hnd rot', 'data-h': 'rot', title: 'Rotate (Shift snaps)', style: { left: 'calc(100% + 24px / var(--z,1))', top: 'calc(-24px / var(--z,1))', width: 'calc(15px / var(--z,1))', height: 'calc(15px / var(--z,1))', transform: 'translate(-50%,-50%)' } }));
      // (not while an idea of a mind map is chosen: its + button sits where the dots would, and must stay clickable)
      if (T.conn && !(o.t === 'mm' && mmSel && mmSel.oid === o.id)) {
        const off = 'calc(-20px / var(--z,1))', cs = 'calc(14px / var(--z,1))';
        const pos = { t: { left: '50%', top: off }, b: { left: '50%', top: 'calc(100% + 20px / var(--z,1))' }, l: { left: off, top: '50%' }, r: { left: 'calc(100% + 20px / var(--z,1))', top: '50%' } };
        for (const [side, p] of Object.entries(pos)) box.append(h('div', { class: 'hnd c', 'data-h': 'c-' + side, title: 'Drag to connect, click to add a connected box', style: { ...p, width: cs, height: cs, transform: 'translate(-50%,-50%)' } }));
      }
    }
    if (o.lock) box.append(h('div', { class: 'lockbadge', title: 'Locked' }, svg('lock')));
    L.append(box);
    return;
  }
  const b = selBox(); if (!b) return;
  const mb = h('div', { class: 'selbox multi', style: { left: (b.x - 4) + 'px', top: (b.y - 4) + 'px', width: (b.w + 8) + 'px', height: (b.h + 8) + 'px', borderWidth: 'calc(1.5px / var(--z,1))' } });
  if (objs.some((x) => x.lock)) mb.append(h('div', { class: 'lockbadge', title: 'Locked' }, svg('lock')));
  L.append(mb);
}

/* ---------- pointer handling on a page or the board ---------- */
function wireSurface(s) {
  s.el.addEventListener('pointerdown', (e) => onSurfaceDown(s, e));
  s.el.addEventListener('dblclick', (e) => onSurfaceDbl(s, e));
  s.L.cap.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.button === 2) { rightPress(s, e); return; } inkDown(s, e); });
  s.el.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  s.el.addEventListener('drop', async (e) => {
    const files = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length || !cur || cur.loading || cur.ro) return;
    e.preventDefault();
    const p = s.toLocal(e.clientX, e.clientY);
    await addImages(files, { surf: s, x: p.x, y: p.y });
  });
  s.el.addEventListener('pointermove', (e) => presenceMove(s, e), { passive: true });
}
function topObjAt(s, p, exceptId) {
  let best = null;
  for (const o of objList((o) => o.t !== 'conn' && o.t !== 'group' && s.match(o) && o.id !== exceptId)) {
    if (p.x >= o.x && p.x <= o.x + (o.w || 0) && p.y >= o.y && p.y <= o.y + (o.h || 0)) {
      const rank = (o.t === 'frame' ? -1e6 : 0) + (o.z || 0);
      if (!best || rank > best.rank) best = { o, rank };
    }
  }
  return best && best.o;
}
function onSurfaceDown(s, e) {
  if (!cur || cur.loading || !doc) return;
  if (e.target.closest('.inkcap,.zoombox,.zoomscale,.page-tools,.title-input,.mm-add,.mm-tog,.ftitle')) return;
  if (e.button === 2) {
    if (editing && editing.el.contains(e.target)) { const ts = textSelectionIn(s); if (ts && !cur.ro) { ctxSuppress = true; const x = e.clientX, y = e.clientY; setTimeout(() => openMenu(pointAnchor(x, y), textMenuItems(ts)), 0); } return; }
    rightPress(s, e); return;
  }
  ctxSuppress = false;
  const v = s.view;
  if (s.board && (e.button === 1 || spaceDown || tool === 'hand')) { e.preventDefault(); startPan(e, v); return; }
  if (e.button !== 0) return;
  const hnd = e.target.closest('.hnd');
  if (hnd) { e.preventDefault(); e.stopPropagation(); handleDrag(s, e, hnd.dataset.h); return; }
  if ((tool === 'lasso' || tool === 'select' || s.board) && selFrameDown(s, e)) return;
  if (tool === 'lasso') { e.preventDefault(); blurEditable(); lassoDrag(s, e); return; }
  if (tool === 'tbox') { if (cur.ro) return; e.preventDefault(); blurEditable(); marquee(s, e, 'tbox'); return; }
  if (tool === 'magic' || tool === 'area') { e.preventDefault(); marquee(s, e, tool); return; }
  if (tool === 'connector') { if (cur.ro) return; e.preventDefault(); connectorDrag(s, e, null, null); return; }
  const hit = e.target.closest('.hit');
  if (hit && !linkMode) { e.preventDefault(); blurEditable(); selectOnly(s, [hit.dataset.id]); return; }
  const oel = e.target.closest('.obj');
  if (oel && s.el.contains(oel)) {
    const o = doc.objs[oel.dataset.id]; if (!o) return;
    if (linkMode) { e.preventDefault(); completeLink(o.id); return; }
    if (oel.classList.contains('editing')) return;
    if (o.t === 'mm' && MM.down(s, e, o, oel)) return;
    e.preventDefault();
    blurEditable();
    if (cur.ro) { selectOnly(s, [o.id]); return; }
    const wasSel = sel.surf === s && sel.ids.has(o.id);
    if (e.shiftKey) { toggleSel(s, o.id); return; }
    if (!wasSel) { if (e.altKey) selectOnly(s, [o.id]); else { const [ids, ink] = expandGroups([o.id], []); selectOnly(s, ids, ink); } }
    moveDrag(s, e, o, wasSel);
    return;
  }
  if (s.board) {
    if (e.pointerType === 'touch') { clearSel(); startPan(e, v); return; }
    e.preventDefault(); blurEditable();
    marquee(s, e, 'select'); return;
  }
  if (tool === 'select') { e.preventDefault(); blurEditable(); marquee(s, e, 'select'); return; }
  if (sel.has) clearSel();
}
function blurEditable() { const a = document.activeElement; if (a && isTyping(a) && work.contains(a)) a.blur(); }
function onSurfaceDbl(s, e) {
  if (!cur || cur.loading || cur.ro || !doc) return;
  const oel = e.target.closest('.obj');
  if (oel && s.el.contains(oel)) {
    const o = doc.objs[oel.dataset.id]; if (!o) return;
    if (o.t === 'card') return openNote(o.target);
    if (o.t === 'm3d') { expandWin(o.id); return; }
    if (o.t === 'scr') { expandScr(o.id); return; }
    if (o.t === 'chart') { selectOnly(s, [o.id]); return openPanel('format'); }
    if (o.t === 'mm') return MM.dbl(s, e, o, oel);
    if (OBJ[o.t].text) { selectOnly(s, [o.id]); enterEdit(s, o); }
    return;
  }
  if (s.board && (tool === 'select' || tool === 'text') && !e.target.closest('.hnd,.zoombox')) {
    const p = s.toLocal(e.clientX, e.clientY);
    pushUndo();
    const f = newScale();
    const o = addObj({ t: 'note', x: Math.round(p.x - 140 * f), y: Math.round(p.y - 22 * f), w: Math.round(280 * f), ah: true, h: Math.round(60 * f), html: '', sc: f !== 1 ? f : undefined, ...newStyleFields('note') });
    s.renderAll(); selectOnly(s, [o.id]); enterEdit(s, o); saveDoc('main');
  }
}
function moveDrag(s, e, o, wasSel, onClick) {
  const start = s.toLocal(e.clientX, e.clientY);
  let moved = false;
  const ids = [...sel.ids], inkIds = [...sel.ink];
  for (const id of [...ids]) { const pp = doc.objs[id]; if (pp && pp.t === 'paper') paperContents(pp, ids, inkIds); }
  const orig = ids.map((id) => { const x = doc.objs[id]; return { id, x: x.x, y: x.y, a: x.a && x.a.x != null ? { ...x.a } : null, b: x.b && x.b.x != null ? { ...x.b } : null }; });
  const origInk = inkIds.map((id) => ({ id, p: doc.ink[id].p.slice() }));
  const k = s.k();
  const locked = selObjs().some((x) => x.lock); let lockWarned = false;
  gesture.start(e, (ev) => {
    const p = s.toLocal(ev.clientX, ev.clientY), dx = p.x - start.x, dy = p.y - start.y;
    if (!moved) { if (Math.hypot(dx, dy) * k < 4) return; if (locked) { if (!lockWarned) { lockWarned = true; toast('Locked. Unlock it to move it (right-click → Unlock).'); } return; } moved = true; pushUndo(); $('#objbar').hidden = true; }
    for (const m of orig) {
      const x = doc.objs[m.id]; if (!x) continue;
      if (x.t === 'conn') { if (m.a) x.a = { x: m.a.x + dx, y: m.a.y + dy }; if (m.b) x.b = { x: m.b.x + dx, y: m.b.y + dy }; continue; }
      x.x = Math.round(m.x + dx); x.y = Math.round(m.y + dy);
      const el = s.objEls.get(x.id); if (el) s.place(el, x);
    }
    for (const m of origInk) { const st = doc.ink[m.id]; st.p = m.p.map((val, i) => round1(val + (i % 2 ? dy : dx))); const el = s.inkEls.get(m.id); if (el) drawStrokeEl(el, st); }
    refreshGroups(s); renderConns(s); renderSel(s);
  }, (ok) => {
    if (moved) {
      for (const m of orig) if (doc.objs[m.id]) changed(doc.objs[m.id]);
      for (const m of origInk) if (doc.ink[m.id]) doc.ink[m.id].u = now();
      saveDoc('main'); if (origInk.length) markInk();
      if (view.kind === 'endless') view.layoutEndless();
      updateObjbar(true); refreshFormatSoon();
    } else if (onClick) { onClick(); updateObjbar(true); }
    else if (wasSel && sel.ids.size === 1 && OBJ[o.t] && OBJ[o.t].text) enterEdit(s, o);
    else updateObjbar(true);
  });
}
function handleDrag(s, e, kind) {
  if (cur.ro) return;
  const objs = selObjs(); if (!objs.length) return;
  const o = objs[0];
  if (kind.startsWith('ep-')) return endpointDrag(s, e, o, kind.slice(3));
  if (kind.startsWith('c-')) return connectorDrag(s, e, o.id, kind.slice(2));
  if (o.lock) return toast('Locked. Unlock it to change it.');
  const T = OBJ[o.t], el = s.objEls.get(o.id);
  const start = s.toLocal(e.clientX, e.clientY);
  const o0 = { x: o.x, y: o.y, w: o.w || el.offsetWidth, h: o.h || el.offsetHeight, r: o.r || 0 };
  const cx0 = o0.x + o0.w / 2, cy0 = o0.y + o0.h / 2;
  let moved = false;
  gesture.start(e, (ev) => {
    const p = s.toLocal(ev.clientX, ev.clientY);
    if (!moved) { moved = true; pushUndo(); $('#objbar').hidden = true; }
    if (kind === 'rot') {
      let a = Math.atan2(p.y - cy0, p.x - cx0) * 180 / Math.PI + 90;
      a = ev.shiftKey ? Math.round(a / 15) * 15 : a;
      for (const t of [0, 90, 180, 270, 360, -90]) if (Math.abs(a - t) < 4) a = t;
      o.r = Math.round(((a % 360) + 360) % 360);
      if (o.r === 360) o.r = 0;
    } else {
      const [hx, hy] = DIRS[kind.slice(2)];
      const rad = o0.r * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
      const dx = p.x - start.x, dy = p.y - start.y;
      const dxl = dx * cos + dy * sin, dyl = -dx * sin + dy * cos;
      const min = T.min || 20;
      let nw = Math.max(min, o0.w + hx * dxl), nh = Math.max(min * 0.5, o0.h + hy * dyl);
      const keep = T.aspect ? !ev.shiftKey : ev.shiftKey;
      if (keep && hx && hy) { const sc = Math.max(nw / o0.w, nh / o0.h); nw = o0.w * sc; nh = o0.h * sc; }
      if (T.paper) { const f = hx && hy ? Math.max(nw / o0.w, nh / o0.h) : hx ? nw / o0.w : nh / o0.h; nw = o0.w * f; nh = o0.h * f; }
      if (o.ah && hy !== 0 && T.text) o.ah = false;
      if (T.handles === 'w' || o.ah) nh = o0.h;
      const cxl = hx * (nw - o0.w) / 2, cyl = hy * (nh - o0.h) / 2;
      const cx = cx0 + cxl * cos - cyl * sin, cy = cy0 + cxl * sin + cyl * cos;
      o.w = Math.round(nw); if (!o.ah) o.h = Math.round(nh);
      if (T.baseW) o.sc = o.w / T.baseW(o);
      o.x = Math.round(cx - nw / 2); o.y = Math.round(cy - (o.ah ? o0.h : nh) / 2);
      if (T.live) T.update(el, o, s);
    }
    s.place(el, o); refreshGroups(s); renderConns(s); renderSel(s);
  }, () => { if (moved) { changed(o); s.renderObj(o, true); renderConns(s); renderSel(s); saveDoc('main'); updateObjbar(true); refreshFormatSoon(); if (view.kind === 'endless') view.layoutEndless(); } });
}

/* ---------- marquee: select, Magic box, fact-check area ---------- */
function marquee(s, e, kind) {
  const start = s.toLocal(e.clientX, e.clientY);
  const box = h('div', { class: 'marquee' + (kind === 'magic' ? ' magic' : kind === 'area' ? ' area' : kind === 'tbox' ? ' tbox' : ''), style: { borderWidth: 'calc(1.5px / var(--z,1))' } });
  s.L.others.append(box);
  let rect = { x: start.x, y: start.y, w: 0, h: 0 };
  gesture.start(e, (ev) => {
    const p = s.toLocal(ev.clientX, ev.clientY);
    rect = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    Object.assign(box.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
  }, (ok) => {
    box.remove();
    const k = s.k();
    if (kind === 'tbox') { if (ok) drawnTextBox(s, start, rect); return; }
    if (!ok || (rect.w * k < 6 && rect.h * k < 6)) { if (kind === 'select') clearSel(); return; }
    if (kind === 'select') selectInRect(s, rect); else if (kind === 'magic') runMagic(s, rect);
    else if (kind === 'area') { setTool(defaultTool()); runFactCheck({ surf: s, rect }); }
  });
}

/* ---------- connectors ---------- */
function connEnds(c, objsOverride) {
  const get = (end) => {
    if (!end) return null;
    if (end.id) { const o = (objsOverride && objsOverride[end.id]) || doc.objs[end.id]; if (!o || o.del || o.pin) return null; return { o, side: end.side }; }
    return { x: end.x, y: end.y };
  };
  const A = get(c.a), B = get(c.b);
  if (!A || !B) return null;
  const center = (E) => E.o ? { x: E.o.x + (E.o.w || 0) / 2, y: E.o.y + (E.o.h || 0) / 2 } : E;
  const ca = center(A), cb = center(B);
  const anchor = (E, toward) => {
    if (!E.o) return { x: E.x, y: E.y, side: null, dir: null };
    const o = E.o, hw = (o.w || 0) / 2, hh = (o.h || 0) / 2, cx = o.x + hw, cy = o.y + hh;
    const rad = (o.r || 0) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    let side = E.side;
    if (!side) { const dx = toward.x - cx, dy = toward.y - cy, lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos; side = Math.abs(lx) / (hw || 1) > Math.abs(ly) / (hh || 1) ? (lx > 0 ? 'r' : 'l') : (ly > 0 ? 'b' : 't'); }
    const ux = SIDEV[side][0], uy = SIDEV[side][1], lx = ux * (hw + 2), ly = uy * (hh + 2);
    return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos, side, dir: [ux * cos - uy * sin, ux * sin + uy * cos] };
  };
  return { a: anchor(A, cb), b: anchor(B, ca) };
}
const SIDEV = { r: [1, 0], l: [-1, 0], t: [0, -1], b: [0, 1] };
function connPath(c, e) {
  const a = e.a, b = e.b, st = c.cs || 'curve';
  if (st === 'straight') return { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, end: [a.x, a.y], start: [b.x, b.y], mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  if (st === 'elbow') {
    const hA = !a.dir || Math.abs(a.dir[0]) >= Math.abs(a.dir[1]), hB = !b.dir || Math.abs(b.dir[0]) >= Math.abs(b.dir[1]);
    let pts;
    if (hA && hB) { const mx = (a.x + b.x) / 2; pts = [[a.x, a.y], [mx, a.y], [mx, b.y], [b.x, b.y]]; }
    else if (!hA && !hB) { const my = (a.y + b.y) / 2; pts = [[a.x, a.y], [a.x, my], [b.x, my], [b.x, b.y]]; }
    else if (hA) pts = [[a.x, a.y], [b.x, a.y], [b.x, b.y]];
    else pts = [[a.x, a.y], [a.x, b.y], [b.x, b.y]];
    const n = pts.length;
    return { d: 'M' + pts.map((p) => p.join(' ')).join('L'), end: pts[n - 2], start: pts[1], mid: { x: (pts[1][0] + pts[n - 2][0]) / 2, y: (pts[1][1] + pts[n - 2][1]) / 2 } };
  }
  const dist = Math.hypot(b.x - a.x, b.y - a.y), k = Math.max(30, dist * 0.4);
  const va = a.dir || [(b.x - a.x) / (dist || 1), (b.y - a.y) / (dist || 1)];
  const vb = b.dir || [(a.x - b.x) / (dist || 1), (a.y - b.y) / (dist || 1)];
  const c1 = [a.x + va[0] * k, a.y + va[1] * k], c2 = [b.x + vb[0] * k, b.y + vb[1] * k];
  const mid = { x: 0.125 * a.x + 0.375 * c1[0] + 0.375 * c2[0] + 0.125 * b.x, y: 0.125 * a.y + 0.375 * c1[1] + 0.375 * c2[1] + 0.125 * b.y };
  return { d: `M${a.x} ${a.y}C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${b.x} ${b.y}`, end: c2, start: c1, mid };
}
function arrowHead(tip, from, size) {
  const ang = Math.atan2(tip.y - from[1], tip.x - from[0]);
  const p = (a, r) => round1(tip.x - Math.cos(ang + a) * r) + ' ' + round1(tip.y - Math.sin(ang + a) * r);
  return `M${tip.x} ${tip.y}L${p(0.42, size)}L${p(-0.42, size)}Z`;
}
function renderConns(s) {
  if (!s || !doc) return;
  queueMicrotask(() => renderWinNotes(s));
  const g = s.L.conns; g.textContent = '';
  for (const c of objList((o) => o.t === 'conn' && s.match(o))) {
    const e = connEnds(c); if (!e) continue;
    const P = connPath(c, e);
    const col = c.c || 'var(--muted)', sw = c.sw || 2;
    const selected = sel.surf === s && sel.ids.has(c.id);
    const gr = sv('g');
    gr.append(sv('path', { d: P.d, class: 'hit', 'data-id': c.id, stroke: 'transparent', 'stroke-width': 16, fill: 'none' }));
    gr.append(sv('path', { d: P.d, fill: 'none', stroke: selected ? 'var(--accent)' : col, 'stroke-width': sw, 'stroke-dasharray': c.dash ? (sw * 3) + ' ' + (sw * 2.5) : null, 'stroke-linecap': 'round', 'pointer-events': 'none' }));
    const ah = 8 + sw * 2.2;
    if ((c.ar || 'end') !== 'none') gr.append(sv('path', { d: arrowHead(e.b, P.end, ah), fill: selected ? 'var(--accent)' : col, 'pointer-events': 'none' }));
    if (c.ar === 'both') gr.append(sv('path', { d: arrowHead(e.a, P.start, ah), fill: selected ? 'var(--accent)' : col, 'pointer-events': 'none' }));
    if (c.label) {
      const t = sv('text', { x: P.mid.x, y: P.mid.y + 5, 'text-anchor': 'middle', 'font-size': 14, fill: 'var(--ink)', 'font-family': 'var(--ff)', 'paint-order': 'stroke', stroke: 'var(--sheet)', 'stroke-width': 5, 'stroke-linejoin': 'round', class: 'hit', 'data-id': c.id });
      t.textContent = c.label; gr.append(t);
    }
    g.append(gr);
  }
}
function connectorDrag(s, e, fromId, side) {
  const start = s.toLocal(e.clientX, e.clientY);
  let from = fromId ? { id: fromId, side } : null;
  if (!from) { const o = topObjAt(s, start); from = o ? { id: o.id } : { x: start.x, y: start.y }; }
  const temp = sv('path', { fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '6 5' });
  s.L.conns.append(temp);
  let moved = false, target = null, last = start;
  gesture.start(e, (ev) => {
    const p = s.toLocal(ev.clientX, ev.clientY); last = p;
    if (!moved && Math.hypot(p.x - start.x, p.y - start.y) * s.k() < 6) return;
    moved = true;
    const t = topObjAt(s, p, from.id); target = t && t.t !== 'frame' ? t : null;
    const c = { a: from, b: target ? { id: target.id } : { x: p.x, y: p.y }, cs: prefs.get('connStyle', 'curve') };
    const en = connEnds(c); if (en) temp.setAttribute('d', connPath(c, en).d);
  }, (ok) => {
    temp.remove();
    if (!ok) return;
    if (!moved) { if (fromId && side) quickConnect(s, fromId, side); return; }
    pushUndo();
    let b;
    if (target) b = { id: target.id };
    else if (fromId) {
      const src = doc.objs[fromId];
      if (src && /^(note|sticky|shape|text)$/.test(src.t)) {
        const n = cloneEmpty(src, last.x, last.y, true);
        b = { id: n.id };
      } else b = { x: last.x, y: last.y };
    } else b = { x: last.x, y: last.y };
    const c = addObj({ t: 'conn', a: from, b, cs: prefs.get('connStyle', 'curve'), ar: 'end', sh: s.sheet, sw: round1(2 * newScale()) });
    s.renderAll(); selectOnly(s, b.id && doc.objs[b.id].t !== 'conn' && !target ? [b.id] : [c.id]);
    if (b.id && !target) enterEdit(s, doc.objs[b.id]);
    saveDoc('main');
    if (tool === 'connector') setTool(defaultTool());
  });
}
function cloneEmpty(src, cx, cy, centered) {
  const n = { t: src.t, w: src.w, h: src.h, ah: src.ah, html: '', sh: src.sh, lay: src.lay };
  for (const k of ['bg', 'tc', 'col', 'k', 'fill', 'stroke', 'sw', 'fs', 'nobd', 'nosh', 'sc']) if (src[k] !== undefined) n[k] = src[k];
  n.x = Math.round(centered ? cx - (src.w || 0) / 2 : cx); n.y = Math.round(centered ? cy - (src.h || 0) / 2 : cy);
  return addObj(n);
}
function quickConnect(s, fromId, side) {
  const src = doc.objs[fromId]; if (!src) return;
  pushUndo();
  const gap = 90 * (src.sc || 1), [ux, uy] = SIDEV[side], rad = (src.r || 0) * Math.PI / 180;
  const vx = ux * Math.cos(rad) - uy * Math.sin(rad), vy = ux * Math.sin(rad) + uy * Math.cos(rad), dd = (ux ? src.w : (src.h || 0)) + gap;
  const cx = src.x + src.w / 2 + vx * dd, cy = src.y + (src.h || 0) / 2 + vy * dd;
  let n;
  if (/^(note|sticky|shape|text)$/.test(src.t)) n = cloneEmpty(src, cx, cy, true);
  else n = addObj({ t: 'note', x: Math.round(cx - 130), y: Math.round(cy - 25), w: 260, ah: true, h: 50, html: '', sh: src.sh, lay: src.lay });
  addObj({ t: 'conn', a: { id: fromId, side }, b: { id: n.id }, cs: prefs.get('connStyle', 'curve'), ar: 'end', sh: s.sheet, sw: round1(2 * (src.sc || 1)) });
  s.renderAll(); selectOnly(s, [n.id]); enterEdit(s, n); saveDoc('main');
}
function endpointDrag(s, e, c, which) {
  const temp = { ...c };
  let moved = false;
  gesture.start(e, (ev) => {
    const p = s.toLocal(ev.clientX, ev.clientY);
    if (!moved) { moved = true; pushUndo(); }
    const t = topObjAt(s, p, null);
    const other = which === 'a' ? c.b : c.a;
    c[which] = t && t.t !== 'frame' && t.id !== other.id ? { id: t.id } : { x: p.x, y: p.y };
    renderConns(s); renderSel(s);
  }, () => { if (moved) { changed(c); renderConns(s); renderSel(s); saveDoc('main'); } else Object.assign(c, temp); });
}

/* ---------- text inside boxes ---------- */
function enterEdit(s, o) {
  if (!cur || cur.ro || !OBJ[o.t] || !OBJ[o.t].text) return;
  if (o.lock) { toast('Locked. Unlock it to edit it.'); return; }
  const el = s.objEls.get(o.id); if (!el) return;
  const tx = el.querySelector('.otext'); if (!tx) return;
  if (editing && editing.id !== o.id) exitEdit();
  el.classList.add('editing'); tx.contentEditable = 'true';
  editing = { s, id: o.id, el, tx };
  placeCaretAt(tx, false); activeEd = tx;
  renderSel(s); $('#objbar').hidden = true;
}
function exitEdit() {
  if (!editing) return;
  const { s, id, el, tx } = editing; editing = null;
  tx.contentEditable = 'false'; el.classList.remove('editing');
  const o = doc && doc.objs[id];
  if (o && !o.del) {
    const html = sanitize(tx.innerHTML);
    if (html !== o.html) { o.html = html; changed(o); saveDoc('main'); }
    s.renderObj(o, true); renderConns(s);
  }
  renderSel(s); updateObjbar(true);
}
let objTextTimer = null;
function onObjText(tx) {
  if (!editing || editing.tx !== tx || !doc) return;
  const o = doc.objs[editing.id]; if (!o) return;
  lastLocalEdit = now();
  o.html = tx.innerHTML; o.u = now(); editing.el._u = o.u;
  if (o.ah) { const hh = editing.el.offsetHeight; if (hh) o.h = hh; renderConns(editing.s); renderSel(editing.s); }
  clearTimeout(objTextTimer); objTextTimer = setTimeout(() => saveDoc('main'), 400);
}
function renameFrame(o) {
  promptModal('Frame name', 'Name', o.title || 'Frame', 'Rename').then((n) => { if (n == null) return; pushUndo(); o.title = n.trim() || 'Frame'; changed(o); view.renderAll(); saveDoc('main'); });
}

/* ---------- adding things ---------- */
function findFree(s, x, y, w, hh) {
  const others = objList((o) => o.t !== 'conn' && o.t !== 'frame' && s.match(o));
  for (let i = 0; i < 40; i++) {
    const hit = others.find((o) => x < o.x + (o.w || 0) + 12 && x + w + 12 > o.x && y < o.y + (o.h || 0) + 12 && y + hh + 12 > o.y);
    if (!hit) break;
    y = hit.y + (hit.h || 0) + 20;
  }
  const ph = s.view.kind === 'a4' ? pageH(s.sheet || 0) : 0;
  if (ph && y + hh > ph - 20) y = Math.max(20, ph - hh - 20);
  return { x: Math.round(x), y: Math.round(y) };
}
function placeNew(w, hh) {
  let at = null;
  if (view.kind !== 'board' && activeEd && activeEd.classList.contains('flow')) {
    const s = view.surfaces.find((x) => x && x.L.flow === activeEd);
    if (s) at = caretPoint(s);
  }
  if (!at) { const c = view.visibleCenter(); at = { surf: c.surf, x: c.x - w / 2, y: c.y - hh / 2 }; }
  let { x, y } = at;
  if (view.kind !== 'board') { const sw = at.surf.el.offsetWidth; x = clamp(x, 10, Math.max(10, sw - w - 10)); }
  if (view.kind === 'board') { for (let i = 0; i < 12 && objList((o) => Math.abs(o.x - x) < 6 && Math.abs(o.y - y) < 6 && at.surf.match(o)).length; i++) { x += 24; y += 24; } return { surf: at.surf, x: Math.round(x), y: Math.round(y) }; }
  const f = findFree(at.surf, x, y, w, hh);
  return { surf: at.surf, x: f.x, y: f.y };
}
function newScale() { return view && view.kind === 'board' && prefs.get('zoomScale', true) ? Math.round(clamp(1 / view.zoom, 0.1, 10) * 100) / 100 : 1; }
function zoomScaleBox() {
  const c = h('input', { type: 'checkbox', checked: prefs.get('zoomScale', true) ? true : null });
  c.addEventListener('change', () => { prefs.set('zoomScale', c.checked); toast(c.checked ? 'Scale with zoom is on: new drawings, boxes and pictures match how far you’re zoomed in or out.' : 'Scale with zoom is off: new things always get their normal size.'); });
  return h('label', { class: 'zoomscale', title: 'On: new drawings, pen lines, boxes and pictures get bigger when you’re zoomed out and smaller when you’re zoomed in, so they always look the right size on screen.' }, c, 'Scale with zoom');
}
function insertObj(spec, opts = {}) {
  if (!cur || cur.loading || cur.ro || !view) return null;
  const f = opts.noScale ? 1 : newScale();
  if (f !== 1) { spec = { ...spec, w: Math.round((spec.w || 200) * f), h: Math.round((spec.h || 100) * f) }; if (spec.t !== 'image') spec.sc = f; }
  const w = spec.w || 200, hh = spec.h || 100;
  const at = opts.at || placeNew(w, hh);
  pushUndo();
  const o = addObj({ ...spec, x: Math.round(at.x), y: Math.round(at.y), sh: at.surf.sheet, lay: spec.lay || 'front' });
  at.surf.renderAll();
  selectOnly(at.surf, [o.id]);
  if (opts.edit && OBJ[o.t].text) enterEdit(at.surf, o);
  saveDoc('main');
  if (view.kind === 'endless') view.layoutEndless();
  const el = at.surf.objEls.get(o.id);
  if (el && view.scroller && !opts.noScroll) el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  return o;
}
const insertNote = () => insertObj({ t: 'note', w: 300, h: 60, ah: true, html: '', ...newStyleFields('note') }, { edit: true });
const insertText = () => insertObj({ t: 'text', w: 260, h: 40, ah: true, html: '', ...newStyleFields('tbox') }, { edit: true });
/* a text box drawn by dragging (like “Draw Text Box” in Word); a click makes a normal-sized one */
function drawnTextBox(s, start, rect) {
  if (!cur || cur.ro || !doc) return;
  const k = s.k(), f = newScale(), tiny = rect.w * k < 12 && rect.h * k < 12;
  const w = Math.round(tiny ? 260 * f : Math.max(60 / k, rect.w)), hh = Math.round(tiny ? 40 * f : Math.max(28 / k, rect.h));
  setTool(defaultTool());
  pushUndo();
  const o = addObj({ t: 'text', x: Math.round(tiny ? start.x : rect.x), y: Math.round(tiny ? start.y - hh / 2 : rect.y), w, h: hh, ah: tiny || rect.h * k < 60, html: '', sh: s.sheet, lay: 'front', sc: f !== 1 ? f : undefined, ...newStyleFields('tbox') });
  s.renderAll(); selectOnly(s, [o.id]); enterEdit(s, o); saveDoc('main');
  if (view.kind === 'endless') view.layoutEndless();
}
const insertSticky = (col) => insertObj({ t: 'sticky', w: 180, h: 180, html: '', col: col || prefs.get('stickyCol', 'yellow') }, { edit: true });
const insertShape = (k) => insertObj({ t: 'shape', k, w: k === 'ellipse' || k === 'star' ? 140 : 170, h: k === 'arrow' ? 90 : (k === 'ellipse' || k === 'star' ? 140 : 110), html: '' });
function insertFrame() {
  if (view.kind !== 'board') return toast('Frames are for drawing boards.');
  const b = sel.has ? selBox() : null;
  if (b) return insertObj({ t: 'frame', w: b.w + 80, h: b.h + 80, title: 'Frame ' + (objList((o) => o.t === 'frame').length + 1), z: -1 }, { at: { surf: view.surf(0), x: b.x - 40, y: b.y - 40 } });
  return insertObj({ t: 'frame', w: 720, h: 460, title: 'Frame ' + (objList((o) => o.t === 'frame').length + 1), z: -1 });
}
function insertCard() {
  const pages = Object.values(tree.nodes).filter((n) => live(n) && n.type === 'note' && (!cur || n.id !== cur.id));
  if (!pages.length) return toast('There’s no other page to link yet.');
  const sel2 = h('select', { class: 'field', 'aria-label': 'Page' });
  for (const n of pages) sel2.append(h('option', { value: n.id }, ancestors(n.id).map((a) => a.name).concat(n.name).join(' › ')));
  modal({ title: 'Add a page link', body: [h('p', { class: 'hint' }, 'A card that opens another page with a double-click.'), sel2], actions: [{ label: 'Cancel' }, { label: 'Add', kind: 'primary', fn: () => insertObj({ t: 'card', w: 280, h: 64, ah: true, target: sel2.value }) }] });
}
function insertTable() {
  const rows = h('input', { class: 'field', type: 'number', min: 1, max: 30, value: 4, 'aria-label': 'Rows' });
  const cols = h('input', { class: 'field', type: 'number', min: 1, max: 10, value: 3, 'aria-label': 'Columns' });
  const head = h('input', { type: 'checkbox', checked: true });
  modal({ title: 'Insert a table', body: [h('div', { class: 'frow' }, h('label', null, 'Rows'), rows), h('div', { class: 'frow' }, h('label', null, 'Columns'), cols), h('label', { class: 'opt' }, head, 'First row is a header')],
    actions: [{ label: 'Cancel' }, { label: 'Insert table', kind: 'primary', fn: () => {
      const r = clamp(+rows.value || 3, 1, 30), c = clamp(+cols.value || 3, 1, 10);
      let html = '<table>';
      if (head.checked) html += '<thead><tr>' + '<th>Heading</th>'.repeat(c) + '</tr></thead>';
      html += '<tbody>' + ('<tr>' + '<td><br></td>'.repeat(c) + '</tr>').repeat(head.checked ? r - 1 || 1 : r) + '</tbody></table><p><br></p>';
      insertHTMLAtCaret(html);
    } }] });
}
function insertHTMLAtCaret(html) {
  if (cur.ro) return;
  const tgt = activeEd && work.contains(activeEd) ? activeEd : null;
  if (tgt && savedRange && tgt.contains(savedRange.startContainer)) {
    tgt.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange);
    document.execCommand('insertHTML', false, html);
    return;
  }
  if (view.kind === 'board') return insertObj({ t: 'note', w: 420, h: 100, ah: true, html });
  const f = view.flowEl(view.kind === 'a4' ? doc.flows.length - 1 : 0);
  placeCaretAt(f, false); document.execCommand('insertHTML', false, html);
}

/* ---------- pictures ---------- */
function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
async function shrink(file, max, q) {
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImg(url);
    const w = im.naturalWidth, hh = im.naturalHeight;
    if (Math.max(w, hh) <= max && file.size < 1.6e6 && /^image\/(jpeg|png|webp|gif)$/.test(file.type)) return { blob: file, w, h: hh };
    const k = Math.min(1, max / Math.max(w, hh));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hh * k);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height);
    const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', q));
    return { blob, w, h: hh };
  } finally { URL.revokeObjectURL(url); }
}
const toDataURL = (b) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
const blobCache = new Map();
async function uploadImage(file) {
  const r = await shrink(file, 1800, 0.86);
  let src = null;
  src = await Files.upload(r.blob);
  if (!src) { const small = await shrink(file, 1000, 0.72); src = await toDataURL(small.blob); }
  return { src, blob: r.blob, w: r.w, h: r.h };
}
async function addImages(files, at) {
  if (!cur || cur.loading || cur.ro) return;
  let n = 0;
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    toast('Adding picture…');
    let up;
    try { up = await uploadImage(f); } catch { toast('That picture couldn’t be added. Try a JPG or PNG.'); continue; }
    const maxW = view.kind === 'a4' ? 420 : 460;
    const w = Math.min(maxW, up.w || maxW), hh = Math.round(w * ((up.h || 1) / (up.w || 1)));
    const pos = at ? { surf: at.surf, x: at.x + n * 24, y: at.y + n * 24 } : placeNew(w, hh);
    const o = insertObj({ t: 'image', w, h: hh, src: up.src, alt: (f.name || 'Picture').replace(/\.[a-z0-9]+$/i, '') }, { at: pos });
    if (o) blobCache.set(o.id, up.blob);
    n++;
  }
  hideToast();
}
$('#fileIn').addEventListener('change', async (e) => { const f = [...e.target.files]; e.target.value = ''; await addImages(f); });
/* a picture dropped anywhere that has no drop place of its own (page margins, toolbars, the Picture buttons) goes onto
   the open page; other files dropped there are ignored instead of the browser leaving Cortex Scribe to show them */
addEventListener('dragover', (e) => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault(); });
addEventListener('drop', (e) => {
  if (e.defaultPrevented || !e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return;
  e.preventDefault();
  const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return toast('Drop pictures onto a page, or files onto Sources.');
  if (!cur || cur.loading || cur.ro || app.hidden) return toast('Open a page you can edit, then drop the picture onto it.');
  addImages(files);
});

/* ---------- arrange ---------- */
function normalizeZ() {
  const all = objList((o) => o.t !== 'conn').sort((a, b) => (a.z || 0) - (b.z || 0));
  all.forEach((o, i) => { const nz = o.t === 'frame' ? i - all.length : i + 1; if (o.z !== nz) { o.z = nz; changed(o); } });
}
function arrange(how) {
  const objs = selObjs().filter((o) => o.t !== 'conn'); if (!objs.length) return;
  pushUndo();
  const all = objList((o) => o.t !== 'conn');
  const zs = all.map((o) => o.z || 0);
  const max = Math.max(...zs), min = Math.min(...zs);
  for (const o of objs) {
    if (how === 'front') o.z = max + 1;
    else if (how === 'back') o.z = min - 1;
    else if (how === 'fwd') o.z = (o.z || 0) + 1.5;
    else if (how === 'bwd') o.z = (o.z || 0) - 1.5;
    changed(o);
  }
  normalizeZ(); view.renderAll(); saveDoc('main');
}
function setWrap(lay) {
  const objs = selObjs().filter((o) => o.t !== 'conn'); if (!objs.length) return;
  pushUndo(); for (const o of objs) { o.lay = lay; changed(o); }
  view.renderAll(); saveDoc('main');
  toast(lay === 'back' ? 'Behind the text. Use Select (Draw tab) to grab it again.' : 'In front of the text.');
}
function alignSel(how) {
  const objs = selObjs().filter((o) => o.t !== 'conn'); if (objs.length < 2) return;
  pushUndo();
  const b = selBox();
  for (const o of objs) {
    if (how === 'left') o.x = b.x; else if (how === 'right') o.x = b.x + b.w - o.w; else if (how === 'center') o.x = Math.round(b.x + b.w / 2 - o.w / 2);
    else if (how === 'top') o.y = b.y; else if (how === 'bottom') o.y = b.y + b.h - o.h; else if (how === 'middle') o.y = Math.round(b.y + b.h / 2 - o.h / 2);
    changed(o);
  }
  view.renderAll(); saveDoc('main');
}
function deleteSel() {
  if (!sel.has || cur.ro) return;
  const lockedN = selObjs().filter((o) => o.lock).length;
  if (lockedN && lockedN === selObjs().length && !sel.ink.size) return toast('Locked. Unlock it first (right-click → Unlock).');
  pushUndo();
  for (const id of sel.ids) { const o = doc.objs[id]; if (o && o.lock) continue; delObj(id); }
  for (const id of sel.ink) { const st = doc.ink[id]; if (!st || (st.g && doc.objs[st.g] && doc.objs[st.g].lock)) continue; doc.ink[id] = { id, del: true, u: now() }; }
  if (lockedN) toast('Locked things weren’t deleted. Unlock them first.');
  const hadInk = sel.ink.size > 0;
  clearSel(); view.renderAll(); saveDoc('main'); if (hadInk) markInk();
}
let clip = null;
function copySel() {
  if (!sel.has) return false;
  const ids = [...sel.ids], inkIds = [...sel.ink];
  expandWithSheets(ids, inkIds);
  clip = { objs: ids.map((id) => doc.objs[id]).filter((o) => o && !o.del).sort((a, b) => (a.z || 0) - (b.z || 0)).map(deep), ink: inkIds.map((id) => deep(doc.ink[id])).filter(Boolean) };
  return true;
}
function pasteClip(at) {
  if (!clip || cur.ro) return;
  pushUndo();
  const s = (at && at.surf) || sel.surf || view.visibleCenter().surf;
  const map = {}, ids = [], inkIds = [];
  const pp0 = clip.objs.find((o) => o.t === 'paper');
  const DX = pp0 ? freeSpotRight(pp0) - pp0.x : 24, DY = pp0 ? 0 : 24;
  for (const o of clip.objs) if (o.t !== 'conn') map[o.id] = newId('o');
  for (const o of clip.objs) {
    const n = deep(o);
    if (n.t === 'conn') {
      for (const k of ['a', 'b']) { if (n[k].id) n[k] = map[n[k].id] ? { ...n[k], id: map[n[k].id] } : null; else n[k] = { x: n[k].x + DX, y: n[k].y + DY }; }
      if (!n.a || !n.b) continue;
      n.id = newId('o');
    } else { n.id = map[o.id]; n.x += DX; n.y += DY; if (n.g) { if (map[n.g]) n.g = map[n.g]; else delete n.g; } delete n.lock; }
    n.sh = s.sheet; delete n.z;
    addObj(n); if (n.t !== 'conn') ids.push(n.id);
  }
  for (const st of clip.ink) { const n = deep(st); if (n.g) { if (map[n.g]) n.g = map[n.g]; else delete n.g; } n.id = newId('k'); n.sh = s.sheet; n.p = n.p.map((v, i) => v + (i % 2 ? DY : DX)); n.u = now(); doc.ink[n.id] = n; inkIds.push(n.id); }
  clip = { objs: clip.objs.map((o) => { const c = deep(o); if (c.t !== 'conn') { c.x += DX; c.y += DY; } return c; }), ink: clip.ink.map((st) => ({ ...st, p: st.p.map((v, i) => v + (i % 2 ? DY : DX)) })) };
  view.renderAll(); selectOnly(s, ids, inkIds); saveDoc('main'); if (inkIds.length) markInk();
}
function duplicateSel() { if (copySel()) pasteClip(); }

/* ---------- keyboard ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !isTyping(document.activeElement) && view && view.kind === 'board') { if (!spaceDown) { spaceDown = true; view.boardEl && view.boardEl.classList.add('panning'); } e.preventDefault(); return; }
  if (e.key === 'Escape' && menuEl) { closeMenu(); return; }
  if (!cur || !doc || !view || document.querySelector('.scrim')) return;
  const ae = document.activeElement;
  if (isTyping(ae)) {
    if (e.key === 'Escape' && editing && ae === editing.tx) { e.preventDefault(); ae.blur(); }
    if (mmEditing && e.key) MM.keyInEdit(e);
    return;
  }
  const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redoObjs(); else undoObjs(); return; }
  if (mod && key === 'y') { e.preventDefault(); redoObjs(); return; }
  if (mmSel && MM.key(e)) return;
  if (e.key === 'Escape') { if (tool !== defaultTool()) setTool(defaultTool()); else if (sel.has) clearSel(); else if (linkMode) $('#linkCancel').click(); return; }
  if (sel.has && !cur.ro) {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
    if (mod && key === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (mod && key === 'g') { e.preventDefault(); if (e.shiftKey) ungroupSel(); else groupSel('box'); return; }
    if (mod && key === 'l') { e.preventDefault(); lockSel(!selObjs().some((o) => o.lock)); return; }
    if (mod && key === 'c') { if (copySel()) { e.preventDefault(); toast('Copied.'); } return; }
    if (mod && key === 'x') { if (copySel()) { e.preventDefault(); deleteSel(); } return; }
    if (/^Arrow/.test(e.key)) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      for (const o of selObjs()) if (o.t !== 'conn' && !o.lock) { o.x += dx; o.y += dy; changed(o); }
      for (const id of sel.ink) { const st = doc.ink[id]; st.p = st.p.map((v, i) => v + (i % 2 ? dy : dx)); st.u = now(); }
      view.renderAll(); saveDoc('main'); if (sel.ink.size) markInk();
      return;
    }
    const one = selObjs().length === 1 && !sel.ink.size ? selObjs()[0] : null;
    if (one && OBJ[one.t] && OBJ[one.t].text && !mod) {
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); enterEdit(sel.surf, one); return; }
      if (e.key.length === 1 && !e.altKey) { e.preventDefault(); enterEdit(sel.surf, one); document.execCommand('insertText', false, e.key); return; }
    }
  }
  if (mod || e.altKey) return;
  const map = { v: 'select', t: 'text', p: 'pen', h: 'hl', e: 'eraser', m: 'magic', l: 'lasso' };
  if (map[key] && !(key === 't' && view.kind === 'board')) { setTool(map[key]); e.preventDefault(); return; }
  if (key === 'n' && !cur.ro) { e.preventDefault(); insertNote(); }
  else if (key === 's' && !cur.ro) { e.preventDefault(); insertSticky(); }
  else if (key === 'c' && !cur.ro) { e.preventDefault(); setTool('connector'); }
});
document.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; if (view && view.boardEl) view.boardEl.classList.remove('panning'); } });
document.addEventListener('paste', async (e) => {
  if (!cur || !doc || cur.ro || isTyping(document.activeElement) || document.querySelector('.scrim')) return;
  const cd = e.clipboardData;
  const files = cd ? [...cd.files].filter((f) => f.type.startsWith('image/')) : [];
  if (files.length) { e.preventDefault(); return addImages(files); }
  if (clip) { e.preventDefault(); return pasteClip(); }
  const text = cd && cd.getData('text/plain');
  if (text && text.trim()) { e.preventDefault(); insertObj({ t: 'note', w: 320, h: 60, ah: true, html: text.trim().split(/\n{2,}/).map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('') }); }
});

/* ---------- floating toolbar for the selection ---------- */
let objbarSig = '';
function updateObjbar(rebuild) {
  const bar = $('#objbar');
  if (!cur || !doc || !view || !sel.has || !sel.surf || gesture.cur || editing) { bar.hidden = true; objbarSig = ''; return; }
  const objs = selObjs();
  const sig = objs.map((o) => o.id + o.t + (o.lay || '') + (o.cs || '') + (o.ar || '')).join(',') + '|' + sel.ink.size + (cur.ro ? 'ro' : '');
  if (rebuild || sig !== objbarSig) { objbarSig = sig; buildObjbar(bar, objs); }
  const b = selBox(); if (!b) { bar.hidden = true; return; }
  const s = sel.surf;
  const tl = s.toClient(b.x, b.y), br = s.toClient(b.x + b.w, b.y + b.h);
  bar.hidden = false;
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  const wr = work.getBoundingClientRect();
  let x = (tl.x + br.x) / 2 - bw / 2, y = tl.y - bh - 40;
  if (y < wr.top + 4) y = br.y + 24;
  if (y > wr.bottom - bh - 4) y = Math.max(wr.top + 4, Math.min(y, wr.bottom - bh - 4));
  x = clamp(x, 8, innerWidth - bw - 8);
  bar.style.left = x + 'px'; bar.style.top = y + 'px';
  bar.style.visibility = (br.y < wr.top || tl.y > wr.bottom) ? 'hidden' : '';
}
function tbtn(icon, label, fn, extra) {
  const { text, ...rest } = extra || {};
  const b = h('button', { class: 'tb', title: label, 'aria-label': label, onclick: fn, ...rest }, icon ? svg(icon) : null);
  if (text) b.append(h('span', null, text));
  return b;
}
function buildObjbar(bar, objs) {
  bar.textContent = '';
  const one = objs.length === 1 && !sel.ink.size ? objs[0] : null;
  const sep = () => h('span', { class: 'rsep' });
  if (cur.ro) { if (one && one.t === 'card') bar.append(tbtn('open', 'Open page', () => openNote(one.target), { text: 'Open' })); else bar.append(h('span', { class: 'rlabel' }, 'View only')); return; }
  if (one) {
    const T = OBJ[one.t] || {};
    if (T.text) bar.append(tbtn('edit', 'Edit text', () => enterEdit(sel.surf, one), { text: 'Edit' }));
    if (STYLE_OF_T[one.t]) bar.append(tbtn('palette', 'Colours', (e) => openStyleFor([one], e.currentTarget), { text: 'Colours' }));
    if (one.t === 'sticky') bar.append(...Object.keys(STICKY).map((c) => h('button', { class: 'sw', style: { background: STICKY[c] }, title: c, 'aria-label': 'Colour ' + c, 'aria-pressed': String(one.col === c), onclick: () => { setProp(one, 'col', c); prefs.set('stickyCol', c); updateObjbar(true); } })));
    if (one.t === 'shape') {
      bar.append(tbtn('shape', 'Change shape', (e) => openMenu(e.currentTarget, Object.entries(SHAPES).map(([k, l]) => ({ label: l, checked: one.k === k, fn: () => setProp(one, 'k', k) })))));
      bar.append(tbtn('palette', 'Fill colour', (e) => openPalette(e.currentTarget, (c) => setProp(one, 'fill', c), { none: 'No fill' })));
    }
    if (one.t === 'image') bar.append(tbtn('rotate', 'Turn 90°', () => setProp(one, 'r', ((one.r || 0) + 90) % 360)));
    if (one.t === 'chart') bar.append(tbtn('chart', 'Edit chart', () => openPanel('format'), { text: 'Edit chart' }));
    if (one.t === 'mm') {
      bar.append(tbtn('plus', 'Add an idea', () => MM.addChildOfSelected(sel.surf, one), { text: 'Idea' }));
      bar.append(tbtn('mindmap', 'Layout', (e) => openMenu(e.currentTarget, MM_LAYOUTS.map(([k, l]) => ({ label: l, checked: (one.lay || 'right') === k, fn: () => setProp(one, 'lay', k) })))));
      bar.append(tbtn('palette', 'Style', (e) => openMenu(e.currentTarget, MM_STYLES.map((st, i) => ({ label: st.name, checked: (one.sty || 0) === i, fn: () => setProp(one, 'sty', i) })))));
    }
    if (one.t === 'conn') {
      bar.append(tbtn(one.cs === 'straight' ? 'straight' : one.cs === 'elbow' ? 'elbow' : 'curve', 'Line style', (e) => openMenu(e.currentTarget, [['curve', 'Curved'], ['straight', 'Straight'], ['elbow', 'Elbow']].map(([k, l]) => ({ label: l, checked: (one.cs || 'curve') === k, fn: () => { setProp(one, 'cs', k); prefs.set('connStyle', k); } })))));
      bar.append(tbtn('arrowR', 'Arrows', (e) => openMenu(e.currentTarget, [['end', 'Arrow at the end'], ['both', 'Arrows at both ends'], ['none', 'No arrows']].map(([k, l]) => ({ label: l, checked: (one.ar || 'end') === k, fn: () => setProp(one, 'ar', k) })))));
      bar.append(tbtn('palette', 'Line colour', (e) => openPalette(e.currentTarget, (c) => setProp(one, 'c', c), { none: 'Default' })));
      bar.append(tbtn('textT', 'Label', async () => { const t = await promptModal('Line label', 'Label', one.label || '', 'Save'); if (t != null) setProp(one, 'label', t.trim()); }));
    }
    if (one.t === 'card') bar.append(tbtn('open', 'Open page', () => openNote(one.target), { text: 'Open' }));
    if (one.t === 'm3d') bar.append(tbtn('fit', 'Expand to full screen', () => expandWin(one.id), { text: 'Expand' }));
    if (one.t === 'scr') bar.append(tbtn('fit', 'Expand to full screen', () => expandScr(one.id), { text: 'Expand' }));
    if (one.t === 'paper') bar.append(tbtn(one.size === 'A3' ? 'a3' : 'a4', 'Page size, orientation and background', (e) => openMenu(e.currentTarget, paperMenu(one)), { text: (one.size || 'A4') + (one.land ? ' ⟷' : ' ↕') }),
      tbtn('rotate', one.land ? 'Turn it upright (portrait)' : 'Turn it sideways (landscape)', () => setPaper(one, one.size || 'A4', !one.land)),
      tbtn('plus', 'Add a sheet below or to the right', (e) => openMenu(e.currentTarget, paperAddItems(one))));
    if (one.t === 'frame') bar.append(tbtn('present', 'Present', () => present(one.id)), tbtn('edit', 'Rename', () => renameFrame(one)));
    if (one.t !== 'conn') bar.append(sep());
  } else {
    bar.append(h('span', { class: 'rlabel' }, (objs.length + sel.ink.size) + ' selected'));
    if (sel.ink.size) bar.append(...inkBarButtons());
    if (objs.length > 1 && styleKindOf(objs)) bar.append(tbtn('palette', 'Colours for all of them', (e) => openStyleFor(objs, e.currentTarget), { text: 'Colours' }));
    if (objs.length > 1) bar.append(tbtn('alignL', 'Line up', (e) => openMenu(e.currentTarget, [['left', 'Left edges'], ['center', 'Centres'], ['right', 'Right edges'], ['top', 'Top edges'], ['middle', 'Middles'], ['bottom', 'Bottom edges']].map(([k, l]) => ({ label: l, fn: () => alignSel(k) })))));
  }
  if (objs.some((o) => o.t !== 'conn')) {
    bar.append(tbtn('fwd', 'Bring forward', (e) => openMenu(e.currentTarget, [{ label: 'Bring to front', icon: 'front', fn: () => arrange('front') }, { label: 'Bring forward', icon: 'fwd', fn: () => arrange('fwd') }, { label: 'Send backward', icon: 'bwd', fn: () => arrange('bwd') }, { label: 'Send to back', icon: 'back', fn: () => arrange('back') }])));
    if (view.kind !== 'board') {
      const behind = objs.every((o) => o.lay === 'back');
      bar.append(tbtn(behind ? 'behind' : 'wrap', behind ? 'Behind text' : 'In front of text', (e) => openMenu(e.currentTarget, [{ label: 'In front of text', checked: !behind, fn: () => setWrap('front') }, { label: 'Behind text', checked: behind, fn: () => setWrap('back') }])));
    }
  }
  if (!cur.ro) {
    const grps = objs.filter((o) => o.t === 'group'), plain = objs.filter((o) => o.t !== 'conn' && o.t !== 'group').length + sel.ink.size;
    if (grps.length) bar.append(tbtn('group', 'Group options', (e) => openMenu(e.currentTarget, groupMenuItems(grps))));
    else if (plain >= 2) bar.append(tbtn('group', 'Group them (Ctrl+G)', (e) => openMenu(e.currentTarget, groupMenuItems([]))));
    const lk = objs.some((o) => o.lock);
    bar.append(tbtn(lk ? 'lock' : 'unlock', lk ? 'Unlock (Ctrl+L)' : 'Lock (Ctrl+L)', () => lockSel(!lk)));
  }
  bar.append(tbtn('magic', 'Magic box on this', () => { const b = selBox(); if (b) runMagic(sel.surf, { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 }); }));
  bar.append(tbtn('sliders', 'More options', () => openPanel('format')));
  bar.append(tbtn('dup', 'Duplicate (Ctrl+D)', duplicateSel));
  bar.append(tbtn('trash', 'Delete', deleteSel));
}
function setProp(o, k, v) {
  pushUndo();
  if (v === null && (k === 'bg' || k === 'c')) delete o[k]; else o[k] = v;
  changed(o); view.renderAll(); saveDoc('main'); updateObjbar(true); refreshFormatSoon();
}
addEventListener('resize', () => { updateObjbar(); renderSelAll(); });

/* ---------- right-click selecting, groups, locking ---------- */
let ctxSuppress = false;
// every right-click starts fresh: a menu opened by the last one must not keep the next one from getting its menu
document.addEventListener('pointerdown', (e) => { if (e.button === 2) ctxSuppress = false; }, true);
document.addEventListener('contextmenu', (e) => { if (ctxSuppress && work.contains(e.target)) e.preventDefault(); ctxSuppress = false; }, true);
/* a right-click on a part of an object that keeps the mouse to itself (calculator keys, the mind map's + and fold
   buttons, tag and pin badges, frame titles…) and that nothing else answered: the object's menu, not the browser's.
   Typing places (text fields, a box being edited) keep the browser's menu for spelling, copy and paste. */
document.addEventListener('contextmenu', (e) => {
  if (e.defaultPrevented || !cur || cur.loading || !doc || !view || !e.target.closest) return;
  const oel = e.target.closest('.obj');
  if (!oel || !work.contains(oel) || !doc.objs[oel.dataset.id]) return;
  if (e.target.closest('input,textarea,select,video,audio,[contenteditable="true"]')) return;
  e.preventDefault();
  const s = view.surfaces.find((x) => x && x.el.contains(oel)) || view.pinSurf; if (!s) return;
  const id = oel.dataset.id;
  if (!(sel.surf === s && sel.ids.has(id))) { const [ids, ink] = expandGroups([id], []); selectOnly(s, ids, ink); }
  openMenu(pointAnchor(e.clientX, e.clientY), selMenuItems());
});
const pointAnchor = (x, y) => ({ getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }), focus() {} });
function expandGroups(ids, inkIds) {
  const gids = new Set();
  for (const id of ids) { const o = doc.objs[id]; if (!o) continue; if (o.t === 'group') gids.add(o.id); else if (o.g && doc.objs[o.g] && !doc.objs[o.g].del) gids.add(o.g); }
  for (const id of inkIds || []) { const st = doc.ink[id]; if (st && st.g && doc.objs[st.g] && !doc.objs[st.g].del) gids.add(st.g); }
  const outIds = new Set(ids), outInk = new Set(inkIds || []);
  for (const g of gids) { outIds.add(g); for (const o of objList((x) => x.g === g)) outIds.add(o.id); for (const st of strokeList((x) => x.g === g)) outInk.add(st.id); }
  return [[...outIds], [...outInk]];
}
function selectInRect(s, rect) {
  const hitR = (b) => b.x < rect.x + rect.w && b.x + b.w > rect.x && b.y < rect.y + rect.h && b.y + b.h > rect.y;
  let ids = objList((o) => o.t !== 'conn' && o.t !== 'group' && s.match(o) && (o.t !== 'frame' || (o.x >= rect.x && o.y >= rect.y && o.x + o.w <= rect.x + rect.w && o.y + o.h <= rect.y + rect.h)) && hitR({ x: o.x, y: o.y, w: o.w || 0, h: o.h || 0 })).map((o) => o.id);
  let inkIds = strokeList((st) => s.match(st) && hitR(strokeBox(st))).map((st) => st.id);
  [ids, inkIds] = expandGroups(ids, inkIds);
  if (ids.length || inkIds.length) selectOnly(s, ids, inkIds); else clearSel();
}
function rightPress(s, e) {
  if (!cur || !doc) return;
  const start = s.toLocal(e.clientX, e.clientY), cx = e.clientX, cy = e.clientY;
  const oel = e.target.closest('.obj'), hit = e.target.closest('.hit');
  const txtSel = textSelectionIn(s);
  ctxSuppress = s.board || !!(oel && s.el.contains(oel)) || !!hit || !!txtSel || !e.target.closest('.flow,.otext');
  const box = h('div', { class: 'marquee', style: { borderWidth: 'calc(1.5px / var(--z,1))' } });
  let moved = false, rect = null;
  gesture.start(e, (ev) => {
    if (!moved && Math.hypot(ev.clientX - cx, ev.clientY - cy) < 5) return;
    if (!moved) { moved = true; ctxSuppress = true; s.L.others.append(box); blurEditable(); closeMenu(); }
    const p = s.toLocal(ev.clientX, ev.clientY);
    rect = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    Object.assign(box.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
  }, (ok) => {
    box.remove();
    if (moved && rect) { ctxSuppress = true; if (ok) selectInRect(s, rect); return; }
    const id = oel && s.el.contains(oel) ? oel.dataset.id : hit ? hit.dataset.id : null;
    if (id && doc.objs[id] && e.ctrlKey && !cur.ro) { ctxSuppress = true; ctrlPick(s, id); return; }
    if (id && doc.objs[id]) {
      if (!(sel.surf === s && sel.ids.has(id))) { const [ids, ink] = expandGroups([id], []); selectOnly(s, ids, ink); }
      ctxSuppress = true; openMenu(pointAnchor(cx, cy), selMenuItems());
    } else if (sel.has && sel.surf === s && inSelBox(start)) { ctxSuppress = true; openMenu(pointAnchor(cx, cy), selMenuItems()); }
    else if (txtSel && !cur.ro) { ctxSuppress = true; openMenu(pointAnchor(cx, cy), textMenuItems(txtSel)); }
    else if (!cur.ro && (s.board || !e.target.closest('.flow,.otext'))) { ctxSuppress = true; openMenu(pointAnchor(cx, cy), pageMenuItems(s, start)); }
    else if (s.board) ctxSuppress = true;
  });
}
function inSelBox(p) { const b = selBox(); return !!b && p.x >= b.x - 6 && p.x <= b.x + b.w + 6 && p.y >= b.y - 6 && p.y <= b.y + b.h + 6; }
function selMenuItems() {
  const objs = selObjs(), grps = objs.filter((o) => o.t === 'group');
  const plain = objs.filter((o) => o.t !== 'conn' && o.t !== 'group').length + sel.ink.size;
  const lk = objs.some((o) => o.lock);
  const wins = objs.filter((o) => o.t === 'm3d' || o.t === 'scr');
  const w3 = objs.length !== 1 ? (wins.length >= 2 ? multiWinItems(wins) : []) : objs[0].t === 'm3d' ? w3MenuItems(objs[0]) : objs[0].t === 'scr' ? scrMenuItems(objs[0]) : objs[0].t === 'paper' && !cur.ro ? [{ label: objDisplayName(objs[0]), header: true }, ...paperMenu(objs[0]).slice(1), { sep: true }] : [];
  if (cur.ro) return w3.concat([{ label: 'View only', header: true }]);
  const items = [];
  if (styleKindOf(objs)) items.push({ label: 'Colours…', icon: 'palette', fn: () => openStyleFor(objs) });
  const tagged = objs.find((o) => o.tag), tg = objs.filter((o) => o.t !== 'conn' && o.t !== 'group');
  if (tg.length) items.push({ label: tagged ? 'Change the tag “' + tagged.tag + '”…' : 'Tag… (jump between things with the same tag)', icon: 'tag', fn: () => tagSelection() });
  if (tagged) items.push({ label: 'Jump to the other “' + tagged.tag + '”', icon: 'tag', fn: () => tagJump(tagged.tag, { obj: tagged.id }, $('#objbar')) }, { label: 'Remove the tag', icon: 'close', fn: () => tagObjects(tg, null) });
  if (items.length) items.push({ sep: true });
  if (grps.length) items.push(...groupMenuItems(grps)); else if (plain >= 2) items.push(...groupMenuItems([]));
  const pinned = objs.some((o) => o.pin);
  items.push({ label: lk ? 'Unlock' : 'Lock', icon: lk ? 'unlock' : 'lock', fn: () => lockSel(!lk) },
    { label: pinned ? 'Unpin: put it back on the page' : 'Stay in place on screen (pin)', icon: 'pin', fn: pinned ? unpinSel : pinSel }, { sep: true },
    { label: 'Bring to front', icon: 'front', fn: () => arrange('front') }, { label: 'Bring forward', icon: 'fwd', fn: () => arrange('fwd') },
    { label: 'Send backward', icon: 'bwd', fn: () => arrange('bwd') }, { label: 'Send to back', icon: 'back', fn: () => arrange('back') });
  if (view.kind !== 'board') items.push({ label: 'In front of text', icon: 'wrap', fn: () => setWrap('front') }, { label: 'Behind text', icon: 'behind', fn: () => setWrap('back') });
  items.push({ sep: true }, { label: 'Save as a block…', icon: 'blocks', fn: saveBlockFromSel }, { label: 'Copy', icon: 'copy', fn: () => { if (copySel()) toast('Copied.'); } }, { label: 'Duplicate', icon: 'dup', fn: duplicateSel }, { label: 'Delete', icon: 'trash', danger: true, fn: deleteSel });
  return w3.concat(items);
}
function groupMenuItems(grps) {
  if (grps.length) {
    const one = grps.length === 1 ? grps[0] : null;
    return [{ label: 'Group', header: true },
      { label: 'Box around them', icon: 'frame', checked: one ? one.sty === 'box' : null, fn: () => setGroupStyle(grps, 'box') },
      { label: 'Circle around them', icon: 'shape', checked: one ? one.sty === 'circle' : null, fn: () => setGroupStyle(grps, 'circle') },
      { label: 'No outline, just move together', icon: 'move', checked: one ? one.sty === 'none' : null, fn: () => setGroupStyle(grps, 'none') },
      { label: 'Ungroup (Ctrl+Shift+G)', icon: 'group', fn: ungroupSel }, { sep: true }];
  }
  return [{ label: 'Group them', header: true },
    { label: 'Group with a box around them', icon: 'frame', fn: () => groupSel('box') },
    { label: 'Group with a circle around them', icon: 'shape', fn: () => groupSel('circle') },
    { label: 'Move together (no outline)', icon: 'move', fn: () => groupSel('none') }, { sep: true }];
}
function fitGroup(g) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of objList((x) => x.g === g.id && x.t !== 'group' && !x.pin)) { x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + (o.w || 0)); y1 = Math.max(y1, o.y + (o.h || 0)); }
  for (const st of strokeList((x) => x.g === g.id)) { const b = strokeBox(st); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  if (x0 === Infinity) return false;
  const pad = 18 * (g.sc || 1), w = x1 - x0, hh = y1 - y0;
  if (g.sty === 'circle') { const W = w * 1.42 + pad * 2, H = hh * 1.42 + pad * 2; g.x = (x0 + x1) / 2 - W / 2; g.y = (y0 + y1) / 2 - H / 2; g.w = W; g.h = H; }
  else { g.x = x0 - pad; g.y = y0 - pad; g.w = w + pad * 2; g.h = hh + pad * 2; }
  return true;
}
function refreshGroups(s) {
  for (const g of objList((x) => x.t === 'group' && s.match(x))) if (fitGroup(g)) { const el = s.objEls.get(g.id); if (el) s.place(el, g); }
}
function groupSel(sty) {
  if (!sel.has || !cur || cur.ro) return;
  const s = sel.surf;
  const objs = selObjs().filter((o) => o.t !== 'group' && o.t !== 'conn');
  const strokes = [...sel.ink].map((id) => doc.ink[id]).filter((x) => x && !x.del);
  if (objs.length + strokes.length < 2) return toast('Select at least two things to group them.');
  pushUndo();
  const old = new Set(selObjs().filter((o) => o.t === 'group').map((o) => o.id));
  for (const o of objs) if (o.g) old.add(o.g);
  for (const st of strokes) if (st.g) old.add(st.g);
  for (const gid of old) ungroupId(gid);
  const zs = objs.map((o) => o.z || 0), f = newScale();
  const g = addObj({ t: 'group', sty, x: 0, y: 0, w: 10, h: 10, z: (zs.length ? Math.min(...zs) : 0) - 0.5, sh: s.sheet, lay: objs.length ? (objs[0].lay || 'front') : 'front', sc: f !== 1 ? f : undefined });
  for (const o of objs) { o.g = g.id; changed(o); }
  for (const st of strokes) { st.g = g.id; st.u = now(); }
  normalizeZ(); view.renderAll();
  selectOnly(s, [g.id, ...objs.map((o) => o.id)], strokes.map((x) => x.id));
  saveDoc('main'); if (strokes.length) markInk();
  toast(sty === 'none' ? 'Grouped: moving one now moves them all.' : 'Grouped. Clicking any of them moves the whole group. Alt + click picks just one.', { label: 'Undo', fn: undoObjs });
}
function ungroupId(gid) {
  for (const o of objList((x) => x.g === gid)) { delete o.g; changed(o); }
  for (const st of strokeList((x) => x.g === gid)) { delete st.g; st.u = now(); }
  if (doc.objs[gid] && !doc.objs[gid].del) delObj(gid);
}
function ungroupSel() {
  if (!sel.has || cur.ro) return;
  const gids = new Set(selObjs().filter((o) => o.t === 'group').map((o) => o.id));
  for (const o of selObjs()) if (o.g) gids.add(o.g);
  if (!gids.size) return toast('Nothing here is grouped.');
  pushUndo();
  for (const g of gids) ungroupId(g);
  const s = sel.surf, ids = [...sel.ids].filter((id) => !gids.has(id)), ink = [...sel.ink];
  view.renderAll(); selectOnly(s, ids, ink); saveDoc('main'); markInk();
  toast('Ungrouped.');
}
function setGroupStyle(grps, sty) { pushUndo(); for (const g of grps) { g.sty = sty; changed(g); } view.renderAll(); saveDoc('main'); }
function lockSel(on) {
  if (!sel.has || !cur || cur.ro) return;
  pushUndo();
  for (const o of selObjs()) { if (on) o.lock = true; else delete o.lock; changed(o); }
  view.renderAll(); renderSel(sel.surf); updateObjbar(true); saveDoc('main');
  toast(on ? 'Locked: it can’t be moved, resized, edited or deleted until you unlock it.' : 'Unlocked.');
}


/* ================= Movable paper pages (A4, A3) =================
   Object type 'paper': a white sheet in true A4/A3 proportions (portrait or landscape)
   that you type on and draw on. Its inside is laid out at the real page size
   (96 dpi) and scaled with `sc`, so resizing scales the whole page.
   Whatever lies on the sheet (drawings, boxes) moves with it. */
const PAPER = { A4: [794, 1123], A3: [1123, 1587] };
const paperBase = (o) => { const [a, b] = PAPER[o.size] || PAPER.A4; return o.land ? [b, a] : [a, b]; };
const PAPER_BG = [['blank', 'Blank'], ['lined', 'Lined'], ['vlined', 'Vertical lines'], ['grid', 'Squared'], ['dots', 'Dotted']];
const PAGE_BG = PAPER_BG;
const PAPER_LINE = { lined: '#cdd6e2', vlined: '#cdd6e2', grid: '#dde3ec', dots: '#bcc4cf' };
OBJ_ICON.paper = 'a4';
const paperBgCache = new Map();
function paperBgURL(o) {
  const bg = o.pbg || 'blank'; if (bg === 'blank') return '';
  const [W, H] = paperBase(o), col = isHex(o.lc) ? o.lc : PAPER_LINE[bg] || '#cdd6e2', key = bg + W + 'x' + H + col;
  if (paperBgCache.has(key)) return paperBgCache.get(key);
  const pat = bg === 'lined' ? '<pattern id="p" width="32" height="32" y="76" patternUnits="userSpaceOnUse"><rect y="30" width="32" height="2" fill="' + col + '"/></pattern>'
    : bg === 'vlined' ? '<pattern id="p" width="32" height="32" x="72" patternUnits="userSpaceOnUse"><rect x="30" width="2" height="32" fill="' + col + '"/></pattern>'
    : bg === 'grid' ? '<pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="2" fill="' + col + '"/><rect width="2" height="32" fill="' + col + '"/></pattern>'
    : '<pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="2.2" fill="' + col + '"/></pattern>';
  const top = bg === 'lined' ? 76 : 0, left = bg === 'vlined' ? 72 : 0;
  const svgText = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><defs>' + pat + '</defs><rect x="' + left + '" y="' + top + '" width="' + (W - left) + '" height="' + (H - top) + '" fill="url(#p)"/></svg>';
  const url = 'url("data:image/svg+xml,' + encodeURIComponent(svgText) + '")';
  paperBgCache.set(key, url); return url;
}
OBJ.paper = {
  label: 'Paper page', handles: 'all', text: true, conn: true, min: 120, paper: true,
  baseW: (o) => paperBase(o)[0],
  create: () => h('div', null, h('div', { class: 'paper-in' }, textBox('Type on the page…')), h('span', { class: 'paper-tag' })),
  update(el, o) {
    const tx = el.querySelector('.otext');
    if (!el.classList.contains('editing')) tx.innerHTML = sanitize(o.html || '');
    el.dataset.bg = o.pbg || 'blank';
    el.style.backgroundImage = paperBgURL(o);
    for (const [v, k] of [['--pp-bg', 'pc'], ['--pp-ink', 'tc'], ['--pp-line', 'lc']]) { if (o[k]) el.style.setProperty(v, o[k]); else el.style.removeProperty(v); }
    el.querySelector('.paper-tag').textContent = (o.size || 'A4') + (o.land ? ' landscape' : '');
  },
};
function insertPaper(size, land) {
  const [bw, bh] = paperBase({ size, land });
  let k = 0.45;
  if (view && view.kind === 'board') { const r = view.boardEl.getBoundingClientRect(), z = view.zoom || 1; k = Math.min((r.height / z) * 0.7 / bh, (r.width / z) * 0.6 / bw, 1.5); }
  const o = insertObj({ t: 'paper', size, land: !!land, w: Math.round(bw * k), h: Math.round(bh * k), html: '', pbg: 'blank', ah: false, ...newStyleFields('paper') }, { noScale: true });
  if (!o) return;
  o.sc = o.w / bw; o.h = Math.round(bh * o.sc);
  changed(o); view.renderAll(); saveDoc('main');
  toast(size + ' page added. Click it to type, draw on it with the pen, and drag it to move it: everything on it moves along.');
}
function setPaper(o, size, land) {
  const sc = o.sc || o.w / paperBase(o)[0];
  pushUndo();
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  o.size = size; o.land = !!land;
  const [bw, bh] = paperBase(o);
  o.w = Math.round(bw * sc); o.h = Math.round(bh * sc); o.sc = o.w / bw;
  o.x = Math.round(cx - o.w / 2); o.y = Math.round(cy - o.h / 2);
  if (/^A[34] page( \d+)?$/.test(o.name || '')) o.name = uniqueName(size + ' page', o.id);
  changed(o); view.renderAll(); saveDoc('main');
}
function paperMenu(o) {
  const cur2 = (s2, l2) => (o.size || 'A4') === s2 && !!o.land === l2;
  return [{ label: 'Page size', header: true },
    { label: 'A4 portrait (upright)', checked: cur2('A4', false), fn: () => setPaper(o, 'A4', false) },
    { label: 'A4 landscape (sideways)', checked: cur2('A4', true), fn: () => setPaper(o, 'A4', true) },
    { label: 'A3 portrait (upright)', checked: cur2('A3', false), fn: () => setPaper(o, 'A3', false) },
    { label: 'A3 landscape (sideways)', checked: cur2('A3', true), fn: () => setPaper(o, 'A3', true) },
    { label: 'Background', icon: 'grid', sub: () => PAPER_BG.map(([k, l]) => ({ label: l, checked: (o.pbg || 'blank') === k, fn: () => setProp(o, 'pbg', k) })) },
    { label: 'Add a sheet next to it', icon: 'plus', sub: () => paperAddItems(o).slice(1) }];
}
function newPaperItems(size) {
  const ic = size === 'A3' ? 'a3' : 'a4';
  return [{ label: size + ' portrait (upright)', icon: ic, fn: () => insertPaper(size, false) }, { label: size + ' landscape (sideways)', icon: ic, fn: () => insertPaper(size, true) }];
}
function paperAddItems(o) {
  return [{ label: 'Add a sheet', header: true },
    { label: 'Empty sheet below', icon: 'a4', fn: () => quickPaper(o.id, 'blank', 'below') },
    { label: 'Empty sheet to the right', icon: 'a4', fn: () => quickPaper(o.id, 'blank', 'right') },
    { label: 'Copy below (with everything on it)', icon: 'copy', fn: () => quickPaper(o.id, 'copy', 'below') },
    { label: 'Copy to the right (with everything on it)', icon: 'copy', fn: () => quickPaper(o.id, 'copy', 'right') }];
}
/* things lying on a sheet: boxes above it and drawings whose middle is on it */
function paperContents(pp, ids, inkIds) {
  const inside = (b) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return cx >= pp.x && cy >= pp.y && cx <= pp.x + pp.w && cy <= pp.y + pp.h; };
  for (const q of objList((x) => x.t !== 'conn' && x.t !== 'group' && x.id !== pp.id && !ids.includes(x.id) && !x.lock && !x.pin && (x.sh || 0) === (pp.sh || 0) && (x.z || 0) > (pp.z || 0) && inside({ x: x.x, y: x.y, w: x.w || 0, h: x.h || 0 }))) ids.push(q.id);
  for (const st of strokeList((x) => !inkIds.includes(x.id) && (x.sh || 0) === (pp.sh || 0) && inside(strokeBox(x)))) inkIds.push(st.id);
}
/* ---------- copying a sheet with everything on it ---------- */
function expandWithSheets(ids, inkIds) { for (const id of [...ids]) { const pp = doc.objs[id]; if (pp && pp.t === 'paper') paperContents(pp, ids, inkIds); } }
function gatherCopy(ids, inkIds) {
  const objs = ids.map((id) => doc.objs[id]).filter((o) => o && !o.del).sort((a, b) => (a.z || 0) - (b.z || 0)).map(deep);
  const set = new Set(objs.map((o) => o.id));
  for (const c of objList((x) => x.t === 'conn' && x.a && x.b && x.a.id && x.b.id && set.has(x.a.id) && set.has(x.b.id))) if (!set.has(c.id)) objs.push(deep(c));
  const ink = inkIds.map((id) => doc.ink[id]).filter((x) => x && !x.del).map(deep);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (b) => { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); };
  for (const o of objs) if (o.t !== 'conn') grow({ x: o.x, y: o.y, w: o.w || 0, h: o.h || 0 });
  for (const st of ink) grow(strokeBox(st));
  if (x0 === Infinity) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
  for (const o of objs) {
    if (o.t === 'conn') { for (const k of ['a', 'b']) if (o[k] && !o[k].id) o[k] = { x: o[k].x - x0, y: o[k].y - y0 }; }
    else { o.x -= x0; o.y -= y0; }
  }
  for (const st of ink) st.p = st.p.map((v, i) => round1(v - (i % 2 ? y0 : x0)));
  return { objs, ink, w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}
function freeSpotRight(pp) {
  const gap = Math.round(pp.w * 0.08);
  let x = pp.x + pp.w + gap, guard = 0;
  const busy = () => objList((q) => q.t === 'paper' && q.id !== pp.id && (q.sh || 0) === (pp.sh || 0) && x < q.x + q.w && x + pp.w > q.x && pp.y < q.y + q.h && pp.y + pp.h > q.y).length;
  while (busy() && guard++ < 40) x += pp.w + gap;
  return x;
}
function freeSpotBelow(pp) {
  const gap = Math.round(pp.h * 0.05);
  let y = pp.y + pp.h + gap, guard = 0;
  const busy = () => objList((q) => q.t === 'paper' && q.id !== pp.id && (q.sh || 0) === (pp.sh || 0) && pp.x < q.x + q.w && pp.x + pp.w > q.x && y < q.y + q.h && y + pp.h > q.y).length;
  while (busy() && guard++ < 40) y += pp.h + gap;
  return y;
}
/* dir: 'right' (the default) or 'below' */
function quickPaper(id, mode, dir) {
  const pp = doc && doc.objs[id]; if (!pp || pp.del || !cur || cur.ro) return;
  const s = view.kind === 'a4' ? view.surf(pp.sh || 0) : view.surf(0);
  const below = dir === 'below', x = below ? pp.x : freeSpotRight(pp), y = below ? freeSpotBelow(pp) : pp.y;
  const show = (nid) => {
    if (view.kind === 'endless') view.layoutEndless();
    if (view.kind === 'board') view.centerOn(x + pp.w / 2, y + pp.h / 2);
    else { const el = nid && findObjEl(nid); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }
  };
  if (mode === 'blank') {
    pushUndo();
    const n = addObj({ t: 'paper', size: pp.size, land: pp.land, pbg: pp.pbg, pc: pp.pc, lc: pp.lc, tc: pp.tc, html: '', w: pp.w, h: pp.h, sc: pp.sc, x, y, sh: pp.sh, lay: pp.lay, name: (pp.size || 'A4') + ' page' });
    for (const k of ['pc', 'lc', 'tc']) if (n[k] == null) delete n[k];
    view.renderAll(); selectOnly(s, [n.id]); saveDoc('main');
    show(n.id);
    toast('New empty ' + (pp.size || 'A4') + ' sheet ' + (below ? 'below.' : 'to the right.'));
    return;
  }
  const ids = [pp.id], inkIds = []; paperContents(pp, ids, inkIds);
  const data = gatherCopy(ids, inkIds);
  const rp = data.objs.find((o) => o.id === pp.id);
  insertBlockObjects(data, { surf: s, x: x - rp.x + data.w / 2, y: y - rp.y + data.h / 2 });
  show([...sel.ids].find((i) => doc.objs[i] && doc.objs[i].t === 'paper'));
  toast('Copied the sheet with everything on it, ' + (below ? 'below.' : 'to the right.'));
}

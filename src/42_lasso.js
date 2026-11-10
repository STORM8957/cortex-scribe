/* ================= Lasso =================
   The lasso tool: draw a loop around drawings and boxes to choose them (a drawing counts when at
   least half of it is inside, a box when its middle is inside). Chosen drawings can be dragged from
   anywhere inside the selection frame (also with Select), and get a colour and thickness in the bar. */
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function strokeInPoly(st, pts) {
  const p = st.p || [], n = p.length / 2; if (!n) return false;
  const step = Math.max(1, Math.floor(n / 60)); let tot = 0, ins = 0;
  for (let i = 0; i < n; i += step) { tot++; if (inPoly(p[i * 2], p[i * 2 + 1], pts)) ins++; }
  return ins / tot >= 0.5;
}
function lassoDrag(s, e) {
  const k = s.k(), pts = [s.toLocal(e.clientX, e.clientY)];
  const g = sv('svg', { class: 'lasso-svg', 'aria-hidden': 'true' }), path = sv('path', { 'vector-effect': 'non-scaling-stroke' });
  g.append(path); s.L.others.append(g);
  const add = (ev) => { const p = s.toLocal(ev.clientX, ev.clientY), q = pts[pts.length - 1]; if (Math.hypot(p.x - q.x, p.y - q.y) * k >= 3) pts.push(p); };
  const draw = () => path.setAttribute('d', 'M' + pts.map((p) => round1(p.x) + ' ' + round1(p.y)).join('L') + 'Z');
  gesture.start(e, (ev, evs) => { for (const x of (evs && evs.length ? evs : [ev])) add(x); draw(); }, (ok) => {
    g.remove();
    if (!ok || pts.length < 4) { clearSel(); return; }
    const corners = (o) => [[o.x, o.y], [o.x + o.w, o.y], [o.x, o.y + o.h], [o.x + o.w, o.y + o.h]];
    const ids = objList((o) => o.t !== 'conn' && o.t !== 'group' && s.match(o) && (o.t === 'frame' ? corners(o).every(([x, y]) => inPoly(x, y, pts)) : inPoly(o.x + (o.w || 0) / 2, o.y + (o.h || 0) / 2, pts))).map((o) => o.id);
    const inkIds = strokeList((st) => s.match(st) && strokeInPoly(st, pts)).map((st) => st.id);
    const [a, b] = expandGroups(ids, inkIds);
    if (a.length || b.length) selectOnly(s, a, b); else clearSel();
  });
}
/* drags the whole selection when you press inside its frame (drawings have no box of their own to grab) */
function selFrameDown(s, e) {
  if (!sel.has || sel.surf !== s || !sel.ink.size || cur.ro || e.target.closest('.obj')) return false;
  if (!inSelBox(s.toLocal(e.clientX, e.clientY))) return false;
  e.preventDefault(); blurEditable();
  moveDrag(s, e, null, true, () => {});
  return true;
}
/* colour and thickness of the chosen drawings */
function setInkProp(k, v) {
  if (!doc || !sel.ink.size || cur.ro) return;
  pushUndo();
  for (const id of sel.ink) { const st = doc.ink[id]; if (st && !st.del) { st[k] = v; st.u = now(); } }
  if (sel.surf) sel.surf.renderInk(); markInk(); renderSelAll(); updateObjbar(true);
}
function inkBarButtons() {
  const one = [...sel.ink].map((id) => doc.ink[id]).find((st) => st && !st.del) || {};
  return [tbtn('palette', 'Colour of the chosen drawings', (e) => openPalette(e.currentTarget, (c) => { if (c) setInkProp('c', c); }, { colors: INK_COLORS.concat(HL_COLORS.filter((c) => !INK_COLORS.includes(c))), value: one.c }), { text: 'Ink colour' }),
    tbtn('pen', 'Thickness of the chosen drawings', (e) => openMenu(e.currentTarget, [[1.5, 'Very thin'], [3, 'Thin'], [5, 'Medium'], [8, 'Thick'], [14, 'Very thick']].map(([w, l]) => ({ label: l, checked: one.s === w, fn: () => setInkProp('s', w) }))))];
}

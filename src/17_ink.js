
/* ================= drawing on the page ================= */
const inkState = {
  color: ((c) => (!c || c === '#1E2740' ? 'var(--ink)' : c))(prefs.get('inkColor', 'var(--ink)')), size: prefs.get('inkSize', 3),
  hlColor: prefs.get('hlColor', '#FFE46B'), hlSize: prefs.get('hlSize', 18),
  auto: prefs.get('autoTidy', false),
};
let lastPen = 0;
const boxCache = new WeakMap();
function strokeBox(s) {
  const c = boxCache.get(s); if (c && c.p === s.p) return c.b;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const p = s.p || [];
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  const pad = (s.s == null ? 3 : s.s) / 2;
  const b = x0 === Infinity ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  boxCache.set(s, { p: s.p, b });
  return b;
}
function strokeD(p) {
  if (!p || p.length < 2) return '';
  if (p.length < 6) return 'M' + p[0] + ' ' + p[1] + 'L' + (p[p.length - 2] + 0.01) + ' ' + p[p.length - 1];
  let d = 'M' + p[0] + ' ' + p[1];
  for (let i = 2; i < p.length - 2; i += 2) d += 'Q' + p[i] + ' ' + p[i + 1] + ' ' + round1((p[i] + p[i + 2]) / 2) + ' ' + round1((p[i + 1] + p[i + 3]) / 2);
  return d + 'L' + p[p.length - 2] + ' ' + p[p.length - 1];
}
function drawStrokeEl(path, s) {
  path.setAttribute('d', strokeD(s.p));
  path.removeAttribute('stroke'); path.style.stroke = !s.c || s.c === '#1E2740' ? 'var(--ink)' : s.c;
  path.setAttribute('stroke-width', String(s.s || 3));
  path.setAttribute('fill', 'none'); path.setAttribute('stroke-linecap', s.k === 'hl' ? 'butt' : 'round'); path.setAttribute('stroke-linejoin', 'round');
  if (s.k === 'hl') { path.setAttribute('class', 'hl'); path.setAttribute('opacity', '0.42'); } else { path.removeAttribute('class'); path.removeAttribute('opacity'); }
  const selected = sel.ink.has(s.id);
  path.style.filter = selected ? 'drop-shadow(0 0 2px var(--accent))' : '';
}
function inkDown(s, e) {
  if (!cur || cur.ro || !doc) return;
  if (e.pointerType === 'touch' && now() - lastPen < 1500) return;
  if (e.pointerType === 'pen') lastPen = now();
  if (s.board && (e.button === 1 || spaceDown)) { startPan(e, s.view); return; }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  if (sel.has) clearSel();
  if (tool === 'eraser') return eraseDrag(s, e);
  const isHl = tool === 'hl';
  const st = { id: newId('k'), c: isHl ? inkState.hlColor : inkState.color, s: round1((isHl ? inkState.hlSize : inkState.size) * newScale()), k: isHl ? 'hl' : 'pen', sh: s.sheet, p: [] };
  const path = sv('path'); s.L.ink.append(path);
  const k = s.k();
  const add = (ev) => {
    if (ev.pointerType === 'pen') lastPen = now();
    const p = s.toLocal(ev.clientX, ev.clientY), n = st.p.length;
    if (n >= 2 && Math.hypot(p.x - st.p[n - 2], p.y - st.p[n - 1]) < 0.8 / k) return;
    st.p.push(round1(p.x), round1(p.y));
  };
  add(e); drawStrokeEl(path, st);
  gesture.start(e, (ev, evs) => { for (const x of evs) add(x); drawStrokeEl(path, st); }, (ok) => {
    path.remove();
    if (!ok || !st.p.length) return;
    if (st.p.length === 2) st.p.push(st.p[0] + 0.5, st.p[1]);
    st.p = simplifyFlat(st.p, 0.45 / k);
    pushUndo();
    audStamp(st);
    if (inkState.auto && st.k === 'pen') { const r = recognizeShape(st); if (r) { applyRecognized(s, st, r); return; } }
    st.u = now(); doc.ink[st.id] = st;
    s.renderInk(); markInk();
    if (view.kind === 'endless') view.layoutEndless();
    if (view.hint) view.hint.hidden = true;
  });
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function distToStroke(pt, st) {
  const p = st.p; let m = Infinity;
  if (p.length === 2) return Math.hypot(pt.x - p[0], pt.y - p[1]);
  for (let i = 0; i < p.length - 2; i += 2) m = Math.min(m, distSeg(pt.x, pt.y, p[i], p[i + 1], p[i + 2], p[i + 3]));
  return m;
}
function eraseDrag(s, e) {
  let any = false;
  const rad = 10 / s.k();
  const hit = (ev) => {
    const p = s.toLocal(ev.clientX, ev.clientY);
    let ch = false;
    for (const st of strokeList((x) => s.match(x) && !(x.g && doc.objs[x.g] && doc.objs[x.g].lock))) {
      const b = strokeBox(st);
      if (p.x < b.x - rad || p.x > b.x + b.w + rad || p.y < b.y - rad || p.y > b.y + b.h + rad) continue;
      if (distToStroke(p, st) <= rad + (st.s || 3) / 2) { if (!any) { pushUndo(); any = true; } doc.ink[st.id] = { id: st.id, del: true, u: now() }; ch = true; }
    }
    if (ch) s.renderInk();
  };
  hit(e);
  gesture.start(e, (ev, evs) => { for (const x of evs) hit(x); }, () => { if (any) markInk(); });
}

/* ---- simplifying and recognising strokes ---- */
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = distSeg(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]); if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function toPts(p) { const out = []; for (let i = 0; i < p.length; i += 2) out.push([p[i], p[i + 1]]); return out; }
function simplifyFlat(p, eps) { const pts = toPts(p); if (pts.length < 4) return p; return rdp(pts, eps).flat().map(round1); }
function recognizeShape(st) {
  const pts = toPts(st.p); const n = pts.length; if (n < 3) return null;
  let L = 0; for (let i = 1; i < n; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const b = strokeBox({ p: st.p, s: 0 }); const diag = Math.hypot(b.w, b.h);
  if (diag < 24) return null;
  const f = pts[0], l = pts[n - 1], gap = Math.hypot(l[0] - f[0], l[1] - f[1]);
  if (gap > 0.82 * L && gap > 30) {
    let md = 0; for (const q of pts) md = Math.max(md, distSeg(q[0], q[1], f[0], f[1], l[0], l[1]));
    if (md < Math.max(5, 0.07 * gap)) {
      let [x0, y0] = f, [x1, y1] = l;
      const ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
      for (const t of [0, 90, 180, -90, -180]) if (Math.abs(ang - t) < 6) { if (t === 0 || Math.abs(t) === 180) y1 = y0; else x1 = x0; }
      return { type: 'line', p: [x0, y0, x1, y1].map(round1) };
    }
  }
  const closed = gap < Math.max(20, 0.2 * L);
  if (!closed) return null;
  let poly = rdp(pts.concat([pts[0]]), 0.075 * diag);
  poly = poly.slice(0, -1);
  const merged = [];
  for (const q of poly) { const prev = merged[merged.length - 1]; if (!prev || Math.hypot(q[0] - prev[0], q[1] - prev[1]) > 0.14 * diag) merged.push(q); }
  if (merged.length > 3 && Math.hypot(merged[0][0] - merged[merged.length - 1][0], merged[0][1] - merged[merged.length - 1][1]) < 0.14 * diag) merged.pop();
  const c = merged.length;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2, ry = b.h / 2;
  if (c === 4) {
    const axis = merged.every((q, i) => { const r = merged[(i + 1) % 4]; const a = Math.abs(Math.atan2(r[1] - q[1], r[0] - q[0]) * 180 / Math.PI) % 90; return a < 18 || a > 72; });
    if (axis) return { type: 'shape', k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h };
    const diam = merged.every((q, i) => { const r = merged[(i + 1) % 4]; const a = Math.abs(Math.atan2(r[1] - q[1], r[0] - q[0]) * 180 / Math.PI) % 90; return a > 25 && a < 65; });
    if (diam) return { type: 'shape', k: 'diamond', x: b.x, y: b.y, w: b.w, h: b.h };
  }
  if (c === 3) {
    const top = merged.reduce((a, q) => (q[1] < a[1] ? q : a));
    if (Math.abs(top[0] - cx) < b.w * 0.22) return { type: 'shape', k: 'tri', x: b.x, y: b.y, w: b.w, h: b.h };
  }
  if (rx > 8 && ry > 8 && c > 4) {
    const ds = pts.map(([x, y]) => Math.hypot((x - cx) / rx, (y - cy) / ry));
    const mean = ds.reduce((a, v) => a + v, 0) / ds.length;
    const dev = Math.sqrt(ds.reduce((a, v) => a + (v - mean) ** 2, 0) / ds.length);
    if (dev < 0.11 && mean > 0.8) return { type: 'shape', k: 'ellipse', x: b.x, y: b.y, w: b.w, h: b.h };
  }
  if (c >= 3 && c <= 8) return { type: 'poly', p: merged.concat([merged[0]]).flat().map(round1) };
  return null;
}
function applyRecognized(s, st, r) {
  if (r.type === 'shape') {
    addObj({ t: 'shape', k: r.k, x: Math.round(r.x), y: Math.round(r.y), w: Math.max(20, Math.round(r.w)), h: Math.max(20, Math.round(r.h)), fill: null, stroke: st.c, sw: st.s, html: '', sh: st.sh, lay: 'front' });
    delete doc.ink[st.id];
    s.renderAll(); saveDoc('main');
  } else {
    st.p = r.p; st.u = now(); doc.ink[st.id] = st; s.renderInk(); markInk();
  }
}
function tidyDrawings(filterFn) {
  let n = 0;
  for (const st of strokeList((x) => x.k !== 'hl' && (!filterFn || filterFn(x)))) {
    const r = recognizeShape(st); if (!r) continue;
    n++;
    if (r.type === 'shape') {
      addObj({ t: 'shape', k: r.k, x: Math.round(r.x), y: Math.round(r.y), w: Math.max(20, Math.round(r.w)), h: Math.max(20, Math.round(r.h)), fill: null, stroke: st.c, sw: st.s, html: '', sh: st.sh, lay: 'front' });
      doc.ink[st.id] = { id: st.id, del: true, u: now() };
    } else { st.p = r.p; st.u = now(); }
  }
  return n;
}

/* ---- turning strokes into pictures for the AI ---- */
async function strokesToBlob(strokes, colored) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) { const b = strokeBox(s); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  const pd = 18, w = Math.max(1, x1 - x0) + pd * 2, hh = Math.max(1, y1 - y0) + pd * 2;
  const k = clamp(Math.min(1400 / w, 900 / hh, 3), 0.3, 3);
  const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(w * k)); c.height = Math.max(8, Math.round(hh * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, (pd - x0) * k, (pd - y0) * k);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of strokes) {
    const hex = /^#[0-9a-f]{6}$/i.test(s.c || '') ? s.c : null;
    ctx.strokeStyle = s.k === 'hl' ? (colored && hex ? hex + '70' : 'rgba(0,0,0,.15)') : (colored && hex && !/^#(1E2740|FFFFFF)$/i.test(hex) ? hex : '#111'); ctx.lineWidth = Math.max(2.5, s.s || 3);
    const p = s.p; ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    if (p.length === 2) ctx.lineTo(p[0] + 0.5, p[1]);
    ctx.stroke();
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/png'));
}
function clusterStrokes(strokes, gapX, gapY) {
  const boxes = strokes.map((s) => strokeBox(s));
  const parent = strokes.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < strokes.length; i++) for (let j = i + 1; j < strokes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x - gapX < b.x + b.w && a.x + a.w + gapX > b.x && a.y - gapY < b.y + b.h && a.y + a.h + gapY > b.y) parent[find(i)] = find(j);
  }
  const groups = new Map();
  strokes.forEach((s, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(s); });
  return [...groups.values()].sort((a, b) => strokeBox(a[0]).y - strokeBox(b[0]).y);
}

/* ================= 3D pieces: dissect, internal components, arranging, X-ray, windows for pieces =================
   Works on 3D windows (t 'm3d'). “Dissect” asks the AI (task model3d.dissect) to sort the model's numbered parts into the
   pieces the object would come apart into. Each piece becomes one of the window's linked models
   (o.links [{ name, scene, pos, piece: true }]); its parts keep their places, so pos [0, 0, 0] is “assembled”.
   “Arrange pieces” moves them: exploded view, in a row, in a grid, back together.
   “Create internal components” (task model3d.internals) adds parts inside the shape, marked { internal: true };
   X-ray (o.xray) makes the outside see-through so they show. Dissect again sorts the inside parts into pieces too.
   “3D windows for pieces” gives every piece (or the chosen ones) a 3D window of its own. */

/* every part of a window, pieces put back together (main scene first) */
function winParts(o) {
  const main = o.scene ? o.scene.parts : ((model3D(o.model) || {}).scene || {}).parts || [];
  return main.concat(...(o.links || []).filter((l) => l.piece && l.scene).map((l) => l.scene.parts));
}
/* puts the pieces back into the main model (before dissecting again or adding inside parts) */
function mergePieces(o) {
  const parts = winParts(o).map((p) => deep(p));
  o.scene = { parts }; o.links = (o.links || []).filter((l) => !l.piece);
}
/* rough size of a set of parts: rotation is ignored, which is good enough to lay pieces out */
function partsBox(parts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts || []) {
    const s = p.scale || [1, 1, 1];
    let e;
    switch (p.type) {
      case 'box': e = p.size.map((v) => v / 2); break;
      case 'plane': e = [p.size[0] / 2, p.size[1] / 2, 0.01]; break;
      case 'sphere': e = [p.r, p.r, p.r]; break;
      case 'cylinder': { const r = Math.max(p.rTop, p.rBottom); e = [r, p.h / 2, r]; break; }
      case 'cone': e = [p.r, p.h / 2, p.r]; break;
      case 'torus': e = [p.r + p.tube, p.r + p.tube, p.tube]; break;
      case 'extrude': { const xs = p.points.map((q) => Math.abs(q[0])), ys = p.points.map((q) => Math.abs(q[1])); e = [Math.max(...xs), Math.max(...ys), p.depth / 2]; break; }
      case 'lathe': { const r = Math.max(...p.points.map((q) => Math.abs(q[0]))), ys = p.points.map((q) => q[1]); e = [r, (Math.max(...ys) - Math.min(...ys)) / 2, r]; break; }
      default: e = [0.5, 0.5, 0.5];
    }
    const yOff = p.type === 'lathe' ? (Math.max(...p.points.map((q) => q[1])) + Math.min(...p.points.map((q) => q[1]))) / 2 * s[1] : 0;
    for (let k = 0; k < 3; k++) {
      const c = p.pos[k] + (k === 1 ? yOff : 0), r = Math.abs(e[k] * s[k]);
      lo[k] = Math.min(lo[k], c - r); hi[k] = Math.max(hi[k], c + r);
    }
  }
  if (lo[0] === Infinity) return null;
  return { lo, hi, c: [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2), size: [0, 1, 2].map((k) => hi[k] - lo[k]) };
}
const slimParts = (parts) => JSON.stringify(parts, (k, v) => (typeof v === 'number' ? r3(v) : v));
function afterPartsChange(id) {
  const el = findObjEl(id); if (el && el._w3 && el._w3.view) el._w3.view.refit();
  refreshWinSnapshot(id);
}
const PIECES_MIN = 2;

/* asks the AI how the parts come apart: { parts (rebuilt from components if it was one solid shape), pieces [{ name, idx }] } */
async function aiDissect(name, parts, desc) {
  if (parts.length < 3) {   // one solid shape: first rebuild it from separate components
    const sc = await aiChangeScene(name, parts, 'Rebuild this model from separate components, one part per real component (for example body, wheels, windows, handle), with a "name" on every part, so it can be taken apart. Keep the look, size and position.', desc);
    parts = sc.parts;
  }
  const list = parts.map((p, i) => i + ': ' + (p.name ? p.name + ', ' : '') + p.type + ' at ' + p.pos.map(r3).join(' ') + (p.internal ? ' (inside)' : '')).join('\n');
  const d = await AI.json('Here are the numbered parts of a 3D model of “' + name + '” (part type and position in metres, y is up):\n' + list + '\n' + descText(desc) +
    '\n\nSort them into the pieces this object would really come apart into when it is dissected, like the pieces of an exploded-view drawing. Parts that belong together (a wheel and its tyre, a piston and its rings) go in the same piece. Every part number must be in exactly one piece. Use 2 to 16 pieces, each with a short name.' +
    '\nReply with only JSON: {"pieces":[{"name":"…","parts":[0,1,2]}]}', { task: 'model3d.dissect', modelTier: 'default', cache: false });
  const pieces = normPieces(d, parts.length);
  if (pieces.length < PIECES_MIN) throw { code: 'invalid_json' };
  return { parts, pieces };
}
/* Dissect a model in the 3D studio: its pieces show as a folder under it */
async function dissect3D(m) {
  if (!m || m3dBusy) return;
  if (!aiReady()) return;
  m3dBusy = 'Taking “' + m.name + '” apart…'; render3DPanel();
  try {
    const before = m.scene.parts, r = await aiDissect(m.name, before.map((p) => deep(p)), m.desc);
    if (r.parts.length !== before.length) { m.prev = m.scene; m.scene = { parts: r.parts }; }
    m.pieces = r.pieces.map((pc) => ({ name: pc.name, idx: pc.idx })); m.u = now(); save3D();
    m3dOpen.add(m.id); m3dSub = null;
    toast('“' + m.name + '” has ' + m.pieces.length + ' pieces. They are in its folder in Assets.', { label: 'Show them', fn: () => setM3dTab('assets') });
  } catch (e) { toast(e && e.code === 'invalid_json' ? AI.name.replace(/^t/, 'T') + ' couldn’t take it apart. Try again.' : aiErrorText(e)); }
  finally { m3dBusy = null; render3DPanel(); }
}
/* Dissect: the AI sorts the parts into pieces */
async function dissectWin(id) {
  id = srcOf(id);
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  if (!aiReady()) return;
  let parts = winParts(o).map((p) => deep(p));
  if (!parts.length) return toast('This 3D window has no model to take apart.');
  const name = o.name || '3D model';
  toast('Taking “' + name + '” apart…');
  try {
    const same = JSON.stringify(parts) === JSON.stringify(((model3D(o.model) || {}).scene || {}).parts || null);
    const r = await aiDissect(name, parts, o.desc || (model3D(o.model) || {}).desc), pieces = r.pieces;
    parts = r.parts;
    const lm = same && r.parts.length === ((model3D(o.model) || {}).scene || { parts: [] }).parts.length ? model3D(o.model) : null;
    if (lm) { lm.pieces = pieces.map((pc) => ({ name: pc.name, idx: pc.idx })); lm.u = now(); save3D(); if (ptab === 'm3d') render3DPanel(); }   // the model in the 3D studio gets the same pieces
    const o2 = doc && doc.objs[id]; if (!o2) return;
    pushUndo();
    o2.scene = { parts: [] };   // the pieces hold every part now
    o2.links = (o2.links || []).filter((l) => !l.piece).concat(pieces.map((pc) => ({ name: pc.name, scene: { parts: pc.idx.map((i) => parts[i]) }, pos: [0, 0, 0], piece: true })));
    changed(o2);
    arrangeWin(id, 'explode', true);
    toast('“' + name + '” is taken apart into ' + pieces.length + ' pieces. Right-click → Pieces to arrange them or give them their own 3D windows.', { label: 'Undo', fn: undoObjs });
  } catch (e) { toast(e && e.code === 'invalid_json' ? AI.name.replace(/^t/, 'T') + ' couldn’t take it apart. Try again.' : aiErrorText(e)); }
}
/* the pieces the AI gave, checked: every part in exactly one piece (left-over parts make an extra piece) */
function normPieces(d, n) {
  const used = new Set(), out = [];
  for (const p of (d && Array.isArray(d.pieces) ? d.pieces : []).slice(0, 24)) {
    if (!p || typeof p !== 'object') continue;
    const idx = (Array.isArray(p.parts) ? p.parts : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < n && !used.has(i));
    idx.forEach((i) => used.add(i));
    if (idx.length) out.push({ name: String(p.name || 'Piece ' + (out.length + 1)).trim().slice(0, 40) || 'Piece', idx });
  }
  const rest = []; for (let i = 0; i < n; i++) if (!used.has(i)) rest.push(i);
  if (rest.length) out.push({ name: 'Other parts', idx: rest });
  return out;
}

/* Create internal components: the AI designs what is built inside */
async function internalsWin(id) {
  id = srcOf(id);
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  if (!aiReady()) return;
  const all = winParts(o); if (!all.length) return toast('This 3D window has no model yet.');
  const b = partsBox(all), name = o.name || '3D model';
  toast('Designing the parts inside “' + name + '”…');
  try {
    const d = await AI.json('Here is a 3D model of “' + name + '” as JSON:\n' + slimParts({ parts: all.filter((p) => !p.internal) }) + '\n' + descText(o.desc || (model3D(o.model) || {}).desc) +
      '\n\nIts outer shape fills about x ' + r3(b.lo[0]) + ' to ' + r3(b.hi[0]) + ', y ' + r3(b.lo[1]) + ' to ' + r3(b.hi[1]) + ', z ' + r3(b.lo[2]) + ' to ' + r3(b.hi[2]) + ' (metres).' +
      '\nDesign the internal components that would really be built inside this object (for example inside an engine: cylinders, pistons, connecting rods, crankshaft, valves, camshaft). Give every part a "name". They must fit inside the outer shape and must not repeat the outer parts. Use 4 to 40 parts.\n' + sceneSpec() +
      '\nReply with only JSON: {"parts":[…]}', m3dOpts('model3d.internals'));
    const sc = normScene({ name, parts: d && d.parts });
    if (!sc) throw { code: 'invalid_json' };
    const o2 = doc && doc.objs[id]; if (!o2) return;
    pushUndo();
    const had = (o2.links || []).some((l) => l.piece);
    mergePieces(o2);
    o2.scene.parts = o2.scene.parts.concat(sc.parts.map((p) => ({ ...p, internal: true })));
    o2.xray = true; changed(o2); view.renderAll(); saveDoc('main'); afterPartsChange(id);
    toast('Added ' + sc.parts.length + ' parts inside. X-ray is on so you can see them' + (had ? '; the pieces were put back together' : '') + '. Dissect splits them into pieces.', { label: 'Undo', fn: undoObjs });
  } catch (e) { toast(e && e.code === 'invalid_json' ? AI.name.replace(/^t/, 'T') + ' didn’t design any parts. Try again.' : aiErrorText(e)); }
}

/* Arrange the pieces (and linked models): 'explode', 'row', 'grid' or 'together' */
function arrangeWin(id, how, quiet) {
  id = srcOf(id);
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  const list = (o.links || []).filter((l) => l.scene && l.scene.parts && l.scene.parts.length && (how !== 'explode' && how !== 'together' ? true : l.piece));
  if (!list.length) { if (!quiet) toast('Nothing to arrange yet. Dissect the model first, or link other models.'); return; }
  if (!quiet) pushUndo();
  if (how === 'together') for (const l of list) l.pos = [0, 0, 0];
  else if (how === 'explode') {
    const boxes = list.map((l) => partsBox(l.scene.parts)), all = partsBox(list.flatMap((l) => l.scene.parts));
    const big = Math.max(...all.size, 0.5);
    list.forEach((l, i) => {
      const bx = boxes[i]; let d = bx.c.map((v, k) => v - all.c[k]);
      let len = Math.hypot(...d);
      if (len < big * 0.04) { const a = (i / list.length) * Math.PI * 2; d = [Math.cos(a), 0.35, Math.sin(a)]; len = Math.hypot(...d); }   // pieces in the middle go round in a circle
      l.pos = d.map((v) => r3(v / len * big * 0.55));
    });
  } else {
    const boxes = list.map((l) => partsBox(l.scene.parts));
    const main = o.scene && o.scene.parts && o.scene.parts.length ? partsBox(o.scene.parts) : null;
    const gap = Math.max(0.25, Math.max(...boxes.map((b) => Math.max(b.size[0], b.size[2]))) * 0.3);
    const cols = how === 'grid' ? Math.ceil(Math.sqrt(list.length)) : list.length;
    let x = main ? main.hi[0] + gap : 0, z = 0, rowDepth = 0, col = 0;
    const startX = x;
    list.forEach((l, i) => {
      const b = boxes[i];
      if (col === cols) { col = 0; x = startX; z += rowDepth + gap; rowDepth = 0; }
      const cx = x + b.size[0] / 2;
      l.pos = [r3(cx - b.c[0]), r3(-b.lo[1]), r3(z + b.size[2] / 2 - b.c[2])];
      x += b.size[0] + gap; rowDepth = Math.max(rowDepth, b.size[2]); col++;
    });
  }
  changed(o); view.renderAll(); saveDoc('main'); afterPartsChange(id);
  if (!quiet) toast({ explode: 'Exploded view: the pieces are pulled apart.', row: 'The pieces are lined up in a row.', grid: 'The pieces are laid out in a grid.', together: 'The pieces are put back together.' }[how], { label: 'Undo', fn: undoObjs });
}

/* 3D windows for pieces: all of them (which = null) or the chosen link numbers */
function pieceWindows(id, which) {
  id = srcOf(id);
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  const ls = (o.links || []).map((l, i) => ({ l, i })).filter((x) => x.l.scene && x.l.scene.parts && x.l.scene.parts.length && (!which || which.includes(x.i)));
  if (!ls.length) return toast('No pieces yet: Dissect the model first (or link other models).');
  pushUndo();
  const k = o.sc || 1, W = Math.round(240 * k), H = Math.round(190 * k), gap = Math.round(24 * k);
  const s = view.kind === 'a4' ? view.surf(o.sh || 0) : view.surf(0);
  const ids = [];
  // free spots in a grid: beside the window on a board, below it on a page; never on top of something already there
  const board = view.kind === 'board', sw = (s && s.el.offsetWidth) || 800;
  const cols = board ? Math.min(4, Math.ceil(Math.sqrt(ls.length))) : Math.max(1, Math.floor((sw - 40) / (W + gap)));
  const x0 = board ? o.x + o.w + gap : 20, y0 = board ? o.y : o.y + o.h + gap;
  const busy = (x, y) => objList((q) => q.t !== 'conn' && q.t !== 'group' && !q.pin && (q.sh || 0) === (o.sh || 0)).some((q) => x < q.x + (q.w || 0) && x + W > q.x && y < q.y + (q.h || 0) && y + H > q.y);
  let slot = 0;
  for (const x of ls) {
    let px, py;
    do { px = Math.round(x0 + (slot % cols) * (W + gap)); py = Math.round(y0 + Math.floor(slot / cols) * (H + gap)); slot++; } while (busy(px, py) && slot < 400);
    ids.push(addObj({ t: 'm3d', name: x.l.name || 'Piece', scene: deep(x.l.scene), links: [], w: W, h: H, sc: o.sc, x: px, y: py, sh: o.sh, lay: o.lay, xray: o.xray, spin: o.spin, spinSpeed: o.spinSpeed }).id);
  }
  view.renderAll(); saveDoc('main');
  if (s) selectOnly(s, ids);
  ids.forEach((nid) => refreshWinSnapshot(nid));
  toast(ids.length === 1 ? 'Made a 3D window for “' + ls[0].l.name + '”.' : 'Made ' + ids.length + ' 3D windows, one for each piece.', { label: 'Undo', fn: undoObjs });
}
function choosePiecesModal(id) {
  id = srcOf(id);
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  const ls = (o.links || []).map((l, i) => ({ l, i })).filter((x) => x.l.scene && x.l.scene.parts && x.l.scene.parts.length);
  if (!ls.length) return toast('No pieces yet: Dissect the model first (or link other models).');
  const boxes = ls.map((x) => { const c = h('input', { type: 'checkbox', checked: true, value: String(x.i) }); return { c, row: h('label', { class: 'opt' }, c, (x.l.name || 'Piece') + (x.l.piece ? '' : ' (linked model)') + ' · ' + x.l.scene.parts.length + ' parts') }; });
  const all = h('button', { class: 'btn small ghost', onclick: () => { const on = !boxes.every((b) => b.c.checked); boxes.forEach((b) => { b.c.checked = on; }); } }, 'All / none');
  modal({ title: 'Which pieces get a 3D window?', body: [h('div', { class: 'piece-list' }, ...boxes.map((b) => b.row)), all], actions: [
    { label: 'Cancel' },
    { label: 'Make the windows', kind: 'primary', fn: () => { const which = boxes.filter((b) => b.c.checked).map((b) => +b.c.value); if (!which.length) { toast('Tick at least one piece.'); return false; } pieceWindows(id, which); } }] });
}

/* the Pieces menu: the window's Dissect button and right-click → Pieces */
function piecesItems(o) {
  const pcs = (o.links || []).filter((l) => l.piece).length, assets = (o.links || []).filter((l) => l.scene && l.scene.parts && l.scene.parts.length).length;
  return [
    { label: pcs ? 'Dissect again (AI)' : 'Dissect: take it apart into pieces (AI)', icon: 'dissect', fn: () => dissectWin(o.id) },
    { label: 'Create internal components (AI)', icon: 'cog', fn: () => internalsWin(o.id) },
    { label: 'See inside (X-ray)', checked: !!o.xray, fn: () => setOpt(o, 'xray', !o.xray) },
    { sep: true },
    { label: 'Arrange the pieces' + (assets ? '' : ' (dissect first)'), icon: 'grid', sub: () => [
      { label: 'Exploded view', fn: () => arrangeWin(o.id, 'explode') },
      { label: 'In a row', fn: () => arrangeWin(o.id, 'row') },
      { label: 'In a grid', fn: () => arrangeWin(o.id, 'grid') },
      { label: 'Put back together', fn: () => arrangeWin(o.id, 'together') }] },
    { label: 'A 3D window for every piece' + (assets ? ' (' + assets + ')' : ''), icon: 'cube', fn: () => pieceWindows(o.id, null) },
    { label: 'Choose pieces for 3D windows…', icon: 'blocks', fn: () => choosePiecesModal(o.id) },
  ];
}
/* the Dissect button: takes the model apart; once it is in pieces, it shows the Pieces menu */
function piecesMenu(anchor, id) {
  const o = doc && doc.objs[srcOf(id)]; if (!o || cur.ro) return;
  if (!(o.links || []).some((l) => l.piece)) return dissectWin(o.id);
  openMenu(anchor, [{ label: 'Pieces of “' + (o.name || '3D model') + '”', header: true }, ...piecesItems(o)]);
}

/* ---------- the 3D studio list: this page's models, each with its pieces (or parts) as a folder;
   models of other pages in an “Other pages” folder ---------- */
let m3dPage = null, m3dSub = null, m3dShowOther = false;   // m3dSub: { id, kind: 'piece' | 'part', i } shown in the studio
const m3dOpen = new Set();   // models whose folder is open
/* a model is on this page when it was made here or a 3D window on this page shows it */
function models3DHere() {
  if (!cur) return [];
  const used = new Set(objList((o) => o.t === 'm3d' && o.model).map((o) => o.model));
  return lib3d.items.filter((m) => m.page === cur.id || used.has(m.id));
}
const subCache = new Map();
/* the piece or part of a model chosen in the list: { kind, name, scene, key } (scenes kept, so the 3D view can reuse them) */
function studioSub(m) { const s = m3dSub; return s && s.id === m.id ? subFor(m, s.kind, s.i) : null; }
/* piece i or part i of a model: { kind, name, scene, key }, or null */
function subFor(m, kind, n) {
  const key = m.id + ':' + m.u + ':' + kind + ':' + n;
  if (!subCache.has(key)) {
    let v = null;
    if (kind === 'piece' && m.pieces && m.pieces[n]) { const pc = m.pieces[n]; v = { kind: 'piece', name: pc.name, scene: { parts: pc.idx.map((i) => m.scene.parts[i]).filter(Boolean) }, key }; }
    else if (kind === 'part' && m.scene.parts[n]) { const pt = m.scene.parts[n]; v = { kind: 'part', name: pt.name || pt.type + ' ' + (n + 1), scene: { parts: [pt] }, key }; }
    if (!v || !v.scene.parts.length) return null;
    if (subCache.size > 60) subCache.clear();
    subCache.set(key, v);
  }
  return subCache.get(key);
}
function studioModelRow(m) {
  const open = m3dOpen.has(m.id), kids = m.pieces ? m.pieces.length : m.scene.parts.length;
  const row = h('div', { class: 'm3d-row' },
    h('button', { class: 'icon-btn m3d-tog', 'aria-label': (open ? 'Close' : 'Open') + ' the parts of ' + m.name, 'aria-expanded': String(open), title: m.pieces ? 'Pieces' : 'Parts', onclick: () => { if (open) m3dOpen.delete(m.id); else m3dOpen.add(m.id); render3DPanel(); } }, svg(open ? 'chevD' : 'chevR')),
    h('button', { class: 'ol-item', 'aria-current': m.id === m3dCur && !m3dSub ? 'true' : null, title: 'Show it in Preview', onclick: () => { m3dCur = m.id; m3dSub = null; setM3dTab('preview'); } },
      svg('cube'), h('span', null, m.name + ' · ' + (m.pieces ? m.pieces.length + ' pieces' : m.scene.parts.length + ' parts') + ((m.links || []).length ? ', ' + m.links.length + ' linked' : ''))));
  const out = [row];
  if (open) {
    const box = h('div', { class: 'm3d-kids', role: 'group', 'aria-label': (m.pieces ? 'Pieces' : 'Parts') + ' of ' + m.name });
    const pick = (kind, i) => () => { m3dCur = m.id; m3dSub = { id: m.id, kind, i }; setM3dTab('preview'); };
    const zoom = (kind, i, name) => h('button', { class: 'icon-btn m3d-zoom', 'aria-label': 'Close-up view of ' + name, title: 'Close-up view: a view window of just this ' + kind + ' (Preview)', onclick: () => addView(m, kind, i) }, svg('zin'));
    const kid = (kind, i, icon, label) => h('div', { class: 'm3d-kid' }, h('button', { class: 'ol-item sub', 'aria-current': on(kind, i), onclick: pick(kind, i) }, svg(icon), h('span', null, label)), zoom(kind, i, label));
    const on = (kind, i) => (m3dSub && m3dSub.id === m.id && m3dSub.kind === kind && m3dSub.i === i ? 'true' : null);
    if (m.pieces) m.pieces.forEach((pc, i) => box.append(kid('piece', i, 'dissect', pc.name + ' · ' + pc.idx.length + ' parts')));
    else {
      m.scene.parts.slice(0, 80).forEach((pt, i) => box.append(kid('part', i, pt.internal ? 'cog' : 'cube', (pt.name || pt.type + ' ' + (i + 1)) + (pt.internal ? ' (inside)' : ''))));
      if (kids > 80) box.append(h('p', { class: 'hint' }, '… and ' + (kids - 80) + ' more parts'));
      box.append(h('p', { class: 'hint m3d-kids-hint' }, 'Dissect groups these parts into the pieces it comes apart into.'));
    }
    out.push(box);
  }
  return out;
}
function studioModelList(p, here) {
  p.append(h('h3', null, 'Models on this page'));
  if (here.length) for (const m of here) p.append(...studioModelRow(m));
  else p.append(h('p', { class: 'hint' }, 'None yet. Make one above, or open one from another page below.'));
  const others = lib3d.items.filter((m) => !here.includes(m));
  if (!others.length) return;
  p.append(h('button', { class: 'ol-item m3d-folder', id: 'm3dOther', 'aria-expanded': String(m3dShowOther), onclick: () => { m3dShowOther = !m3dShowOther; render3DPanel(); } },
    svg(m3dShowOther ? 'chevD' : 'chevR'), svg('folder'), h('span', null, 'Other pages · ' + others.length + ' model' + (others.length > 1 ? 's' : ''))));
  if (!m3dShowOther) return;
  const groups = new Map();
  for (const m of others) { const n = m.page && tree.nodes[m.page] && !tree.nodes[m.page].deleted ? tree.nodes[m.page].name : 'Earlier models'; if (!groups.has(n)) groups.set(n, []); groups.get(n).push(m); }
  const box = h('div', { class: 'm3d-other' });
  for (const [n, ms] of groups) { box.append(h('p', { class: 'm3d-page' }, svg('page'), n)); for (const m of ms) box.append(...studioModelRow(m)); }
  p.append(box);
}

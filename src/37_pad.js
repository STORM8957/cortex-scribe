/* ================= Handwriting pad extras =================
   1. The side panel can be made wider (drag its left edge) and the pad taller (drag the bar under it).
   2. Pad settings (⚙): what “Insert drawing” makes (a picture or pen lines), white or see-through
      background for pictures, pad size, panel width.
   3. “Insert drawing” puts the sketch on the page as it is, without AI.
   4. ↑ / ↓ move where the pad writes: to the line above or below (pages) or the box above or below (boards).
   5. Pad on another screen: a whole tab, window, phone or laptop becomes the drawing pad (pad mode).
      The notebook ('main') and the pad ('pad') talk through PadLink (11b_platform.js) with these messages:
        pad → main  { t: 'hello', dev }                       the pad is here (repeated until it gets a state)
                    { t: 'ink', id, act, strokes, space, as, bg, dev }
                        act 'text' (read handwriting), 'picture' (AI picture), 'insert' (as drawn), '3d'
                        strokes [{ c: colour or 'ink', w: width, p: [x, y, x, y, …] }] in pad pixels
                    { t: 'key', k: 'space' | 'enter' | 'back' }   { t: 'move', dir: -1 | 1 }   { t: 'bye' }
        main → pad  { t: 'state', page, target, ai, done?: id, msg? }   { t: 'bye' }
      The notebook also saves 'padlink' { code, t, page, session } in Store, so another device signed in to
      the same account can offer “Use this screen as the drawing pad”. A tab opened with #pad=<code> starts
      in pad mode straight away. */

/* ---------- 1. panel width and pad height ---------- */
const PANEL_MIN = 300, PANEL_MAX = 760, PAD_MIN = 140, PAD_MAX = 760;
function applyPanelWidth() {
  const w = prefs.get('panelW', null);
  if (w) { app.style.setProperty('--panelW', w + 'px'); app.style.setProperty('--panelIn', w + 'px'); app.classList.add('custom-pw'); }
  else { app.style.removeProperty('--panelW'); app.style.removeProperty('--panelIn'); app.classList.remove('custom-pw'); }
}
function setPanelWidth(w) {
  prefs.set('panelW', w == null ? null : clamp(Math.round(w), PANEL_MIN, Math.max(PANEL_MIN, Math.min(PANEL_MAX, innerWidth - 420))));
  applyPanelWidth();
}
function applyPadHeight() { const hh = prefs.get('padH', null); pad.cv.style.height = hh ? hh + 'px' : ''; raf(padResize); }
const applyPadGuide = () => $('#ptab-pen .pad-wrap').classList.toggle('guide', !!prefs.get('padGuide', false));   // the writing line (off unless chosen)
const setPadHeight = (hh) => { prefs.set('padH', hh == null ? null : clamp(Math.round(hh), PAD_MIN, PAD_MAX)); applyPadHeight(); };
const panelGrip = h('div', { class: 'panel-grip', role: 'separator', tabindex: '0', 'aria-orientation': 'vertical', 'aria-label': 'Panel width. Drag, or use the arrow keys.', title: 'Drag to make the panel wider or narrower. Double-click: normal width.' });
$('#panel').append(panelGrip);
panelGrip.addEventListener('pointerdown', (e) => {
  if (isMobile() || e.button !== 0) return;
  e.preventDefault();
  const x0 = e.clientX, w0 = $('#panel').getBoundingClientRect().width;
  app.classList.add('resizing');
  gesture.start(e, (ev) => setPanelWidth(w0 + (x0 - ev.clientX)), () => { app.classList.remove('resizing'); padResize(); updateObjbar(); renderSelAll(); });
});
panelGrip.addEventListener('dblclick', () => { setPanelWidth(null); setTimeout(padResize, 260); });
panelGrip.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault(); setPanelWidth($('#panel').getBoundingClientRect().width + (e.key === 'ArrowLeft' ? 24 : -24)); setTimeout(padResize, 260);
});
const padGrip = h('div', { class: 'pad-grip', role: 'separator', tabindex: '0', 'aria-orientation': 'horizontal', 'aria-label': 'Pad height. Drag, or use the arrow keys.', title: 'Drag to make the pad taller or shorter. Double-click: normal height.' }, h('span'));
$('#ptab-pen .pad-wrap').after(padGrip);
padGrip.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  const y0 = e.clientY, h0 = pad.cv.getBoundingClientRect().height;
  gesture.start(e, (ev) => setPadHeight(h0 + ev.clientY - y0), () => {});
});
padGrip.addEventListener('dblclick', () => setPadHeight(null));
padGrip.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault(); setPadHeight(pad.cv.getBoundingClientRect().height + (e.key === 'ArrowDown' ? 20 : -20));
});

/* ---------- drawings as they are (no AI) ---------- */
function strokesBox(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) { const r = (s.w || 3.6) / 2; for (const [x, y] of s.pts) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); } }
  return x0 === Infinity ? null : { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
/* bg '#ffffff' or null (see-through); k = pixels per pad pixel */
function renderStrokes(strokes, bg, k = 2, margin = 10) {
  const b = strokesBox(strokes);
  const c = document.createElement('canvas');
  c.width = Math.max(4, Math.round((b.w + margin * 2) * k)); c.height = Math.max(4, Math.round((b.h + margin * 2) * k));
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.setTransform(k, 0, 0, k, (margin - b.x) * k, (margin - b.y) * k);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const ink = bg ? '#111111' : (cssVar('--ink') || '#111111');
  for (const s of strokes) { const col = !s.c || s.c === 'ink' ? ink : s.c; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = s.w || 3.6; padStroke(ctx, s); }
  return c;
}
async function padInsertDrawing(strokes, opts = {}) {
  const local = !strokes;
  strokes = strokes || pad.strokes;
  if (!strokes.length) { if (local) padState('Draw something on the pad first.'); return false; }
  if (!cur || !doc || !view || cur.ro || cur.loading) { toast('Open a page you can edit first.'); return false; }
  const as = opts.as || prefs.get('padInsertAs', 'picture'), bg = opts.bg || prefs.get('padBg', 'white');
  const b = strokesBox(strokes);
  if (as === 'ink') {
    const f = newScale();
    const at = placeNew(b.w * f, b.h * f);
    pushUndo();
    for (const s of strokes) {
      const p = [];
      for (const [x, y] of s.pts) p.push(round1(at.x + (x - b.x) * f), round1(at.y + (y - b.y) * f));
      if (p.length === 2) p.push(p[0] + 0.5, p[1]);
      const id = newId('k');
      doc.ink[id] = { id, c: !s.c || s.c === 'ink' ? 'var(--ink)' : s.c, s: round1((s.w || 3.6) * f), k: 'pen', sh: at.surf.sheet, p, u: now() };
    }
    view.renderAll(); markInk();
    if (view.kind === 'endless') view.layoutEndless();
  } else {
    const c = renderStrokes(strokes, bg === 'white' ? '#ffffff' : null, 2);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) { toast('The drawing couldn’t be made into a picture.'); return false; }
    const src = await storeBlobSrc(blob);
    const W = Math.min(view.kind === 'a4' ? 420 : 460, Math.round(c.width / 2)), H = Math.round(W * c.height / c.width);
    const o = insertObj({ t: 'image', w: W, h: H, src, alt: 'Drawing' });
    if (o) blobCache.set(o.id, blob);
  }
  if (local) { clearTimeout(pad.timer); pad.strokes = []; padDraw(); padState(''); $('#padLast').textContent = 'Drawing added to the page.'; }
  return true;
}
/* background of AI pictures (Drawing → picture): the rule for the model and a clean-up of its SVG */
const padBgRule = () => (prefs.get('padBg', 'white') === 'clear'
  ? 'Do not draw any background: no rectangle behind the picture, leave everything around the subject transparent.'
  : 'Give the picture a plain white background.');
function padSvgBg(svgText) {
  if (!svgText) return svgText;
  const clear = prefs.get('padBg', 'white') === 'clear';
  const d = new DOMParser().parseFromString(svgText, 'image/svg+xml'), root = d.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') return svgText;
  const vb = (root.getAttribute('viewBox') || '0 0 600 450').trim().split(/[\s,]+/).map(Number);
  const covers = (el) => {
    if (!el || el.nodeName.toLowerCase() !== 'rect') return false;
    const pct = (v, total) => (/%$/.test(v || '') ? parseFloat(v) / 100 * total : parseFloat(v || '0'));
    const x = pct(el.getAttribute('x'), vb[2]), y = pct(el.getAttribute('y'), vb[3]), w = pct(el.getAttribute('width'), vb[2]), hh = pct(el.getAttribute('height'), vb[3]);
    return x <= vb[0] + vb[2] * 0.05 && y <= vb[1] + vb[3] * 0.05 && w >= vb[2] * 0.9 && hh >= vb[3] * 0.9;
  };
  const light = (el) => { const f = String(el.getAttribute('fill') || (el.style && el.style.fill) || '#000').trim().toLowerCase(); if (/^(white|#fff|#ffffff|#fefefe|#fdfdfd|#fafafa|#f8f8f8|#f5f5f5)$/.test(f)) return true; const m = f.match(/^#([0-9a-f]{6})$/); if (!m) return false; const n = parseInt(m[1], 16); return ((n >> 16) & 255) > 230 && ((n >> 8) & 255) > 230 && (n & 255) > 230; };
  const firstShape = [...root.children].find((c) => !/^(defs|title|desc|style|metadata)$/i.test(c.nodeName));
  if (clear) { if (covers(firstShape) && light(firstShape)) firstShape.remove(); else return svgText; }
  else {
    if (covers(firstShape)) return svgText;
    const r = d.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', String(vb[0])); r.setAttribute('y', String(vb[1])); r.setAttribute('width', String(vb[2])); r.setAttribute('height', String(vb[3])); r.setAttribute('fill', '#ffffff');
    root.insertBefore(r, firstShape || null);
  }
  return new XMLSerializer().serializeToString(root);
}

/* ---------- 4. where the pad writes ---------- */
const PAD_BLOCKS = 'p,h1,h2,h3,h4,li,blockquote,pre';
function padTextTargets() {
  if (!view) return [];
  if (view.kind === 'board') return objList((o) => OBJ[o.t] && OBJ[o.t].text && !o.pin).sort((a, b) => a.y - b.y || a.x - b.x).map((o) => ({ obj: o }));
  const out = [];
  for (const s of view.surfaces) if (s && s.L.flow) for (const b of s.L.flow.querySelectorAll(PAD_BLOCKS)) if (!b.querySelector(PAD_BLOCKS)) out.push({ el: b, flow: s.L.flow });
  return out;
}
function padTargetIndex(list) {
  if (!view) return -1;
  if (view.kind === 'board') {
    const id = editing ? editing.id : sel.has && selObjs().length === 1 ? selObjs()[0].id : null;
    return list.findIndex((t) => t.obj.id === id);
  }
  if (!savedRange || !activeEd || !activeEd.classList.contains('flow')) return -1;
  const n = savedRange.startContainer;
  return list.findIndex((t) => t.el === n || t.el.contains(n));
}
const snip = (t) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > 34 ? t.slice(0, 33) + '…' : t; };
const boxLabel = (o) => 'Box “' + snip((o && htmlStrToText(o.html || '').trim()) || (o ? objDisplayName(o) : 'box')) + '”';
function padTargetLabel() {
  if (!cur || !view || !doc) return 'Open a page first';
  if (cur.ro) return 'This page is view only';
  if (activeEd && activeEd.isConnected && activeEd.classList.contains('otext')) { const el = activeEd.closest('.obj'); return boxLabel(el && doc.objs[el.dataset.id]); }
  const list = padTextTargets(), i = padTargetIndex(list);
  if (view.kind === 'board') return i >= 0 ? boxLabel(list[i].obj) : 'A new note box';
  if (i < 0) return 'The end of the page';
  return 'Line ' + (i + 1) + ' of ' + list.length + (list[i].el.textContent.trim() ? ': “' + snip(list[i].el.textContent) + '”' : ' (empty line)');
}
function movePadTarget(dir) {
  if (!cur || !view || !doc || cur.ro) return;
  const list = padTextTargets();
  if (view.kind === 'board') {
    if (!list.length) return toast('There’s no text box on this board yet. Write, and the pad makes one.');
    let i = padTargetIndex(list); i = i < 0 ? (dir > 0 ? 0 : list.length - 1) : clamp(i + dir, 0, list.length - 1);
    const o = list[i].obj;
    if (editing) exitEdit();
    activeEd = null; savedRange = null;
    selectOnly(view.surf(0), [o.id]); view.centerOn(o.x + (o.w || 0) / 2, o.y + (o.h || 0) / 2);
    const el = view.surf(0).objEls.get(o.id); if (el) flashEl(el);
  } else {
    if (!list.length) return;
    let i = padTargetIndex(list);
    if (i === list.length - 1 && dir > 0) { padEnter(); updatePadTarget(); return; }   // below the last line: a new line
    i = i < 0 ? list.length - 1 : clamp(i + dir, 0, list.length - 1);
    const t = list[i], r = document.createRange();
    r.selectNodeContents(t.el); r.collapse(false);
    if (document.activeElement && document.activeElement !== t.flow && isTyping(document.activeElement)) document.activeElement.blur();
    setPadCaret(t.flow, r);
    t.el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    flashEl(t.el);
  }
  updateGhostCaret(); updatePadTarget();
}

/* ---------- 2. the row above the pad: settings, other screen, ↑ ↓ ---------- */
const padTop = h('div', { class: 'pad-top' });
const padTargetEl = h('p', { class: 'pad-target', 'aria-live': 'polite' });
$('#padTools').before(padTop);
$('#ptab-pen .pad-wrap').before(padTargetEl);
function renderPadTop() {
  padTop.textContent = '';
  const linked = !!padSess, peer = linked && padSess.peer;
  padTop.append(
    h('button', { class: 'btn small', id: 'padSetBtn', title: 'Pad settings', onclick: (e) => padSettingsPop(e.currentTarget) }, svg('cog'), 'Settings'),
    h('button', { class: 'btn small' + (linked ? ' linked' : ''), id: 'padSyncBtn', title: peer ? 'The pad on another screen is connected' : linked ? 'Waiting for the pad on another screen' : 'Use a whole tab, window, phone or laptop as the drawing pad', onclick: padSyncModal }, svg('screen'), peer ? 'Pad linked' : linked ? 'Waiting…' : 'Other screen'),
    h('span', { class: 'pad-arrows' },
      h('button', { class: 'icon-btn', id: 'padUp', 'aria-label': 'Write on the line above', title: 'Write on the line above (or the box above)', onclick: () => movePadTarget(-1) }, svg('chevD', 'flip')),
      h('button', { class: 'icon-btn', id: 'padDown', 'aria-label': 'Write on the line below', title: 'Write on the line below (or the box below)', onclick: () => movePadTarget(1) }, svg('chevD'))));
}
let padTargetT = null;
function updatePadTarget() {
  clearTimeout(padTargetT);
  padTargetT = setTimeout(() => {
    padTargetEl.textContent = 'Writes into: ' + padTargetLabel();
    if (padSess && padSess.peer) padSendState();
  }, 120);
}
document.addEventListener('selectionchange', () => { if ((ptab === 'pen' && panelShown()) || (padSess && padSess.peer)) updatePadTarget(); });
document.addEventListener('pointerup', () => { if (padSess && padSess.peer) updatePadTarget(); }, true);
function padSettingsPop(anchor) {
  const box = h('div');
  const chips = (key, def, opts, after) => h('div', { class: 'btnrow' }, opts.map(([v, l]) => h('button', { class: 'chip', 'aria-pressed': String(prefs.get(key, def) === v), onclick: () => { prefs.set(key, v); if (after) after(v); padSettingsPop(anchor); } }, l)));
  const curH = prefs.get('padH', null), sq = () => Math.round(pad.cv.getBoundingClientRect().width);
  box.append(
    h('h4', null, '“Insert drawing” puts it on the page as'),
    chips('padInsertAs', 'picture', [['picture', 'A picture'], ['ink', 'Pen lines you can edit']]),
    h('h4', null, 'Background of pictures'),
    chips('padBg', 'white', [['white', 'Keep it white'], ['clear', 'See-through']]),
    h('p', { class: 'hint' }, 'For “Insert drawing” as a picture and for “Drawing → picture”.'),
    h('h4', null, 'Pad size'),
    h('div', { class: 'btnrow' }, [['Small', 200], ['Normal', null], ['Tall', 420], ['Square', 'sq']].map(([l, v]) => h('button', { class: 'chip', 'aria-pressed': String(v === 'sq' ? curH === sq() : curH === v), onclick: () => { setPadHeight(v === 'sq' ? sq() : v); padSettingsPop(anchor); } }, l))),
    h('p', { class: 'hint' }, 'Or drag the bar under the pad. Drag the left edge of the panel to make it wider.'),
    h('h4', null, 'Writing lines'),
    chips('padGuide', false, [[false, 'No lines'], [true, 'Show lines']], applyPadGuide),
    h('div', { class: 'btnrow' }, h('button', { class: 'btn small', onclick: () => { setPanelWidth(null); setTimeout(padResize, 260); } }, 'Normal panel width')),
    h('h4', null, 'Write on another screen'),
    h('div', { class: 'btnrow' }, h('button', { class: 'btn small primary', onclick: () => { closeMenu(); padSyncModal(); } }, svg('screen'), 'Pad on another screen…')));
  openPop(anchor, box, 'Pad settings');
}
/* the pad keys as tiles: an icon on top, what it does underneath; Space and New line stand out */
const padKeys = $('#ptab-pen .pad-keys');
padKeys.append(
  h('button', { class: 'btn', id: 'kInsert', title: 'Put the drawing on the page as it is (no AI)', onclick: () => padInsertDrawing() }, 'Insert drawing'),
  h('button', { class: 'btn', id: 'kUndo', title: 'Remove the last line you drew on the pad', onclick: () => { if (pad.busy && pad.sending >= pad.strokes.length) return; pad.strokes.pop(); padDraw(); } }, 'Undo line'));
function pkey(btn, icon, label, cls) {
  if (!btn.title) btn.title = btn.textContent.trim();
  btn.textContent = ''; btn.classList.add('pkey', ...(cls ? cls.split(' ') : []));
  btn.append(svg(icon), h('span', null, label));
  return btn;
}
{
  const B = Object.fromEntries(['kType', 'kImg', 'kSpace', 'kEnter', 'kBack', 'kUndo', 'kClear', 'kInsert', 'k3d', 'kDetail'].map((id) => [id, $('#' + id)]));
  padKeys.textContent = '';   // the same buttons (and their click handlers), arranged in rows
  padKeys.append(
    h('div', { class: 'pk-row pk-2' }, pkey(B.kType, 'textT', 'Drawing → text'), pkey(B.kImg, 'image', 'Drawing → picture')),
    h('div', { class: 'pk-row pk-2' }, pkey(B.kSpace, 'spaceKey', 'Space', 'big'), pkey(B.kEnter, 'enterKey', 'New line', 'big')),
    h('div', { class: 'pk-row pk-3' }, pkey(B.kBack, 'backspace', 'Delete letter'), pkey(B.kUndo, 'undo', 'Undo line'), pkey(B.kClear, 'eraser', 'Clear pad'),
      pkey(B.kInsert, 'paste', 'Insert drawing'), pkey(B.k3d, 'cube', '3D model'), pkey(B.kDetail, 'sparkle', 'More detail')));
}

/* ---------- 5a. the notebook side of “pad on another screen” ---------- */
let padSess = null;   // { code, link, peer: { dev, t } | null }
let padQueue = Promise.resolve(), padModalRefresh = null;
const PAD_CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const padCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => PAD_CODE_CHARS[b % PAD_CODE_CHARS.length]).join('');
/* this browser or app on this device (kept in prefs): a device never jumps into pad mode for its own pad link */
const PAD_DEV = prefs.get('padDev', null) || (() => { const v = padCode() + padCode(); prefs.set('padDev', v); return v; })();
const PAD_BEAT = 30000;   // the notebook renews its offer this often while the link is open; older offers are dead
const padOffer = (sess) => ({ code: sess.code, t: now(), started: sess.started, page: cur && tree.nodes[cur.id] ? tree.nodes[cur.id].name : '', session: SESSION, dev: PAD_DEV });
function padStart() {
  if (padSess) return padSess;
  const code = padCode();
  const sess = padSess = { code, started: now(), peer: null, prevOffer: null, beat: 0, link: PadLink.open(code, 'main', padOnMsg) };
  try { sessionStorage.setItem('inkling:padNotebook', code); } catch {}   // this tab is the notebook: after a reload it doesn't become the pad
  Store.get('padlink').catch(() => null).then((prev) => {   // remembered, so “Be the pad” here can put another notebook’s offer back
    sess.prevOffer = prev && prev.session !== SESSION ? prev : null;
    return Store.set('padlink', padOffer(sess));
  }).catch(() => {});
  sess.beat = setInterval(() => {
    if (padSess !== sess) return clearInterval(sess.beat);
    Store.get('padlink').then((d) => {
      if (d && d.code !== sess.code) { clearInterval(sess.beat); return; }   // another notebook started a pad link since
      return Store.set('padlink', padOffer(sess));
    }).catch(() => {});
  }, PAD_BEAT);
  renderPadTop();
  return padSess;
}
addEventListener('pagehide', () => { if (padSess) padStop(true); });
function padStop(restore) {
  if (!padSess) return;
  try { padSess.link.send({ t: 'bye' }); } catch {}
  const s = padSess; padSess = null;
  clearInterval(s.beat);
  setTimeout(() => s.link.close(), 300);
  Store.get('padlink').then((d) => {   // only our own offer; “Be the pad” puts back the one that was there before
    if (!d || d.code !== s.code) return;
    return restore && s.prevOffer ? Store.set('padlink', s.prevOffer) : Store.del('padlink');
  }).catch(() => {});
  renderPadTop();
}
function padSendState(extra) {
  if (!padSess) return;
  padSess.link.send({ t: 'state', page: cur && tree.nodes[cur.id] ? tree.nodes[cur.id].name : '', target: padTargetLabel(), ai: AI.ok, ...(extra || {}) });
}
function padOnMsg(m) {
  if (!padSess || !m || typeof m !== 'object') return;
  if (m.t === 'bye') { padSess.peer = null; renderPadTop(); if (padModalRefresh) padModalRefresh(); toast('The drawing pad was closed.'); return; }
  const first = !padSess.peer;
  padSess.peer = { dev: String(m.dev || (padSess.peer && padSess.peer.dev) || 'screen').slice(0, 20), t: now() };
  if (first) { toast('The drawing pad is connected.'); renderPadTop(); if (padModalRefresh) padModalRefresh(); padSendStyle(true); }
  if (m.t === 'hello') padSendState();
  else if (m.t === 'style') padTakeStyle(m);
  else if (m.t === 'move') { movePadTarget(m.dir > 0 ? 1 : -1); padSendState(); }
  else if (m.t === 'key') {
    if (cur && doc && !cur.ro) { if (m.k === 'space') insertTextAtSaved(' '); else if (m.k === 'enter') padEnter(); else if (m.k === 'back') padBackspace(); }
    padSendState();
  } else if (m.t === 'ink') padQueue = padQueue.then(() => padRemoteInk(m)).catch((e) => console.error(e));
}
/* the style for pictures and 3D models (Your style), kept the same on both screens; the picture only travels when it changed */
function padSendStyle(force) {
  if (!padSess || !padSess.peer) return;
  const text = prefs.get('padStyle', '') || '', img = prefs.get('padStyleImg', null) || null, m = { t: 'style' };
  if (force || text !== padSess.sentText) { m.text = text; padSess.sentText = text; }
  if (force || img !== padSess.sentImg) { m.img = img; padSess.sentImg = img; }
  if ('text' in m || 'img' in m) padSess.link.send(m);
}
function padTakeStyle(m) {
  if (typeof m.text === 'string') { const t = m.text.slice(0, 300); padSess.sentText = t; prefs.set('padStyle', t); $('#padStyle').value = t; }
  if ('img' in m) {
    const d = typeof m.img === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(m.img) && m.img.length < 400000 ? m.img : null;
    padSess.sentImg = d; prefs.set('padStyleImg', d); loadPadStyle();
    toast(d ? 'Style picture from the pad saved.' : 'Style picture removed on the pad.');
  }
}
{ let t = 0; $('#padStyle').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => padSendStyle(), 500); }); }
/* the font and size the pad asked for, if they are ones Cortex Scribe offers */
function padFmt(m) {
  const font = FONTS.some((f) => f[0] === m.font) ? m.font : '', size = SIZES.includes(+m.size) ? +m.size : 0;
  return font || size ? { font, size } : null;
}
async function padReadStrokes(strokes, space, fmt) {
  if (!AI.ok) return { msg: 'Reading handwriting works ' + Platform.aiWhere + '.' };
  if (!AI.img) return { msg: AI.noPics };
  if (!cur || cur.loading || !doc) return { msg: 'Open a page in the notebook first.' };
  if (cur.ro) return { msg: 'This page is view only.' };
  const blob = await padBlob(strokes);
  const { text } = await AI.text(HW_PROMPT, { task: 'pad.read', images: [blob], modelTier: 'quick' });
  let t = String(text || '').trim().replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '');
  if (!t || /^<none>$/i.test(t)) return { msg: 'Couldn’t read that. Try writing a bit bigger.' };
  if (space) t += ' ';
  insertTextAtSaved(t, fmt);
  return { msg: 'Typed “' + t.trim() + '”', text: t };
}
async function padRemoteInk(m) {
  const strokes = (Array.isArray(m.strokes) ? m.strokes : []).slice(0, 600).map((s) => ({
    c: typeof s.c === 'string' && (s.c === 'ink' || /^#[0-9a-f]{6}$/i.test(s.c)) ? s.c : 'ink',
    w: clamp(+s.w || 3.6, 0.5, 40),
    pts: toPts((Array.isArray(s.p) ? s.p : []).slice(0, 40000).map((v) => +v || 0)),
  })).filter((s) => s.pts.length);
  let msg = '';
  try {
    if (!strokes.length) msg = 'There was nothing to send.';
    else if (m.act === 'text') msg = (await padReadStrokes(strokes, !!m.space, padFmt(m))).msg;
    else if (m.act === 'picture') msg = (await padToImage(false, strokes)) ? 'Picture added to the page.' : ($('#padState').textContent || 'That didn’t work.');
    else if (m.act === 'insert') msg = (await padInsertDrawing(strokes, { as: m.as === 'ink' ? 'ink' : 'picture', bg: m.bg === 'clear' ? 'clear' : 'white' })) ? 'Drawing added to the page.' : 'Open a page in the notebook first.';
    else if (m.act === '3d') msg = (await gen3D({ fromPad: true, strokes })) ? '3D model made: it’s in the 3D studio.' : 'The 3D model couldn’t be made.';
  } catch (e) { msg = e && e.code ? aiErrorText(e) : 'That didn’t work.'; }
  padSendState({ done: m.id, msg });
}
async function padQR(url) {
  try {
    await loadLib('qr');
    const q = window.qrcode(0, 'M');
    if (window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs['UTF-8']) window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
    q.addData(url); q.make();
    const box = h('div', { class: 'pad-qr', role: 'img', 'aria-label': 'QR code for the pad link' });
    box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    return box;
  } catch { return h('p', { class: 'hint' }, 'The QR code couldn’t be made here. Use the link below.'); }
}
/* the phone pad without Claude: the pad relay on this computer (scripts/pad-relay.mjs) serves Cortex Scribe on the
   home network; the QR code leads the phone there, and the drawing comes back through the relay */
let padLan = null;
async function padLanInfo(force) {
  if (!force && padLan && padLan.info && now() - padLan.at < 30000) return padLan;
  const started = Platform.desktop ? await PadRelay.ensure() : null;
  const info = await PadRelay.info(Platform.desktop ? 4000 : 1800);
  padLan = { at: now(), info, started };
  if (info && padSess && padSess.link.useRelay) padSess.link.useRelay();
  return padLan;
}
function padLanBox(s) {      // shown at once; filled in when the relay answers (a redraw makes a new box)
  const box = h('div', { class: 'pad-lan' }, h('p', { class: 'hint' }, 'Starting the pad link for phones…'));
  padLanFill(box, s).catch((e) => { console.error(e); box.textContent = 'The pad link for phones didn’t start.'; });
  return box;
}
async function padLanFill(box, s) {
  const { info, started } = await padLanInfo();
  box.textContent = '';
  if (!info) {
    const why = !Platform.desktop ? 'Start the pad link on this computer: in the Cortex Scribe folder, run  npm run pad  and leave it open. Then press Try again.'
      : started && started.state === 'no-node' ? 'The pad link for phones needs Node.js on this computer (nodejs.org). ' + (started.detail || '')
      : started && started.state === 'missing' ? 'This app can’t start the pad link by itself. In the Cortex Scribe folder, run  npm run pad  and leave it open.'
      : 'The pad link for phones didn’t start' + (started && started.detail ? ': ' + started.detail : '.') + ' (Its log is Documents/Inkling/pad-relay.log.)';
    box.append(h('p', { class: 'hint', id: 'padLanWhy' }, why),
      h('div', { class: 'btnrow' }, h('button', { class: 'btn small', id: 'padLanRetry', onclick: async () => { await padLanInfo(true); if (padModalRefresh) padModalRefresh(); } }, svg('refresh'), 'Try again')));
    return box;
  }
  if (!info.ips.length) {
    box.append(h('p', { class: 'hint' }, 'This computer isn’t on a Wi-Fi or network right now. Connect it to the same Wi-Fi as your phone and press Try again.'),
      h('div', { class: 'btnrow' }, h('button', { class: 'btn small', onclick: async () => { await padLanInfo(true); if (padModalRefresh) padModalRefresh(); } }, svg('refresh'), 'Try again')));
    return box;
  }
  const pick = prefs.get('padIp', '');
  const ip = info.ips.includes(pick) ? pick : info.ips[0];
  const url = 'http://' + ip + ':' + info.port + '/#pad=' + s.code;
  const linkEl = h('input', { class: 'field', readonly: true, value: url, 'aria-label': 'Pad link for the phone', id: 'padLinkIn' });
  box.append(await padQR(url), linkEl,
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn small', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { linkEl.select(); toast('Select the link and copy it.'); } } }, svg('copy'), 'Copy link'),
      info.ips.length > 1 ? h('button', { class: 'btn small ghost', title: 'This computer has more than one network address. If the phone can’t open the link, try the next one.', onclick: () => { prefs.set('padIp', info.ips[(info.ips.indexOf(ip) + 1) % info.ips.length]); if (padModalRefresh) padModalRefresh(); } }, 'Other address (' + (info.ips.indexOf(ip) + 1) + ' of ' + info.ips.length + ')') : null),
    h('ol', { class: 'pad-steps' },
      h('li', null, 'Put your phone or tablet on the ', h('b', null, 'same Wi-Fi'), ' as this computer.'),
      h('li', null, 'Scan the QR code with the camera. Cortex Scribe opens there as the drawing pad; what you write lands on this page.'),
      h('li', null, 'If it doesn’t open: when Windows asks whether Node.js may use the network, allow it for private networks. School and café Wi-Fi often keep devices apart; then use your phone’s hotspot for the computer.')));
  return box;
}
function padSyncModal() {
  const s = padStart();
  const body = h('div', { class: 'padsync' });
  const render = async () => {
    if (!padSess) return;
    body.textContent = '';
    const peer = padSess.peer;
    body.append(
      h('p', { class: 'pad-status' + (peer ? ' on' : '') }, peer ? '● Connected: the pad on a ' + peer.dev + '. Everything you write there lands on this page.' : '○ Waiting for a pad to connect…'),
      h('p', { class: 'hint' }, 'Pad code'), h('div', { class: 'code', id: 'padCodeEl' }, s.code),
      h('h3', null, 'On this computer'),
      Platform.host === 'claude'
        ? h('div', null,   // Claude's page can't open claude.ai in a new tab (the tab is blocked), so the student pastes the link
          h('div', { class: 'btnrow' }, h('button', { class: 'btn primary', id: 'padOpenTab', onclick: async () => {
            const url = Platform.homeLink + '#pad=' + s.code;
            try { await navigator.clipboard.writeText(url); toast('Link copied. Open a new tab, paste it and press Enter.'); }
            catch { toast('Open this Cortex Scribe in a new tab: it asks “Use this screen as the drawing pad?”.'); }
          } }, svg('copy'), 'Copy the link for a new tab')),
          h('p', { class: 'hint' }, 'Paste it into a new tab or window: Cortex Scribe opens there as the drawing pad.'))
        : h('div', { class: 'btnrow' }, h('button', { class: 'btn primary', id: 'padOpenTab', onclick: async () => {
          const ok = await Platform.openPadWindow(s.code);
          if (!ok) toast('The new ' + (Platform.desktop ? 'window' : 'tab') + ' was blocked. Open Cortex Scribe in another tab yourself: it offers “Be the pad”, or type the code there.');
        } }, svg('open'), Platform.desktop ? 'Open the pad in a new window' : 'Open the pad in a new tab')),
      h('h3', null, 'On your phone or another computer'));
    const home = Platform.homeLink;
    if (PadLink.remote && home) {
      const url = home + '#pad=' + s.code;
      const linkEl = h('input', { class: 'field', readonly: true, value: url, 'aria-label': 'Pad link', id: 'padLinkIn' });
      body.append(await padQR(url), linkEl,
        h('div', { class: 'btnrow' },
          h('button', { class: 'btn small', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { linkEl.select(); toast('Select the link and copy it.'); } } }, svg('copy'), 'Copy link'),
          h('button', { class: 'btn small ghost', onclick: async () => { const v = await promptModal('Link to this Cortex Scribe', 'Link', prefs.get('homeLink', '') || home, 'Save', 'https://claude.ai/artifact/…'); if (v != null) { prefs.set('homeLink', /^https:\/\/\S+$/.test(v.trim()) ? v.trim() : ''); render(); } } }, 'Wrong link? Change it')),
        h('ol', { class: 'pad-steps' },
          h('li', null, 'Scan the QR code with your phone, or open the link on the other computer, signed in to the same Claude account.'),
          h('li', null, 'Cortex Scribe opens straight as the drawing pad. Your notes are one tap away there (', h('b', null, 'My notes'), ').'),
          h('li', null, 'If it doesn’t ask: press ', h('b', null, 'Drawing pad'), ' in the menu on the left and type the code ', h('b', null, s.code), '.')));
    } else if (PadRelay.usable) body.append(padLanBox(s));   // the desktop app and the browser version: through the pad relay on this computer
    else body.append(h('p', { class: 'hint' }, 'A phone or another computer can be the pad when Cortex Scribe can pass the drawing between devices: inside Claude when you’re signed in, or with the desktop app on the same Wi-Fi.'));
    const codeIn = h('input', { class: 'field', placeholder: 'e.g. k7m2qx', 'aria-label': 'Code of the pad link', maxlength: 16, style: { maxWidth: '180px', margin: '0' } });
    body.append(h('h3', null, 'Be the pad'), h('p', { class: 'hint' }, 'Turn this screen into the pad for a notebook on another screen: type the code it shows.'),
      h('div', { class: 'frow' }, codeIn, h('button', { class: 'btn', onclick: () => { const c = padParseCode(codeIn.value); if (!c) return toast('Type the code the notebook shows, e.g. k7m2qx.'); m.close(); padStop(true); enterPadMode(c); } }, 'Be the pad')));
  };
  const m = modal({ title: 'Pad on another screen', body: [body], actions: [
    { label: 'Stop the pad link', fn: () => { padStop(); } },
    { label: 'Done', kind: 'primary' }], onClose: () => { padModalRefresh = null; } });
  padModalRefresh = render;
  render();
}
/* another device signed in to the same account: offer to be the pad, at the start and whenever a pad link starts */
const padOfferFresh = (d) => !!(d && d.code && d.session !== SESSION && now() - (d.t || 0) < PAD_BEAT * 5);   // renewed every 30 s while open
/* while a pad link is open, Cortex Scribe opens as the drawing pad on the account's other screens and tabs; the notes are one
   tap away (My notes). Claude doesn't pass the #pad= part of the link on, so this is how the QR code leads to the pad.
   Not in the notebook's own tab after a reload (sessionStorage), or, where sessionStorage is missing, on the same device. */
function padJumpIn(d) {
  if (!padOfferFresh(d)) return false;
  let mine;
  try { mine = sessionStorage.getItem('inkling:padNotebook'); } catch { return d.dev !== PAD_DEV; }
  return mine !== d.code;
}
const padOfferSeen = new Set();
let padOfferWatch = null;
async function padOfferCheck() {
  padOfferShow(await Store.get('padlink').catch(() => null));
  if (!padOfferWatch) padOfferWatch = Store.watch('padlink', padOfferShow) || true;
}
function padOfferShow(d) {
  if (!padOfferFresh(d) || padRemote || padOfferSeen.has(d.code) || $('#padOffer')) return;
  padOfferSeen.add(d.code);
  const bar = h('div', { class: 'pad-offer', id: 'padOffer', role: 'dialog', 'aria-label': 'Drawing pad' },
    svg('pen'), h('p', null, 'A drawing pad was started' + (d.page ? ' for “' + d.page + '”' : '') + '. Use this screen as the drawing pad?'),
    h('button', { class: 'btn primary small', onclick: () => { bar.remove(); enterPadMode(d.code); } }, 'Be the pad'),
    h('button', { class: 'btn small', onclick: () => bar.remove() }, 'Not now'));
  document.body.append(bar);
}
const padHashCode = () => { const m = String(location.hash || '').match(/pad=([a-z0-9]{4,16})/i); return m ? m[1].toLowerCase() : null; };
/* a typed code, or a pasted pad link */
function padParseCode(v) {
  v = String(v || '').trim();
  const m = v.match(/pad=([a-z0-9]{4,16})/i);
  const c = (m ? m[1] : v).toLowerCase().replace(/[^a-z0-9]/g, '');
  return c.length >= 4 && c.length <= 16 ? c : null;
}
/* “Drawing pad” in the sidebar: be the pad for another screen, or start a pad link for these notes */
async function padHubModal() {
  const offer = await Store.get('padlink').catch(() => null);
  const codeIn = h('input', { class: 'field', placeholder: 'Code or link, e.g. k7m2qx', 'aria-label': 'Code of the pad link', id: 'padHubCode', autocomplete: 'off', autocapitalize: 'off' });
  const go = (c) => { if (!c) return toast('Type the code the notebook shows, e.g. k7m2qx.'); m.close(); if (padSess) padStop(true); enterPadMode(c); };
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(padParseCode(codeIn.value)); });
  const body = h('div', { class: 'padhub' },
    h('p', null, 'Write or draw on one screen, and it lands in your notes on another: a phone, a tablet, a laptop or another tab.'),
    h('h3', null, 'Use this screen as the pad'),
    padOfferFresh(offer) ? h('div', { class: 'btnrow' }, h('button', { class: 'btn primary', id: 'padHubOffer', onclick: () => go(offer.code) }, svg('pen'), 'Be the pad' + (offer.page ? ' for “' + offer.page + '”' : ''))) : null,
    h('p', { class: 'hint' }, 'Type the code that the notebook on the other screen shows (Handwriting panel → Other screen).'),
    h('div', { class: 'frow' }, codeIn, h('button', { class: 'btn', id: 'padHubGo', onclick: () => go(padParseCode(codeIn.value)) }, 'Be the pad')),
    h('h3', null, 'Use another screen as the pad for these notes'),
    h('div', { class: 'btnrow' }, h('button', { class: 'btn', id: 'padHubStart', onclick: () => { m.close(); padSyncModal(); } }, svg('screen'), 'Show the code and QR code')));
  const m = modal({ title: 'Drawing pad', body: [body], actions: [{ label: 'Close' }] });
}
$('#joinBtn').after(h('button', { class: 'btn ghost', id: 'padBtn', onclick: padHubModal }, svg('pen'), 'Drawing pad'));

/* ---------- 5b. pad mode: this whole screen is the drawing pad ---------- */
let padRemote = null;
function padDevice() { const ua = navigator.userAgent || ''; return /iPhone|Android.+Mobile|Mobile Safari/.test(ua) ? 'phone' : /iPad|Android|Tablet/.test(ua) ? 'tablet' : 'computer'; }
function enterPadMode(code, onExit) {
  code = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  if (!code || padRemote) return;
  if (padSess) padStop(true);   // this screen can't be a notebook with its own pad and a pad at the same time
  const offer = $('#padOffer'); if (offer) offer.remove();
  padOfferSeen.add(code);   // no “Be the pad?” for this link after leaving the pad
  const was = cur && cur.id;
  if (!onExit && was) onExit = () => { if (live(tree.nodes[was])) openNote(was); else showEmpty(); };
  if (cur) closeNote();
  const st = { code, since: now(), strokes: [], cur: null, timer: 0, ids: 0, connected: false, seen: 0, page: '', target: '', status: '', link: null, hello: 0, onExit, style: { text: '', img: null } };
  padRemote = st;
  app.hidden = true; document.body.classList.add('in-padmode');
  const pm = h('div', { class: 'padmode' + (prefs.get('padLeft', false) ? ' left' : ''), id: 'padmode' });
  const cv = h('canvas', { class: 'pm-canvas', 'aria-label': 'Drawing pad. Write or draw here.' });
  const area = h('div', { class: 'pm-area' }, cv);
  const conn = h('span', { class: 'pm-conn' });
  const target = h('span', { class: 'pm-target' });
  const status = h('div', { class: 'pm-status', 'aria-live': 'polite' });
  const side = h('div', { class: 'pm-side' });
  const modeSeg = h('div', { class: 'pm-modeseg', role: 'group', 'aria-label': 'Write or draw' });
  pm.append(h('div', { class: 'pm-top' }, h('button', { class: 'icon-btn pm-cog', id: 'pmCog', 'aria-label': 'Pad options', title: 'Pad options', onclick: (e) => pmCog(e.currentTarget) }, svg('cog')), h('b', { class: 'pm-title' }, 'Cortex Scribe pad'), modeSeg, conn, target,
    h('button', { class: 'btn small pm-leave', id: 'pmLeave', title: 'Leave the pad and open my notes', onclick: () => exitPadMode() }, svg('chevL'), h('span', null, 'My notes'))),
    h('div', { class: 'pm-main' }, area, side), status);
  document.body.append(pm);
  st.el = { pm, cv, area, conn, target, status, side, modeSeg };
  st.mq = matchMedia(PM_COMPACT); st.onMq = () => { pmSide(); pmRender(); }; st.mq.addEventListener('change', st.onMq);
  const ctx = cv.getContext('2d');
  const size = () => { const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; if (!r.width) return; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); draw(); };
  const draw = () => {
    const dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
    if (prefs.get('padGuide', false)) { ctx.strokeStyle = cssVar('--line') || '#ccc'; ctx.lineWidth = 1; for (let y = 96; y < r.height; y += 96) { ctx.beginPath(); ctx.moveTo(16, y + 0.5); ctx.lineTo(r.width - 16, y + 0.5); ctx.stroke(); } }
    const ink = cssVar('--ink') || '#111';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of st.strokes) { const c = s.c === 'ink' ? ink : s.c; ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = s.w; ctx.globalAlpha = s.sent ? 0.35 : 1; padStroke(ctx, s); }
    ctx.globalAlpha = 1;
  };
  st.draw = draw;
  if (window.ResizeObserver) new ResizeObserver(size).observe(cv);
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10]; };
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch {}
    clearTimeout(st.timer);
    st.cur = { c: prefs.get('padColor', 'ink'), w: prefs.get('padSize', 3.6) * (padDevice() === 'computer' ? 1 : 1.2), pts: [pt(e)] };
    st.strokes.push(st.cur); draw();
  });
  cv.addEventListener('pointermove', (e) => { if (!st.cur) return; const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const ev of evs) st.cur.pts.push(pt(ev)); draw(); });
  const end = () => {
    if (!st.cur) return;
    st.cur = null;
    if (prefs.get('padMode', 'write') === 'write' && prefs.get('padAuto', true)) { clearTimeout(st.timer); st.timer = setTimeout(() => pmSend('text'), prefs.get('padDelay', 1000)); }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  st.link = PadLink.open(code, 'pad', pmOnMsg);
  const hello = () => {   // until the notebook answers, and then now and then to check it is still there
    if (padRemote !== st) return;
    const age = now() - st.seen;
    if (st.connected && age > 32000) { st.connected = false; pmRender(); }
    if (!st.connected || age > 20000) st.link.send({ t: 'hello', dev: padDevice() });
    if (!st.connected && !st.status) pmRender();   // the hint changes after a while without a connection
  };
  hello(); st.hello = setInterval(hello, 2500);
  addEventListener('pagehide', () => { if (padRemote) padRemote.link.send({ t: 'bye' }); });
  pmSide(); pmRender(); raf(size);
}
function pmOnMsg(m) {
  const st = padRemote; if (!st || !m || typeof m !== 'object') return;
  if (m.t === 'bye') { st.connected = false; st.status = 'The notebook stopped the pad link. Start it again there.'; pmRender(); return; }
  if (m.t === 'style') {
    if (typeof m.text === 'string' && now() - (st.styleTyped || 0) > 1500) { st.style.text = m.text; if (st.el.styleText) st.el.styleText.value = m.text; }   // not while typing here
    if ('img' in m) { st.style.img = typeof m.img === 'string' && /^data:image\//.test(m.img) ? m.img : null; if (st.el.styleRow) st.el.styleRow(); }
    return;
  }
  if (m.t !== 'state') return;
  st.connected = true; st.seen = now(); st.page = String(m.page || ''); st.target = String(m.target || '');
  if (m.done != null) { st.strokes = st.strokes.filter((s) => s.sent !== m.done); if (m.msg) st.status = String(m.msg); st.draw(); }
  pmRender();
}
function pmRender() {
  const st = padRemote; if (!st) return;
  st.el.conn.className = 'pm-conn' + (st.connected ? ' on' : '');
  st.el.conn.textContent = st.connected ? '● Connected' + (st.page ? ' to “' + st.page + '”' : '') : '○ Connecting… (code ' + st.code + ')';
  st.el.target.textContent = st.connected && st.target ? 'Writes into: ' + st.target : '';
  const lonely = Platform.host === 'claude' && !PadLink.remote, slow = now() - (st.since || now()) > 15000;
  st.el.status.classList.toggle('warn', !st.status && !st.connected && (lonely || slow));
  st.el.status.textContent = st.status || (st.connected ? (pmCompact() && st.target ? 'Writes into: ' + st.target : '')
    : lonely ? 'This screen can’t reach your notes: it isn’t signed in to Claude here. Open the link in the Claude app, or sign in at claude.ai with the same account, then scan the code again.'
    : slow ? 'Still not connected. Check that the notebook still shows the pad link (Handwriting → Other screen, code ' + st.code + ') and that this screen uses the same Claude account.'
    : 'Keep the notebook open with the pad link running. Its code is ' + st.code + '.');
}
function pmSend(act) {
  const st = padRemote; if (!st) return;
  clearTimeout(st.timer);
  const fresh = st.strokes.filter((s) => !s.sent && s !== st.cur);
  if (!fresh.length) { st.status = act === 'text' ? '' : 'Draw something first.'; pmRender(); return; }
  if (!st.connected) { st.status = 'Not connected yet, so nothing was sent. Your drawing stays here.'; pmRender(); return; }
  const id = ++st.ids;
  for (const s of fresh) s.sent = id;
  st.link.send({ t: 'ink', id, act, dev: padDevice(), space: !!prefs.get('padSpace', false), as: prefs.get('padInsertAs', 'picture'), bg: prefs.get('padBg', 'white'),
    font: prefs.get('padFont', ''), size: prefs.get('padTextSize', 0),
    strokes: fresh.map((s) => ({ c: s.c, w: round1(s.w), p: rdp(s.pts, 0.6).flat().map((v) => Math.round(v * 10) / 10) })) });
  st.status = act === 'text' ? 'Reading…' : act === 'picture' ? 'Making a picture…' : act === '3d' ? 'Building a 3D model…' : 'Sending the drawing…';
  st.draw(); pmRender();
}
/* phones and small windows, upright or sideways: the drawing area, a dock of the main keys, and the rest in a sheet (More) */
const PM_COMPACT = '(max-width: 760px), (max-height: 560px)';
const pmCompact = () => matchMedia(PM_COMPACT).matches;
function pmSide() {
  const st = padRemote; if (!st) return;
  const compact = pmCompact();
  st.el.pm.classList.toggle('compact', compact);
  const side = st.el.side; side.textContent = '';
  const again = () => pmSide();
  const chips = (key, def, opts) => h('div', { class: 'btnrow' }, opts.map(([v, l]) => h('button', { class: 'chip', 'aria-pressed': String(prefs.get(key, def) === v), onclick: () => { prefs.set(key, v); again(); } }, l)));
  const check = (key, def, label) => { const c = h('input', { type: 'checkbox', checked: prefs.get(key, def) ? true : null }); c.addEventListener('change', () => prefs.set(key, c.checked)); return h('label', { class: 'opt' }, c, label); };
  const write = prefs.get('padMode', 'write') === 'write';
  const colour = prefs.get('padColor', 'ink');
  const K = (id, icon, label, fn, cls, icls) => h('button', { class: 'btn pkey' + (cls ? ' ' + cls : ''), id, title: label, onclick: fn }, svg(icon, icls), h('span', null, label));
  const key = {
    type: () => K('pmType', 'textT', 'Type it now', () => pmSend('text'), 'primary'),
    pic: () => K('pmPic', 'image', 'Drawing → picture', () => pmSend('picture'), 'primary'),
    d3: () => K('pm3d', 'cube', '3D model', () => pmSend('3d')),
    space: () => K('pmSpace', 'spaceKey', 'Space', () => st.link.send({ t: 'key', k: 'space' }), 'big'),
    enter: () => K('pmEnter', 'enterKey', 'New line', () => st.link.send({ t: 'key', k: 'enter' }), 'big'),
    back: () => K('pmBack', 'backspace', 'Delete letter', () => st.link.send({ t: 'key', k: 'back' })),
    undo: () => K('pmUndo', 'undo', 'Undo line', () => { const i = st.strokes.map((x) => !x.sent).lastIndexOf(true); if (i >= 0) { st.strokes.splice(i, 1); st.draw(); } }),
    clear: () => K('pmClear', 'eraser', 'Clear', () => { clearTimeout(st.timer); st.strokes = st.strokes.filter((x) => x.sent); st.draw(); }),
    insert: () => K('pmInsert', 'paste', 'Insert drawing', () => pmSend('insert')),
    up: () => K('pmUp', 'chevD', 'Line above', () => st.link.send({ t: 'move', dir: -1 }), '', 'flip'),
    down: () => K('pmDown', 'chevD', 'Line below', () => st.link.send({ t: 'move', dir: 1 })),
  };
  const sizes = () => h('div', { class: 'sizes' }, [2, 3.6, 7, 12].map((sz, i) => h('button', { class: 'tb', 'aria-label': ['Thin', 'Normal', 'Thick', 'Very thick'][i] + ' line', 'aria-pressed': String(prefs.get('padSize', 3.6) === sz), onclick: () => { prefs.set('padSize', sz); again(); } }, h('span', { style: { width: (3 + i * 3) + 'px', height: (3 + i * 3) + 'px' } }))));
  const colourBox = (withPen) => h('section', { class: 'pm-box' }, h('h4', null, withPen ? 'Colour and pen' : 'Colour'),
    h('div', { class: 'swatches pad-sw' }, PAD_COLORS.slice(0, 14).map((c) => h('button', { class: 'sw', style: { background: c === 'ink' ? 'var(--ink)' : c }, 'aria-label': 'Colour ' + (c === 'ink' ? 'ink' : c), 'aria-pressed': String(colour === c), onclick: () => { prefs.set('padColor', c); again(); } })),
      h('input', { type: 'color', 'aria-label': 'Any colour', value: /^#[0-9a-f]{6}$/i.test(colour) ? colour : '#e5383b', onchange: (e) => { prefs.set('padColor', e.target.value); again(); } })),
    withPen ? sizes() : null);
  const settingsBox = () => {
    const delay = h('input', { type: 'range', min: 400, max: 2500, step: 100, value: prefs.get('padDelay', 1000), 'aria-label': 'Pause before it is read' });
    const delayV = h('span', null, (prefs.get('padDelay', 1000) / 1000).toFixed(1) + ' s');
    delay.addEventListener('input', () => { prefs.set('padDelay', +delay.value); delayV.textContent = (delay.value / 1000).toFixed(1) + ' s'; });
    return h('section', { class: 'pm-box' }, h('h4', null, 'Settings'),
      chips('padMode', 'write', [['write', 'Write text'], ['draw', 'Draw a picture']]),
      write ? check('padAuto', true, 'Type automatically after a pause') : null,
      write ? h('label', { class: 'opt' }, 'Pause', delay, delayV) : null,
      write ? check('padSpace', false, 'Add a space after each word') : null,
      h('p', { class: 'hint', style: { margin: '6px 0 2px' } }, '“Insert drawing” as'),
      chips('padInsertAs', 'picture', [['picture', 'Picture'], ['ink', 'Pen lines']]),
      h('p', { class: 'hint', style: { margin: '6px 0 2px' } }, 'Background of pictures'),
      chips('padBg', 'white', [['white', 'White'], ['clear', 'See-through']]));
  };
  // Write / Draw in the top bar (phones; on a computer it is in Settings)
  st.el.modeSeg.textContent = '';
  st.el.modeSeg.append(...[['write', 'Write'], ['draw', 'Draw']].map(([v, l]) => h('button', { class: 'chip', 'aria-pressed': String(prefs.get('padMode', 'write') === v), onclick: () => { prefs.set('padMode', v); again(); } }, l)));
  if (!compact) {
    pmSheet(false);
    side.append(colourBox(false), settingsBox(),
      h('div', { class: 'pm-arrows' }, key.up(), key.down()),
      h('section', { class: 'pm-box pm-pen' }, h('h4', null, 'Pen'), sizes(),
        h('div', { class: 'pm-keys' },
          write ? h('div', { class: 'pk-row pk-1' }, key.type()) : h('div', { class: 'pk-row pk-2' }, key.pic(), key.d3()),
          write ? h('div', { class: 'pk-row pk-2' }, key.space(), key.enter()) : null,
          h('div', { class: 'pk-row ' + (write ? 'pk-2' : 'pk-3') }, write ? key.back() : null, key.undo(), key.clear(), key.insert()))),
      write ? pmTextBox() : null,
      pmStyleBox(st));
    return;
  }
  const dot = h('span', { class: 'pm-dot', style: { background: colour === 'ink' ? 'var(--ink)' : colour } });
  const more = h('button', { class: 'btn pkey pm-more', id: 'pmMore', title: 'Colours, pen, settings, text and style', onclick: () => pmSheet(true) }, dot, h('span', null, 'More'));
  side.append(h('div', { class: 'pm-dock ' + (write ? 'write' : 'draw') },
    ...(write ? [key.type(), key.space(), key.enter(), key.back(), key.up(), key.down(), key.undo(), key.clear(), more]
      : [key.pic(), key.insert(), key.d3(), key.up(), key.down(), key.undo(), key.clear(), more])));
  st.sheetBoxes = () => [colourBox(true), settingsBox(), write ? pmTextBox() : null, pmStyleBox(st)];
  if (st.sheetOpen) pmSheet(true);
}
/* the sheet with everything that isn't in the dock (phones): up from the bottom, or from the side when sideways */
function pmSheet(open) {
  const st = padRemote; if (!st) return;
  st.sheetOpen = !!open;
  let sh = st.el.pm.querySelector('.pm-sheet'), scrim = st.el.pm.querySelector('.pm-scrim');
  if (!open) { if (sh) sh.remove(); if (scrim) scrim.remove(); return; }
  if (!st.sheetBoxes) return;
  const top = sh ? sh.querySelector('.pm-sheet-body').scrollTop : 0;
  if (!sh) {
    scrim = h('div', { class: 'pm-scrim', onclick: () => pmSheet(false) });
    sh = h('div', { class: 'pm-sheet', role: 'dialog', 'aria-label': 'Pad options' });
    st.el.pm.append(scrim, sh);
  }
  sh.textContent = '';
  const body = h('div', { class: 'pm-sheet-body' }, ...st.sheetBoxes().filter(Boolean));
  sh.append(h('div', { class: 'pm-sheet-head' }, h('b', null, 'Pad options'), h('button', { class: 'btn small primary', id: 'pmSheetDone', onclick: () => pmSheet(false) }, 'Done')), body);
  body.scrollTop = top;
}
/* “Text on the page”: the font and size of what the pad types (empty = like the page) */
function pmTextBox() {
  const font = prefs.get('padFont', ''), size = prefs.get('padTextSize', 0);
  const prev = h('div', { class: 'pm-text-prev', style: { fontFamily: font ? '"' + font + '", sans-serif' : '', fontSize: size ? Math.min(size, 34) + 'px' : '' } }, 'Your writing, typed');
  const fontSel = h('select', { id: 'pmFont', 'aria-label': 'Font of the typed text', onchange: (e) => { prefs.set('padFont', e.target.value); pmSide(); } },
    h('option', { value: '' }, 'Like the page'), FONTS.map(([v, l]) => h('option', { value: v, style: { fontFamily: '"' + v + '"' } }, l)));
  const sizeSel = h('select', { id: 'pmSize', 'aria-label': 'Size of the typed text', onchange: (e) => { prefs.set('padTextSize', +e.target.value || 0); pmSide(); } },
    h('option', { value: '0' }, 'Like the page'), SIZES.map((n) => h('option', { value: String(n) }, n + ' px')));
  fontSel.value = font; sizeSel.value = String(size || 0);
  return h('section', { class: 'pm-box', id: 'pmText' }, h('h4', null, 'Text on the page'),
    h('div', { class: 'pm-text-row' }, h('label', null, h('span', null, 'Font'), fontSel), h('label', null, h('span', null, 'Size'), sizeSel)),
    h('div', { class: 'btnrow pm-sizes' }, [['S', 14], ['M', 18], ['L', 24], ['XL', 32]].map(([l, n]) => h('button', { class: 'chip', 'aria-pressed': String(size === n), title: n + ' px', onclick: () => { prefs.set('padTextSize', size === n ? 0 : n); pmSide(); } }, l))),
    prev);
}
/* “Your style” for Drawing → picture and 3D models: the same as in the notebook's Handwriting panel, kept in step */
function pmStyleBox(st) {
  const text = h('textarea', { class: 'field', id: 'pmStyleText', rows: 2, maxlength: 300, placeholder: 'e.g. comic style, pastel colours, clean line art', 'aria-label': 'Describe your style' });
  text.value = st.style.text || '';
  text.addEventListener('input', () => { st.style.text = text.value; st.styleTyped = now(); clearTimeout(st.styleT); st.styleT = setTimeout(() => st.link.send({ t: 'style', text: text.value.slice(0, 300) }), 500); });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, id: 'pmStyleFile' });
  const useFile = async (f) => {
    try {
      const sh = await shrink(f, 480, 0.75), d = await toDataURL(sh.blob);
      st.style.img = d; st.link.send({ t: 'style', img: d }); st.status = 'Style picture sent to the notebook.';
    } catch { st.status = 'That picture couldn’t be used. Try a JPG or PNG.'; }
    row(); pmRender();
  };
  file.addEventListener('change', () => { const f = file.files[0]; file.value = ''; if (f) useFile(f); });
  const rowEl = h('div', { class: 'pm-style-row' });
  const row = () => {
    rowEl.textContent = '';
    if (st.style.img) rowEl.append(h('img', { class: 'pm-style-img', src: st.style.img, alt: 'Your style picture' }));
    rowEl.append(h('button', { class: 'btn small', id: 'pmStylePick', onclick: () => file.click() }, svg('image'), st.style.img ? 'Change picture' : 'Style picture'));
    if (st.style.img) rowEl.append(h('button', { class: 'btn small ghost', id: 'pmStyleDel', onclick: () => { st.style.img = null; st.link.send({ t: 'style', img: null }); row(); } }, 'Remove'));
    rowEl.append(file);
  };
  row();
  st.el.styleText = text; st.el.styleRow = row;
  const box = h('section', { class: 'pm-box pm-style', id: 'pmStyle' }, h('h4', null, 'Your style'),
    h('p', { class: 'hint' }, 'For “Drawing → picture” and 3D models.'), text, rowEl,
    h('p', { class: 'hint pm-drop-hint' }, 'Or drag a picture onto this box.'));
  dropFiles(box, (files) => useFile(files[0]));
  return box;
}
function pmCog(anchor) {
  const st = padRemote; if (!st) return;
  const left = prefs.get('padLeft', false), guide = prefs.get('padGuide', false);
  openMenu(anchor, [
    { label: st.connected ? 'Connected' + (st.page ? ' to “' + st.page + '”' : '') + ' · code ' + st.code : 'Not connected yet · code ' + st.code, header: true },
    { label: document.fullscreenElement ? 'Leave full screen' : 'Full screen', icon: 'fit', fn: () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch {} } },
    { label: 'Tools on the left (left-handed)', checked: left, fn: () => { prefs.set('padLeft', !left); st.el.pm.classList.toggle('left', !left); } },
    { label: 'Writing lines on the pad', checked: guide, fn: () => { prefs.set('padGuide', !guide); st.draw(); } },
    { label: 'Clear the pad', icon: 'trash', fn: () => { st.strokes = []; st.draw(); } },
    pmCompact() ? { label: 'Colours, pen, settings, text and style', icon: 'sliders', fn: () => pmSheet(true) } : null,
    { sep: true },
    { label: 'Leave the pad and open my notes', icon: 'chevL', fn: () => exitPadMode() },
  ]);
}
function exitPadMode() {
  const st = padRemote; if (!st) return;
  try { st.link.send({ t: 'bye' }); } catch {}
  clearInterval(st.hello); clearTimeout(st.timer);
  if (st.mq) st.mq.removeEventListener('change', st.onMq);
  setTimeout(() => st.link.close(), 300);
  st.el.pm.remove(); padRemote = null;
  document.body.classList.remove('in-padmode'); app.hidden = false;
  if (/pad=/.test(location.hash)) { try { history.replaceState(null, '', location.href.split('#')[0]); } catch {} }
  if (st.onExit) st.onExit(); else if (!kids(null).length || !cur) showEmpty();
}
/* at start: a tab opened with #pad=<code> becomes the pad straight away */
async function padBootCheck(startUi) {
  let code = padHashCode();
  if (!code) { const d = await Store.get('padlink').catch(() => null); if (padJumpIn(d)) { code = d.code; padOfferSeen.add(code); } }
  if (!code) return false;
  enterPadMode(code, startUi);
  return true;
}
applyPanelWidth(); applyPadHeight(); applyPadGuide(); renderPadTop();

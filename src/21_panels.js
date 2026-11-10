
/* ================= panels ================= */
const app = $('#app');
const PTABS = [['pen', 'Handwriting', 'pen'], ['format', 'Format', 'sliders'], ['fact', 'Fact check', 'shield'], ['sources', 'Sources', 'sources'], ['chat', 'Chat', 'chat'], ['learn', 'Learn', 'learn'], ['m3d', '3D studio', 'cube'], ['outline', 'Outline', 'outline'], ['calc', 'Calculator', 'calc']];
let ptab = prefs.get('ptab', 'pen');
let panelOpen = prefs.get('panel', true);
let mobilePanel = false;
const panelShown = () => (isMobile() ? mobilePanel : panelOpen);
function buildRail() {
  const r = $('#rail'); r.textContent = '';
  PTABS.forEach(([k, l, ic], i) => {
    if (i === 2 || i === 4) r.append(h('div', { class: 'rail-sep' }));
    r.append(h('button', { 'data-ptab': k, 'aria-label': l, 'aria-pressed': String(panelShown() && ptab === k), onclick: () => togglePanel(k) }, svg(ic), h('span', { class: 'tip' }, l), k === 'fact' ? h('span', { class: 'dot', id: 'factDot', hidden: true }) : null));
  });
  r.append(h('div', { style: { flex: '1' } }));
  r.append(h('button', { 'aria-label': 'Hide or show the panel', onclick: () => showPanel(!panelShown()) }, svg(panelShown() ? 'chevR' : 'chevL'), h('span', { class: 'tip' }, panelShown() ? 'Hide panel' : 'Show panel')));
}
function setPtab(t) {
  ptab = t; prefs.set('ptab', t);
  const def = PTABS.find((x) => x[0] === t);
  const title = $('#panelTitle'); title.textContent = ''; title.append(svg(def[2]), def[1]);
  for (const [k] of PTABS) $('#ptab-' + k).hidden = k !== t;
  app.classList.toggle('pad-tab', t === 'pen');
  if (t === 'pen') raf(padResize);
  if (t === 'format') refreshFormat();
  if (t === 'outline') renderOutline();
  if (t === 'fact') renderFact();
  if (t === 'sources') renderSources();
  if (t === 'learn') renderScoreboard();
  if (t === 'm3d') render3DPanel();
  if (t === 'calc') renderCalcPanel();
  buildRail(); updateGhostCaret();
}
function showPanel(on) {
  if (isMobile()) { mobilePanel = on; app.classList.toggle('m-panel', on); if (on) setSide(false); }
  else { panelOpen = on; prefs.set('panel', on); app.classList.toggle('panel-closed', !on); }
  buildRail(); setTimeout(() => { padResize(); updateObjbar(); updateGhostCaret(); }, 240);
}
function openPanel(t) { setPtab(t); showPanel(true); }
function togglePanel(t) { if (panelShown() && ptab === t) showPanel(false); else openPanel(t); }
$('#closePanel').append(svg('chevR'));
$('#closePanel').addEventListener('click', () => showPanel(false));

/* left: notebooks */
function setSide(on) { app.classList.toggle('side-open', !!on && isMobile()); }
function toggleSide() {
  if (isMobile()) { setSide(!app.classList.contains('side-open')); return; }
  const closed = !app.classList.contains('side-closed');
  app.classList.toggle('side-closed', closed); prefs.set('sideClosed', closed);
  setTimeout(() => { updateObjbar(); }, 240);
}
$('#openSide').append(svg('sidebar'));
$('#openSide').addEventListener('click', toggleSide);
$('#closeSide').append(svg('chevL'));
$('#closeSide').addEventListener('click', () => (isMobile() ? setSide(false) : toggleSide()));
$('#drawerScrim').addEventListener('click', () => { setSide(false); if (isMobile()) showPanel(false); });
matchMedia('(max-width: 900px)').addEventListener('change', () => { app.classList.remove('side-open', 'm-panel'); mobilePanel = false; app.classList.toggle('panel-closed', !panelOpen); buildRail(); });

/* ================= format panel ================= */
let fmtTimer = null;
function refreshFormatSoon() { clearTimeout(fmtTimer); fmtTimer = setTimeout(() => { if (ptab === 'format' && panelShown()) { const p = $('#ptab-format'); if (!p.contains(document.activeElement)) refreshFormat(); } }, 60); }
function liveCtl(el, o, apply) {
  let pushed = false;
  el.addEventListener('focus', () => { if (!pushed) { pushUndo(); pushed = true; } });
  el.addEventListener('pointerdown', () => { if (!pushed) { pushUndo(); pushed = true; } });
  el.addEventListener('blur', () => { pushed = false; });
  el.addEventListener('input', () => { apply(el); changed(o); view.renderAll(); saveDoc('main'); });
  return el;
}
function refreshFormat() {
  const p = $('#ptab-format'); p.textContent = '';
  if (!cur || !doc) { p.append(h('p', { class: 'empty-panel' }, 'Open a page first.')); return; }
  const objs = selObjs();
  const row = (label, ...ctl) => h('div', { class: 'frow' }, h('label', null, label), ...ctl);
  if (!objs.length && !sel.ink.size) {
    p.append(h('p', { class: 'hint' }, 'Select a picture, box, chart, mind map or line to change it here.'),
      h('h3', null, 'This page'),
      row('Type', rselect('Page type', [['a4', 'A4 pages'], ['endless', 'Endless page'], ['board', 'Drawing board']], doc.kind, (v) => convertKind(v))),
      row('Paper', rselect('Paper', PAGE_BG, doc.bg, (v) => { if (cur.ro) return; doc.bg = v; doc.mu = now(); view.rebuild(); saveDoc('main'); })),
      row('Colour', h('button', { class: 'btn small', onclick: (e) => { if (!cur.ro) pageStylePop(e.currentTarget); } }, h('span', { class: 'pc-dot', style: { background: (doc.pcol && doc.pcol.bg) || 'var(--sheet)' } }), doc.pcol ? 'Change' : 'Normal')),
      doc.kind === 'a4' ? row('Setup', h('button', { class: 'btn small', onclick: (e) => pageSetupMenu(e.currentTarget) }, pageSizeName() + (doc.po === 'l' ? ', sideways' : '') + ((doc.hd || doc.ft) ? ', header/footer' : ''))) : null);
    const counts = {}; for (const o of objList()) counts[o.t] = (counts[o.t] || 0) + 1;
    const words = (doc.flows || []).reduce((a, f) => a + (htmlStrToText(f).match(/\S+/g) || []).length, 0) + objList((o) => o.html).reduce((a, o) => a + (htmlStrToText(o.html).match(/\S+/g) || []).length, 0);
    p.append(h('h3', null, 'On this page'), h('p', { class: 'hint' }, words + ' words, ' + (counts.image || 0) + ' pictures, ' + ((counts.note || 0) + (counts.sticky || 0) + (counts.text || 0)) + ' boxes, ' + (counts.chart || 0) + ' charts, ' + (counts.mm || 0) + ' mind maps, ' + strokeList().length + ' drawings.'));
    return;
  }
  if (objs.length !== 1 || sel.ink.size) {
    p.append(h('p', { class: 'hint' }, (objs.length + sel.ink.size) + ' things selected.'));
    if (objs.length > 1) p.append(h('h3', null, 'Line up'), h('div', { class: 'btnrow' }, [['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']].map(([k, l]) => h('button', { class: 'btn small', onclick: () => alignSel(k) }, l))));
    p.append(h('h3', null, 'Arrange'), arrangeRow(), h('div', { class: 'btnrow' }, h('button', { class: 'btn small', onclick: duplicateSel }, svg('dup'), 'Duplicate'), h('button', { class: 'btn small', onclick: deleteSel }, svg('trash'), 'Delete')));
    return;
  }
  const o = objs[0], T = OBJ[o.t] || { label: 'Line' };
  p.append(h('p', { class: 'hint', style: { fontWeight: '700', color: 'var(--ink)' } }, o.t === 'conn' ? 'Connector line' : T.label));
  const num = (k, min, max, step) => liveCtl(h('input', { type: 'number', value: Math.round((o[k] || 0) * 10) / 10, min, max, step: step || 1, 'aria-label': k }), o, (el) => { const v = parseFloat(el.value); if (isFinite(v)) o[k] = v; });
  if (cur.ro) { p.append(h('p', { class: 'hint' }, 'This page is view only.')); return; }
  if (o.t !== 'conn' && o.t !== 'frame') { const ni = h('input', { type: 'text', value: o.name || baseName(o), 'aria-label': 'Name' }); ni.addEventListener('change', () => { const v = uniqueName(ni.value, o.id); ni.value = v; setProp(o, 'name', v); }); p.append(row('Name', ni)); }
  if (o.t === 'chart') { p.append(chartEditor(o)); }
  if (o.t !== 'conn') {
    p.append(h('h3', null, 'Position and size'), row('Left / top', num('x', -1e5, 1e5), num('y', -1e5, 1e5)));
    if (T.handles !== 'none') p.append(row('Width / height', num('w', 10, 1e4), o.ah ? h('span', { class: 'hint', style: { margin: 0 } }, 'grows with text') : num('h', 10, 1e4)));
    if (T.handles !== 'none' && o.t !== 'frame' && !T.norot) {
      const rs = liveCtl(h('input', { type: 'range', min: 0, max: 359, value: o.r || 0, 'aria-label': 'Rotation' }), o, (el) => { o.r = +el.value; rn.value = el.value; });
      const rn = liveCtl(h('input', { type: 'number', min: 0, max: 359, value: o.r || 0, 'aria-label': 'Rotation degrees' }), o, (el) => { o.r = ((+el.value % 360) + 360) % 360; rs.value = o.r; });
      p.append(row('Rotation', rs, rn));
    }
    p.append(h('h3', null, 'Arrange'), arrangeRow());
    if (view.kind !== 'board') {
      const front = h('input', { type: 'radio', name: 'wrap', checked: o.lay !== 'back' ? true : null }), back = h('input', { type: 'radio', name: 'wrap', checked: o.lay === 'back' ? true : null });
      front.addEventListener('change', () => setWrap('front')); back.addEventListener('change', () => setWrap('back'));
      p.append(h('label', { class: 'opt' }, front, 'In front of text'), h('label', { class: 'opt' }, back, 'Behind text'));
    }
  }
  const colorRow = (label, key, none) => row(label, h('button', { class: 'btn small', onclick: (e) => openPalette(e.currentTarget, (c) => setProp(o, key, c === null && none ? null : c), { none: none || null, value: o[key] }) }, h('span', { style: { width: '14px', height: '14px', borderRadius: '4px', background: o[key] || 'transparent', border: '1px solid var(--line)', display: 'inline-block' } }), o[key] ? 'Change' : (none || 'Pick')));
  const check = (label, key, invert) => { const c = h('input', { type: 'checkbox', checked: (invert ? !o[key] : !!o[key]) ? true : null }); c.addEventListener('change', () => setProp(o, key, invert ? !c.checked : c.checked)); return h('label', { class: 'opt' }, c, label); };
  if (o.t === 'image') {
    p.append(h('h3', null, 'Picture'),
      row('See-through', liveCtl(h('input', { type: 'range', min: 10, max: 100, value: Math.round((o.op != null ? o.op : 1) * 100) }), o, (el) => { o.op = +el.value / 100; })),
      row('Round corners', liveCtl(h('input', { type: 'range', min: 0, max: 200, value: o.rad != null ? o.rad : 6 }), o, (el) => { o.rad = +el.value; })),
      colorRow('Border', 'bd', 'No border'),
      row('Description', liveCtl(h('input', { type: 'text', value: o.alt || '', placeholder: 'What’s in the picture' }), o, (el) => { o.alt = el.value; })));
  } else if (o.t === 'note') {
    p.append(h('h3', null, 'Note box'), h('div', { class: 'btnrow' }, h('button', { class: 'btn small', onclick: (e) => openStyleFor([o], e.currentTarget) }, svg('palette'), 'Colour styles…')),
      colorRow('Background', 'bg', 'Default'), colorRow('Border colour', 'bc', 'Default'), colorRow('Text colour', 'tc', 'Default'), check('Border', 'nobd', true), check('Shadow', 'nosh', true), check('Height grows with the text', 'ah'));
  } else if (o.t === 'text') {
    p.append(h('h3', null, 'Text box'), h('div', { class: 'btnrow' }, h('button', { class: 'btn small', onclick: (e) => openStyleFor([o], e.currentTarget) }, svg('palette'), 'Colour styles…')),
      colorRow('Text colour', 'tc', 'Default'), colorRow('Fill', 'bg', 'No fill (see-through)'),
      row('See-through', liveCtl(h('input', { type: 'range', min: 0, max: 100, value: Math.round((1 - (o.fo != null ? o.fo : 0.5)) * 100), 'aria-label': 'How see-through the fill is', disabled: o.bg ? null : true }), o, (el) => { o.fo = Math.round(100 - +el.value) / 100; })),
      colorRow('Outline', 'bc', 'No outline'),
      row('Outline width', liveCtl(h('input', { type: 'range', min: 1, max: 8, step: 0.5, value: o.bw || 1.5, 'aria-label': 'Outline width' }), o, (el) => { o.bw = +el.value; })),
      row('Round corners', liveCtl(h('input', { type: 'range', min: 0, max: 40, value: o.rad != null ? o.rad : 6, 'aria-label': 'Round corners' }), o, (el) => { o.rad = +el.value; })),
      check('Height grows with the text', 'ah'));
  } else if (o.t === 'sticky') {
    p.append(h('h3', null, 'Sticky note'), h('div', { class: 'swatches', style: { margin: '0 0 10px' } }, Object.keys(STICKY).map((c) => h('button', { class: 'sw', style: { background: STICKY[c] }, 'aria-label': c, 'aria-pressed': String(o.col === c), onclick: () => setProp(o, 'col', c) }))),
      row('Text size', liveCtl(h('input', { type: 'range', min: 14, max: 48, value: o.fs || 22 }), o, (el) => { o.fs = +el.value; })));
  } else if (o.t === 'shape') {
    p.append(h('h3', null, 'Shape'), row('Shape', rselect('Shape', Object.entries(SHAPES), o.k || 'rect', (v) => setProp(o, 'k', v))),
      colorRow('Fill', 'fill', 'No fill'), colorRow('Border', 'stroke', null), colorRow('Text colour', 'tc', 'Default'),
      row('Border width', liveCtl(h('input', { type: 'range', min: 0, max: 14, value: o.sw != null ? o.sw : 2 }), o, (el) => { o.sw = +el.value; })));
  } else if (o.t === 'mm') {
    p.append(h('h3', null, 'Mind map'), row('Layout', rselect('Layout', MM_LAYOUTS, o.lay || 'right', (v) => { prefs.set('mmLay', v); setProp(o, 'lay', v); })), row('Style', rselect('Style', MM_STYLES.map((s, i) => [i, s.name]), o.sty || 0, (v) => setProp(o, 'sty', +v))),
      h('div', { class: 'btnrow' }, h('button', { class: 'btn small', onclick: () => MM.addChildOfSelected(sel.surf, o) }, svg('plus'), 'Add idea'),
        h('button', { class: 'btn small', onclick: () => { const walk = (n) => { n.col = false; (n.ch || []).forEach(walk); }; pushUndo(); walk(o.tree); changed(o); view.renderAll(); saveDoc('main'); } }, 'Show everything')),
      h('p', { class: 'hint' }, 'Click an idea, then press Tab for a new child idea, Enter for a sibling, Delete to remove it. Double-click to edit.'));
  } else if (o.t === 'conn') {
    p.append(h('h3', null, 'Line'), row('Style', rselect('Line style', [['curve', 'Curved'], ['straight', 'Straight'], ['elbow', 'Elbow']], o.cs || 'curve', (v) => setProp(o, 'cs', v))),
      row('Arrows', rselect('Arrows', [['end', 'At the end'], ['both', 'Both ends'], ['none', 'None']], o.ar || 'end', (v) => setProp(o, 'ar', v))),
      colorRow('Colour', 'c', 'Default'), row('Width', liveCtl(h('input', { type: 'range', min: 1, max: 10, value: o.sw || 2 }), o, (el) => { o.sw = +el.value; })), check('Dashed', 'dash'),
      row('Label', liveCtl(h('input', { type: 'text', value: o.label || '', placeholder: 'Text on the line' }), o, (el) => { o.label = el.value; })));
  } else if (o.t === 'frame') {
    p.append(h('h3', null, 'Frame'), row('Name', liveCtl(h('input', { type: 'text', value: o.title || '' }), o, (el) => { o.title = el.value; })), colorRow('Border', 'c', 'Default'), colorRow('Fill', 'fill', 'Default'),
      h('button', { class: 'btn small', onclick: () => present(o.id) }, svg('present'), 'Present from here'));
  } else if (o.t === 'paper') {
    const sz = h('select', { 'aria-label': 'Page size' }, ['A4', 'A3'].map((x) => h('option', { value: x, selected: (o.size || 'A4') === x ? true : null }, x)));
    sz.addEventListener('change', () => setPaper(o, sz.value, o.land));
    const or = h('select', { 'aria-label': 'Orientation' }, [['0', 'Portrait'], ['1', 'Landscape']].map(([v, l]) => h('option', { value: v, selected: (o.land ? '1' : '0') === v ? true : null }, l)));
    or.addEventListener('change', () => setPaper(o, o.size || 'A4', or.value === '1'));
    const bgs = h('select', { 'aria-label': 'Background' }, PAPER_BG.map(([v, l]) => h('option', { value: v, selected: (o.pbg || 'blank') === v ? true : null }, l)));
    bgs.addEventListener('change', () => setProp(o, 'pbg', bgs.value));
    p.append(h('h3', null, 'Paper page'), row('Size', sz), row('Orientation', or), row('Background', bgs), h('p', { class: 'hint' }, 'Drawings and boxes lying on the page move with it. Resizing keeps the real page proportions.'));
  } else if (o.t === 'm3d') {
    p.append(h('h3', null, '3D window'),
      h('div', { class: 'btnrow' }, h('button', { class: 'btn small', onclick: () => expandWin(o.id) }, svg('fit'), 'Expand'), h('button', { class: 'btn small', onclick: (e) => linkMenuWin(e.currentTarget, o.id) }, svg('link'), 'Link a model')));
    if ((o.links || []).length) { p.append(h('h3', null, 'Linked models')); o.links.forEach((l, i) => p.append(linkRowWin(o, i))); }
  } else if (o.t === 'card') {
    const pages = Object.values(tree.nodes).filter((n) => live(n) && n.type === 'note');
    p.append(h('h3', null, 'Page link'), row('Opens', rselect('Page', pages.map((n) => [n.id, n.name]), o.target, (v) => setProp(o, 'target', v))), h('button', { class: 'btn small', onclick: () => openNote(o.target) }, svg('open'), 'Open page'));
  }
  p.append(h('div', { class: 'sect' }, h('div', { class: 'btnrow' }, h('button', { class: 'btn small', onclick: duplicateSel }, svg('dup'), 'Duplicate'), h('button', { class: 'btn small', onclick: deleteSel }, svg('trash'), 'Delete'))));
}
function arrangeRow() {
  return h('div', { class: 'btnrow' },
    h('button', { class: 'btn small', onclick: () => arrange('front') }, svg('front'), 'To front'), h('button', { class: 'btn small', onclick: () => arrange('fwd') }, 'Forward'),
    h('button', { class: 'btn small', onclick: () => arrange('bwd') }, 'Backward'), h('button', { class: 'btn small', onclick: () => arrange('back') }, svg('back'), 'To back'));
}

/* ================= outline ================= */
let olTimer = null;
function scheduleOutline() { clearTimeout(olTimer); olTimer = setTimeout(() => { if (ptab === 'outline' && panelShown()) renderOutline(); }, 500); }
function renderOutline() {
  const p = $('#ptab-outline'); p.textContent = '';
  if (!cur || !doc || !view) { p.append(h('p', { class: 'empty-panel' }, 'Open a page first.')); return; }
  if (view.kind === 'a4') {
    p.append(h('h3', null, 'Pages'));
    doc.flows.forEach((f, i) => {
      const t = htmlStrToText(f).replace(/^#+\s*/gm, '').split('\n').find((x) => x.trim()) || 'Empty page';
      p.append(h('button', { class: 'ol-item', onclick: () => { const s = view.surf(i); if (s) s.el.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); } }, svg('a4'), h('span', null, 'Page ' + (i + 1) + ': ' + t.slice(0, 40))));
    });
    if (!cur.ro) p.append(h('button', { class: 'btn small', style: { marginTop: '6px' }, onclick: () => view.addPage(doc.flows.length) }, svg('plus'), 'Add a page'));
  }
  if (view.kind !== 'board') {
    const heads = [];
    view.surfaces.forEach((s) => { if (s && s.L.flow) for (const hEl of s.L.flow.querySelectorAll('h1,h2,h3')) if (hEl.textContent.trim()) heads.push(hEl); });
    p.append(h('h3', null, 'Headings'));
    if (!heads.length) p.append(h('p', { class: 'hint' }, 'Headings you add (Home → text style) show up here.'));
    for (const hEl of heads) p.append(h('button', { class: 'ol-item ' + hEl.tagName.toLowerCase(), onclick: () => { hEl.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); flashEl(hEl); } }, hEl.textContent.trim().slice(0, 60)));
  } else {
    const frames = objList((o) => o.t === 'frame').sort((a, b) => a.y - b.y || a.x - b.x);
    p.append(h('h3', null, 'Frames'));
    if (!frames.length) p.append(h('p', { class: 'hint' }, 'Frames group parts of the board, like slides. Insert → Frame.'));
    for (const f of frames) p.append(h('button', { class: 'ol-item', onclick: () => { view.focusBox({ x: f.x, y: f.y, w: f.w, h: f.h }, null, 40); selectOnly(view.surf(0), [f.id]); } }, svg('frame'), f.title || 'Frame'));
    if (frames.length) p.append(h('button', { class: 'btn small', style: { marginTop: '6px' }, onclick: () => present() }, svg('present'), 'Present'));
  }
  const mms = objList((o) => o.t === 'mm'), charts = objList((o) => o.t === 'chart');
  if (mms.length || charts.length) {
    p.append(h('h3', null, 'Mind maps and charts'));
    for (const o of [...mms, ...charts]) p.append(h('button', { class: 'ol-item', onclick: () => jumpToObj(o.id) }, svg(o.t === 'mm' ? 'mindmap' : 'chart'), o.t === 'mm' ? (o.tree && o.tree.text) || 'Mind map' : ((o.chart || {}).title || 'Chart')));
  }
}
function flashEl(el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1900); }
function jumpToObj(id) {
  const o = doc.objs[id]; if (!o || o.del) return false;
  if (o.pin && view.pinSurf) { const pe = view.pinSurf.objEls.get(id); selectOnly(view.pinSurf, [id]); if (pe) flashEl(pe); return true; }
  const s = view.kind === 'a4' ? view.surf(o.sh || 0) : view.surf(0); if (!s) return false;
  if (view.kind === 'board') view.centerOn(o.x + (o.w || 0) / 2, o.y + (o.h || 0) / 2);
  const el = s.objEls.get(id);
  if (el) { if (view.scroller) el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); flashEl(el); }
  selectOnly(s, [id]);
  return true;
}

/* ================= handwriting pad ================= */
const pad = { cv: $('#pad'), strokes: [], cur: null, timer: null, busy: false, sending: 0, ctl: null, color: prefs.get('padColor', 'ink'), size: prefs.get('padSize', 3.6), lastSvg: null, lastObj: null, lastKind: null };
const HW_PROMPT = 'This image is handwriting drawn with a finger or pen on a drawing pad (dark strokes on white). Transcribe exactly what is written. Reply with only the written characters: no quotes, no explanation, no extra words. Keep upper- and lowercase as drawn. A single letter or digit is a valid answer. Include punctuation only if it is drawn. If nothing readable is written, reply with exactly <none>.';
pad.ctx = pad.cv.getContext('2d');
function padResize() {
  const r = pad.cv.getBoundingClientRect(); if (!r.width) return;
  const dpr = window.devicePixelRatio || 1;
  pad.cv.width = Math.round(r.width * dpr); pad.cv.height = Math.round(r.height * dpr);
  padDraw();
}
if (window.ResizeObserver) new ResizeObserver(padResize).observe(pad.cv);
function padStroke(ctx, s) {
  s = s.pts || s;
  if (s.length === 1) { ctx.beginPath(); ctx.arc(s[0][0], s[0][1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
  ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]);
  for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
  ctx.stroke();
}
function padDraw() {
  const ctx = pad.ctx, dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, pad.cv.width, pad.cv.height);
  const ink = cssVar('--ink') || '#1E2740';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  pad.strokes.forEach((s, i) => { const c = !s.c || s.c === 'ink' ? ink : s.c; ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = s.w || 3.6; ctx.globalAlpha = i < pad.sending ? 0.35 : 1; padStroke(ctx, s); });
  ctx.globalAlpha = 1;
}
const padPt = (e) => { const r = pad.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const autoOn = () => $('#padAuto').checked;
const padDelay = () => +$('#padDelay').value;
pad.cv.addEventListener('pointerdown', (e) => { e.preventDefault(); try { pad.cv.setPointerCapture(e.pointerId); } catch {} clearTimeout(pad.timer); pad.cur = { c: pad.color, w: pad.size, pts: [padPt(e)] }; pad.strokes.push(pad.cur); padDraw(); });
pad.cv.addEventListener('pointermove', (e) => { if (!pad.cur) return; const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const ev of evs) pad.cur.pts.push(padPt(ev)); padDraw(); });
const padEnd = () => { if (!pad.cur) return; pad.cur = null; if (autoOn() && padMode() === 'write') { clearTimeout(pad.timer); pad.timer = setTimeout(recognize, padDelay()); } };
pad.cv.addEventListener('pointerup', padEnd);
pad.cv.addEventListener('pointercancel', padEnd);
function padState(msg, busy) {
  const el = $('#padState'); el.textContent = '';
  if (!msg) { el.hidden = true; return; }
  if (busy) el.append(h('span', { class: 'spinner' }));
  el.append(h('span', null, msg)); el.hidden = false;
}
async function padBlob(strokes, colored) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of (s.pts || s)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pd = 18, w = Math.max(1, x1 - x0) + pd * 2, hh = Math.max(1, y1 - y0) + pd * 2;
  const k = Math.max(1, Math.min(4, 220 / hh));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hh * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, (pd - x0) * k, (pd - y0) * k);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  strokes.forEach((s) => { const c = colored && s.c && s.c !== 'ink' ? s.c : '#111'; ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = colored ? Math.max(3, (s.w || 3.6) * 1.1) : 4.2; padStroke(ctx, s); });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/png'));
}
async function recognize() {
  clearTimeout(pad.timer);
  if (pad.busy || !pad.strokes.length || pad.cur) return;
  if (!AI.ok) { padState('Handwriting works ' + Platform.aiWhere + '.'); return; }
  if (!AI.img) { padState(AI.noPics); return; }
  if (!cur || cur.loading) { padState('Open a page first.'); return; }
  if (cur.ro) { padState('This page is view only.'); return; }
  const n = pad.strokes.length;
  pad.busy = true; pad.sending = n; padDraw(); padState('Reading…', true);
  pad.ctl = new AbortController();
  try {
    const blob = await padBlob(pad.strokes.slice(0, n));
    const { text } = await AI.text(HW_PROMPT, { task: 'pad.read', images: [blob], modelTier: 'quick', signal: pad.ctl.signal });
    let t = text.trim().replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '');
    pad.strokes.splice(0, n);
    if (!t || /^<none>$/i.test(t)) padState('Couldn’t read that. Try writing it a bit bigger.');
    else { if ($('#padSpace').checked) t += ' '; insertTextAtSaved(t); padState(''); $('#padLast').textContent = 'Typed “' + t.trim() + '”'; }
  } catch (e) {
    if (!e || e.code !== 'cancelled') padState(aiErrorText(e));
  } finally {
    pad.busy = false; pad.sending = 0; padDraw();
    if (pad.strokes.length && autoOn() && padMode() === 'write' && !pad.cur) pad.timer = setTimeout(recognize, padDelay());
  }
}
function padTarget() {
  if (activeEd && activeEd.isConnected && work.contains(activeEd) && activeEd.isContentEditable) {
    const r = savedRange && activeEd.contains(savedRange.startContainer) ? savedRange.cloneRange() : endRange(activeEd);
    return { ed: activeEd, r };
  }
  if (!view) return null;
  if (view.kind === 'board') {
    const one = sel.has && selObjs().length === 1 ? selObjs()[0] : null;
    let o = one && OBJ[one.t] && OBJ[one.t].text ? one : null;
    if (!o) o = insertObj({ t: 'note', w: 300, h: 60, ah: true, html: '' }, { noScroll: true });
    if (!o) return null;
    enterEdit(view.surf(0), o); if (!editing) return null;
    document.activeElement.blur(); activeEd = editing ? editing.tx : activeEd;
    const tx = view.surf(0).objEls.get(o.id).querySelector('.otext');
    if (!editing) { enterEdit(view.surf(0), o); }
    return { ed: tx, r: endRange(tx) };
  }
  const f = view.flowEl(view.kind === 'a4' ? doc.flows.length - 1 : 0);
  activeEd = f;
  return { ed: f, r: endRange(f) };
}
function setPadCaret(ed, r) {
  savedRange = r; activeEd = ed;
  const s = getSelection();   // also when the page text isn't focused but holds the selection, so it can't pull the caret back
  if (document.activeElement === ed || (s.rangeCount && ed.contains(s.getRangeAt(0).startContainer))) { s.removeAllRanges(); s.addRange(r); }
}
function edChanged(ed) { if (ed.classList.contains('flow')) onFlowInput(ed); else if (ed.classList.contains('otext')) { const el = ed.closest('.obj'); const o = el && doc.objs[el.dataset.id]; if (o) { o.html = ed.innerHTML; changed(o); saveDoc('main'); } } }
/* fmt { font, size } (optional): the text gets that font and size (px), as chosen on the pad on another screen */
function insertTextAtSaved(text, fmt) {
  if (!cur || cur.loading || cur.ro) return;
  const t = padTarget(); if (!t) return;
  const { ed } = t; let r = t.r;
  if (!fmt && typingFmt && typingFmt.ed === ed && r.collapsed && r.startContainer === typingFmt.c && r.startOffset === typingFmt.o) fmt = { font: typingFmt.font, size: typingFmt.size };
  typingFmt = null;
  r.deleteContents();
  const blk = r.startContainer.nodeType === 1 ? r.startContainer.closest('p,h1,h2,h3,h4,li,blockquote,pre') : r.startContainer.parentNode.closest('p,h1,h2,h3,h4,li,blockquote,pre');
  if (blk && blk.childNodes.length === 1 && blk.firstChild.nodeName === 'BR') { blk.removeChild(blk.firstChild); r = document.createRange(); r.setStart(blk, 0); r.collapse(true); }
  const tn = document.createTextNode(text.replace(/ $/, '\u00a0'));
  let node = tn;
  if (fmt && (fmt.font || fmt.size)) {
    const sp = document.createElement('span');
    if (fmt.font) sp.style.fontFamily = fmt.font;
    if (fmt.size) sp.style.fontSize = fmt.size + 'px';
    const host = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer;
    if (!(host.nodeName === 'SPAN' && host.getAttribute('style') === sp.getAttribute('style'))) { sp.append(tn); node = sp; }   // already inside the same style: just add the text
  }
  r.insertNode(node);
  if (node.parentNode === ed && ed.classList.contains('flow')) { const p = h('p'); node.before(p); p.append(node); }
  let prev = node.previousSibling; if (prev && prev.nodeType === 1 && prev.nodeName === 'SPAN') prev = prev.lastChild;
  if (prev && prev.nodeType === 3 && prev.data.endsWith('\u00a0') && !/^\s/.test(text)) prev.replaceData(prev.length - 1, 1, ' ');   // only that letter: setting .data would move the caret to the start of the line
  const nr = document.createRange(); nr.setStart(tn, tn.length); nr.collapse(true);
  setPadCaret(ed, nr); edChanged(ed); updateGhostCaret();
}
function padBackspace() {
  const t = padTarget(); if (!t || cur.ro) return;
  const { ed } = t; let r = t.r;
  if (!r.collapsed) { r.deleteContents(); r.collapse(true); setPadCaret(ed, r); edChanged(ed); return; }
  const sc = r.startContainer, so = r.startOffset;
  if (sc.nodeType === 3 && so > 0) { r.setStart(sc, so - 1); r.deleteContents(); }
  else {
    const pos = document.createRange(); pos.setStart(sc, so); pos.collapse(true);
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let prev = null; while (w.nextNode()) { const tt = w.currentNode; if (tt.length && pos.comparePoint(tt, tt.length) <= 0) prev = tt; else if (tt.length) break; }
    if (!prev) return;
    r = document.createRange(); r.setStart(prev, prev.length - 1); r.setEnd(prev, prev.length); r.deleteContents();
  }
  r.collapse(true); setPadCaret(ed, r); edChanged(ed); updateGhostCaret();
}
function padEnter() {
  const t = padTarget(); if (!t || cur.ro) return;
  const { ed, r } = t;
  const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
  const blk = n.closest('p,h1,h2,h3,h4,li,blockquote,pre');
  if (!blk || !ed.contains(blk)) { const p = h('p', null, h('br')); ed.append(p); const nr = document.createRange(); nr.setStart(p, 0); nr.collapse(true); setPadCaret(ed, nr); edChanged(ed); return; }
  const tag = blk.tagName === 'LI' ? 'LI' : 'P';
  const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(blk, blk.childNodes.length);
  const frag = tail.extractContents();
  const nb = document.createElement(tag); nb.append(frag);
  const empty = (x) => !x.textContent.replace(/\u00a0/g, '').trim() && !x.querySelector('img');
  if (empty(nb)) nb.innerHTML = '<br>';
  if (empty(blk)) blk.innerHTML = '<br>';
  blk.after(nb);
  const nr = document.createRange(); nr.setStart(nb, 0); nr.collapse(true); setPadCaret(ed, nr); edChanged(ed); updateGhostCaret();
}
$('#kSpace').addEventListener('click', () => insertTextAtSaved(' '));
$('#kBack').addEventListener('click', padBackspace);
$('#kEnter').addEventListener('click', padEnter);
$('#kClear').addEventListener('click', () => { clearTimeout(pad.timer); if (pad.ctl && pad.busy) pad.ctl.abort(); pad.strokes = []; padDraw(); padState(''); });
$('#kType').addEventListener('click', recognize);
$('#padDelay').addEventListener('input', (e) => { $('#padDelayV').textContent = (e.target.value / 1000).toFixed(1) + ' s'; prefs.set('padDelay', +e.target.value); });
$('#padAuto').addEventListener('change', (e) => prefs.set('padAuto', e.target.checked));
$('#padSpace').addEventListener('change', (e) => prefs.set('padSpace', e.target.checked));

/* where the pad will type, shown while the text isn't focused */
const ghost = $('#ghost');
function updateGhostCaret() {
  const ed = activeEd && activeEd.isConnected && work.contains(activeEd) ? activeEd : null;
  const show = cur && !cur.loading && !cur.ro && ptab === 'pen' && panelShown() && ed && document.activeElement !== ed && ed.isContentEditable && savedRange && ed.contains(savedRange.startContainer);
  if (!show) { ghost.hidden = true; return; }
  const r = savedRange.cloneRange(); r.collapse(true);
  let rect = r.getClientRects()[0];
  if (!rect || (!rect.height && !rect.width)) { const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode; const br = n.getBoundingClientRect(); rect = { left: br.left, top: br.top + 2, height: 22, bottom: br.top + 24 }; }
  const wr = work.getBoundingClientRect();
  if (rect.bottom < wr.top || rect.top > wr.bottom) { ghost.hidden = true; return; }
  ghost.style.left = rect.left + 'px'; ghost.style.top = rect.top + 'px'; ghost.style.height = Math.max(16, rect.height) + 'px';
  ghost.hidden = false;
}
addEventListener('resize', () => updateGhostCaret());

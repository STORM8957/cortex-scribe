
/* ================= tools ================= */
function defaultTool() { return view && view.kind === 'board' ? 'select' : 'text'; }
const TOOL_HINTS = {
  magic: () => 'Magic box: drag a box around anything. It will: ' + (magicOn().map(magicLabel).join(', ') || 'nothing yet, switch something on') + '.',
  area: () => 'Fact check: drag a box around the part you want checked.',
  connector: () => 'Connector: drag from one box to another. Release on empty space to make a new box.',
  lasso: () => 'Lasso: draw a loop around drawings and boxes to choose them. Then drag inside the frame to move them, or change their colour in the bar.',
  tbox: () => 'Text box: drag on the page to draw it, or just click. It’s see-through, like in Word. Esc to stop.',
};
function setTool(t) {
  if (!view) { tool = t; return; }
  if (cur && cur.ro && /^(pen|hl|eraser|connector|magic|tbox)$/.test(t)) return toast('This page is view only.');
  if (t === 'text' && view.kind === 'board') t = 'select';
  if (t === 'hand' && view.kind !== 'board') t = 'select';
  if (editing) exitEdit();
  tool = t;
  applyToolClass();
  const hint = TOOL_HINTS[t];
  $('#toolhint').hidden = !hint;
  if (hint) $('#toolhintText').textContent = hint();
  $$('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  $$('.magic-go').forEach((b) => b.setAttribute('aria-pressed', String(t === 'magic')));
  updateGhostCaret();
}
function applyToolClass() {
  work.className = 'work view' + (view ? ' kind-' + view.kind : '') + ' tool-' + tool + (linkMode ? ' linking' : '') + (cur && cur.ro ? ' ro' : '');
}
$('#toolhintCancel').addEventListener('click', () => setTool(defaultTool()));

/* ================= text formatting ================= */
function targetEditable() {
  const ed = activeEd && work.contains(activeEd) && activeEd.isContentEditable ? activeEd : null;
  if (ed) return ed;
  const one = sel.has && selObjs().length === 1 ? selObjs()[0] : null;
  if (one && OBJ[one.t] && OBJ[one.t].text && !cur.ro) {
    enterEdit(sel.surf, one);
    if (editing) { const r = document.createRange(); r.selectNodeContents(editing.tx); const s = getSelection(); s.removeAllRanges(); s.addRange(r); savedRange = r.cloneRange(); return editing.tx; }
  }
  return null;
}
function withSel(fn) {
  if (!cur || cur.ro) return;
  const ed = targetEditable();
  if (!ed) return toast('Click into some text first, or select a box.');
  const live0 = getSelection();   // the live caret is newer than savedRange right after fast typing
  if (live0.rangeCount && ed.contains(live0.getRangeAt(0).startContainer)) savedRange = live0.getRangeAt(0).cloneRange();
  ed.focus({ preventScroll: true });
  if (savedRange && ed.contains(savedRange.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
  try { document.execCommand('styleWithCSS', false, true); } catch {}
  fn(ed);
  const s = getSelection(); if (s.rangeCount) savedRange = s.getRangeAt(0).cloneRange();
  afterFormat(ed);
}
function afterFormat(ed) {
  if (ed.classList.contains('flow')) onFlowInput(ed);
  else if (ed.classList.contains('pg-hf')) hfInput();   // 51_pagesetup.js
  else if (ed.classList.contains('otext')) onObjText(ed);
  syncRibbonState();
}
const cmd = (c, v) => () => withSel(() => document.execCommand(c, false, v == null ? null : v));
/* a size or font picked with nothing selected only reaches typed keys (the browser keeps it as a pending style),
   so it is remembered here for that spot, and text from the handwriting pad gets it too (insertTextAtSaved) */
let typingFmt = null;
function rememberTypingFmt(k, v) {
  const r = savedRange, ed = r && targetEditable();
  if (!r || !r.collapsed || !ed || !ed.contains(r.startContainer)) return;
  const same = typingFmt && typingFmt.ed === ed && typingFmt.c === r.startContainer && typingFmt.o === r.startOffset;
  typingFmt = { ...(same ? typingFmt : {}), ed, c: r.startContainer, o: r.startOffset, [k]: v };
}
function setFontSize(px) {
  withSel((ed) => {
    try { document.execCommand('styleWithCSS', false, false); } catch {}
    document.execCommand('fontSize', false, '7');
    for (const f of ed.querySelectorAll('font[size="7"]')) { const sp = document.createElement('span'); sp.style.fontSize = px + 'px'; while (f.firstChild) sp.appendChild(f.firstChild); f.replaceWith(sp); }
    for (const sp of ed.querySelectorAll('span[style*="xxx-large"]')) sp.style.fontSize = px + 'px';
    try { document.execCommand('styleWithCSS', false, true); } catch {}
  });
  rememberTypingFmt('size', px);
}
function caretStyle() {
  const r = savedRange; if (!r) return null;
  const n = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer;
  return n && n.nodeType === 1 ? getComputedStyle(n) : null;
}
function growText(dir) {
  const cs = caretStyle(); const cur0 = cs ? parseFloat(cs.fontSize) : 16;
  const steps = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72];
  let i = steps.findIndex((s) => s >= Math.round(cur0)); if (i < 0) i = steps.length - 1;
  setFontSize(steps[clamp(i + dir, 0, steps.length - 1)]);
}
function blocksInSel(ed) {
  const s = getSelection(); if (!s.rangeCount) return [];
  const r = s.getRangeAt(0);
  const out = [...ed.querySelectorAll('p,h1,h2,h3,h4,li,blockquote,pre')].filter((b) => r.intersectsNode(b) && !b.querySelector('p,h1,h2,h3,h4,li'));
  if (!out.length) { const n = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer; const b = n.closest && n.closest('p,h1,h2,h3,h4,li,blockquote,pre'); if (b && ed.contains(b)) out.push(b); }
  return out;
}
function indent(dir) {
  withSel((ed) => {
    const s = getSelection(); const n = s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentNode : s.anchorNode);
    if (n && n.closest && n.closest('li')) { document.execCommand(dir > 0 ? 'indent' : 'outdent'); return; }
    for (const b of blocksInSel(ed)) { const m = (parseInt(b.style.marginLeft, 10) || 0) + dir * 32; b.style.marginLeft = m > 0 ? Math.min(m, 320) + 'px' : ''; }
  });
}
function lineSpacing(v) { withSel((ed) => { for (const b of blocksInSel(ed)) b.style.lineHeight = v === 'default' ? '' : v; }); }
function checklist() {
  withSel((ed) => {
    const s = getSelection(); const n = s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentNode : s.anchorNode);
    let ul = n && n.closest && n.closest('ul');
    if (ul && ed.contains(ul)) { ul.classList.toggle('check'); return; }
    document.execCommand('insertUnorderedList');
    const s2 = getSelection(); const n2 = s2.anchorNode && (s2.anchorNode.nodeType === 3 ? s2.anchorNode.parentNode : s2.anchorNode);
    ul = n2 && n2.closest && n2.closest('ul'); if (ul) ul.classList.add('check');
  });
}
function markHighlight() {
  withSel(() => {
    const s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0); if (r.collapsed) return toast('Select some words first.');
    const n = r.commonAncestorContainer; const mk0 = (n.nodeType === 3 ? n.parentNode : n).closest('mark');
    if (mk0) { unwrap(mk0); return; }
    const mk = document.createElement('mark');
    try { mk.appendChild(r.extractContents()); mk.querySelectorAll('mark').forEach(unwrap); r.insertNode(mk); } catch { return; }
    const nr = document.createRange(); nr.setStartAfter(mk); nr.collapse(true); s.removeAllRanges(); s.addRange(nr);
  });
}
function clearFormat() { withSel(() => { document.execCommand('removeFormat'); document.execCommand('unlink'); }); }
function setBlock(tag) { withSel(() => document.execCommand('formatBlock', false, '<' + tag + '>')); }
function doUndo(redo) {
  const ae = document.activeElement;
  if (ae && ae.isContentEditable && work.contains(ae)) { document.execCommand(redo ? 'redo' : 'undo'); return; }
  if (redo) redoObjs(); else undoObjs();
}

/* ================= magic box settings ================= */
const magic = Object.assign({ mode: 'diagram', chartType: 'pie', palette: 'ink', legend: 'right', labels: 'percent', title: true, place: 'next', mmLay: 'right', mmSty: 0, mmDetail: 'short', tableHead: true, sumLen: 'short', sumForm: 'bullets', stickyMax: 6, stickyCol: 'yellow', level: 'simple', lang: 'English', tidyMode: 'layout', hwRemove: true }, prefs.get('magic', {}));
const saveMagic = () => prefs.set('magic', magic);

/* ================= ribbon ================= */
let rtab = prefs.get('rtab', 'home');
const RTABS = [['home', 'Home', null], ['insert', 'Insert', null], ['draw', 'Draw', 'pen'], ['magic', 'Magic box', 'magic'], ['fact', 'Fact check', 'shield'], ['view', 'View', null]];
function buildRibbonTabs() {
  const t = $('#rtabs'); t.textContent = '';
  for (const [k, l, ic] of RTABS) {
    t.append(h('button', { class: 'rtab' + (k === 'magic' ? ' magic-tab' : k === 'fact' ? ' fact-tab' : ''), role: 'tab', 'aria-selected': String(k === rtab), onclick: () => { rtab = k; prefs.set('rtab', k); buildRibbonTabs(); renderRibbon(); if (k === 'fact') openPanel('fact'); } }, ic ? svg(ic) : null, l));
  }
}
const nodown = (el) => { el.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'INPUT') e.preventDefault(); }); return el; };
function rb(icon, label, fn, opts = {}) {
  const b = h('button', { class: 'tb' + (opts.big ? ' big' : '') + (opts.cls ? ' ' + opts.cls : ''), title: opts.title || label, 'aria-label': label, 'data-cmd': opts.cmd || null, 'data-tool': opts.tool || null, onclick: fn });
  if (opts.html) b.innerHTML = opts.html; else if (icon) b.append(svg(icon));
  if (opts.text) b.append(h('span', null, opts.text));
  return nodown(b);
}
const rsep = () => h('span', { class: 'rsep' });
function rselect(label, options, value, onChange, id, width) {
  const s = h('select', { 'aria-label': label, title: label, id: id || null, style: width ? { width } : null });
  for (const [v, l] of options) s.append(h('option', { value: v }, l));
  s.value = value; s.addEventListener('change', () => onChange(s.value));
  return s;
}
const FONTS = [['Atkinson Hyperlegible Next', 'Atkinson'], ['Bricolage Grotesque', 'Bricolage'], ['Merriweather', 'Merriweather'], ['Caveat', 'Caveat (handwriting)'], ['Arial', 'Arial'], ['Georgia', 'Georgia'], ['Times New Roman', 'Times New Roman'], ['Verdana', 'Verdana'], ['Trebuchet MS', 'Trebuchet'], ['Courier New', 'Courier New'], ['Comic Sans MS', 'Comic Sans']];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 60, 72];
const STYLES = [['p', 'Normal text'], ['h1', 'Title'], ['h2', 'Heading 1'], ['h3', 'Heading 2'], ['h4', 'Heading 3'], ['blockquote', 'Quote'], ['pre', 'Code']];
let lastTextColor = prefs.get('tColor', '#B42318'), lastHlColor = prefs.get('hColor', '#FFE46B');
function colorBtn(icon, label, get, set) {
  const b = rb(icon, label, () => set(get()), { cls: 'colorbtn' });
  const bar = h('span', { class: 'bar', style: { background: get() } }); b.append(bar);
  const hl = label.includes('Highlight');
  const dd = rb('down', label + ': choose colour', (e) => openPalette(e.currentTarget, (c) => { if (c) bar.style.background = c; set(c); }, { none: hl ? 'No highlight' : 'Automatic', colors: hl ? BASIC_HL.concat(['#FFC890', '#D7C4FF']) : null }));
  dd.style.minWidth = '18px'; dd.style.padding = '0 2px';
  return h('span', { class: 'rgroup' }, b, dd);
}
function renderRibbon() {
  renderDock();
  const body = $('#rbody'); body.textContent = '';
  if (!cur || !view) return;
  const ro = cur.ro;
  const add = (...els) => body.append(...els);
  if (rtab === 'home') {
    add(rb('undo', 'Undo (Ctrl+Z)', () => doUndo(false)), rb('redo', 'Redo (Ctrl+Y)', () => doUndo(true)), rsep());
    if (ro) { add(h('span', { class: 'rlabel' }, 'This page is view only.')); return; }
    add(rselect('Text style', STYLES, 'p', (v) => setBlock(v), 'rStyle', '128px'),
      rselect('Font', FONTS, FONTS[0][0], (v) => { withSel(() => document.execCommand('fontName', false, v)); rememberTypingFmt('font', v); }, 'rFont', '128px'),
      rselect('Font size', SIZES.map((s) => [s, String(s)]), 16, (v) => setFontSize(+v), 'rSize', '62px'),
      rb(null, 'Bigger text', () => growText(1), { html: '<span style="font:700 15px var(--ff-d)">A<sup style="font-size:9px">+</sup></span>' }),
      rb(null, 'Smaller text', () => growText(-1), { html: '<span style="font:700 12px var(--ff-d)">A<sup style="font-size:9px">−</sup></span>' }), rsep(),
      rb(null, 'Bold (Ctrl+B)', cmd('bold'), { html: '<b>B</b>', cmd: 'bold' }), rb(null, 'Italic (Ctrl+I)', cmd('italic'), { html: '<i>I</i>', cmd: 'italic' }),
      rb(null, 'Underline (Ctrl+U)', cmd('underline'), { html: '<u>U</u>', cmd: 'underline' }), rb(null, 'Strikethrough', cmd('strikeThrough'), { html: '<s>S</s>', cmd: 'strikeThrough' }),
      rb(null, 'Subscript', cmd('subscript'), { html: '<span style="font-weight:700">x<sub style="font-size:9px">2</sub></span>', cmd: 'subscript' }),
      rb(null, 'Superscript', cmd('superscript'), { html: '<span style="font-weight:700">x<sup style="font-size:9px">2</sup></span>', cmd: 'superscript' }),
      colorBtn('textT', 'Text colour', () => lastTextColor, (c) => { if (c) { lastTextColor = c; prefs.set('tColor', c); } withSel(() => document.execCommand('foreColor', false, c || cssVar('--ink') || '#1E2740')); }),
      colorBtn('hl', 'Highlight colour', () => lastHlColor, (c) => { if (c) { lastHlColor = c; prefs.set('hColor', c); } withSel(() => document.execCommand('hiliteColor', false, c || 'transparent')); }),
      rb('marker', 'Marker highlight', markHighlight), rb('clearf', 'Clear formatting', clearFormat), rsep(),
      rb('list', 'Bullet list', cmd('insertUnorderedList'), { cmd: 'insertUnorderedList' }), rb('olist', 'Numbered list', cmd('insertOrderedList'), { cmd: 'insertOrderedList' }),
      rb('checklist', 'Checklist', checklist), rb('outdent', 'Decrease indent', () => indent(-1)), rb('indent', 'Increase indent', () => indent(1)), rsep(),
      rb('alignL', 'Align left', cmd('justifyLeft'), { cmd: 'justifyLeft' }), rb('alignC', 'Centre', cmd('justifyCenter'), { cmd: 'justifyCenter' }),
      rb('alignR', 'Align right', cmd('justifyRight'), { cmd: 'justifyRight' }), rb('alignJ', 'Justify', cmd('justifyFull'), { cmd: 'justifyFull' }),
      rb('spacing', 'Line spacing', (e) => openMenu(e.currentTarget, [['default', 'Normal'], ['1', '1.0'], ['1.15', '1.15'], ['1.5', '1.5'], ['2', '2.0'], ['2.5', '2.5']].map(([v, l]) => ({ label: l, fn: () => lineSpacing(v) })))), rsep(),
      rb('tag', 'Tag: give words or a box a tag; clicking it jumps to the other places with the same tag', () => tagSelection(), { text: 'Tag' }),
      rb('sparkle', 'Tidy up', tidyModal, { text: 'Tidy up', cls: 'tidy' }));
  } else if (rtab === 'insert') {
    if (ro) { add(h('span', { class: 'rlabel' }, 'This page is view only.')); return; }
    add(rb('image', 'Picture', () => $('#fileIn').click(), { big: true, text: 'Picture' }),
      rb('note', 'Note box (N)', insertNote, { big: true, text: 'Note box' }),
      rb('tbox', 'Text box: see-through, like in Word', (e) => openMenu(e.currentTarget, [{ label: 'Draw a text box (drag on the page)', icon: 'tbox', fn: () => setTool('tbox') }, { label: 'Add a text box here', icon: 'textT', fn: insertText }]), { big: true, text: 'Text box', tool: 'tbox' }),
      rb('sticky', 'Sticky note (S)', (e) => openMenu(e.currentTarget, Object.keys(STICKY).map((c) => ({ label: c[0].toUpperCase() + c.slice(1), fn: () => { prefs.set('stickyCol', c); insertSticky(c); } }))), { big: true, text: 'Sticky' }),
      rb('shape', 'Shapes', (e) => openMenu(e.currentTarget, Object.entries(SHAPES).map(([k, l]) => ({ label: l, fn: () => insertShape(k) }))), { big: true, text: 'Shape' }),
      rb('connector', 'Connector (C)', () => setTool('connector'), { big: true, text: 'Connect', tool: 'connector' }), rsep(),
      rb('mindmap', 'Mind map', () => insertMindMap(), { big: true, text: 'Mind map' }),
      rb('chart', 'Chart', (e) => openMenu(e.currentTarget, CHART_TYPES.map(([k, l]) => ({ label: l, fn: () => { const o = insertObj(newChartSpec(null, { type: k, title: 'Chart' })); if (o) openPanel('format'); } }))), { big: true, text: 'Chart' }),
      rb('table', 'Table', insertTable, { big: true, text: 'Table' }),
      rb('calc', 'Calculator you can drag around (the scientific one is in the side panel)', insertCalc, { big: true, text: 'Calculator' }),
      rb('card', 'Link to a page', insertCard, { big: true, text: 'Page link' }),
      rb('screen', 'Screen window: show a tab, app window, your screen or a video', insertScreenWin, { big: true, text: 'Screen' }), rsep(),
      ...audRibbonButtons(), rsep(),
      rb('a4', 'Movable A4 page', (e) => openMenu(e.currentTarget, newPaperItems('A4')), { big: true, text: 'A4 page' }),
      rb('a3', 'Movable A3 page', (e) => openMenu(e.currentTarget, newPaperItems('A3')), { big: true, text: 'A3 page' }));
    if (view.kind === 'board') add(rb('frame', 'Frame (for presenting)', insertFrame, { big: true, text: 'Frame' }));
    if (view.kind === 'a4') add(rsep(), rb('plus', 'Add a page (Ctrl+Enter)', () => view.addPage(doc.flows.length), { big: true, text: 'Add page' }));
  } else if (rtab === 'draw') {
    if (ro) { add(rb('pointer', 'Select', () => setTool('select'), { big: true, text: 'Select', tool: 'select' }), h('span', { class: 'rlabel' }, 'This page is view only.')); return; }
    add(rb('pointer', 'Select boxes, pictures and drawings (V)', () => setTool('select'), { big: true, text: 'Select', tool: 'select' }));
    if (view.kind === 'board') add(rb('hand', 'Move around: drag to move, scroll to zoom (or hold Space)', () => setTool('hand'), { big: true, text: 'Hand', tool: 'hand' }));
    else add(rb('textT', 'Type text (T)', () => setTool('text'), { big: true, text: 'Text', tool: 'text' }));
    add(rb('pen', 'Pen (P)', () => setTool('pen'), { big: true, text: 'Pen', tool: 'pen' }),
      rb('marker', 'Highlighter (H)', () => setTool('hl'), { big: true, text: 'Highlighter', tool: 'hl' }),
      rb('eraser', 'Eraser (E)', () => setTool('eraser'), { big: true, text: 'Eraser', tool: 'eraser' }),
      rb('lasso', 'Lasso (L): draw a loop around drawings and boxes to choose them', () => setTool('lasso'), { big: true, text: 'Lasso', tool: 'lasso' }), rsep());
    const isHl = tool === 'hl';
    const cols = isHl ? HL_COLORS : INK_COLORS;
    const cur0 = isHl ? inkState.hlColor : inkState.color;
    const sws = h('div', { class: 'swatches' }, cols.map((c) => nodown(h('button', { class: 'sw', style: { background: c }, 'aria-label': c === 'var(--ink)' ? 'Black (white on a dark page)' : 'Colour ' + c, title: c === 'var(--ink)' ? 'Black (white on a dark page)' : c, 'aria-pressed': String(c === cur0), onclick: () => { if (tool === 'hl') { inkState.hlColor = c; prefs.set('hlColor', c); } else { inkState.color = c; prefs.set('inkColor', c); if (tool !== 'pen') setTool('pen'); } renderRibbon(); } }))),
      nodown(h('button', { class: 'sw', style: { background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' }, 'aria-label': 'Other colour', onclick: (e) => openPalette(e.currentTarget, (c) => { if (!c) return; if (tool === 'hl') { inkState.hlColor = c; prefs.set('hlColor', c); } else { inkState.color = c; prefs.set('inkColor', c); } renderRibbon(); }, { colors: isHl ? HL_ALL : INK_ALL.concat(COLORS.filter((x) => !INK_ALL.includes(x))) }) })));
    const sizes = isHl ? [10, 18, 28] : [2, 3, 6];
    const curS = isHl ? inkState.hlSize : inkState.size;
    const sz = h('div', { class: 'sizes' }, sizes.map((s, i) => rb(null, ['Thin', 'Medium', 'Thick'][i], () => { if (tool === 'hl') { inkState.hlSize = s; prefs.set('hlSize', s); } else { inkState.size = s; prefs.set('inkSize', s); } renderRibbon(); }, { html: '<span style="width:' + (4 + i * 4) + 'px;height:' + (4 + i * 4) + 'px"></span>' })));
    sz.querySelectorAll('.tb').forEach((b, i) => b.setAttribute('aria-pressed', String(sizes[i] === curS)));
    const auto = h('input', { type: 'checkbox', checked: inkState.auto ? true : null });
    auto.addEventListener('change', () => { inkState.auto = auto.checked; prefs.set('autoTidy', auto.checked); toast(auto.checked ? 'Lines, circles, boxes and triangles you draw are tidied automatically.' : 'Automatic tidying is off.'); });
    add(sws, rsep(), sz, rsep(), h('label', { class: 'rcheck', title: 'Straighten lines and turn rough circles, boxes and triangles into clean shapes as you draw' }, auto, 'Tidy as I draw'),
      rb('wand', 'Tidy my drawings into clean shapes', () => { pushUndo(); const n = tidyDrawings(sel.ink.size ? (st) => sel.ink.has(st.id) : null); view.renderAll(); saveDoc('main'); markInk(); toast(n ? 'Tidied ' + n + ' drawing' + (n === 1 ? '' : 's') + '.' : 'No lines or shapes found to tidy.', n ? { label: 'Undo', fn: undoObjs } : null); }, { text: 'Tidy drawings' }),
      rb('textT', 'Turn handwriting into typed text', () => handwritingToText(sel.ink.size ? [...sel.ink].map((id) => doc.ink[id]).filter(Boolean) : null), { text: 'Writing → text' }), rsep(),
      rb('trash', 'Clear all drawings on this note', async () => { if (!strokeList().length) return; if (!(await confirmModal('Clear all drawings?', 'Every pen and highlighter stroke on this note is removed. Boxes, pictures and text stay.', 'Clear drawings', true))) return; pushUndo(); for (const st of strokeList()) doc.ink[st.id] = { id: st.id, del: true, u: now() }; view.renderAll(); markInk(); toast('Drawings cleared.', { label: 'Undo', fn: undoObjs }); }));
  } else if (rtab === 'magic') {
    add(rb('magic', 'Magic box: drag a box around something (M)', () => setTool(tool === 'magic' ? defaultTool() : 'magic'), { big: true, text: 'Magic box', cls: 'magic-go' }),
      rb('sliders', 'All Magic box switches', (e) => openMagicPop(e.currentTarget), { big: true, text: 'Switches' }), rsep());
    add(h('div', { class: 'chips' }, magicAll().map(([k, l]) => nodown(h('button', { class: 'chip' + (k.startsWith('c:') ? ' own' : ''), 'aria-pressed': String(!!magic.on[k]), title: (magic.on[k] ? 'On: ' : 'Off: ') + l + (magicCustom(k) ? ' (your button: ' + magicCustom(k).rule.slice(0, 80) + '). Right-click to change it.' : ''), onclick: () => toggleMagic(k), oncontextmenu: (e) => { const c = magicCustom(k); if (c) { e.preventDefault(); magicButtonModal(c); } } }, l))),
      nodown(h('button', { class: 'chip add', id: 'magicAddBtn', title: 'Make your own Magic box button: write a rule for the AI', onclick: () => magicButtonModal(null) }, '+ Your button'))));
    const ask = h('input', { class: 'magic-ask', id: 'magicAsk', placeholder: 'Or tell the AI what to do, just this once…', 'aria-label': 'Tell the AI what to do with the next Magic box', onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') magicOnceRun(ask.value); } });
    add(rsep(), ask, rb('magic', 'Drag a box: the AI does what you wrote', () => magicOnceRun(ask.value), { text: 'Go' }), rb('star', 'Save what you wrote as your own button', () => { if (!ask.value.trim()) return magicButtonModal(null); saveMagicButton('', ask.value); ask.value = ''; }, { text: 'Save as button' }));
    const st = magicOn().flatMap((k) => magicSettingsFor(k));
    if (st.length) add(rsep(), ...st);
    add(rsep(), h('span', { class: 'rlabel' }, 'Put it'), rselect('Where to put new things', [['next', 'Next to it'], ['below', 'Below it'], ['replace', 'Instead of it']], magic.place || 'next', (v) => { magic.place = v; saveMagic(); }));
    if (sel.has) add(rsep(), rb('sparkle', 'Use on the selection', () => { const b = selBox(); if (b) runMagic(sel.surf, { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 }); }, { text: 'Use on selection' }));
  } else if (rtab === 'fact') {
    add(rb('shield', 'Check the whole note', () => runFactCheck({}), { big: true, text: 'Check note' }),
      rb('area', 'Check only an area: drag a box', () => { setTool('area'); }, { big: true, text: 'Check area', tool: 'area' }), rsep(),
      rb('sources', 'Sources for this notebook', () => openPanel('sources'), { big: true, text: 'Sources' }),
      rb('upload', 'Add a source', () => { openPanel('sources'); $('#srcIn').click(); }, { big: true, text: 'Add source' }), rsep(),
      rb('outline', 'Results', () => openPanel('fact'), { big: true, text: 'Results' }));
    const ask = h('input', { type: 'checkbox', checked: prefs.get('fcAsk', true) ? true : null });
    ask.addEventListener('change', () => prefs.set('fcAsk', ask.checked));
    add(h('label', { class: 'rcheck' }, ask, 'Ask me before the AI uses its own knowledge'));
  } else if (rtab === 'view') {
    add(h('span', { class: 'rlabel' }, 'Page type'), rselect('Page type', [['a4', 'A4 pages'], ['endless', 'Endless page'], ['board', 'Drawing board']], doc.kind, (v) => convertKind(v)),
      h('span', { class: 'rlabel' }, 'Paper'), rselect('Paper', PAGE_BG, doc.bg, (v) => { if (cur.ro) return; doc.bg = v; doc.mu = now(); view.rebuild(); saveDoc('main'); }),
      rb('palette', 'Page colour', (e) => { if (cur.ro) return toast('This page is view only.'); pageStylePop(e.currentTarget); }, { text: 'Page colour' }),
      doc.kind === 'a4' ? rb('a4', 'Page setup: size, upright or sideways, margins, header and footer, page numbers', (e) => pageSetupMenu(e.currentTarget), { text: 'Page setup' }) : null,
      rb('clock', 'Page history: go back to an earlier version', () => openHistory(), { text: 'History' }),
      rb('download', 'Download this page as a PDF', () => exportPdf(), { text: 'PDF' }));
    if (doc.kind === 'endless') { const m = h('input', { type: 'checkbox', checked: doc.margin ? true : null }); m.addEventListener('change', () => { if (cur.ro) return; doc.margin = m.checked; doc.mu = now(); view.rebuild(); saveDoc('main'); }); add(h('label', { class: 'rcheck' }, m, 'Margin line')); }
    add(rsep(), rb('zout', 'Zoom out', () => view.zoomBy(1 / 1.15)), h('span', { class: 'rlabel', id: 'rZoom' }, '100%'), rb('zin', 'Zoom in', () => view.zoomBy(1.15)),
      rb('fit', view.kind === 'board' ? 'Fit everything' : 'Fit to width', () => view.fit()), rb(null, 'Actual size', () => view.zoomReset(), { html: '<span style="font-weight:700;font-size:12.5px">100%</span>' }), rsep());
    if (view.kind === 'board') add(rb('present', 'Present the frames as slides', () => present(), { big: true, text: 'Present' }));
    add(rselect('Colours', [['dark', 'Black (with red)'], ['light', 'White'], ['navy', 'Navy blue'], ['auto', 'Match my device']], prefs.get('theme', 'dark'), (v) => { prefs.set('theme', v); applyTheme(); }),
      rb('sidebar', 'Show or hide notebooks', () => toggleSide(), { text: 'Notebooks' }));
    const pvw = h('input', { type: 'checkbox', checked: showPreviews() ? true : null });   // 47_sections.js
    pvw.addEventListener('change', () => { prefs.set('previews', pvw.checked); renderSecNav(); if (secOpen) renderSection(); });
    add(h('label', { class: 'rcheck', title: 'Subjects & grades, Calendar, Task and Study projects, Coding logbook: screens with example data that show what is coming.' }, pvw, 'Coming sections (preview)'));
    const intro = h('input', { type: 'checkbox', checked: prefs.get('intro', true) ? true : null });
    intro.addEventListener('change', () => { prefs.set('intro', intro.checked); if (intro.checked) playIntro(true); });   // 46_brand.js
    add(h('label', { class: 'rcheck', title: 'The Cortex Scribe logo animation when the app opens. Ticking it plays it once now.' }, intro, 'Intro animation'));
  }
  updateZoomLabel();
  $$('[data-tool]', body).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
  $$('.magic-go', body).forEach((b) => b.setAttribute('aria-pressed', String(tool === 'magic')));
  syncRibbonState();
}
function syncRibbonState() {
  if (rtab !== 'home' || !cur) return;
  const ed = activeEd && activeEd.isContentEditable ? activeEd : null;
  for (const b of $$('#rbody [data-cmd]')) { let on = false; try { on = !!ed && document.queryCommandState(b.dataset.cmd); } catch {} b.setAttribute('aria-pressed', String(on)); }
  const cs = ed ? caretStyle() : null;
  if (cs) {
    const sz = $('#rSize'), fn = $('#rFont'), st = $('#rStyle');
    const px = Math.round(parseFloat(cs.fontSize));
    if (sz && document.activeElement !== sz) { if (![...sz.options].some((o) => +o.value === px)) sz.append(h('option', { value: px }, String(px))); sz.value = String(px); }
    if (fn && document.activeElement !== fn) { const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); const m = FONTS.find((f) => f[0].toLowerCase() === fam.toLowerCase()); fn.value = m ? m[0] : FONTS[0][0]; }
    if (st && document.activeElement !== st && savedRange) { const n = savedRange.startContainer.nodeType === 3 ? savedRange.startContainer.parentNode : savedRange.startContainer; const b = n.closest && n.closest('p,h1,h2,h3,h4,blockquote,pre'); st.value = b ? b.tagName.toLowerCase() : 'p'; }
  }
}
function applyTheme() {
  const t = prefs.get('theme', 'dark');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  if (view) view.renderAll(true);
  v3Theme();
}

/* change a note between A4, endless and board */
async function convertKind(k) {
  if (!doc || cur.ro || k === doc.kind) return;
  const from = doc.kind;
  if (!(await confirmModal('Change to ' + KIND_LABEL[k] + '?', from === 'board' || k === 'board' ? 'Text, boxes, pictures and drawings are kept but may move around. You can undo with Ctrl+Z.' : 'Your text, boxes and pictures are kept. You can undo with Ctrl+Z.', 'Change page type'))) { renderRibbon(); return; }
  verBefore('Before changing the page type');
  const before = JSON.stringify({ kind: doc.kind, bg: doc.bg, margin: doc.margin, flows: doc.flows, objs: doc.objs, ink: doc.ink });
  const all = objList(), strokes = strokeList();
  const offY = (i) => pageTop(i);   // 51_pagesetup.js: pages can differ in size and turn
  if (from === 'a4') { for (const o of all) { o.y += offY(o.sh || 0); o.sh = 0; changed(o); } for (const s of strokes) { s.p = s.p.map((v, i) => (i % 2 ? v + offY(s.sh || 0) : v)); s.sh = 0; s.u = now(); } }
  if (k === 'board') {
    const flows = doc.flows.filter((f) => htmlStrToText(f).trim() || /<img|<table/.test(f));
    flows.forEach((f, i) => addObj({ t: 'note', x: 40 + i * 40, y: -400 + i * 40, w: 640, ah: true, h: 300, html: f, z: 0 }));
    doc.flows = []; doc.fu = [];
  } else if (from === 'board') {
    const b = contentBox();
    if (b) { for (const o of all) { o.x = o.x - b.x + 60; o.y = o.y - b.y + 120; changed(o); } for (const s of strokes) { s.p = s.p.map((v, i) => (i % 2 ? v - b.y + 120 : v - b.x + 60)); s.u = now(); } }
    doc.flows = ['<p><br></p>']; doc.fu = [now()];
  } else if (k === 'endless') { doc.flows = [doc.flows.join('')]; doc.fu = [now()]; }
  if (k === 'a4') {
    if (from === 'endless') doc.flows = [doc.flows[0] || '<p><br></p>'];
    for (const o of objList()) { const sh = pageAt(Math.max(0, o.y)); o.sh = sh; o.y -= offY(sh); changed(o); }
    for (const s of strokeList()) { const b = strokeBox(s); const sh = pageAt(Math.max(0, b.y)); s.sh = sh; s.p = s.p.map((v, i) => (i % 2 ? v - offY(sh) : v)); s.u = now(); }
    const need = Math.max(...objList().map((o) => o.sh || 0), ...strokeList().map((s) => s.sh || 0), 0) + 1;
    while (doc.flows.length < need) doc.flows.push('<p><br></p>');
  }
  doc.kind = k; doc.bg = k === 'board' ? 'dots' : (doc.bg === 'dots' && from === 'board' ? 'blank' : doc.bg); doc.margin = k === 'endless'; doc.mu = now(); doc.fu = doc.flows.map(() => now());
  tree.nodes[cur.id].kind = k; touch(tree.nodes[cur.id]); saveTree();
  clearSel();
  view = new View(k); view.build(); tool = defaultTool(); setTool(tool);
  if (k === 'a4') { for (let i = 0; i < doc.flows.length; i++) view.reflow(i); }
  saveDoc(); markInk(); renderRibbon(); renderCrumbs(); renderTree();
  hist.undo = []; hist.redo = [];
  toast('Changed to ' + KIND_LABEL[k] + '.', { label: 'Undo', fn: () => revertKind(before) });
}
function revertKind(s) {
  if (!doc || !cur) return;
  const b = JSON.parse(s), t = now();
  restoreSnap(JSON.stringify({ objs: b.objs, ink: b.ink, flows: b.flows }));
  doc.kind = b.kind; doc.bg = b.bg; doc.margin = b.margin; doc.mu = t; doc.fu = doc.flows.map(() => t);
  tree.nodes[cur.id].kind = b.kind; touch(tree.nodes[cur.id]); saveTree();
  clearSel(); view = new View(b.kind); view.build(); setTool(defaultTool());
  saveDoc(); markInk(); renderRibbon(); renderCrumbs(); renderTree();
  hist.undo = []; hist.redo = [];
}

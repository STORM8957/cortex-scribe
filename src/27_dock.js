
/* ================= bottom tool dock ================= */
const dock = h('div', { class: 'dock', id: 'dock', role: 'toolbar', 'aria-label': 'Drawing and Magic box tools', hidden: true });
$('#main').append(dock);
function dbtn(icon, label, fn, opts = {}) {
  const b = h('button', { class: 'tb' + (opts.cls ? ' ' + opts.cls : ''), title: label, 'aria-label': label, 'data-tool': opts.tool || null, onclick: fn }, svg(icon));
  if (opts.dot) b.append(h('span', { class: 'dot', style: { background: opts.dot } }));
  if (opts.text) b.append(h('span', { class: 'dl' }, opts.text));
  return nodown(b);
}
function renderDock() {
  dock.textContent = '';
  if (!cur || !view) { dock.hidden = true; return; }
  dock.hidden = false;
  const ro = cur.ro;
  dock.append(dbtn('pointer', 'Select (V)', () => setTool('select'), { tool: 'select' }));
  if (view.kind === 'board') dock.append(dbtn('hand', 'Move around: drag to move, scroll to zoom (or hold Space)', () => setTool('hand'), { tool: 'hand' }));
  else dock.append(dbtn('textT', 'Type text (T)', () => setTool('text'), { tool: 'text' }));
  if (!ro) {
    dock.append(
      dbtn('pen', 'Pen (P). Click again for colours and size', (e) => (tool === 'pen' ? penPop(e.currentTarget, 'pen') : setTool('pen')), { tool: 'pen', dot: inkState.color }),
      dbtn('marker', 'Highlight marker (H). Click again for colours', (e) => (tool === 'hl' ? penPop(e.currentTarget, 'hl') : setTool('hl')), { tool: 'hl', dot: inkState.hlColor }),
      dbtn('eraser', 'Eraser (E)', () => setTool('eraser'), { tool: 'eraser' }),
      dbtn('lasso', 'Lasso (L): draw a loop around drawings and boxes', () => setTool('lasso'), { tool: 'lasso' }),
      h('span', { class: 'rsep' }),
      dbtn('note', 'Note box (N)', insertNote),
      dbtn('tbox', 'Text box: drag on the page to draw a see-through one', () => setTool('tbox'), { tool: 'tbox' }),
      dbtn('sticky', 'Sticky note (S)', () => insertSticky()),
      dbtn('shape', 'Shape', (e) => openMenu(e.currentTarget, Object.entries(SHAPES).map(([k, l]) => ({ label: l, fn: () => insertShape(k) })))),
      dbtn('connector', 'Connect boxes (C)', () => setTool('connector'), { tool: 'connector' }),
      dbtn('mindmap', 'Mind map', () => insertMindMap()),
      dbtn('image', 'Picture', () => $('#fileIn').click()),
      h('span', { class: 'rsep' }),
      dbtn('paste', pasteLabel(), () => pasteArmed(), { cls: 'paste-go' + (prefs.get('pasteArm', null) ? ' armed' : '') }),
      dbtn('chevD', 'Choose what Paste does', (e) => { const b = e.currentTarget; loadBlocks().then(() => openMenu(b, pasteMenuItems())); }, { cls: 'dock-caret' }),
      h('span', { class: 'rsep' }),
      dbtn('magic', 'Magic box (M). Opens its settings', (e) => { if (tool !== 'magic') setTool('magic'); openMagicPop(e.currentTarget); }, { tool: 'magic', cls: 'magic-go' }));
  }
  dock.append(dbtn('area', 'Fact check an area', () => setTool('area'), { tool: 'area' }));
  dock.append(dbtn('cube', '3D studio', () => togglePanel('m3d')));
  $$('[data-tool]', dock).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
  loadBlocks();
}
function openPop(anchor, content, label) {
  closeMenu();
  const m = h('div', { class: 'pop', role: 'dialog', 'aria-label': label || 'Options' }, content);
  m.addEventListener('mousedown', (e) => { if (e.target.tagName === 'BUTTON') e.preventDefault(); });
  document.body.append(m);
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  const x = clamp(r.left + r.width / 2 - mw / 2, 8, innerWidth - mw - 8);
  let y = r.top - mh - 10; if (y < 8) y = Math.min(innerHeight - mh - 8, r.bottom + 8);
  m.style.left = x + 'px'; m.style.top = Math.max(8, y) + 'px';
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenu(); anchor.focus(); } });
  menuEl = m;
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  return m;
}
function switchBtn(on, label, onChange) {
  const b = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label });
  b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(v)); onChange(v); });
  return b;
}
/* pen and highlighter: the 5 basic colours (black is the page's ink: black on white paper, white on a dark page);
   every other colour is under “Other colour” / “Any colour” */
const INK_COLORS = ['#E5383B', '#FF5FA2', '#2563EB', '#16A34A', 'var(--ink)'];
const HL_COLORS = BASIC_HL;
const INK_ALL = ['var(--ink)', '#E5383B', '#FF5FA2', '#FF7F27', '#FFC90E', '#22B14C', '#16A34A', '#00A2E8', '#2563EB', '#3F48CC', '#A349A4', '#B97A57', '#7F7F7F', '#FFFFFF', '#000000'];
const HL_ALL = ['#FFE46B', '#FFB3C7', '#A6E3FF', '#B9F0A8', '#FFC890', '#D7C4FF', '#FF8A8A'];
function penPop(anchor, kind) {
  const isHl = kind === 'hl';
  const box = h('div');
  const cols = isHl ? HL_COLORS : INK_COLORS;
  const curC = isHl ? inkState.hlColor : inkState.color;
  const setC = (c) => { if (isHl) { inkState.hlColor = c; prefs.set('hlColor', c); } else { inkState.color = c; prefs.set('inkColor', c); } renderDock(); if (rtab === 'draw') renderRibbon(); penPop($('#dock [data-tool="' + (isHl ? 'hl' : 'pen') + '"]') || anchor, kind); };
  box.append(h('h4', null, isHl ? 'Highlighter colour' : 'Pen colour'),
    h('div', { class: 'swatches', style: { flexWrap: 'wrap', gap: '6px' } }, cols.map((c) => h('button', { class: 'sw', style: { background: c }, 'aria-label': c === 'var(--ink)' ? 'Black (white on a dark page)' : 'Colour ' + c, title: c === 'var(--ink)' ? 'Ink' : c, 'aria-pressed': String(c === curC), onclick: () => setC(c) })),
      h('input', { type: 'color', 'aria-label': 'Any colour', value: /^#[0-9a-f]{6}$/i.test(curC) ? curC : '#e5383b', onchange: (e) => setC(e.target.value) })));
  const sizes = isHl ? [10, 18, 28] : [1.5, 3, 6, 10];
  const curS = isHl ? inkState.hlSize : inkState.size;
  box.append(h('h4', null, 'Size'), h('div', { class: 'sizes' }, sizes.map((s, i) => h('button', { class: 'tb', 'aria-label': 'Size ' + s, 'aria-pressed': String(s === curS), onclick: () => { if (isHl) { inkState.hlSize = s; prefs.set('hlSize', s); } else { inkState.size = s; prefs.set('inkSize', s); } penPop(anchor, kind); } }, h('span', { style: { width: (3 + i * 4) + 'px', height: (3 + i * 4) + 'px' } })))));
  if (!isHl) box.append(h('div', { class: 'sw-row' }, h('span', { class: 'sw-l' }, svg('wand'), 'Tidy my drawing as I draw'), switchBtn(inkState.auto, 'Tidy as I draw', (v) => { inkState.auto = v; prefs.set('autoTidy', v); })));
  openPop(anchor, box, isHl ? 'Highlighter' : 'Pen');
}
function magicSettingsFor(k) {
  const out = [];
  const lab = (t) => h('span', { class: 'rlabel' }, t);
  const sel2 = (label, key, opts) => rselect(label, opts, magic[key], (v) => { magic[key] = typeof magic[key] === 'number' ? +v : v; saveMagic(); });
  const chk = (key, label) => { const c = h('input', { type: 'checkbox', checked: magic[key] ? true : null }); c.addEventListener('change', () => { magic[key] = c.checked; saveMagic(); }); return h('label', { class: 'rcheck' }, c, label); };
  switch (k) {
    case 'mDiagram':
      out.push(lab('Chart'), sel2('Chart type', 'chartType', CHART_TYPES), lab('Colours'), sel2('Colours', 'palette', Object.entries(PALETTE_NAMES)),
        lab('Legend'), sel2('Legend', 'legend', [['none', 'None'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']]),
        lab('Labels'), sel2('Data labels', 'labels', [['none', 'None'], ['value', 'Values'], ['percent', 'Percent'], ['category', 'Names'], ['both', 'Name + %']]), chk('title', 'Title'));
      break;
    case 'mMap': out.push(lab('Layout'), sel2('Layout', 'mmLay', MM_LAYOUTS), lab('Style'), sel2('Style', 'mmSty', MM_STYLES.map((s, i) => [i, s.name])), lab('Detail'), sel2('Detail', 'mmDetail', [['short', 'Key ideas'], ['deep', 'More detail']])); break;
    case 'mTable': out.push(chk('tableHead', 'Header row')); break;
    case 'mSum': out.push(lab('Length'), sel2('Length', 'sumLen', [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']]), lab('As'), sel2('Form', 'sumForm', [['bullets', 'Bullet points'], ['paragraph', 'A paragraph']])); break;
    case 'mSticky': out.push(lab('Up to'), sel2('How many', 'stickyMax', [3, 4, 6, 8, 10, 12].map((n) => [n, n + ' notes'])), lab('Colour'), sel2('Colour', 'stickyCol', Object.keys(STICKY).map((c) => [c, c[0].toUpperCase() + c.slice(1)]))); break;
    case 'mExplain': out.push(lab('Level'), sel2('Level', 'level', [['simple', 'Like I’m 12'], ['normal', 'Normal'], ['expert', 'In depth']])); break;
    case 'mTrans': break;
    case 'mHand': out.push(chk('hwRemove', 'Remove the handwriting afterwards')); break;
  }
  return out;
}
let magicPopAnchor = null;
function magicPanel() {
  const box = h('div');
  box.append(h('p', { class: 'hint', style: { margin: '0 0 6px' } }, 'Switch on what the Magic box should do. Then drag a box around anything on the page: everything switched on happens at once.'));
  let group = '';
  for (const [k, label, icon, grp] of magicAll()) {
    if (grp !== group) { group = grp; box.append(h('h4', null, grp)); }
    const own = magicCustom(k);
    if (own) { box.append(h('div', { class: 'sw-row' }, h('span', { class: 'sw-l', title: own.rule }, svg(icon), label), h('button', { class: 'icon-btn', 'aria-label': 'Change the button ' + label, title: 'Change or delete', onclick: () => { closeMenu(); magicButtonModal(own); } }, svg('edit')), switchBtn(magic.on[k], label, (v) => { toggleMagic(k, v); refreshMagicPop(); }))); continue; }
    const cog = k === 'mTrans' ? langCog(() => magic.lang || 'English', (v) => { magic.lang = v; saveMagic(); }, { title: 'Translate into' })
      : k === 'mCorr' ? langCog(() => magic.corrLang || 'auto', (v) => { magic.corrLang = v; saveMagic(); }, { title: 'Correct in', auto: true }) : null;
    box.append(h('div', { class: 'sw-row' }, h('span', { class: 'sw-l' }, svg(icon), label), cog, switchBtn(magic.on[k], label, (v) => { toggleMagic(k, v); refreshMagicPop(); })));
    if (magic.on[k]) { const st = magicSettingsFor(k); if (st.length) box.append(h('div', { class: 'sw-set' }, st)); }
  }
  const ask = h('textarea', { class: 'field magic-ask-box', id: 'magicAskPop', rows: 2, placeholder: 'e.g. Turn it into 5 flashcards: question, then answer', 'aria-label': 'Your own rule for the AI' });
  box.append(h('h4', null, 'Your own rule for the AI'), ask, h('div', { class: 'btnrow' },
    h('button', { class: 'btn small primary', onclick: () => magicOnceRun(ask.value) }, svg('magic'), 'Use it once'),
    h('button', { class: 'btn small', id: 'magicAskSave', onclick: () => { closeMenu(); magicButtonModal(null, ask.value.trim()); } }, svg('star'), 'Save as a button')));
  box.append(h('h4', null, 'New things go'), h('div', { class: 'sw-set' }, rselect('Where to put new things', [['next', 'Next to it'], ['below', 'Below it'], ['replace', 'Instead of it']], magic.place || 'next', (v) => { magic.place = v; saveMagic(); })));
  box.append(h('button', { class: 'btn magic', style: { width: '100%', marginTop: '10px' }, onclick: () => { closeMenu(); setTool('magic'); } }, svg('magic'), 'Drag a box now'));
  return box;
}
function openMagicPop(anchor) {
  magicPopAnchor = anchor || $('#dock .magic-go') || $('#rbody .magic-go') || $('#rbody');
  if (!magicPopAnchor) return;
  openPop(magicPopAnchor, magicPanel(), 'Magic box settings');
}
function refreshMagicPop() {
  if (!menuEl || menuEl.getAttribute('aria-label') !== 'Magic box settings') return;
  const sc = menuEl.scrollTop; menuEl.textContent = ''; menuEl.append(magicPanel()); menuEl.scrollTop = sc;
}

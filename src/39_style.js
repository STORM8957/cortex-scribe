/* ================= Colour styles =================
   Ready-made colour styles, and your own colours, for note boxes, see-through text boxes,
   movable A4/A3 sheets and the page itself (A4 pages, the endless page and the board).
   A style is a few colours. “Use for new …” keeps it in the prefs noteStyle, tboxStyle,
   paperStyle and pageStyle, so things you add later get it too.
   Fields: note box bg / bc / tc, text box bg (fill) / fo (how solid the fill is, 0–1) / bc / bw / tc,
   sheet pc / lc / tc, page doc.pcol = { bg, line, text }. */
const PAGE_STYLES = [
  ['white', 'White', { bg: '#ffffff', line: '#cdd6e2', text: '#1b1f27' }],
  ['cream', 'Cream', { bg: '#fbf5e6', line: '#e2d3ae', text: '#2b2418' }],
  ['recycled', 'Recycled', { bg: '#ebe9e3', line: '#cdcac0', text: '#23231f' }],
  ['sun', 'Sunny', { bg: '#fff6cf', line: '#ecd98a', text: '#33290a' }],
  ['mint', 'Mint', { bg: '#e8f6ee', line: '#b9dbc8', text: '#13301f' }],
  ['sky', 'Sky', { bg: '#e7f0fb', line: '#b6cde8', text: '#10243a' }],
  ['rose', 'Rose', { bg: '#fbebee', line: '#ebc0ca', text: '#3a1018' }],
  ['lavender', 'Lavender', { bg: '#efebfb', line: '#cec4ee', text: '#241a3d' }],
  ['chalk', 'Chalkboard', { bg: '#1f3a2e', line: '#3c5e4e', text: '#eef3ec' }],
  ['night', 'Night blue', { bg: '#182033', line: '#2f3b58', text: '#e6ebf5' }],
  ['black', 'Black', { bg: '#101113', line: '#2b2e34', text: '#f1f1f1' }],
  ['wine', 'Dark red', { bg: '#2a1214', line: '#55282c', text: '#fbe9e7' }],
];
const NOTE_STYLES = [
  ['white', 'White', { bg: '#ffffff', bd: '#d5dbe3', text: '#1b1f27' }],
  ['yellow', 'Yellow', { bg: '#fff3bf', bd: '#ecd27a', text: '#33290a' }],
  ['mint', 'Mint', { bg: '#e2f5e9', bd: '#a6d6b8', text: '#13301f' }],
  ['sky', 'Sky', { bg: '#e2edfb', bd: '#a6c4ea', text: '#10243a' }],
  ['rose', 'Rose', { bg: '#fde6eb', bd: '#eeb1bf', text: '#3a1018' }],
  ['lavender', 'Lavender', { bg: '#ede7fd', bd: '#c7b8f1', text: '#241a3d' }],
  ['peach', 'Peach', { bg: '#ffe8d4', bd: '#f1c196', text: '#3a2210' }],
  ['grey', 'Grey', { bg: '#eceff3', bd: '#c6ccd6', text: '#1b1f27' }],
  ['dark', 'Dark', { bg: '#22262e', bd: '#3b414c', text: '#eef0f4' }],
  ['red', 'Red on black', { bg: '#161012', bd: '#c0352b', text: '#fbe9e7' }],
  ['teal', 'Teal', { bg: '#0f3b39', bd: '#2c7a74', text: '#e7f6f4' }],
  ['clear', 'See-through', { bg: 'transparent', bd: '#9aa3b2' }],
];
const TBOX_STYLES = [
  ['clear', 'See-through', null],
  ['outline', 'Outline', { bd: '#8a93a3' }],
  ['frost', 'Frosted', { fill: '#ffffff', fo: 0.6, text: '#1b1f27' }],
  ['yellow', 'Yellow tint', { fill: '#ffe46b', fo: 0.35 }],
  ['blue', 'Blue tint', { fill: '#7fb0ff', fo: 0.3 }],
  ['green', 'Green tint', { fill: '#6fd48f', fo: 0.3 }],
  ['pink', 'Pink tint', { fill: '#ff9fbd', fo: 0.3 }],
  ['dark', 'Dark glass', { fill: '#000000', fo: 0.55, text: '#ffffff' }],
];
const STYLE_KINDS = {
  note: { title: 'Note box colours', presets: NOTE_STYLES, normal: 'Normal', map: { bg: 'bg', bd: 'bc', text: 'tc' },
    fields: [['bg', 'Background'], ['bd', 'Border'], ['text', 'Text']], pref: 'noteStyle', newLabel: 'new note boxes',
    base: () => ({ bg: cssVar('--sheet'), bd: cssVar('--line'), text: cssVar('--ink') }) },
  tbox: { title: 'Text box colours', presets: TBOX_STYLES, normal: null, map: { fill: 'bg', fo: 'fo', bd: 'bc', text: 'tc' },
    fields: [['fill', 'Fill'], ['bd', 'Outline'], ['text', 'Text']], pref: 'tboxStyle', newLabel: 'new text boxes',
    base: () => ({ fill: '#ffffff', fo: 0.5, bd: '#8a93a3', text: cssVar('--ink') }) },
  paper: { title: 'Sheet colours', presets: PAGE_STYLES, normal: 'Normal', map: { bg: 'pc', line: 'lc', text: 'tc' },
    fields: [['bg', 'Paper'], ['line', 'Lines'], ['text', 'Text']], pref: 'paperStyle', newLabel: 'new sheets',
    base: () => ({ bg: '#ffffff', line: '#cdd6e2', text: '#111111' }) },
  page: { title: 'Page colour', presets: PAGE_STYLES, normal: 'Normal', fields: [['bg', 'Paper'], ['line', 'Lines'], ['text', 'Text']],
    pref: 'pageStyle', newLabel: 'new pages', base: () => ({ bg: cssVar('--sheet'), line: cssVar('--grid'), text: cssVar('--ink') }) },
};
const STYLE_OF_T = { note: 'note', text: 'tbox', paper: 'paper' };
const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
/* a colour made partly see-through (a = 0…1) */
const seeThrough = (c, a) => (a >= 1 ? c : 'color-mix(in srgb, ' + c + ' ' + Math.round(clamp(a, 0, 1) * 100) + '%, transparent)');
function cleanStyle(st) {
  if (!st || typeof st !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(st)) if (v != null && v !== '' && (k === 'fo' ? typeof v === 'number' : typeof v === 'string' && v.length < 80)) out[k] = k === 'fo' ? clamp(v, 0, 1) : v;
  return Object.keys(out).length ? out : null;
}
const styleKey = (s) => { const c = cleanStyle(s); return c ? JSON.stringify(Object.keys(c).sort().map((k) => [k, String(c[k]).toLowerCase()])) : 'null'; };
const sameStyle = (a, b) => styleKey(a) === styleKey(b);
/* the style an object has now */
function objStyle(kind, o) {
  const K = STYLE_KINDS[kind];
  if (kind === 'page') return cleanStyle(o);
  const st = {}; for (const [sk, ok] of Object.entries(K.map)) if (o[ok] != null) st[sk] = o[ok];
  return cleanStyle(st);
}
/* the object fields for a style (null = back to normal) */
function styleFields(kind, st) {
  const K = STYLE_KINDS[kind], out = {};
  for (const [sk, ok] of Object.entries(K.map)) out[ok] = st && st[sk] != null ? st[sk] : null;
  return out;
}
/* the fields for something new, from “Use for new …” */
function newStyleFields(kind) {
  const st = cleanStyle(prefs.get(STYLE_KINDS[kind].pref, null)); if (!st) return {};
  const f = styleFields(kind, st);
  for (const k of Object.keys(f)) if (f[k] == null) delete f[k];
  return f;
}
function applyStyleTo(objs, kind, st) {
  if (!cur || cur.ro || !objs.length) return;
  pushUndo();
  const f = styleFields(kind, cleanStyle(st));
  for (const o of objs) {
    for (const [k, v] of Object.entries(f)) { if (v == null) delete o[k]; else o[k] = v; }
    if (kind === 'note' && f.bc) delete o.nobd;
    changed(o);
  }
  view.renderAll(); saveDoc('main'); updateObjbar(true); refreshFormatSoon();
}
/* the page colour: one style for the whole page */
function setPageStyle(st) {
  if (!cur || cur.ro || !doc) return;
  st = cleanStyle(st);
  if (st) st = { ...STYLE_KINDS.page.base(), ...st };
  if (st) doc.pcol = { bg: st.bg, line: st.line, text: st.text }; else delete doc.pcol;
  doc.mu = now(); view.rebuild(); saveDoc('main');
}
/* paints a page (.sheet) or the board with the page colour */
function paintPage(el) {
  const pc = doc && cleanStyle(doc.pcol);
  el.classList.toggle('pgc', !!pc);
  for (const [v, k] of [['--pg-bg', 'bg'], ['--pg-line', 'line'], ['--pg-ink', 'text']]) { if (pc && pc[k]) el.style.setProperty(v, pc[k]); else el.style.removeProperty(v); }
}
function styleTile(kind, label, st, on, fn) {
  const sw = h('span', { class: 'sp-sw' }, h('b', null, 'Aa'));
  if (kind === 'tbox') {
    sw.classList.add('glass');
    if (st && st.fill) sw.style.setProperty('--sp-fill', seeThrough(st.fill, st.fo != null ? st.fo : 0.4));
    if (st && st.bd) sw.style.boxShadow = 'inset 0 0 0 1.5px ' + st.bd;
    if (st && st.text) sw.style.color = st.text;
  } else if (st) {
    sw.style.background = st.bg === 'transparent' ? 'transparent' : st.bg || '';
    if (st.bd || st.line) sw.style.borderColor = st.bd || st.line;
    if (st.line) sw.style.backgroundImage = 'repeating-linear-gradient(to bottom, transparent 0 7px, ' + st.line + ' 7px 8px)';
    if (st.text) sw.style.color = st.text;
    if (st.bg === 'transparent') sw.classList.add('clear');
  } else sw.classList.add(kind === 'paper' ? 'paper' : 'normal');
  return h('button', { class: 'sp-tile', 'aria-pressed': String(!!on), title: label, onclick: fn }, sw, h('span', { class: 'sp-name' }, label));
}
/* the colours panel: ready-made styles, your own colours, and “Use for new …” */
function stylePop(anchor, kind, cur0, apply) {
  const K = STYLE_KINDS[kind];
  let now0 = cleanStyle(cur0);
  const wrap = h('div', { class: 'stylepop', 'data-kind': kind });
  const pick = (st) => { now0 = cleanStyle(st); apply(now0); render(); };
  const render = () => {
    wrap.textContent = '';
    wrap.append(h('div', { class: 'sp-head' }, svg('palette'), K.title));
    const tiles = (K.normal ? [[null, K.normal, null]] : []).concat(K.presets);
    wrap.append(h('div', { class: 'sp-grid' }, tiles.map(([, label, st]) => styleTile(kind, label, st, sameStyle(st, now0), () => pick(st)))));
    const base = { ...K.base(), ...(now0 || {}) };
    const own = h('div', { class: 'sp-own' });
    for (const [f, label] of K.fields) {
      const inp = h('input', { type: 'color', 'aria-label': label + ' colour', value: isHex(base[f]) ? base[f] : '#888888' });
      inp.addEventListener('change', () => pick({ ...(now0 || (kind === 'page' ? K.base() : {})), [f]: inp.value, ...(kind === 'tbox' && f === 'fill' && !(now0 && now0.fo != null) ? { fo: 0.5 } : {}) }));
      own.append(h('label', { class: 'sp-col' }, inp, h('span', null, label)));
    }
    wrap.append(h('div', { class: 'sp-lab' }, 'Your own colours'), own);
    if (kind === 'tbox') {
      const solid = now0 && now0.fo != null ? now0.fo : 0.5;
      const r = h('input', { type: 'range', min: 0, max: 100, value: Math.round((1 - solid) * 100), 'aria-label': 'How see-through the fill is', disabled: now0 && now0.fill ? null : true });
      const out = h('span', { class: 'sp-val' }, Math.round((1 - solid) * 100) + '%');
      r.addEventListener('input', () => { out.textContent = r.value + '%'; });
      r.addEventListener('change', () => pick({ ...now0, fo: Math.round(100 - +r.value) / 100 }));
      wrap.append(h('label', { class: 'sp-range' }, h('span', null, 'See-through'), r, out));
      if (!(now0 && now0.fill)) wrap.append(h('p', { class: 'hint' }, 'Pick a fill colour first; then you can choose how much shows through.'));
    }
    const isNew = sameStyle(prefs.get(K.pref, null), now0);
    wrap.append(h('div', { class: 'sp-foot' },
      h('button', { class: 'btn small' + (isNew ? ' on' : ''), id: 'spNew', 'aria-pressed': String(isNew), onclick: () => {
        prefs.set(K.pref, now0 ? deep(now0) : null);
        toast(now0 ? 'Your ' + K.newLabel + ' get these colours.' : 'Your ' + K.newLabel + ' look normal again.'); render();
      } }, svg(isNew ? 'check' : 'star'), isNew ? 'Used for ' + K.newLabel : 'Use for ' + K.newLabel)));
  };
  render();
  return openPop(anchor, wrap, K.title);
}
function styleKindOf(objs) {
  const ks = [...new Set(objs.filter((o) => o.t !== 'conn').map((o) => STYLE_OF_T[o.t] || '-'))];
  return ks.length === 1 && ks[0] !== '-' ? ks[0] : null;
}
function styleAnchor(o) { const b = $('#objbar'); return b && !b.hidden ? b : (o && findObjEl(o.id)) || $('#work'); }
function openStyleFor(objs, anchor) {
  const k = styleKindOf(objs); if (!k) return;
  const list = objs.filter((o) => STYLE_OF_T[o.t] === k);
  return stylePop(anchor || styleAnchor(list[0]), k, objStyle(k, list[0]), (st) => applyStyleTo(list, k, st));
}
function pageStylePop(anchor) { return stylePop(anchor, 'page', doc && doc.pcol, setPageStyle); }

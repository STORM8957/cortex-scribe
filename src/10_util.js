<script>
(() => {
'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs) { const e = document.createElementNS(SVGNS, tag); if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v)); return e; }
const newId = (p) => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const now = () => Date.now();
const SESSION = newId('s');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cssq = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round1 = (v) => Math.round(v * 10) / 10;
const prefs = {
  get(k, d) { try { const v = localStorage.getItem('inkling:pref:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('inkling:pref:' + k, JSON.stringify(v)); } catch {} },
};
const isMobile = () => matchMedia('(max-width: 900px)').matches;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const parse = (html) => new DOMParser().parseFromString('<!doctype html><body>' + (html || '') + '</body>', 'text/html');
const raf = (fn) => requestAnimationFrame(fn);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isTyping = (el) => !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
const deep = (o) => JSON.parse(JSON.stringify(o));
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

/* ================= icons ================= */
const ICONS = {
  download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7h6"/>',
  page: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  a4: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M9 8h6M9 11h6M9 14h4"/>',
  endless: '<path d="M6 3h12v12M6 3v12"/><path d="M9 7h6M9 10h6"/><path d="M6 18v.01M6 21v.01M18 18v.01M18 21v.01"/>',
  board: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 14l3-4 3 3 4-5"/><path d="M12 18v3M8 21h8"/>',
  shared: '<circle cx="7" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M9.2 10.8l5.6-3.4M9.2 13.2l5.6 3.4"/>',
  caret: '<path d="M9 6l6 6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  dots: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  hl: '<path d="M14.5 4.5l5 5-8.5 8.5H6v-5z"/><path d="M4 21h9"/>',
  list: '<path d="M10 6h10M10 12h10M10 18h10"/><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="18" r="1" fill="currentColor"/>',
  olist: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5h1.5v3.5M4 8.5h3M4 14.5c.4-.6 1-.9 1.6-.8.8.1 1.2.8.8 1.5L4 18h3"/>',
  checklist: '<rect x="3.5" y="4.5" width="5" height="5" rx="1"/><path d="M4.8 7l1 1 1.6-1.8"/><rect x="3.5" y="14.5" width="5" height="5" rx="1"/><path d="M12 7h8M12 17h8"/>',
  quote: '<path d="M6 17c-1.2-1.3-1.8-2.7-1.8-4.4C4.2 9.9 6 8 8.5 7.2l.5 1.2C7.5 9.1 6.8 10 6.7 11H9v6zM15 17c-1.2-1.3-1.8-2.7-1.8-4.4 0-2.7 1.8-4.6 4.3-5.4l.5 1.2c-1.5.7-2.2 1.6-2.3 2.6H18v6z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  sparkle: '<path d="M11 3.5l1.7 4.4 4.4 1.7-4.4 1.7L11 15.7l-1.7-4.4L4.9 9.6l4.4-1.7z"/><path d="M18 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/>',
  move: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10 13h6M13 10l3 3-3 3"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  unlink: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/><path d="M4 4l16 16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  pen: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
  marker: '<path d="M15 4l5 5-7 7H8v-5z"/><path d="M8 16l-4 4h6"/>',
  eraser: '<path d="M8 20h12"/><path d="M5.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 19H8z"/><path d="M9.5 11.5l5 5"/>',
  pointer: '<path d="M5 3l14 7.5-6.2 1.6L10 18z"/><path d="M13 13l5 6"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v6M14 10V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L4 14.5a1.5 1.5 0 0 1 2.4-1.8L8 14"/>',
  textT: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  tbox: '<rect x="3.5" y="5" width="17" height="14" rx="1.5" stroke-dasharray="2.6 2.2"/><path d="M8.5 9.5h7M12 9.5v6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  calc: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><rect x="8" y="5.5" width="8" height="3.5" rx=".6"/><path d="M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01M8.5 18.5h.01M12 18.5h.01M15.5 18.5h.01" stroke-width="2.2" stroke-linecap="round"/>',
  tag: '<path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2-8.7 8.7z"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/>',
  lasso: '<path d="M12 4.5c-4.7 0-8.5 2.3-8.5 5.2s3.8 5.2 8.5 5.2 8.5-2.3 8.5-5.2-3.8-5.2-8.5-5.2z" stroke-dasharray="2.6 2.2"/><path d="M7.8 14.2c-.9 1.3-.5 3 .9 3.6 1.4.6 2 2.1 1.4 3.4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3"/>',
  stopSq: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor"/>',
  note: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M7.5 9h9M7.5 12.5h9M7.5 16h5"/>',
  sticky: '<path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/>',
  shape: '<rect x="3" y="11" width="9" height="9" rx="1"/><circle cx="16" cy="8" r="5"/>',
  connector: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M6.5 16.5C9 8 13 14 17.5 7.5"/>',
  mindmap: '<rect x="9" y="10" width="6" height="4" rx="1.2"/><rect x="2" y="3" width="5" height="3.5" rx="1"/><rect x="2" y="17.5" width="5" height="3.5" rx="1"/><rect x="17" y="10.2" width="5" height="3.5" rx="1"/><path d="M9 11c-2 0-2-6-2-6M9 13c-2 0-2 6-2 6M15 12h2"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  table: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 10h18M3 14.5h18M9 5v14M15 5v14"/>',
  frame: '<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h6M7 13h10"/><path d="M15 9h2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  zin: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M8 11h6M11 8v6"/>',
  zout: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M8 11h6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  front: '<rect x="8" y="8" width="12" height="12" rx="1.5" fill="currentColor" fill-opacity=".25"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  back: '<rect x="4" y="4" width="12" height="12" rx="1.5"/><path d="M20 8v11a1 1 0 0 1-1 1H8" /><path d="M8 20" />',
  fwd: '<rect x="9" y="9" width="11" height="11" rx="1.5" fill="currentColor" fill-opacity=".25"/><rect x="4" y="4" width="11" height="11" rx="1.5"/>',
  bwd: '<rect x="4" y="4" width="11" height="11" rx="1.5" fill="currentColor" fill-opacity=".25"/><rect x="9" y="9" width="11" height="11" rx="1.5"/>',
  wrap: '<path d="M4 6h16M4 18h16M4 10h4M4 14h4"/><rect x="11" y="9" width="9" height="6" rx="1"/>',
  behind: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16" opacity=".5"/><rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor" fill-opacity=".2"/>',
  alignL: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignR: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  alignJ: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  indent: '<path d="M4 6h16M10 10h10M10 14h10M4 18h16"/><path d="M4 9.5l3 2.5-3 2.5"/>',
  outdent: '<path d="M4 6h16M10 10h10M10 14h10M4 18h16"/><path d="M7 9.5L4 12l3 2.5"/>',
  clearf: '<path d="M5 6h11M10 6l-3 13"/><path d="M14 14l6 6M20 14l-6 6"/>',
  spacing: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M5 4v16M3 6l2-2 2 2M3 18l2 2 2-2"/>',
  present: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/><path d="M10 8l4 2-4 2z"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
  textfile: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 12h6M10 15.5h6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  shield: '<path d="M12 3l7 3v6c0 4.2-3 7.6-7 9-4-1.4-7-4.8-7-9V6z"/><path d="M8.8 12.2l2.3 2.3 4.2-4.6"/>',
  sources: '<path d="M4 6.5A1.5 1.5 0 0 1 5.5 5H10l2 2h6.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><path d="M8 12h8M8 15h5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  learn: '<path d="M2.5 9L12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c1.5 1.5 3.5 2.2 5.5 2.2s4-.7 5.5-2.2V11"/><path d="M21.5 9v5"/>',
  outline: '<path d="M4 6h3M4 12h3M4 18h3M10 6h10M12 12h8M12 18h8"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  bg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/>',
  wand: '<path d="M4 20L16 8"/><path d="M14 6l4 4"/><path d="M19 3v3M17.5 4.5h3M7 4v2M6 5h2M19 14v2M18 15h2"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/><path d="M14 11v6M11 14h6"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  curve: '<path d="M4 18C10 18 14 6 20 6"/>',
  elbow: '<path d="M4 18h8V6h8"/>',
  straight: '<path d="M4 18L20 6"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.5-1-2.6 0-1 .8-1.7 1.9-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7" r="1.2" fill="currentColor"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-1.8 5.1"/><path d="M20 4v7h-7"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  area: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M9 12l2 2 4-4"/>',
  magic: '<path d="M3.5 20.5l10-10"/><path d="M11.6 8.6l3.8 3.8"/><path d="M17.6 2.2L18.6 4.8L21.4 5.0L19.2 6.7L20.0 9.4L17.6 7.9L15.2 9.4L16.0 6.7L13.8 5.0L16.6 4.8Z"/><path d="M5 4v2.2M3.9 5.1h2.2M20.5 14.5v2M19.5 15.5h2"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9.5 4V2.8h5V4M9 10h6M9 14h6M9 18h3"/>',
  blocks: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  a3: '<rect x="4" y="2.5" width="16" height="19" rx="1.5"/><path d="M8 16l2-7 2 7M8.7 13.6h2.6M14.3 9.3h1.6a1.3 1.3 0 0 1 0 2.6h-1a1.3 1.3 0 0 1 0 2.6 1.3 1.3 0 0 1-1.4-1"/>',
  pin: '<path d="M9 3h6l-1 6 3.5 3.5h-11L10 9z"/><path d="M12 12.5V21"/>',
  spaceKey: '<path d="M3 9v5a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9"/>',
  enterKey: '<path d="M20 5v7a3 3 0 0 1-3 3H5"/><path d="M9 11l-4 4 4 4"/>',
  backspace: '<path d="M21 5H9l-6 7 6 7h12z"/><path d="M12 9l6 6M18 9l-6 6"/>',
  dissect: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  spell: '<path d="M3.5 16l3.5-10 3.5 10M4.8 12.5h4.4"/><path d="M13 15.5l3 3 5.5-6.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  group: '<rect x="3" y="3" width="18" height="18" rx="4" stroke-dasharray="3 2.6"/><rect x="7" y="7" width="5" height="5" rx="1"/><circle cx="15.5" cy="15.5" r="2.5"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  cmd: '<path d="M9 6.5A2.5 2.5 0 1 0 6.5 9H9V6.5zM15 6.5A2.5 2.5 0 1 1 17.5 9H15V6.5zM9 17.5A2.5 2.5 0 1 1 6.5 15H9v2.5zM15 17.5a2.5 2.5 0 1 0 2.5-2.5H15v2.5z"/><path d="M9 9h6v6H9z"/>',
  home: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2"/>',
  code: '<path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5"/><path d="M13.5 4.5l-3 15"/>',
  trend: '<path d="M3.5 17.5l5.5-5.5 4 4 7.5-8"/><path d="M15 8h5.5v5.5"/>',
  inbox: '<path d="M3.5 13.5l2.6-8h11.8l2.6 8V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 13.5h5l1.2 2.5h4.6l1.2-2.5h5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  bulb: '<path d="M9 17.5h6M10 21h4"/><path d="M8.6 14.5A6 6 0 1 1 15.4 14.5c-.8.7-1.2 1.5-1.2 3H9.8c0-1.5-.4-2.3-1.2-3z"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2"/><path d="M15.5 5.6a3.1 3.1 0 0 1 0 5.8M17.5 14.6c1.8.7 3 2.4 3.4 4.9"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4.5h12l-2.5 4 2.5 4H5"/>',
};
function svg(name, cls) {
  const t = document.createElement('template');
  t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (cls ? ' class="' + cls + '"' : '') + '>' + (ICONS[name] || '') + '</svg>';
  return t.content.firstChild;
}

/* ================= modals, menus, toast ================= */
/* lets files be dragged onto el: onFiles(files) gets the ones whose type matches accept; el has .drop-over meanwhile */
function dropFiles(el, onFiles, accept = /^image\//, wrong = 'Drop a picture file here.') {
  let n = 0;
  const has = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  el.addEventListener('dragenter', (e) => { if (!has(e)) return; e.preventDefault(); n++; el.classList.add('drop-over'); });
  el.addEventListener('dragover', (e) => { if (!has(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; });
  el.addEventListener('dragleave', () => { if (--n <= 0) { n = 0; el.classList.remove('drop-over'); } });
  el.addEventListener('drop', (e) => {
    if (!has(e)) return;
    e.preventDefault(); e.stopPropagation(); n = 0; el.classList.remove('drop-over');
    const files = [...(e.dataTransfer.files || [])].filter((f) => accept.test(f.type || ''));
    if (files.length) onFiles(files); else toast(wrong);
  });
  return el;
}
function modal({ title, body, actions = [], wide, onClose }) {
  const prev = document.activeElement;
  const scrim = h('div', { class: 'scrim' });
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    scrim.remove(); document.removeEventListener('keydown', onKey, true);
    if (onClose) onClose();
    if (prev && prev.focus && prev.isConnected) prev.focus({ preventScroll: true });
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  box.append(h('h2', null, title), h('div', { class: 'modal-body' }, body),
    h('div', { class: 'modal-acts' }, actions.map((a) => h('button', { class: 'btn ' + (a.kind || ''), onclick: async () => { const r = a.fn ? await a.fn() : undefined; if (r !== false) close(); } }, a.label))));
  scrim.append(box);
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
  document.body.append(scrim);
  setTimeout(() => { const f = box.querySelector('input:not([type=checkbox]):not([type=radio]),select,textarea') || box.querySelector('.btn.primary') || box.querySelector('button'); if (f) f.focus(); });
  return { close, box };
}
function promptModal(title, label, value, ok, placeholder) {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { class: 'field', value: value || '', placeholder: placeholder || '', 'aria-label': label, maxlength: 140 });
    const m = modal({ title, body: [input], actions: [{ label: 'Cancel', fn: () => { done = true; resolve(null); } }, { label: ok, kind: 'primary', fn: () => { done = true; resolve(input.value); } }], onClose: () => { if (!done) resolve(null); } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done = true; resolve(input.value); m.close(); } });
    setTimeout(() => input.select());
  });
}
function confirmModal(title, text, ok, danger) {
  return new Promise((resolve) => {
    let done = false;
    modal({ title, body: [h('p', null, text)], actions: [{ label: 'Cancel', fn: () => { done = true; resolve(false); } }, { label: ok, kind: danger ? 'danger' : 'primary', fn: () => { done = true; resolve(true); } }], onClose: () => { if (!done) resolve(false); } });
  });
}
function choiceModal(title, text, choices) {
  return new Promise((resolve) => {
    let done = false;
    modal({ title, body: [h('p', null, text)], actions: choices.map((c) => ({ label: c.label, kind: c.kind, fn: () => { done = true; resolve(c.value); } })), onClose: () => { if (!done) resolve(null); } });
  });
}
/* menuEl: the open menu; subs: its open sub-menus, one per level (a sub-menu can have sub-menus of its own) */
let menuEl = null, subT = null;
const subs = [];
/* closes the sub-menus from this level down (0 = all of them) */
function closeSub(level = 0) {
  clearTimeout(subT);
  while (subs.length > level) { const x = subs.pop(); x.m.remove(); x.btn.setAttribute('aria-expanded', 'false'); }
}
function closeMenu() { closeSub(); if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener('pointerdown', outside, true); } }
function outside(e) { if (menuEl && !menuEl.contains(e.target) && !(e.target.closest && e.target.closest('.menu,.pop'))) closeMenu(); }
function placePopup(m, anchor) {
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let x = Math.min(r.left, innerWidth - mw - 8), y = r.bottom + 4;
  if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 4);
  m.style.left = Math.max(8, x) + 'px'; m.style.top = y + 'px';
}
function fillMenu(m, items, level = 0) {
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { m.append(h('div', { class: 'msep' })); continue; }
    if (it.label && it.header) { m.append(h('div', { class: 'mlabel' }, it.label)); continue; }
    const ic = it.icon ? svg(it.icon) : (it.checked != null ? (it.checked ? svg('check') : h('span', { style: { width: '16px', flex: 'none' } })) : null);
    if (it.sub) {
      const b = h('button', { role: 'menuitem', class: 'has-sub', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, ic, h('span', null, it.label), svg('chevR', 'mchev'));
      const isOpen = () => subs[level] && subs[level].btn === b;
      const open = () => { clearTimeout(subT); if (!isOpen()) openSub(b, typeof it.sub === 'function' ? it.sub() : it.sub, level); };
      const first = () => { const x = subs[level]; const f = x && x.m.querySelector('button'); if (f) f.focus(); };
      b.addEventListener('click', (e) => { e.stopPropagation(); open(); if (e.detail === 0) first(); });
      b.addEventListener('pointerenter', () => { clearTimeout(subT); subT = setTimeout(open, 140); });
      b.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); open(); first(); } });
      m.append(b); continue;
    }
    const b = h('button', { role: it.checked != null ? 'menuitemradio' : 'menuitem', 'aria-checked': it.checked != null ? String(!!it.checked) : null, class: it.danger ? 'danger' : null, onclick: () => { closeMenu(); it.fn(); } }, ic, it.label);
    b.addEventListener('pointerenter', () => { if (subs.length > level) { clearTimeout(subT); subT = setTimeout(() => closeSub(level), 220); } });   // a plain item: deeper sub-menus close
    m.append(b);
  }
}
function menuKeys(m, onEsc) {
  m.addEventListener('keydown', (e) => {
    const bs = $$('button', m), i = bs.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopPropagation(); onEsc(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  });
}
/* opens a sub-menu for btn, which sits in a menu at this level (0 = the main menu) */
function openSub(btn, items, level = 0) {
  closeSub(level);
  const m = h('div', { class: 'menu sub', role: 'menu' });
  fillMenu(m, items, level + 1);
  menuKeys(m, () => { closeSub(level); btn.focus(); });
  m.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); closeSub(level); btn.focus(); } });
  m.addEventListener('pointerenter', () => clearTimeout(subT));
  document.body.append(m);
  const r = btn.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  let x = r.right + 2; if (x + mw > innerWidth - 8) x = Math.max(8, r.left - mw - 2);
  let y = r.top - 6; if (y + mh > innerHeight - 8) y = Math.max(8, innerHeight - mh - 8);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  subs.push({ m, btn }); btn.setAttribute('aria-expanded', 'true');
}
function openMenu(anchor, items) {
  closeMenu();
  const m = h('div', { class: 'menu', role: 'menu' });
  fillMenu(m, items, 0);
  menuKeys(m, () => { closeMenu(); anchor.focus(); });
  document.body.append(m);
  placePopup(m, anchor);
  menuEl = m;
  const first = m.querySelector('button'); if (first) first.focus({ preventScroll: true });
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
}
const COLORS = ['#1E2740', '#5B6576', '#B42318', '#D9480F', '#B7791F', '#2F855A', '#0F6B67', '#1C5BCB', '#6B4FD8', '#B83280', '#FFFFFF', '#000000',
  '#FFE46B', '#FFC9D9', '#C6E2FF', '#CDEFC4', '#FFD3A8', '#E1D2FF', '#DAEEEA', '#F1F3F0'];
function openPalette(anchor, onPick, opts = {}) {
  closeMenu();
  const m = h('div', { class: 'pal', role: 'dialog', 'aria-label': opts.label || 'Pick a colour' });
  for (const c of (opts.colors || COLORS)) m.append(h('button', { style: { background: c }, 'aria-label': c, title: c, onclick: () => { closeMenu(); onPick(c); } }));
  if (opts.none) m.append(h('button', { class: 'none', onclick: () => { closeMenu(); onPick(null); } }, opts.none));
  const inp = h('input', { type: 'color', 'aria-label': 'Custom colour', value: opts.value && /^#[0-9a-f]{6}$/i.test(opts.value) ? opts.value : '#0f6b67' });
  inp.addEventListener('change', () => { closeMenu(); onPick(inp.value); });
  m.append(inp);
  m.addEventListener('mousedown', (e) => { if (e.target.tagName === 'BUTTON') e.preventDefault(); });
  document.body.append(m);
  placePopup(m, anchor);
  menuEl = m;
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
}
let toastTimer = null;
function toast(msg, action) {
  const t = $('#toast'); t.textContent = '';
  t.append(h('span', null, msg));
  if (action) t.append(h('button', { onclick: () => { hideToast(); action.fn(); } }, action.label));
  t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, action ? 8000 : 3800);
}
function hideToast() { $('#toast').classList.remove('show'); }

/* ================= script loader (pinned CDN versions) ================= */
const LIBS = {
  pdf: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'],
  pdfw: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'],
  mammoth: ['https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'],
  xlsx: ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'],
};
LIBS.qr = ['https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'];
LIBS.h2c = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'];   // PDF export where the browser can't draw the page itself (52_pdf.js)
LIBS.three = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'];
const libCache = {};
function loadLib(name) {
  if (libCache[name]) return libCache[name];
  const urls = LIBS[name];
  libCache[name] = (async () => {
    for (const u of urls) {
      const ok = await new Promise((res) => { const s = document.createElement('script'); s.src = u; s.async = true; s.onload = () => res(true); s.onerror = () => { s.remove(); res(false); }; document.head.append(s); });
      if (ok) return true;
    }
    libCache[name] = null;
    throw new Error('lib');
  })();
  return libCache[name];
}

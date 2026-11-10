
/* ================= names for things on a page ================= */
const BASE_NAMES = { note: 'Note box', text: 'Text box', sticky: 'Sticky note', image: 'Picture', chart: 'Chart', mm: 'Mind map', card: 'Page link', m3d: '3D model', group: 'Group', frame: 'Frame' };
const OBJ_ICON = { note: 'note', text: 'textT', sticky: 'sticky', shape: 'shape', image: 'image', chart: 'chart', mm: 'mindmap', frame: 'frame', card: 'card', m3d: 'cube', group: 'group' };
function baseName(o) {
  if (o.t === 'paper') return (o.size || 'A4') + ' page';
  if (o.t === 'shape') return SHAPES[o.k] || 'Shape';
  if (o.t === 'chart' && o.chart && o.chart.title) return String(o.chart.title).slice(0, 40);
  if (o.t === 'mm' && o.tree && o.tree.text) return 'Mind map: ' + String(o.tree.text).slice(0, 30);
  return BASE_NAMES[o.t] || 'Item';
}
const stripNum = (n) => String(n).replace(/\s+\d+$/, '');
function uniqueName(want, exceptId) {
  want = String(want || '').trim().slice(0, 80) || 'Item';
  const taken = new Set(objList((x) => x.id !== exceptId && x.name && x.t !== 'conn').map((x) => x.name.toLowerCase()));
  if (!taken.has(want.toLowerCase())) return want;
  const base = stripNum(want);
  let n = 2; while (taken.has((base + ' ' + n).toLowerCase())) n++;
  return base + ' ' + n;
}
const objDisplayName = (o) => (o.t === 'frame' ? (o.title || o.name || 'Frame') : (o.name || baseName(o)));
function ensureNames() {
  if (!doc) return;
  const unnamed = objList((o) => o.t !== 'conn' && !o.name).sort((a, b) => (a.z || 0) - (b.z || 0));
  if (!unnamed.length) return;
  for (const o of unnamed) { o.name = uniqueName(baseName(o), o.id); changed(o); }
  saveDoc('main');
}
function objSearchText(o) {
  switch (o.t) {
    case 'note': case 'text': case 'sticky': case 'shape': case 'paper': return htmlStrToText(o.html || '');
    case 'chart': { const d = chartData(o); return [(o.chart || {}).title || '', ...d.cats, ...d.series.map((s) => s.name)].join(' '); }
    case 'mm': { const out = []; const walk = (n) => { if (!n) return; out.push(n.text || ''); (n.ch || []).forEach(walk); }; walk(o.tree); return out.join(' · '); }
    case 'image': return o.alt || '';
    case 'card': { const n = tree.nodes[o.target]; return n ? 'Opens ' + n.name : ''; }
    case 'frame': return o.title || '';
    case 'group': return objList((x) => x.g === o.id).map(objDisplayName).join(', ');
    case 'm3d': return (o.links || []).map((l) => l.name).join(', ');
    default: return '';
  }
}

/* ================= helpers for matching ================= */
const fold = (s) => Array.from(String(s || ''), (c) => c.normalize('NFD')[0] || c).join('').toLowerCase();
const queryWords = (q) => fold(q).split(/\s+/).filter(Boolean);
const matchAll = (text, words) => { const f = fold(text); return words.every((w) => f.includes(w)); };
function snippetEl(text, word) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const i = word ? fold(t).indexOf(word) : -1;
  if (i < 0) return t.slice(0, 110) + (t.length > 110 ? '…' : '');
  const a = Math.max(0, i - 40), b = Math.min(t.length, i + word.length + 70);
  return h('span', null, (a > 0 ? '…' : '') + t.slice(a, i), h('mark', null, t.slice(i, i + word.length)), t.slice(i + word.length, b) + (b < t.length ? '…' : ''));
}
function highlightText(q) {
  const w = queryWords(q);
  const f = findRange(q.trim()) || (w[0] ? findRange(q.trim().split(/\s+/)[0]) : null);
  if (!f) return false;
  const objEl = f.root.closest('.obj');
  if (objEl && view && view.kind === 'board') { const o = doc.objs[objEl.dataset.id]; if (o) view.centerOn(o.x + o.w / 2, o.y + o.h / 2); }
  else { const el = f.range.startContainer.parentElement; if (el) el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); }
  if (window.Highlight && window.CSS && CSS.highlights) { CSS.highlights.set('fcfind', new Highlight(f.range)); setTimeout(() => CSS.highlights.delete('fcfind'), 4500); }
  else { const s = getSelection(); s.removeAllRanges(); s.addRange(f.range); }
  return true;
}

/* ================= search notes (left side) ================= */
const noteIndex = new Map();
let indexing = null;
const noteSearchQ = () => { const i = $('#noteSearch'); return i ? i.value.trim() : ''; };
function indexNotes() {
  if (indexing) return indexing;
  indexing = (async () => {
    const notes = Object.values(tree.nodes).filter((n) => live(n) && n.type === 'note');
    for (const n of notes) {
      if (cur && n.id === cur.id && doc) { noteIndex.set(n.id, { t: now(), text: docText(doc) }); continue; }
      const c = noteIndex.get(n.id);
      if (c && now() - c.t < 120000) continue;
      try { const d = await loadDocData(n.id); noteIndex.set(n.id, { t: now(), text: docText(d.main) }); } catch {}
      if (noteSearchQ()) renderNoteSearch();
    }
  })().finally(() => { indexing = null; if (noteSearchQ()) renderNoteSearch(); });
  return indexing;
}
function renderNoteSearch() {
  const q = noteSearchQ(), t = $('#tree');
  if (!q) { renderTree(); return; }
  const words = queryWords(q);
  t.textContent = '';
  const nodes = Object.values(tree.nodes).filter(live);
  const byName = nodes.filter((n) => matchAll(n.name, words)).sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1));
  const byText = nodes.filter((n) => n.type === 'note' && !byName.includes(n) && noteIndex.has(n.id) && matchAll(noteIndex.get(n.id).text, words));
  const ul = h('ul', { class: 't-list s-results', role: 'list', 'aria-label': 'Search results' });
  const item = (n, inText) => {
    const path = ancestors(n.id).map((a) => a.name).join(' › ');
    const txt = (noteIndex.get(n.id) || {}).text || '';
    const ic = n.type === 'folder' ? (n.parent ? 'folder' : 'book') : (n.shared ? 'shared' : (KIND_ICON[n.kind] || 'page'));
    return h('li', null, h('button', { class: 's-item', onclick: async () => {
      if (n.type === 'folder') { let x = n; while (x) { openSet.add(x.id); x = tree.nodes[x.parent]; } persistOpen(); $('#noteSearch').value = ''; renderTree(); return; }
      await openNote(n.id);
      if (inText) setTimeout(() => highlightText(q), 150);
    } }, svg(ic), h('span', { class: 's-txt' }, h('b', null, n.name || 'Untitled'), h('small', null, inText ? snippetEl(txt, words[0]) : (path || (n.type === 'folder' ? 'Notebook' : ''))))));
  };
  for (const n of byName) ul.append(item(n, false));
  if (byText.length) ul.append(h('li', { class: 'mlabel', style: { padding: '8px 10px 2px' } }, 'Found inside pages'));
  for (const n of byText) ul.append(item(n, true));
  if (byName.length || byText.length) t.append(ul);
  else t.append(h('p', { class: 'tree-empty' }, indexing ? 'Searching…' : 'Nothing found for “' + q + '”.'));
  if (indexing) t.append(h('p', { class: 'store-note' }, 'Looking inside your pages…'));
}
(() => {
  const inp = $('#noteSearch'); if (!inp) return;
  $('#noteSearchBox').prepend(svg('search', 'si'));
  let tm = null;
  inp.addEventListener('focus', () => indexNotes());
  inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { renderNoteSearch(); if (noteSearchQ()) indexNotes(); }, 120); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { inp.value = ''; renderTree(); inp.blur(); }
    else if (e.key === 'Enter') { const b = $('#tree .s-item'); if (b) b.click(); }
    else if (e.key === 'ArrowDown') { const b = $('#tree .s-item'); if (b) { e.preventDefault(); b.focus(); } }
  });
})();

/* ================= find things on this page (top bar) ================= */
function closePageSearch() { $('#psearchList').hidden = true; }
function renderPageSearch() {
  const list = $('#psearchList');
  if (!doc || !view) { list.hidden = true; return; }
  const q = $('#pageSearch').value.trim(), words = queryWords(q);
  list.textContent = '';
  const all = objList((o) => o.t !== 'conn').map((o) => ({ o, name: objDisplayName(o), text: objSearchText(o) }));
  const hits = words.length ? all.filter((x) => matchAll(x.name + ' ' + x.text + ' ' + ((OBJ[x.o.t] || {}).label || ''), words)) : all;
  hits.sort((a, b) => (a.o.sh || 0) - (b.o.sh || 0) || a.o.y - b.o.y || a.o.x - b.o.x);
  if (hits.length) list.append(h('div', { class: 'mlabel' }, words.length ? 'On this page' : 'Everything on this page (' + hits.length + ')'));
  for (const x of hits.slice(0, 100)) {
    const sub = x.text ? snippetEl(x.text, words.find((w) => fold(x.text).includes(w))) : ((OBJ[x.o.t] || {}).label || '') + (view.kind === 'a4' ? ', page ' + ((x.o.sh || 0) + 1) : '');
    list.append(h('button', { class: 's-item', role: 'option', onclick: () => { closePageSearch(); $('#pageSearch').blur(); jumpToObj(x.o.id); } }, svg(OBJ_ICON[x.o.t] || 'note'), h('span', { class: 's-txt' }, h('b', null, x.name), h('small', null, sub))));
  }
  if (words.length && view.kind !== 'board') {
    const flowText = view.surfaces.map((s) => (s && s.L.flow ? s.L.flow.innerText : '')).join('\n');
    if (matchAll(flowText, words)) list.append(h('div', { class: 'mlabel' }, 'Page text'), h('button', { class: 's-item', role: 'option', onclick: () => { closePageSearch(); if (!highlightText(q)) toast('Not found on this page.'); } }, svg('textT'), h('span', { class: 's-txt' }, h('b', null, 'In the page text'), h('small', null, snippetEl(flowText, words[0])))));
  }
  if (!list.querySelector('.s-item')) list.append(h('p', { class: 'hint', style: { padding: '8px 10px', margin: '0' } }, words.length ? 'Nothing on this page matches “' + q + '”.' : 'Nothing on this page yet. Add boxes, pictures or charts and they show up here.'));
  list.hidden = false;
}
(() => {
  const inp = $('#pageSearch'); if (!inp) return;
  $('#psearch').prepend(svg('search', 'si'));
  let tm = null;
  inp.addEventListener('focus', renderPageSearch);
  inp.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(renderPageSearch, 100); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { inp.value = ''; closePageSearch(); inp.blur(); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const b = $('#psearchList .s-item'); if (b) b.click(); }
    else if (e.key === 'ArrowDown') { const b = $('#psearchList .s-item'); if (b) { e.preventDefault(); b.focus(); } }
  });
  $('#psearchList').addEventListener('keydown', (e) => {
    const items = $$('#psearchList .s-item'), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i >= 0) { e.preventDefault(); (items[i + 1] || items[i]).focus(); }
    else if (e.key === 'ArrowUp' && i >= 0) { e.preventDefault(); (i ? items[i - 1] : inp).focus(); }
    else if (e.key === 'Escape') { closePageSearch(); inp.focus(); }
  });
  document.addEventListener('pointerdown', (e) => { if (!$('#psearch').contains(e.target)) closePageSearch(); }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k' && cur && !document.querySelector('.scrim')) { e.preventDefault(); inp.focus(); inp.select(); }
  }, true);
})();

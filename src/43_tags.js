/* ================= Jump tags =================
   Give words (span.jtag with data-tag and a unique data-tid) or boxes, pictures and windows (o.tag)
   a tag such as “a”. Clicking tagged words, or the #tag badge of a box, jumps to the other places
   with the same tag: on this page and on the other pages of the notebook. With several, a menu lets
   you choose. Alt + click edits tagged words without jumping. (This replaces the old Link button;
   links made with it still work.) */
const TAG_OK = /^[^"'<>\\`]{1,40}$/;
const cleanTag = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 40);
const tagSnippet = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Tagged words';
/* the #tag badge on a tagged object */
function tagBadge(el, o) {
  let b = null; for (const c of el.children) if (c.classList.contains('tagbadge')) b = c;
  if (!o.tag) { if (b) b.remove(); el.classList.remove('has-tag'); return; }
  if (!b) {
    b = h('button', { class: 'tagbadge', type: 'button' });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); const ob = doc && doc.objs[el.dataset.id]; if (ob && ob.tag) tagJump(ob.tag, { obj: ob.id }, b); });
    el.append(b);
  }
  b.textContent = '#' + o.tag; b.title = 'Tag “' + o.tag + '”: click to jump to the other “' + o.tag + '”'; b.setAttribute('aria-label', b.title);
  el.classList.add('has-tag');
}
/* every tagged place of the notebook (other pages are read from storage, cached until they change) */
const tagCache = new Map();
async function tagScanPage(n) {
  const c = tagCache.get(n.id); if (c && c.u === n.updated) return c.list;
  let d = null; try { d = await loadDocData(n.id); } catch {}
  const list = [], main = d && d.main;
  if (main) {
    const scan = (html, where) => { if (!html || !html.includes('jtag')) return; parse(html).body.querySelectorAll('.jtag').forEach((el) => list.push({ page: n.id, tag: el.getAttribute('data-tag'), tid: el.getAttribute('data-tid'), label: '“' + tagSnippet(el) + '”' + where })); };
    (main.flows || []).forEach((f) => scan(f, ' on ' + n.name));
    for (const o of Object.values(main.objs || {})) { if (!o || o.del) continue; if (o.tag) list.push({ page: n.id, tag: o.tag, obj: o.id, label: (o.name || 'Box') + ' on ' + n.name }); if (o.html) scan(o.html, ' in ' + (o.name || 'a box') + ' on ' + n.name); }
  }
  tagCache.set(n.id, { u: n.updated, list });
  return list;
}
function tagsHere() {
  const out = [];
  if (!cur || !doc || !view) return out;
  for (const el of work.querySelectorAll('.jtag')) { const oe = el.closest('.obj'), o = oe && doc.objs[oe.dataset.id]; out.push({ page: cur.id, tag: el.getAttribute('data-tag'), tid: el.getAttribute('data-tid'), el, label: '“' + tagSnippet(el) + '”' + (o ? ' in ' + objDisplayName(o) : '') }); }
  for (const o of objList((x) => x.tag)) out.push({ page: cur.id, tag: o.tag, obj: o.id, label: objDisplayName(o) });
  return out;
}
async function tagPlaces(tag) {
  const out = tagsHere();
  const nb = cur ? notebookOf(cur.id) : null;
  if (nb) for (const n of descendants(nb.id)) if (n.type === 'note' && n.id !== cur.id) out.push(...(await tagScanPage(n)));
  return tag == null ? out : out.filter((p) => p.tag === tag);
}
async function tagJump(tag, from, anchor) {
  const here = cur && cur.id;
  const others = (await tagPlaces(tag)).filter((p) => !(from.el && p.el === from.el) && !(from.tid && p.tid === from.tid && p.page === here) && !(from.obj && p.obj === from.obj && p.page === here));
  if (!others.length) return toast('Nothing else has the tag “' + tag + '” yet. Give other words or a box the same tag to connect them.');
  if (others.length === 1) return tagGo(others[0]);
  openMenu(anchor, [{ label: 'Jump to “' + tag + '” (' + others.length + ' places)', header: true }, ...others.map((p) => ({ label: p.label, icon: p.obj ? 'note' : 'tag', fn: () => tagGo(p) }))]);
}
function tagGo(p) {
  if (cur && p.page === cur.id) {
    if (p.obj) return jumpToObj(p.obj);
    const el = p.el && p.el.isConnected ? p.el : work.querySelector('.jtag[data-tid="' + cssq(p.tid || '') + '"]');
    if (!el) return toast('That tagged spot isn’t there any more.');
    const oe = el.closest('.obj'), o = oe && doc.objs[oe.dataset.id];
    if (o && view.kind === 'board') view.centerOn(o.x + o.w / 2, o.y + o.h / 2); else el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    flashEl(el); return;
  }
  if (!live(tree.nodes[p.page])) return toast('That page no longer exists.');
  openNote(p.page, p.obj || p.tid);
}
/* clicking tagged words jumps (Alt + click to edit them) */
work.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('.jtag');
  if (!t || !work.contains(t) || e.altKey || linkMode || !cur || cur.loading) return;
  const s = getSelection(); if (s && !s.isCollapsed && t.contains(s.anchorNode)) return;
  e.preventDefault();
  tagJump(t.getAttribute('data-tag'), { el: t, tid: t.getAttribute('data-tid') }, pointAnchor(e.clientX, e.clientY));
});
/* the tag chooser: tags already used in the notebook, or a new one */
function chooseTag(anchor, current, done) {
  const used = new Map();
  const box = h('div', { class: 'tagpop' });
  const inp = h('input', { class: 'field', id: 'tagName', maxlength: 40, placeholder: 'For example a, 1 or Mitose', value: current || '', 'aria-label': 'Tag' });
  const go = (t) => { t = cleanTag(t); if (!TAG_OK.test(t)) { inp.focus(); return toast('Type a tag (up to 40 letters, no quotes).'); } closeMenu(); done(t); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(inp.value); } });
  const chips = h('div', { class: 'tag-chips' });
  const fillChips = (list) => {
    used.clear(); for (const p of list) if (p.tag) used.set(p.tag, (used.get(p.tag) || 0) + 1);
    chips.textContent = '';
    if (!used.size) chips.append(h('span', { class: 'hint' }, 'No tags in this notebook yet.'));
    for (const [t, n] of [...used].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) chips.append(h('button', { class: 'chip', 'aria-pressed': String(t === current), onclick: () => go(t) }, '#' + t, h('small', null, ' ' + n)));
    if (!inp.value) { const free = 'abcdefghijklmnopqrstuvwxyz'.split('').find((c) => !used.has(c)); inp.value = free || ''; inp.select(); }
  };
  box.append(h('div', { class: 'sp-head' }, svg('tag'), 'Tag'), h('p', { class: 'hint' }, 'Things with the same tag are connected: clicking one jumps to the other.'), inp,
    h('div', { class: 'sp-lab' }, 'Tags in this notebook'), chips,
    h('div', { class: 'btnrow' }, h('button', { class: 'btn primary small', id: 'tagGo', onclick: () => go(inp.value) }, svg('tag'), 'Tag it')));
  fillChips(tagsHere());
  tagPlaces(null).then((l) => { if (box.isConnected) fillChips(l); });
  openPop(anchor, box, 'Tag');
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
}
function tagObjects(objs, tag) {
  if (!objs.length || cur.ro) return;
  pushUndo();
  for (const o of objs) { if (tag) o.tag = tag; else delete o.tag; changed(o); }
  view.renderAll(); saveDoc('main'); updateObjbar(true);
  if (tag) toast('Tagged with “' + tag + '”. Click its #' + tag + ' badge to jump to the other “' + tag + '”.');
}
function tagMenuFor(el) {
  const ed = el.closest('.flow,.otext'), tag = el.getAttribute('data-tag');
  openMenu($('#rbody [aria-label^="Tag"]') || pointAnchor(el.getBoundingClientRect().left, el.getBoundingClientRect().bottom), [
    { label: 'Tag “' + tag + '”', header: true },
    { label: 'Jump to the other “' + tag + '”', icon: 'tag', fn: () => tagJump(tag, { el, tid: el.getAttribute('data-tid') }, el) },
    { label: 'Change the tag…', icon: 'edit', fn: () => chooseTag(el, tag, (t) => { el.setAttribute('data-tag', t); if (ed) edChanged(ed); }) },
    { label: 'Remove the tag', icon: 'close', fn: () => { unwrap(el); if (ed) edChanged(ed); } }]);
}
/* the Tag button (Home tab), and “Tag it…” in right-click menus */
function tagSelection(anchor) {
  if (!cur || cur.ro) return;
  anchor = anchor || $('#rbody [aria-label^="Tag"]') || $('#objbar');
  const ed = activeEd && work.contains(activeEd) && activeEd.isContentEditable ? activeEd : null;
  const s = getSelection();
  let r = null;
  if (ed) { if (s.rangeCount && ed.contains(s.getRangeAt(0).startContainer)) r = s.getRangeAt(0); else if (savedRange && ed.contains(savedRange.startContainer)) r = savedRange; }
  const n0 = r && (r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer);
  const existing = n0 && n0.closest ? n0.closest('.jtag') : null;
  if (existing && (r.collapsed || existing.contains(r.endContainer))) return tagMenuFor(existing);
  if (r && !r.collapsed && r.toString().trim()) {
    const range = r.cloneRange();
    return chooseTag(anchor, '', (tag) => {
      const span = h('span', { class: 'jtag', 'data-tag': tag, 'data-tid': newId('tg') });
      try { span.appendChild(range.extractContents()); range.insertNode(span); } catch { return toast('Select words inside one paragraph.'); }
      getSelection().removeAllRanges(); edChanged(ed);
      toast('Tagged “' + tagSnippet(span) + '” with “' + tag + '”. Click it to jump to the other “' + tag + '” (Alt + click to edit it).');
    });
  }
  const objs = sel.has ? selObjs().filter((o) => o.t !== 'conn' && o.t !== 'group') : [];
  if (objs.length) return chooseTag(anchor, objs[0].tag || '', (tag) => tagObjects(objs, tag));
  toast('Select some words, or click a box, picture or window first. Then press Tag.');
}

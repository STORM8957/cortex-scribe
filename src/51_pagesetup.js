/* ================= Page setup on A4 pages: size, turning, margins, header and footer =================
   Stored with the page; every part is optional, and a page without them looks like A4 pages always did:
   doc.ps   'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'custom' (doc.pwh = [width, height] upright, px at 96 per inch)
   doc.po   'l' = all pages lie sideways (landscape)
   doc.pt   [true, …] = pages turned the other way than the rest (one sideways page for a wide table or chart)
   doc.pmg  [top, right, bottom, left] margins in px (missing = the usual 76 / 80 / 76 / 88)
   doc.hd / doc.ft  the header and footer (html, the same on every page); span.pgf data-f="page" | "pages" shows the
            page number / the number of pages. doc.hfd = [header, footer] distance from the page edge in px (48 = 1.27 cm).
   A page linked with Word takes Word's size, orientation, margins, header and footer (49_wordlink.js). */
const PAGE_SIZES = { A4: [794, 1123], A3: [1123, 1587], A5: [559, 794], Letter: [816, 1056], Legal: [816, 1344] };
const PAGE_SIZE_LABEL = { A4: 'A4 (21 × 29.7 cm)', A3: 'A3 (29.7 × 42 cm)', A5: 'A5 (14.8 × 21 cm)', Letter: 'Letter (8.5 × 11 in)', Legal: 'Legal (8.5 × 14 in)' };
const PAGE_MARGINS = { std: [76, 80, 76, 88], normal: [96, 96, 96, 96], narrow: [48, 48, 48, 48], moderate: [96, 72, 96, 72], wide: [96, 192, 96, 192] };
const PAGE_MARGIN_LABEL = { std: 'Standard', normal: 'Normal (2.54 cm, like Word)', narrow: 'Narrow (1.27 cm)', moderate: 'Moderate', wide: 'Wide' };
const PAGE_KEYS = ['ps', 'pwh', 'po', 'pt', 'pmg', 'hd', 'ft', 'hfd'];
const HF_DIST = [48, 48];

/* ---- the stored values ---- */
function cleanPageSetup(d) {
  const o = {};
  if (!d || typeof d !== 'object') return o;
  const nums = (a, n, lo, hi) => (Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi) ? a.map((v) => Math.round(v * 10) / 10) : null);
  if (PAGE_SIZES[d.ps]) { if (d.ps !== 'A4') o.ps = d.ps; }
  else if (d.ps === 'custom') { const wh = nums(d.pwh, 2, 150, 4000); if (wh) { o.ps = 'custom'; o.pwh = [Math.min(...wh), Math.max(...wh)]; } }
  if (d.po === 'l') o.po = 'l';
  if (Array.isArray(d.pt) && d.pt.some(Boolean)) o.pt = d.pt.slice(0, 3000).map((x) => !!x);
  const m = nums(d.pmg, 4, 0, 700); if (m) o.pmg = m;
  for (const k of ['hd', 'ft']) if (typeof d[k] === 'string' && d[k].trim()) o[k] = d[k].slice(0, 30000);
  const hf = nums(d.hfd, 2, 0, 500); if (hf) o.hfd = hf;
  return o;
}
function copyPageSetup(from, to) {
  for (const k of PAGE_KEYS) delete to[k];
  Object.assign(to, cleanPageSetup(from));
  return to;
}
const pageSetupKey = (d) => JSON.stringify(cleanPageSetup(d));

/* ---- sizes ---- */
function pageBase() {
  if (doc && doc.ps === 'custom' && doc.pwh) return doc.pwh;
  return PAGE_SIZES[(doc && doc.ps) || 'A4'] || PAGE_SIZES.A4;
}
const pageLand = (i) => ((doc && doc.po) === 'l') !== !!(doc && doc.pt && doc.pt[i || 0]);
function pageDims(i) { const [a, b] = pageBase(); return pageLand(i) ? [b, a] : [a, b]; }
const pageMg = () => (doc && doc.pmg) || PAGE_MARGINS.std;
const hfDist = () => (doc && doc.hfd) || HF_DIST;
const pageH = (i) => pageDims(i)[1];
function pageTop(i) { let y = 0; for (let k = 0; k < i; k++) y += pageH(k) + 24; return y; }   // where page i starts when the pages are put one below the other
function pageAt(y) { let top = 0; for (let k = 0; k < 5000; k++) { const hh = pageH(k); if (y < top + hh + 24) return k; top += hh + 24; } return 0; }
function pageMaxW() { let w = 0; const n = doc && doc.flows ? doc.flows.length : 1; for (let i = 0; i < n; i++) w = Math.max(w, pageDims(i)[0]); return w || A4W; }
function pageSizeName() {
  if (!doc || doc.ps !== 'custom') return (doc && doc.ps) || 'A4';
  const [w, hh] = pageBase(), cm = (v) => (v * 2.54 / 96).toFixed(1).replace(/\.0$/, '');
  return cm(w) + ' × ' + cm(hh) + ' cm';
}
function pageMarginName() {
  const m = pageMg();
  for (const [k, v] of Object.entries(PAGE_MARGINS)) if (v.every((x, i) => Math.abs(x - m[i]) < 0.6)) return k;
  return 'custom';
}

/* ---- the sheets: size, margins, header and footer ---- */
const hfHas = (html) => !!html && (!!htmlStrToText(html).trim() || /class="pgf"/.test(html));
function hfFill(el, i) {
  const n = doc && doc.flows ? doc.flows.length : 1;
  for (const f of el.querySelectorAll('.pgf')) { const v = f.dataset.f === 'pages' ? String(n) : String(i + 1); if (f.textContent !== v) f.textContent = v; }
}
function hfRender(s, i) {
  if (!s || !doc) return;
  const flow = s.querySelector(':scope > .flow');
  let prev = flow;
  for (const part of ['hd', 'ft']) {
    let el = s.querySelector(':scope > .pg-hf.' + part);
    if (!el) {
      el = h('div', { class: 'pg-hf ' + part, 'data-part': part, spellcheck: 'true', title: (part === 'hd' ? 'Header' : 'Footer') + ': double-click to change it' });
      el.addEventListener('dblclick', (e) => { e.stopPropagation(); hfEdit(+s.dataset.sheet, part); });
      if (prev) prev.after(el); else s.append(el);
    }
    prev = el;
    if (el.isContentEditable) { hfFill(el, i); continue; }
    const html = sanitize(doc[part] || '');
    if (el.innerHTML !== html) el.innerHTML = html;
    hfFill(el, i);
    el.classList.toggle('empty', !hfHas(doc[part]));
  }
}
function sheetLayout(s, i) {
  if (!s || !doc) return;
  const [w, hh] = pageDims(i), [mt, mr, mb, ml] = pageMg(), [dh, df] = hfDist();
  s.style.width = w + 'px'; s.style.height = hh + 'px';
  s.classList.toggle('land', w > hh);
  const flow = s.querySelector(':scope > .flow'), hd = s.querySelector(':scope > .pg-hf.hd'), ft = s.querySelector(':scope > .pg-hf.ft');
  let pt = mt, pb = mb;
  const shown = (el) => el && (el.isContentEditable || !el.classList.contains('empty'));
  if (hd) { Object.assign(hd.style, { top: dh + 'px', left: ml + 'px', right: mr + 'px' }); if (shown(hd)) pt = Math.max(mt, Math.round(dh + hd.offsetHeight + 10)); }
  if (ft) { Object.assign(ft.style, { bottom: df + 'px', left: ml + 'px', right: mr + 'px' }); if (shown(ft)) pb = Math.max(mb, Math.round(df + ft.offsetHeight + 10)); }
  if (flow) { const pad = pt + 'px ' + mr + 'px ' + pb + 'px ' + ml + 'px'; if (flow.style.padding !== pad) flow.style.padding = pad; }
}
/* called by View.makeSheet for every A4 sheet */
function pageSheetSetup(s, i) {
  hfRender(s, i); sheetLayout(s, i);
  s.addEventListener('dblclick', (e) => {      // double-click in the top or bottom margin, like in Word
    if (!doc || !cur || cur.ro || !view || view.kind !== 'a4') return;
    const flow = s.querySelector(':scope > .flow');
    if (e.target !== flow) return;
    const r = s.getBoundingClientRect(), k = r.height / (s.offsetHeight || 1), y = (e.clientY - r.top) / k;
    const cs = getComputedStyle(flow), top = parseFloat(cs.paddingTop) || 0, bot = parseFloat(cs.paddingBottom) || 0;
    if (y < top) hfEdit(+s.dataset.sheet, 'hd'); else if (y > s.offsetHeight - bot) hfEdit(+s.dataset.sheet, 'ft');
  });
}
function pageLayoutAll(reflow) {
  if (!view || view.kind !== 'a4' || !doc) return;
  view.surfaces.forEach((s, i) => { if (s) { hfRender(s.el, i); sheetLayout(s.el, i); } });
  const ti = $('#titleIn'); if (ti && ti.classList.contains('a4t')) ti.style.width = pageDims(0)[0] + 'px';
  if (reflow) for (let i = 0; i < doc.flows.length; i++) if (view.flowEl(i)) view.reflow(i, 'deleteContentBackward');
}
/* something in the page setup changed: save it, draw the pages again, move text between pages */
function pageEmpty(i) {
  const f = view && view.flowEl(i);
  return !!f && !f.textContent.trim() && !f.querySelector('img,table,hr') && !objList((o) => (o.sh || 0) === i).length && !strokeList((s) => (s.sh || 0) === i).length;
}
function pageSetupChanged(why) {
  if (!doc || !view) return;
  doc.mu = now();
  const had = doc.flows.map((_, i) => view.kind === 'a4' && !pageEmpty(i));
  pageLayoutAll(true);
  if (view.kind === 'a4') {       // pages that only emptied because the text has more room now go away (like in Word)
    let n = doc.flows.length;
    while (n > 1 && had[n - 1] && pageEmpty(n - 1)) n--;
    if (n < doc.flows.length) {
      doc.flows.length = n; doc.fu.length = n; if (doc.pt) { doc.pt.length = Math.min(doc.pt.length, n); if (!doc.pt.some(Boolean)) delete doc.pt; }
      view.rebuild();
    }
    pageFitWide(); setTimeout(pageFitWide, 700);
  }
  pageKeepObjsInside();
  saveDoc('main'); scheduleOutline(); updateGhostCaret();
  if (typeof wordLinkChanged === 'function') wordLinkChanged();
  if (why) toast(why);
}
/* a wide (sideways or big) page that doesn't fit on the screen: zoom out for this page only (the saved zoom of
   ordinary A4 pages stays) */
function pageFitWide() {
  const v = view, sc = v && v.kind === 'a4' && v.scroller;
  if (!sc || !sc.clientWidth || !doc) return;
  const w = pageMaxW(), room = sc.clientWidth - 40;
  if (w * v.pz <= room + 10) return;
  v.pz = clamp(Math.floor(room / w * 100) / 100, 0.4, v.pz);
  if (v.pagesEl) v.pagesEl.style.zoom = String(v.pz);
  updateZoomLabel(); renderSelAll(); updateObjbar();
}
function pageKeepObjsInside(only) {     // boxes and pictures stay on their page when it gets smaller or turns
  let moved = false;
  for (const o of objList()) {
    if (o.pin || o.t === 'conn') continue;
    const i = o.sh || 0; if (only != null && i !== only) continue;
    const [w, hh] = pageDims(i), ow = o.w || 0, oh = o.h || 0;
    const x = clamp(o.x, 0, Math.max(0, w - Math.min(ow, w) - 4)), y = clamp(o.y, 0, Math.max(0, hh - Math.min(oh, hh) - 4));
    if (x !== o.x || y !== o.y) { o.x = x; o.y = y; changed(o); moved = true; }
  }
  if (moved) view.renderAll(true);
}

/* ---- changing it ---- */
const isWordPage = () => !!(doc && doc.word);
function setPageSize(k) {
  if (!doc || cur.ro || (!PAGE_SIZES[k])) return;
  pushUndo(true);
  if (k === 'A4') delete doc.ps; else doc.ps = k;
  delete doc.pwh;
  pageSetupChanged();
}
function setPageOrient(land) {
  if (!doc || cur.ro) return;
  pushUndo(true);
  if (land) doc.po = 'l'; else delete doc.po;
  delete doc.pt;
  pageSetupChanged();
}
function setPageMargins(k) {
  if (!doc || cur.ro || !PAGE_MARGINS[k]) return;
  pushUndo(true);
  if (k === 'std') delete doc.pmg; else doc.pmg = PAGE_MARGINS[k].slice();
  pageSetupChanged();
}
/* the turn button on a page: this page only (the whole document on a page linked with Word, which turns all pages) */
function turnPage(i) {
  if (!doc || cur.ro || !view || view.kind !== 'a4') return;
  pushUndo(true);
  if (isWordPage()) {
    if (doc.po === 'l') delete doc.po; else doc.po = 'l';
    delete doc.pt;
    pageSetupChanged('All pages turned: Word turns the whole document.');
    return;
  }
  const pt = (doc.pt || []).slice(); while (pt.length < doc.flows.length) pt.push(false);
  pt[i] = !pt[i];
  if (pt.some(Boolean)) doc.pt = pt; else delete doc.pt;
  pageSetupChanged();
  const s = view.surfaces[i]; if (s) s.el.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
}
/* addPage / deletePage keep doc.pt in step with the pages (a new page, also one the text flows onto, is as the
   document is: only the pages you turned stay turned) */
function pageSetupInsert(at) { if (doc && doc.pt) doc.pt.splice(at, 0, false); }
function pageSetupRemove(i) { if (doc && doc.pt) { doc.pt.splice(i, 1); if (!doc.pt.some(Boolean)) delete doc.pt; } }

/* ---- the header and footer ---- */
let hfEditing = null;
function hfEdit(i, part) {
  if (!doc || !cur || cur.ro || !view || view.kind !== 'a4') return;
  if (hfEditing && hfEditing.part === part && hfEditing.i === i) { hfEditing.el.focus(); return; }
  hfStop();
  const s = view.surfaces[i]; if (!s) return;
  const el = s.el.querySelector(':scope > .pg-hf.' + part); if (!el) return;
  el.contentEditable = 'true'; el.classList.add('editing'); el.classList.remove('empty');
  if (!el.textContent.trim() && !el.querySelector('.pgf')) el.innerHTML = '<p><br></p>';
  const tag = h('div', { class: 'pg-hf-tag ' + part, contenteditable: 'false' }, h('span', null, part === 'hd' ? 'Header' : 'Footer'),
    h('button', { class: 'btn small', title: 'Add the page number here', onmousedown: (e) => e.preventDefault(), onclick: () => hfInsertField('page') }, '# Page number'),
    h('button', { class: 'btn small', title: 'Add the number of pages here', onmousedown: (e) => e.preventDefault(), onclick: () => hfInsertField('pages') }, 'Pages'),
    h('button', { class: 'btn small', onmousedown: (e) => e.preventDefault(), onclick: () => hfStop() }, 'Close'));
  s.el.append(tag);
  hfEditing = { part, el, tag, i };
  const ml = pageMg()[3];
  Object.assign(tag.style, part === 'hd' ? { top: Math.max(4, hfDist()[0] - 34) + 'px', left: ml + 'px' } : { bottom: Math.max(4, hfDist()[1] - 34) + 'px', left: ml + 'px' });
  el.addEventListener('input', hfInput);
  el.addEventListener('keydown', hfKey);
  el.addEventListener('blur', hfBlur);
  activeEd = el;
  el.focus({ preventScroll: true });
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); savedRange = r.cloneRange();
  sheetLayout(s.el, i);
}
function hfHtmlOf(el) {
  const c = el.cloneNode(true);
  for (const f of c.querySelectorAll('.pgf')) f.textContent = '#';
  return sanitize(c.innerHTML.replace(/\u200b/g, ''));
}
function hfInput() {
  if (!hfEditing || !doc) return;
  const { el, part, i } = hfEditing;
  const html = hfHtmlOf(el);
  if (hfHas(html)) doc[part] = html; else delete doc[part];
  doc.mu = now(); lastLocalEdit = now();
  view.surfaces.forEach((s, k) => { if (s && k !== i) hfRender(s.el, k); });
  pageLayoutAll(false);
  clearTimeout(hfInput.t); hfInput.t = setTimeout(() => { if (view) for (let k = 0; k < doc.flows.length; k++) if (view.flowEl(k)) view.reflow(k, 'deleteContentBackward'); }, 400);
  saveDoc('main');
  if (typeof wordLinkChanged === 'function') wordLinkChanged();
}
function hfKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hfStop(); }
  else if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '\t'); }
}
function hfBlur() {
  setTimeout(() => {
    if (!hfEditing) return;
    const a = document.activeElement;
    if (a === hfEditing.el || (a && a.closest && a.closest('#ribbon,.ribbon,.menu,.pal,.pop,.pg-hf-tag'))) return;   // the ribbon's bold, colours, alignment work in the header too
    hfStop();
  }, 180);
}
function hfStop() {
  if (!hfEditing) return;
  const { el, tag, part } = hfEditing;
  hfEditing = null;
  el.removeEventListener('input', hfInput); el.removeEventListener('keydown', hfKey); el.removeEventListener('blur', hfBlur);
  const html = hfHtmlOf(el);
  if (doc) { if (hfHas(html)) { if (doc[part] !== html) { doc[part] = html; doc.mu = now(); saveDoc('main'); } } else if (doc[part]) { delete doc[part]; doc.mu = now(); saveDoc('main'); } }
  el.removeAttribute('contenteditable'); el.classList.remove('editing');
  if (tag) tag.remove();
  if (activeEd === el) activeEd = null;
  if (view && doc) { pageLayoutAll(true); if (typeof wordLinkChanged === 'function') wordLinkChanged(); }
}
function hfInsertField(f) {
  if (!hfEditing) return;
  const el = hfEditing.el;
  el.focus({ preventScroll: true });
  const sl = getSelection();
  if (savedRange && el.contains(savedRange.startContainer)) { sl.removeAllRanges(); sl.addRange(savedRange); }
  const chip = '<span class="pgf" data-f="' + f + '" contenteditable="false">#</span>\u200b';
  document.execCommand('insertHTML', false, chip);
  hfFill(el, hfEditing.i);
  hfInput();
}
/* Page numbers ▸ bottom centre / bottom right / top right / “Page 1 of 3”: a paragraph with the number in the
   footer (or header); the old page-number paragraph goes */
function setPageNumbers(where) {
  if (!doc || cur.ro || !view || view.kind !== 'a4') return;
  hfStop(); pushUndo(true);
  const strip = (html) => { const d = parse(sanitize(html || '')).body; for (const p of [...d.children]) if (p.querySelector('.pgf')) p.remove(); return d.innerHTML; };
  doc.hd = strip(doc.hd); doc.ft = strip(doc.ft);
  const field = (f) => '<span class="pgf" data-f="' + f + '">#</span>';
  if (where) {
    const part = where === 'tr' ? 'hd' : 'ft', align = where === 'br' || where === 'tr' ? 'right' : 'center';
    const inner = where === 'of' ? 'Page ' + field('page') + ' of ' + field('pages') : field('page');
    doc[part] = (doc[part] || '') + '<p style="text-align:' + align + '">' + inner + '</p>';
  }
  for (const k of ['hd', 'ft']) if (!hfHas(doc[k])) delete doc[k];
  pageSetupChanged();
}
function removeHeaderFooter() {
  if (!doc || cur.ro) return;
  hfStop(); pushUndo(true); delete doc.hd; delete doc.ft;
  pageSetupChanged('Header and footer removed.');
}

/* ---- the Page setup menu (View tab, and the Format panel) ---- */
function pageSetupItems() {
  const land = doc && doc.po === 'l', mk = pageMarginName(), size = (doc && doc.ps) || 'A4';
  return [
    { label: 'Size: ' + pageSizeName(), sub: () => Object.keys(PAGE_SIZES).map((k) => ({ label: PAGE_SIZE_LABEL[k], checked: size === k, fn: () => setPageSize(k) })) },
    { label: 'Turn: ' + (land ? 'sideways' : 'upright'), sub: () => [
      { label: 'Upright (portrait)', checked: !land, fn: () => setPageOrient(false) },
      { label: 'Sideways (landscape)', checked: land, fn: () => setPageOrient(true) },
      { sep: true }, { label: isWordPage() ? 'All pages turn together on a page linked with Word.' : 'Turn one page: the turn button next to the page.', header: true }] },
    { label: 'Margins: ' + (PAGE_MARGIN_LABEL[mk] || 'from Word').split(' (')[0], sub: () => Object.keys(PAGE_MARGINS).map((k) => ({ label: PAGE_MARGIN_LABEL[k], checked: mk === k, fn: () => setPageMargins(k) })) },
    { sep: true },
    { label: 'Edit the header', icon: 'edit', fn: () => hfEdit(pageVisibleIndex(), 'hd') },
    { label: 'Edit the footer', icon: 'edit', fn: () => hfEdit(pageVisibleIndex(), 'ft') },
    { label: 'Page numbers', sub: () => [
      { label: 'At the bottom, in the middle', fn: () => setPageNumbers('bc') },
      { label: 'At the bottom, on the right', fn: () => setPageNumbers('br') },
      { label: 'At the top, on the right', fn: () => setPageNumbers('tr') },
      { label: '“Page 1 of 3” at the bottom', fn: () => setPageNumbers('of') },
      { sep: true }, { label: 'No page numbers', fn: () => setPageNumbers(null) }] },
    (doc && (doc.hd || doc.ft)) ? { label: 'Remove the header and footer', icon: 'trash', fn: removeHeaderFooter } : null,
  ];
}
function pageSetupMenu(anchor) {
  if (!doc || !view || view.kind !== 'a4') return toast('Page setup is for A4 pages. Change the page type in View first.');
  if (cur.ro) return toast('This page is view only.');
  openMenu(anchor, pageSetupItems());
}
function pageVisibleIndex() {
  if (!view || !view.scroller) return 0;
  const mid = view.scroller.getBoundingClientRect().top + view.scroller.clientHeight / 3;
  let best = 0;
  view.surfaces.forEach((s, i) => { if (s && s.el.getBoundingClientRect().top <= mid) best = i; });
  return best;
}

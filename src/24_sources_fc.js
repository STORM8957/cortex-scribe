
/* ================= sources (like NotebookLM) ================= */
const SRC_LABEL = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', csv: 'Table', text: 'Text', image: 'Picture', youtube: 'YouTube', web: 'Web page' };
const SRC_ICON = { pdf: 'PDF', docx: 'DOC', xlsx: 'XLS', csv: 'CSV', text: 'TXT', image: 'IMG', youtube: '▶', web: 'WEB' };
let srcState = { nb: null, items: [], loaded: false, busy: null };
const currentNb = () => (cur ? (notebookOf(cur.id) || {}).id || null : null);
async function loadSources(nb) {
  if (srcState.nb === nb && srcState.loaded) return srcState;
  srcState = { nb, items: [], loaded: false, busy: null };
  if (!nb) return srcState;
  const d = await Store.get('srcs_' + nb).catch(() => null);
  if (srcState.nb !== nb) return srcState;
  srcState.items = (d && Array.isArray(d.items)) ? d.items : []; srcState.loaded = true;
  return srcState;
}
function saveSources() { const nb = srcState.nb; if (!nb) return; const items = srcState.items.slice(); Saver.schedule('srcs_' + nb, { items }, (x) => Store.set('srcs_' + nb, x), 300); }
function fitText(t) {
  let s = String(t || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
  if (s.length > 200000) s = s.slice(0, 200000);
  while (byteSize({ text: s }) > 240000) s = s.slice(0, Math.floor(s.length * 0.9));
  return s;
}
const wordCount = (t) => (String(t || '').match(/\S+/g) || []).length;
async function addSource(item, payload) {
  item.id = newId('src'); item.on = true; item.created = now();
  await Store.set('srct_' + item.id, payload);
  srcState.items.unshift(item); saveSources(); renderSources(); renderFactSoon();
}
async function deleteAllSources(nb) {
  const d = await Store.get('srcs_' + nb).catch(() => null);
  for (const it of (d && d.items) || []) Store.del('srct_' + it.id);
  Store.del('srcs_' + nb);
  if (srcState.nb === nb) srcState = { nb: null, items: [], loaded: false, busy: null };
}
async function extractFile(f) {
  const name = (f.name || '').toLowerCase(), ext = name.includes('.') ? name.split('.').pop() : '';
  if (f.type.startsWith('image/')) {
    const sh = await shrink(f, 1600, 0.82);
    let src = null;
    src = await Files.upload(sh.blob);
    if (!src) src = await toDataURL((await shrink(f, 1000, 0.7)).blob);
    return { img: src };
  }
  if (ext === 'pdf' || f.type === 'application/pdf') {
    await loadLib('pdfw'); await loadLib('pdf');
    const lib = window.pdfjsLib; if (!lib) throw { code: 'lib' };
    try { lib.GlobalWorkerOptions.workerSrc = LIBS.pdfw[0]; } catch {}
    const pdf = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
    let text = ''; const n = Math.min(pdf.numPages, 400);
    for (let i = 1; i <= n; i++) {
      const pg = await pdf.getPage(i); const tc = await pg.getTextContent();
      text += tc.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('') + '\n\n';
      if (text.length > 260000) break;
    }
    return { type: 'pdf', text };
  }
  if (ext === 'docx') { await loadLib('mammoth'); const r = await window.mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() }); return { type: 'docx', text: r.value || '' }; }
  if (ext === 'xlsx' || ext === 'xls') {
    await loadLib('xlsx');
    const wb = window.XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
    let text = ''; for (const sn of wb.SheetNames) text += '## ' + sn + '\n' + window.XLSX.utils.sheet_to_csv(wb.Sheets[sn]) + '\n\n';
    return { type: 'xlsx', text };
  }
  if (/^(csv|tsv|txt|md|json)$/.test(ext) || f.type.startsWith('text/')) return { type: ext === 'csv' || ext === 'tsv' ? 'csv' : 'text', text: await f.text() };
  if (ext === 'doc' || ext === 'ppt' || ext === 'pptx') throw { code: 'olddoc' };
  throw { code: 'unsupported' };
}
async function handleSourceFiles(files) {
  const nb = currentNb(); if (!nb) return toast('Open a page first.');
  await loadSources(nb);
  for (const f of files) {
    srcState.busy = 'Reading “' + f.name + '”…'; renderSources();
    try {
      const r = await extractFile(f);
      if (r.img) await addSource({ name: f.name, type: 'image', words: 0 }, { img: r.img });
      else {
        const text = fitText(r.text);
        if (!text.trim()) throw { code: 'empty' };
        await addSource({ name: f.name, type: r.type, words: wordCount(text), cut: (r.text || '').length > text.length }, { text });
      }
    } catch (e) {
      const c = e && e.code;
      toast(c === 'empty' ? 'No text found in “' + f.name + '”. If it’s a scan, add it as a picture instead.'
        : c === 'olddoc' ? '“' + f.name + '” is an old Office format. Save it as .docx or PDF first.'
        : c === 'unsupported' ? '“' + f.name + '” can’t be used. Try PDF, Word (.docx), Excel, a picture or a text file.'
        : c === 'too_big' ? '“' + f.name + '” is too big to store.'
        : 'Couldn’t read “' + f.name + '”. Try again, or copy its text and use Paste text.');
    }
  }
  srcState.busy = null; renderSources();
}
$('#srcIn').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) handleSourceFiles(f); });
function sourceTextModal(kind) {
  const nb = currentNb(); if (!nb) return toast('Open a page first.');
  const title = h('input', { class: 'field', placeholder: kind === 'youtube' ? 'Video title (optional)' : kind === 'web' ? 'Page title (optional)' : 'Title, e.g. Chapter 3 worksheet', maxlength: 140 });
  const url = kind !== 'text' ? h('input', { class: 'field', placeholder: kind === 'youtube' ? 'https://www.youtube.com/watch?v=…' : 'https://…', type: 'url' }) : null;
  const text = h('textarea', { class: 'field', placeholder: kind === 'youtube' ? 'Paste the transcript here (YouTube: … under the video → Show transcript → copy)' : kind === 'web' ? 'Paste the text of the page here' : 'Paste the text here' });
  const body = [title, url, text, kind === 'youtube' ? h('p', { class: 'hint' }, 'The AI can’t watch videos. Paste the transcript so the video can be used for fact checking and chat.') : kind === 'web' ? h('p', { class: 'hint' }, 'Web pages can’t be loaded from inside the app, so paste the text you want to use.') : null];
  modal({ title: kind === 'youtube' ? 'Add a YouTube video' : kind === 'web' ? 'Add a web page' : 'Paste text as a source', wide: true, body,
    actions: [{ label: 'Cancel' }, { label: 'Add source', kind: 'primary', fn: async () => {
      const u = url ? url.value.trim() : '';
      if (kind === 'youtube' && !/(youtube\.com|youtu\.be)\//i.test(u)) { toast('Paste a YouTube link.'); return false; }
      if (kind === 'web' && u && !/^https?:\/\//i.test(u)) { toast('Web links start with https://'); return false; }
      const t = fitText(text.value);
      if (kind !== 'youtube' && !t.trim()) { toast('Paste some text first.'); return false; }
      await loadSources(nb);
      const name = title.value.trim() || (kind === 'youtube' ? 'YouTube video' : kind === 'web' ? (u.replace(/^https?:\/\//, '').split('/')[0] || 'Web page') : 'Pasted text');
      try { await addSource({ name, type: kind, url: u || undefined, words: wordCount(t), noText: !t.trim() }, { text: t }); } catch { toast('Couldn’t save the source. It may be too long.'); return false; }
      if (kind === 'youtube' && !t.trim()) toast('Video saved. Add its transcript (… menu) so it can be used for checking.');
    } }] });
}
async function editSourceText(it) {
  const d = await Store.get('srct_' + it.id).catch(() => null);
  const text = h('textarea', { class: 'field', style: { minHeight: '50vh' } }); text.value = (d && d.text) || '';
  modal({ title: it.name, wide: true, body: [h('p', { class: 'hint' }, it.type === 'youtube' ? 'The video transcript. Paste or correct it here.' : 'The text the AI uses from this source. You can correct it.'), text],
    actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', fn: async () => {
      const t = fitText(text.value);
      try { await Store.set('srct_' + it.id, { text: t }); } catch { toast('Couldn’t save. The text may be too long.'); return false; }
      it.words = wordCount(t); it.noText = !t.trim(); saveSources(); renderSources();
    } }] });
}
function renderSources() {
  const p = $('#ptab-sources'); if (!p) return; p.textContent = '';
  if (!cur) { p.append(h('p', { class: 'empty-panel' }, 'Open a page first.')); return; }
  const nb = currentNb(); const nbNode = tree.nodes[nb];
  if (srcState.nb !== nb || !srcState.loaded) { p.append(h('div', { class: 'busy' }, h('span', { class: 'spinner' }), h('span', null, 'Loading sources…'))); loadSources(nb).then(() => { if (ptab === 'sources') renderSources(); }); return; }
  p.append(h('p', { class: 'hint' }, 'Sources for “' + (nbNode ? nbNode.name : 'this notebook') + '”. Fact check and chat use the ones that are ticked.'));
  const drop = h('div', { class: 'drop' }, 'Drop PDF, Word, Excel, pictures or text files here');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = [...(e.dataTransfer.files || [])]; if (f.length) handleSourceFiles(f); });
  p.append(drop, h('div', { class: 'btnrow' },
    h('button', { class: 'btn small', onclick: () => $('#srcIn').click() }, svg('upload'), 'Upload files'),
    h('button', { class: 'btn small', onclick: () => sourceTextModal('youtube') }, svg('video'), 'YouTube'),
    h('button', { class: 'btn small', onclick: () => sourceTextModal('web') }, svg('globe'), 'Web page'),
    h('button', { class: 'btn small', onclick: () => sourceTextModal('text') }, svg('textfile'), 'Paste text')));
  if (srcState.busy) p.append(h('div', { class: 'busy' }, h('span', { class: 'spinner' }), h('span', null, srcState.busy)));
  if (!srcState.items.length) { p.append(h('p', { class: 'empty-panel' }, 'No sources yet. Add your textbook pages, worksheets or a video transcript, and the fact check will compare your notes with them.')); return; }
  for (const it of srcState.items) {
    const c = h('input', { type: 'checkbox', checked: it.on ? true : null, 'aria-label': 'Use ' + it.name });
    c.addEventListener('change', () => { it.on = c.checked; saveSources(); });
    const meta = it.type === 'image' ? 'Picture' : it.noText ? 'No transcript yet' : (SRC_LABEL[it.type] || 'Text') + ', ' + it.words.toLocaleString() + ' words' + (it.cut ? ' (shortened)' : '');
    p.append(h('div', { class: 'src' }, c, h('span', { class: 'si' }, SRC_ICON[it.type] || 'TXT'), h('div', { class: 'sn' }, h('b', { title: it.name }, it.name), h('small', null, meta)),
      h('button', { class: 'icon-btn', 'aria-label': 'More for ' + it.name, onclick: (e) => openMenu(e.currentTarget, [
        it.type !== 'image' ? { label: it.type === 'youtube' ? 'Edit transcript' : 'View or edit text', icon: 'textfile', fn: () => editSourceText(it) } : null,
        it.url ? { label: 'Copy link', icon: 'copy', fn: () => navigator.clipboard && navigator.clipboard.writeText(it.url).then(() => toast('Link copied.'), () => toast(it.url)) } : null,
        { label: 'Rename', icon: 'edit', fn: async () => { const n = await promptModal('Rename source', 'Name', it.name, 'Rename'); if (n && n.trim()) { it.name = n.trim(); saveSources(); renderSources(); } } },
        { label: 'Delete', icon: 'trash', danger: true, fn: async () => { if (!(await confirmModal('Delete “' + it.name + '”?', 'The source is removed from this notebook. Your notes stay.', 'Delete', true))) return; srcState.items = srcState.items.filter((x) => x.id !== it.id); Store.del('srct_' + it.id); saveSources(); renderSources(); renderFactSoon(); } },
      ]) }, svg('dots'))));
  }
}
async function getSourceContext(budget, maxImgs) {
  const nb = currentNb(); await loadSources(nb);
  const on = srcState.items.filter((i) => i.on && !i.noText);
  const texts = on.filter((i) => i.type !== 'image'), imgs = on.filter((i) => i.type === 'image');
  let out = ''; const names = [], images = [];
  const per = texts.length ? Math.floor(budget / texts.length) : 0;
  for (const it of texts) {
    const d = await Store.get('srct_' + it.id).catch(() => null);
    const t = (d && d.text) || ''; if (!t.trim()) continue;
    out += '\n\n### Source: ' + it.name + ' (' + (SRC_LABEL[it.type] || 'text') + (it.url ? ', ' + it.url : '') + ')\n' + (t.length > per ? t.slice(0, per) + '\n[…the rest was cut]' : t);
    names.push(it.name);
  }
  for (const it of imgs.slice(0, maxImgs || 0)) {
    const d = await Store.get('srct_' + it.id).catch(() => null);
    if (!d || !d.img) continue;
    const b = await imgBlobFromSrc(d.img, 'src_' + it.id).catch(() => null);
    if (b) { images.push(b); names.push(it.name); out += '\n\n### Source: ' + it.name + ' (a picture, attached as an image)'; }
  }
  return { text: out.trim(), images, names, count: names.length };
}

/* ================= fact check ================= */
let factState = { id: null, hist: [], busy: false };
let factCtl = null;
async function loadFact(id) {
  factState = { id, hist: [], busy: false };
  const d = await Store.get('fc_' + id).catch(() => null);
  if (factState.id !== id) return;
  factState.hist = (d && Array.isArray(d.hist)) ? d.hist : [];
  updateAccChip(); if (ptab === 'fact') renderFact();
}
function saveFact() { const id = factState.id; if (!id) return; const hist = factState.hist.slice(0, 10); Saver.schedule('fc_' + id, { hist }, (x) => Store.set('fc_' + id, x), 300); }
function updateAccChip() {
  const chip = $('#accChip'); const r = cur && factState.id === cur.id ? factState.hist[0] : null;
  const dot = $('#factDot');
  if (!r || r.score == null) { chip.hidden = true; if (dot) dot.hidden = true; return; }
  chip.hidden = false; chip.textContent = 'Accuracy ' + r.score + '%';
  chip.className = 'acc-chip' + (r.score >= 80 ? '' : r.score >= 50 ? ' mid' : ' low');
  if (dot) { dot.hidden = !r.claims.some((c) => (c.verdict === 'incorrect' || c.verdict === 'partly') && !c.fixed); dot.style.background = r.score >= 80 ? 'var(--ok)' : r.score >= 50 ? 'var(--warn)' : 'var(--danger)'; }
}
$('#accChip').addEventListener('click', () => openPanel('fact'));
let factRenderT = null;
function renderFactSoon() { clearTimeout(factRenderT); factRenderT = setTimeout(() => { if (ptab === 'fact' && panelShown()) renderFact(); }, 80); }
let factFilter = 'all';
function ring(score) {
  const r = 32, c = 2 * Math.PI * r, v = score == null ? 0 : score;
  const col = score == null ? 'var(--muted)' : v >= 80 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--danger)';
  const box = h('div', { class: 'ring', role: 'img', 'aria-label': score == null ? 'No score' : 'Accuracy ' + v + ' percent' });
  box.innerHTML = '<svg viewBox="0 0 76 76"><circle cx="38" cy="38" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="8"/><circle cx="38" cy="38" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c * v / 100) + ' ' + c + '"/></svg>';
  box.append(h('b', null, score == null ? '–' : v + '%'));
  return box;
}
const VERDICT = { correct: 'Correct', partly: 'Partly right', incorrect: 'Wrong' };
function renderFact() {
  const p = $('#ptab-fact'); if (!p) return; p.textContent = '';
  if (!cur) { p.append(h('p', { class: 'empty-panel' }, 'Open a page first.')); return; }
  p.append(h('div', { class: 'btnrow' },
    h('button', { class: 'btn primary', onclick: () => runFactCheck({}), disabled: factState.busy ? true : null }, svg('shield'), 'Check whole note'),
    h('button', { class: 'btn', onclick: () => setTool('area'), disabled: factState.busy ? true : null }, svg('area'), 'Check an area')));
  const nb = currentNb();
  const srcLine = h('p', { class: 'hint' });
  if (srcState.nb === nb && srcState.loaded) {
    const n = srcState.items.filter((i) => i.on && !i.noText).length;
    srcLine.append(n ? 'Checks against ' + n + ' source' + (n === 1 ? '' : 's') + '. ' : 'No sources yet, so the AI would use its own knowledge. ', h('button', { class: 'btn ghost', style: { display: 'inline', padding: '0', color: 'var(--accent)', fontWeight: '700' }, onclick: () => openPanel('sources') }, n ? 'Manage sources' : 'Add a source'));
  } else loadSources(nb).then(renderFactSoon);
  p.append(srcLine);
  if (factState.busy) p.append(h('div', { class: 'busy' }, h('span', { class: 'spinner' }), h('span', null, 'Checking your notes…'), h('button', { class: 'btn small', onclick: () => factCtl && factCtl.abort() }, 'Stop')));
  const r = factState.id === cur.id ? factState.hist[0] : null;
  if (!r) { if (!factState.busy) p.append(h('p', { class: 'empty-panel' }, 'Fact check reads your note (text, boxes, charts, mind maps and handwriting) and compares it with your sources. You get an accuracy score and a fix for anything that’s wrong.')); return; }
  const counts = { correct: 0, partly: 0, incorrect: 0, unsupported: 0 };
  for (const c of r.claims) counts[c.verdict]++;
  p.append(h('div', { class: 'fc-top' }, ring(r.score), h('div', null,
    h('p', null, h('b', null, r.score == null ? 'Nothing could be checked.' : 'Accuracy ' + r.score + '%'), r.area ? ' (selected area)' : ''),
    h('p', null, r.summary || ''),
    h('p', { class: 'counts' }, counts.correct + ' correct, ' + counts.partly + ' partly right, ' + counts.incorrect + ' wrong, ' + counts.unsupported + (r.mode === 'sources' ? ' not in your sources' : ' unsure') + (r.mode === 'knowledge' ? '. Checked with the AI’s own knowledge.' : '.')))));
  const problems = r.claims.filter((c) => c.verdict === 'incorrect' || c.verdict === 'partly');
  p.append(h('div', { class: 'btnrow' }, h('button', { class: 'chip', 'aria-pressed': String(factFilter === 'all'), onclick: () => { factFilter = 'all'; renderFact(); } }, 'All (' + r.claims.length + ')'), h('button', { class: 'chip', 'aria-pressed': String(factFilter === 'problems'), onclick: () => { factFilter = 'problems'; renderFact(); } }, 'Problems (' + problems.length + ')'),
    problems.some((c) => c.fix && !c.fixed) && !cur.ro ? h('button', { class: 'btn small', onclick: () => { let n = 0; for (const c of problems) if (c.fix && !c.fixed && applyFix(c, true)) n++; renderFact(); updateAccChip(); toast(n ? 'Applied ' + n + ' fix' + (n === 1 ? '' : 'es') + '.' : 'The text has changed, so the fixes couldn’t be applied.', n ? { label: 'Undo', fn: undoObjs } : null); } }, svg('check'), 'Apply all fixes') : null));
  const list = factFilter === 'problems' ? problems : r.claims;
  for (const c of list) {
    const v = c.verdict === 'unsupported' ? (r.mode === 'sources' ? 'Not in your sources' : 'Not sure') : VERDICT[c.verdict];
    p.append(h('div', { class: 'claim ' + c.verdict },
      h('span', { class: 'v' }, v), h('q', null, c.quote), c.why ? h('p', { class: 'why' }, c.why) : null,
      c.evidence ? h('p', { class: 'ev' }, '“' + c.evidence + '”' + (c.source ? ' (' + c.source + ')' : '')) : (c.source ? h('p', { class: 'ev' }, c.source) : null),
      c.fix && c.verdict !== 'correct' ? h('p', { class: 'fix' }, h('b', null, c.fixed ? 'Fixed: ' : 'Better: '), c.fix) : null,
      h('div', { class: 'btnrow', style: { margin: '0' } }, h('button', { class: 'btn small', onclick: () => showInNote(c.quote) }, 'Show in note'),
        c.fix && c.verdict !== 'correct' && !c.fixed && !cur.ro ? h('button', { class: 'btn small primary', onclick: () => { if (applyFix(c)) { renderFact(); updateAccChip(); } } }, 'Apply fix') : null)));
  }
  if (factState.hist.length > 1) p.append(h('h3', null, 'Earlier checks'), h('ul', { class: 'hist' }, factState.hist.slice(1).map((x) => h('li', null, new Date(x.t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) + ': ' + (x.score == null ? 'no score' : x.score + '%') + (x.area ? ' (area)' : '')))));
}
function findRange(quote) {
  const norm = (s) => s.replace(/\s+/g, ' ').toLowerCase().replace(/[„“”"«»]/g, '"').replace(/[‘’`]/g, "'");
  const q = norm(String(quote || '')).trim(); if (!q) return null;
  for (const root of work.querySelectorAll('.flow, .otext, .mm-node')) {
    const nodes = []; let full = '';
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { nodes.push({ t: w.currentNode, start: full.length }); full += w.currentNode.data; }
    let ns = '', map = [], sp = false;
    for (let i = 0; i < full.length; i++) { const ch = full[i]; if (/\s/.test(ch)) { if (sp) continue; ns += ' '; map.push(i); sp = true; } else { ns += norm(ch); map.push(i); sp = false; } }
    let len = q.length, idx = ns.indexOf(q);
    if (idx < 0 && q.length > 30) { const q2 = q.slice(0, 30); idx = ns.indexOf(q2); len = q2.length; }
    if (idx < 0) continue;
    const a = map[idx], b = map[Math.min(idx + len - 1, map.length - 1)] + 1;
    const at = (pos) => { for (let i = nodes.length - 1; i >= 0; i--) if (pos >= nodes[i].start) return { node: nodes[i].t, off: Math.min(pos - nodes[i].start, nodes[i].t.length) }; return null; };
    const s = at(a), e = at(b - 1); if (!s || !e) continue;
    const r = document.createRange(); r.setStart(s.node, s.off); r.setEnd(e.node, e.off + 1);
    return { range: r, root };
  }
  return null;
}
function showInNote(quote) {
  const f = findRange(quote);
  if (!f) return toast('That text isn’t in the note any more.');
  const objEl = f.root.closest('.obj');
  if (objEl && view.kind === 'board') { const o = doc.objs[objEl.dataset.id]; if (o) view.centerOn(o.x + o.w / 2, o.y + o.h / 2); }
  else { const el = f.range.startContainer.parentElement; if (el) el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); }
  if (window.Highlight && window.CSS && CSS.highlights) { CSS.highlights.set('fcfind', new Highlight(f.range)); setTimeout(() => CSS.highlights.delete('fcfind'), 4500); }
  else { const s = getSelection(); s.removeAllRanges(); s.addRange(f.range); }
}
function applyFix(c, quiet) {
  if (!cur || cur.ro) return false;
  const f = findRange(c.quote);
  if (!f) { if (!quiet) toast('That text isn’t in the note any more, so the fix can’t be applied.'); return false; }
  if (!quiet || !applyFix.pushed) { pushUndo(true); if (quiet) { applyFix.pushed = true; setTimeout(() => { applyFix.pushed = false; }, 0); } }
  f.range.deleteContents(); f.range.insertNode(document.createTextNode(c.fix));
  const root = f.root;
  if (root.classList.contains('flow')) onFlowInput(root);
  else if (root.classList.contains('otext')) { const el = root.closest('.obj'); const o = el && doc.objs[el.dataset.id]; if (o) { o.html = sanitize(root.innerHTML); changed(o); saveDoc('main'); } }
  else if (root.classList.contains('mm-node')) { const el = root.closest('.obj'); const o = el && doc.objs[el.dataset.id]; const n = o && mmFind(o.tree, root.dataset.nid); if (n) { n.node.text = root.innerText.trim(); changed(o); view.renderAll(); saveDoc('main'); } }
  c.fixed = true; saveFact();
  if (!quiet) toast('Fix applied.', { label: 'Undo', fn: undoObjs });
  return true;
}
async function runFactCheck(area) {
  if (!cur || !doc) return;
  openPanel('fact');
  if (factState.busy || !aiReady()) return;
  const maxImg = AI.img ? Math.min(AI.img.maxCount || 0, 6) : 0;
  let text, images = [];
  if (area && area.rect) { const g = gather(area.surf, area.rect); text = g.text; images = await gatherImages(g, Math.min(3, maxImg)); }
  else {
    text = docText(doc); images = await docImages(doc, Math.min(3, maxImg));
    const pen = strokeList((s) => s.k !== 'hl');
    if (pen.length && images.length < maxImg) for (const c of clusterStrokes(pen, 60, 40).slice(0, 2)) { const b = await strokesToBlob(c).catch(() => null); if (b && images.length < maxImg) images.push(b); }
  }
  if (!String(text || '').trim() && !images.length) return toast('There’s nothing to check here yet.');
  if (text.length > 90000) text = text.slice(0, 90000) + '\n[…cut]';
  const src = await getSourceContext(110000, Math.max(0, maxImg - images.length));
  let mode = 'sources';
  if (!src.count) {
    let choice = 'know';
    if (prefs.get('fcAsk', true)) choice = await choiceModal('No sources to check against', 'This notebook has no sources yet. Add your textbook, worksheet or a video transcript for the most reliable check. Or may the AI check with its own general knowledge? It can’t browse the web from here, so very recent facts may be missing.',
      [{ label: 'Cancel', value: null }, { label: 'Add a source', value: 'add' }, { label: 'Yes, use the AI’s knowledge', value: 'know', kind: 'primary' }]);
    if (choice === 'add') { openPanel('sources'); return; }
    if (choice !== 'know') return;
    mode = 'knowledge';
  }
  const noteId = cur.id;
  factState.busy = true; factCtl = new AbortController(); renderFact();
  try {
    const nImg = images.length, all = images.concat(src.images);
    const prompt = 'You are a careful fact checker for a student’s study notes.\n' +
      (mode === 'sources' ? 'Check every factual statement in the NOTES against the SOURCES below. Use only the sources. If the sources don’t cover a statement, its verdict is "unsupported".' : 'There are no sources. Check every factual statement with your own reliable general knowledge. If you are not confident, use "unsupported".') +
      '\nIgnore headings, questions, opinions and to-do items. Check at most 25 statements; pick the most important ones if there are more.\nFor each statement give:\n- quote: the statement copied EXACTLY from the notes, word for word (at most 20 words), so it can be found again\n- verdict: "correct", "partly", "incorrect" or "unsupported"\n- why: one short sentence explaining the verdict\n- fix: for "partly" or "incorrect", a corrected version of the quote written like the student would (same language); otherwise ""\n- source: the name of the source you used, or ""\n- evidence: a short quote from the source (at most 25 words) that proves it, or ""\nAlso give "summary": one or two sentences about how accurate the notes are.\nWrite why, fix and summary in the language of the notes.\n' +
      (nImg ? 'Images 1 to ' + nImg + ' are pictures or handwriting from the notes; check what they say too (for handwriting, quote it as written).' + (src.images.length ? ' The remaining images are sources.' : '') + '\n' : (src.images.length ? 'The attached images are sources.\n' : '')) +
      'Reply with only JSON: {"summary":"…","claims":[{"quote":"…","verdict":"correct","why":"…","fix":"","source":"…","evidence":"…"}]}\n\nNOTES' + (area && area.rect ? ' (only the part the student selected)' : '') + ':\n' + (text || '(see the images)') + (mode === 'sources' ? '\n\nSOURCES:\n' + src.text : '');
    const opts = { task: 'factcheck', signal: factCtl.signal, modelTier: 'default' };
    if (all.length) opts.images = all;
    const d = await AI.json(prompt, opts);
    if (!d || !Array.isArray(d.claims)) throw { code: 'invalid_json' };
    const claims = d.claims.filter((c) => c && c.quote).slice(0, 40).map((c) => ({ quote: String(c.quote).slice(0, 400), verdict: ['correct', 'partly', 'incorrect', 'unsupported'].includes(c.verdict) ? c.verdict : 'unsupported', why: String(c.why || ''), fix: String(c.fix || ''), source: String(c.source || ''), evidence: String(c.evidence || '') }));
    const chk = claims.filter((c) => c.verdict !== 'unsupported');
    const score = chk.length ? Math.round(100 * chk.reduce((a, c) => a + (c.verdict === 'correct' ? 1 : c.verdict === 'partly' ? 0.5 : 0), 0) / chk.length) : null;
    const res = { t: now(), area: !!(area && area.rect), mode, score, summary: String(d.summary || ''), claims, sources: src.names };
    if (factState.id === noteId) { factState.hist.unshift(res); factState.hist = factState.hist.slice(0, 10); saveFact(); factFilter = claims.some((c) => c.verdict === 'incorrect' || c.verdict === 'partly') ? 'problems' : 'all'; }
  } catch (e) { if (!e || e.code !== 'cancelled') toast(aiErrorText(e)); }
  finally { factState.busy = false; factCtl = null; renderFact(); updateAccChip(); }
}

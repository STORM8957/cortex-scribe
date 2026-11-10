
/* ================= Magic box ================= */
const MAGIC_ACTIONS = [
  ['tText', 'Tidy text', 'sparkle', 'Tidy up'], ['tDraw', 'Tidy drawings', 'wand', 'Tidy up'], ['tLayout', 'Tidy layout', 'alignL', 'Tidy up'],
  ['mHand', 'Drawing → text', 'textT', 'Drawing'], ['mPic', 'Drawing → picture', 'image', 'Drawing'],
  ['mTrans', 'Auto-translate', 'globe', 'Language'], ['mCorr', 'Auto-correct', 'spell', 'Language'],
  ['mDiagram', 'Make diagram', 'pie', 'Make'], ['mMap', 'Mind map', 'mindmap', 'Make'], ['mTable', 'Table', 'table', 'Make'], ['mSum', 'Summary', 'note', 'Make'],
  ['mSticky', 'Sticky notes', 'sticky', 'Make'], ['m3d', '3D model', 'cube', 'Make'], ['mExplain', 'Explain', 'info', 'Make'],
  ['mFact', 'Fact check', 'shield', 'Check'],
];
if (!magic.on || typeof magic.on !== 'object') {
  const old = { diagram: 'mDiagram', mindmap: 'mMap', table: 'mTable', summary: 'mSum', sticky: 'mSticky', explain: 'mExplain', translate: 'mTrans', tidy: 'tText', hand: 'mHand', shapes: 'tDraw', fact: 'mFact' };
  magic.on = { tText: false, tDraw: true, tLayout: true, mDiagram: false };
  if (magic.mode && old[magic.mode] && magic.mode !== 'diagram') magic.on[old[magic.mode]] = true;
  saveMagic();
}
/* the student's own buttons: { id, name, rule } in magic.custom; switched on like the others (key 'c:<id>') */
if (!Array.isArray(magic.custom)) magic.custom = [];
const magicAll = () => MAGIC_ACTIONS.concat(magic.custom.map((c) => ['c:' + c.id, c.name, 'star', 'Your buttons']));
const magicCustom = (k) => (k.startsWith('c:') ? magic.custom.find((c) => 'c:' + c.id === k) : null);
let magicOnce = null;   // a rule typed for the next Magic box only
const magicOn = () => (magicOnce ? ['once'] : magicAll().filter(([k]) => magic.on[k]).map(([k]) => k));
const magicLabel = (k) => (k === 'once' ? 'Your rule' : (magicAll().find((a) => a[0] === k) || [k, k])[1]);
function saveMagicButton(name, rule, id) {
  name = String(name || '').trim().slice(0, 40); rule = String(rule || '').trim().slice(0, 1000);
  if (!rule) { toast('Write what the AI should do first.'); return false; }
  if (!name) name = rule.split(/\s+/).slice(0, 4).join(' ');
  const old = id && magic.custom.find((c) => c.id === id);
  if (old) { old.name = name; old.rule = rule; }
  else { if (magic.custom.length >= 20) { toast('You have 20 buttons already. Delete one first.'); return false; } const c = { id: newId('mb'), name, rule }; magic.custom.push(c); magic.on['c:' + c.id] = true; }
  saveMagic(); if (rtab === 'magic') renderRibbon(); refreshMagicPop();
  toast(old ? 'Button “' + name + '” changed.' : 'Button “' + name + '” added and switched on. Drag a Magic box around something to use it.');
  return true;
}
function deleteMagicButton(id) {
  const c = magic.custom.find((x) => x.id === id); if (!c) return;
  magic.custom = magic.custom.filter((x) => x.id !== id); delete magic.on['c:' + id];
  saveMagic(); if (rtab === 'magic') renderRibbon(); refreshMagicPop();
  toast('Button “' + c.name + '” deleted.');
}
/* the editor for one of your buttons (new when c is empty) */
function magicButtonModal(c, rulePrefill) {
  const name = h('input', { class: 'field', id: 'mbName', maxlength: 40, placeholder: 'Button name, e.g. Flashcards', 'aria-label': 'Button name' });
  const rule = h('textarea', { class: 'field', id: 'mbRule', rows: 4, maxlength: 1000, placeholder: 'What should the AI do with what’s in the box? e.g. Turn it into 5 flashcards: question, then answer.', 'aria-label': 'What the AI should do' });
  if (c) { name.value = c.name; rule.value = c.rule; } else if (rulePrefill) rule.value = rulePrefill;
  modal({ title: c ? 'Change your button' : 'Your own Magic box button', body: [h('p', { class: 'hint' }, 'Write the rule in your own words. The AI does it with whatever you drag the Magic box around, and puts the result next to it (or where “Put it” says).'), name, rule], actions: [
    c ? { label: 'Delete', kind: 'danger', fn: () => deleteMagicButton(c.id) } : null,
    { label: 'Cancel' },
    { label: c ? 'Save' : 'Add the button', kind: 'primary', fn: () => saveMagicButton(name.value, rule.value, c && c.id) }].filter(Boolean) });
}
/* a rule for just the next Magic box (nothing saved) */
function magicOnceRun(text) {
  text = String(text || '').trim();
  if (!text) return toast('Write what the AI should do first.');
  magicOnce = text.slice(0, 1000); closeMenu(); setTool('magic');
  toast('Now drag a box around something: the AI does “' + snipText(magicOnce, 40) + '” with it.');
}
const snipText = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
function toggleMagic(k, v) {
  if (k === 'once') return;
  magic.on[k] = v == null ? !magic.on[k] : !!v; saveMagic();
  if (tool === 'magic') setTool('magic');
  if (rtab === 'magic') renderRibbon();
}
let magicCtl = null;
function gather(s, rect) {
  const hitR = (b) => b.x < rect.x + rect.w && b.x + b.w > rect.x && b.y < rect.y + rect.h && b.y + b.h > rect.y;
  const blocks = [];
  if (s.L.flow) {
    for (const b of s.L.flow.children) {
      const r = b.getBoundingClientRect(); if (!r.width && !r.height) continue;
      const p0 = s.toLocal(r.left, r.top), p1 = s.toLocal(r.right, r.bottom);
      if (hitR({ x: p0.x, y: p0.y, w: p1.x - p0.x, h: p1.y - p0.y }) && (b.textContent.trim() || b.querySelector('img,table'))) blocks.push(b);
    }
  }
  const objs = objList((o) => o.t !== 'conn' && s.match(o) && (o.t !== 'frame' || (o.x >= rect.x && o.y >= rect.y && o.x + o.w <= rect.x + rect.w && o.y + o.h <= rect.y + rect.h)) && hitR({ x: o.x, y: o.y, w: o.w || 0, h: o.h || 0 })).sort((a, b) => a.y - b.y || a.x - b.x);
  const strokes = strokeList((st) => s.match(st) && hitR(strokeBox(st)));
  const text = [...blocks.map((b) => htmlToText(b)), ...objs.map(objText)].filter(Boolean).join('\n').trim();
  return { blocks, objs, strokes, text };
}
async function gatherImages(g, max) {
  const out = [];
  if (!max) return out;
  for (const o of g.objs) { if (out.length >= max) break; if (o.t === 'image' || o.t === 'm3d') { const b = await imgBlobFromSrc(resolveSrc(o.src), o.id).catch(() => null); if (b) out.push(b); } }
  for (const b of g.blocks) for (const img of b.querySelectorAll('img')) { if (out.length >= max) break; const x = await imgBlobFromSrc(img.getAttribute('src'), img.getAttribute('data-anchor')).catch(() => null); if (x) out.push(x); }
  const pen = g.strokes.filter((s) => s.k !== 'hl');
  if (pen.length && out.length < max) { const b = await strokesToBlob(pen).catch(() => null); if (b) out.push(b); }
  return out;
}
function magicPlace(s, rect, w, hh) {
  const where = magic.place || 'next';
  let x, y;
  if (where === 'replace') { x = rect.x; y = rect.y; }
  else if (where === 'below') { x = rect.x; y = rect.y + rect.h + 24; }
  else { x = rect.x + rect.w + 32; y = rect.y; }
  if (!s.board) {
    const sw = s.el.offsetWidth;
    if (x + w > sw - 10) { if (where === 'next') { x = rect.x; y = rect.y + rect.h + 24; } x = clamp(x, 10, Math.max(10, sw - w - 10)); }
  }
  const f = findFree(s, x, y, w, hh);
  return { surf: s, x: f.x, y: f.y };
}
function removeGathered(g) {
  for (const b of g.blocks) b.remove();
  for (const o of g.objs) delObj(o.id);
  for (const st of g.strokes) doc.ink[st.id] = { id: st.id, del: true, u: now() };
  if (g.blocks.length) view.surfaces.forEach((s, i) => { if (s && s.L.flow) { if (!s.L.flow.firstChild) s.L.flow.innerHTML = '<p><br></p>'; view.syncFlow(i); } });
}
function localChartParse(text) {
  const cats = [], vals = [];
  const re = /(\d+(?:[.,]\d+)?)\s*%?\s*(?:(?:of|von|der|die|das|des|are|is|sind|ist|=|:)\s+)?(?:(?:the|die|der|das|a|an|ein|eine)\s+)?([A-Za-zÀ-ÿ][\wÀ-ÿ\- ]{0,30}?)(?=[,.;\n]|\s+(?:and|und|&)\s|$)/g;
  let m;
  while ((m = re.exec(text))) { cats.push(m[2].trim().replace(/^\w/, (c) => c.toUpperCase())); vals.push(parseFloat(m[1].replace(',', '.'))); }
  const rest = text.match(/(?:the\s+)?(?:rest|remaining|others?|der\s+rest)\s+(?:is|are|ist|sind)?\s*(?:a|an|ein|eine)?\s*([A-Za-zÀ-ÿ][\wÀ-ÿ\- ]{0,30})/i);
  const sum = vals.reduce((a, c) => a + c, 0);
  if (rest && sum < 100 && /%/.test(text)) { cats.push(rest[1].trim().replace(/^\w/, (c) => c.toUpperCase())); vals.push(Math.round((100 - sum) * 100) / 100); }
  if (!cats.length) return null;
  return { title: '', cats, series: [{ name: 'Values', vals }], unit: /%/.test(text) ? '%' : '' };
}
function makeChart(s, rect, d) {
  const type = magic.chartType || 'pie';
  const spec = newChartSpec({ cats: d.cats.map(String), series: (d.series || []).map((x, i) => ({ name: x.name || 'Series ' + (i + 1), vals: (x.vals || []).map((v) => parseFloat(String(v).replace(',', '.')) || 0) })) },
    { type, title: d.title || '', showTitle: !!magic.title && !!d.title, legend: magic.legend || 'right', labels: magic.labels || 'percent', palette: magic.palette || 'ink', unit: d.unit || '', prefix: d.prefix || '' });
  if (type === 'pie' || type === 'donut') { spec.w = 420; spec.h = 300; }
  const Z = newScale(); if (Z !== 1) { spec.w = Math.round(spec.w * Z); spec.h = Math.round(spec.h * Z); spec.sc = Z; }
  const at = magicPlace(s, rect, spec.w, spec.h);
  return addObj({ ...spec, x: at.x, y: at.y, sh: s.sheet, lay: 'front' });
}
async function runMagic(s, rect) {
  if (!cur || !doc || !view) return;
  if (cur.ro) return toast('This page is view only.');
  setTool(defaultTool());
  const on = magicOn(), once = magicOnce; magicOnce = null;
  if (!on.length) { toast('Turn on at least one Magic box action first.'); openMagicPop(); return; }
  let g = gather(s, rect);
  const strokes0 = g.strokes.filter((x) => x.k !== 'hl');
  const hasInk = g.strokes.some((x) => x.k !== 'hl');
  if (!g.text && !hasInk && !g.objs.length) return toast('There’s nothing inside the box. Drag it around some text, pictures or drawings.');
  const ai = !!AI.ok;
  const label = h('span', { style: { pointerEvents: 'auto', cursor: 'pointer', transform: s.board ? 'scale(' + (1 / view.zoom) + ')' : '', transformOrigin: '0 100%' }, title: 'Stop', onclick: () => magicCtl && magicCtl.abort() }, svg('magic'), h('b', null, 'Magic box…'), ' (click to stop)');
  const busy = h('div', { class: 'magic-busy', style: { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' } }, label);
  s.L.others.append(busy);
  const step = (t) => { label.querySelector('b').textContent = t; };
  magicCtl = new AbortController();
  const signal = magicCtl.signal;
  const done = [], made = [], skipped = [];
  pushUndo(true); undoHold = true;
  try {
    if (on.includes('tDraw')) {
      const ids = new Set(g.strokes.map((x) => x.id));
      const n = tidyDrawings((x) => ids.has(x.id));
      if (n) { done.push(n + ' drawing' + (n === 1 ? '' : 's') + ' tidied'); view.renderAll(); g = gather(s, rect); }
    }
    if (on.includes('mHand') && hasInk) {
      if (!ai) skipped.push('Handwriting → text');
      else { step('Reading handwriting…'); const n = await handwritingToText(g.strokes.filter((x) => x.k !== 'hl'), { quiet: true, signal }); if (n) { done.push('handwriting typed'); g = gather(s, rect); } }
    }
    const inPlaceTrans = on.includes('mTrans') && magic.place === 'replace';
    const corr = on.includes('mCorr'), tidyT = on.includes('tText') || on.includes('tLayout');
    if (tidyT || inPlaceTrans || corr) {
      if (!ai) skipped.push(tidyT ? 'Tidy text' : inPlaceTrans ? 'Auto-translate' : 'Auto-correct');
      else {
        step(inPlaceTrans ? 'Translating…' : !tidyT ? 'Correcting…' : 'Tidying the text…');
        const rules = [tidyT ? tidyRules(on.includes('tLayout')) + '\n' + (inPlaceTrans ? '' : KEEP_LANG) : '', corr ? corrRule(magic.corrLang || 'auto') : '', inPlaceTrans ? translateRule(magic.lang) : ''].filter(Boolean).join('\n');
        let n = 0;
        if (g.blocks.length) {
          const flow = g.blocks[0].parentNode;
          const out = await aiRewriteHTML(g.blocks.map((b) => b.outerHTML).join(''), rules, signal);
          if (g.blocks.every((b) => b.isConnected)) {
            const tpl = document.createElement('template'); tpl.innerHTML = out;
            flow.insertBefore(tpl.content, g.blocks[0]); for (const b of g.blocks) b.remove();
            onFlowInput(flow); n++;
          }
        }
        const boxes = g.objs.filter((o) => /^(note|text|sticky|shape)$/.test(o.t) && htmlStrToText(o.html || '').trim());
        if (boxes.length) { const res = await aiRewriteBoxes(boxes, rules, signal); for (const b of boxes) if (res.has(b.id)) { b.html = res.get(b.id); changed(b); n++; } }
        if (n) { done.push(inPlaceTrans ? 'translated' : 'text tidied'); view.renderAll(); g = gather(s, rect); }
      }
    }
    const creators = on.filter((k) => ['mPic', 'mDiagram', 'mMap', 'mTable', 'mSum', 'mSticky', 'm3d', 'mExplain', 'once'].includes(k) || (k === 'mTrans' && !inPlaceTrans) || magicCustom(k));
    if (creators.length) {
      const text = g.text, ink = g.strokes.some((x) => x.k !== 'hl');
      const images = ai && AI.img ? await gatherImages(g, Math.min(AI.img.maxCount || 0, 4)) : [];
      const strokes = g.strokes.slice();
      if (magic.place === 'replace') removeGathered(g);
      for (const k of creators) {
        if (!ai && k !== 'mDiagram' && k !== 'm3d') { skipped.push(magicLabel(k)); continue; }
        step(magicLabel(k) + '…');
        const ids = await magicCreate(k, s, rect, text, images, ink, strokes, signal, strokes0, k === 'once' ? once : null);
        if (ids && ids.length) { made.push(...ids); done.push(magicLabel(k).toLowerCase()); }
        else if (k === 'm3d' && lib3d.items[0] && now() - lib3d.items[0].created < 20000) done.push('3D model saved in the 3D studio');
      }
    }
  } catch (e) { if (!e || e.code !== 'cancelled') toast(e && e.code === 'nodata' ? 'No numbers found in the box to make a diagram from.' : aiErrorText(e)); }
  finally { undoHold = false; busy.remove(); magicCtl = null; }
  if (!view) return;
  view.renderAll(); saveDoc(); markInk();
  if (made.length) selectOnly(s, made);
  if (on.includes('mFact')) runFactCheck({ surf: s, rect });
  if (done.length) toast('Magic box: ' + done.join(', ') + '.' + (skipped.length ? ' (' + skipped.join(', ') + ' needs AI.)' : ''), { label: 'Undo', fn: undoObjs });
  else if (skipped.length) toast(skipped.join(', ') + ' works ' + Platform.aiWhere + '.');
  else if (!on.includes('mFact')) toast('Nothing to change in the box.');
}
async function magicCreate(k, s, rect, text, images, hasInk, strokes, signal, strokes0, onceRule) {
  const lang = 'Write in the same language as the content.';
  const intro = 'You are the Magic box inside a student’s notebook app. The student drew a box around part of their notes.' + (hasInk ? ' Handwriting or drawings inside the box are attached as an image (the last image).' : '') + '\n\nCONTENT INSIDE THE BOX:\n' + (text || '(only handwriting or pictures, see the images)') + '\n\n';
  const opt = { signal, modelTier: 'default' };
  if (images.length) opt.images = images;
  const Z = newScale();
  const box = (html, w) => { w = Math.round(w * Z); const at = magicPlace(s, rect, w, 200 * Z); return [addObj({ t: 'note', x: at.x, y: at.y, w, ah: true, h: Math.round(160 * Z), html: sanitize(html), sh: s.sheet, lay: 'front', sc: Z !== 1 ? Z : undefined }).id]; };
  if (k === 'mPic') {
    const st = strokes0 && strokes0.length ? strokes0 : strokes.filter((x) => x.k !== 'hl');
    if (!st.length || !AI.img) return [];
    const svgText = await sketchToSVG(await strokesToBlob(st, true), signal);
    const { w, h: hh } = svgSize(svgText);
    const src = await storeSVG(svgText);
    const W = Math.round(Math.min(view.kind === 'a4' ? 380 : 420, w, Math.max(180, rect.w))), H = Math.round(W * hh / w);
    const at = magicPlace(s, rect, W, H);
    return [addObj({ t: 'image', x: at.x, y: at.y, w: W, h: H, src, alt: 'Drawing', sh: s.sheet, lay: 'front' }).id];
  }
  if (k === 'mDiagram') {
    let d = null;
    if (AI.ok) d = await AI.json(intro + 'Turn the numbers in the content into chart data. If something is described as “the rest”, calculate it. Use short category names. ' + lang + '\nReply with only JSON: {"title":"short title","cats":["…"],"series":[{"name":"…","vals":[0]}],"unit":"% or unit or empty","prefix":"currency or empty"}. If there are no numbers at all, reply {"cats":[]}.', { ...opt, task: 'magic.chart' });
    if (!d || !Array.isArray(d.cats) || !d.cats.length || !Array.isArray(d.series)) d = localChartParse(text);
    if (!d) throw { code: 'nodata' };
    return [makeChart(s, rect, d).id];
  }
  if (k === 'mMap') {
    const d = await AI.json(intro + 'Make a mind map of this content: one central topic, ' + (magic.mmDetail === 'deep' ? '4–7 branches, each with 2–5 children, and children may have 1–3 children of their own' : '3–6 branches, each with 1–4 short children') + '. Labels at most 6 words. ' + lang + '\nReply with only JSON: {"center":"…","branches":[{"label":"…","children":[{"label":"…","children":["…"]}]}]}', { ...opt, task: 'magic.mindmap' });
    if (!d || !d.center) throw { code: 'invalid_json' };
    const o = insertMindMap(mmFromOutline(d.center, d.branches), { lay: magic.mmLay, sty: +magic.mmSty || 0, at: magicPlace(s, rect, 400, 260) });
    return o ? [o.id] : [];
  }
  if (k === 'mTable') {
    const d = await AI.json(intro + 'Organise this content as a table with clear columns. ' + lang + '\nReply with only JSON: {"headers":["…"],"rows":[["…"]]}', { ...opt, task: 'magic.table' });
    if (!d || !Array.isArray(d.rows)) throw { code: 'invalid_json' };
    const head = magic.tableHead && Array.isArray(d.headers) && d.headers.length ? '<thead><tr>' + d.headers.map((x) => '<th>' + esc(x) + '</th>').join('') + '</tr></thead>' : '';
    return box('<table>' + head + '<tbody>' + d.rows.map((r) => '<tr>' + (Array.isArray(r) ? r : [r]).map((c) => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>', 560);
  }
  if (k === 'mSticky') {
    const d = await AI.json(intro + 'Split this content into at most ' + magic.stickyMax + ' key ideas for sticky notes, each at most 12 words. ' + lang + '\nReply with only JSON: {"notes":["…"]}', { ...opt, task: 'magic.sticky' });
    const notes = (d && Array.isArray(d.notes) ? d.notes : []).slice(0, +magic.stickyMax || 6);
    if (!notes.length) throw { code: 'invalid_json' };
    const G = 196 * Z, at = magicPlace(s, rect, 3 * G, Math.ceil(notes.length / 3) * G);
    return notes.map((t, i) => addObj({ t: 'sticky', sc: Z !== 1 ? Z : undefined, x: Math.round(at.x + (i % 3) * G), y: Math.round(at.y + Math.floor(i / 3) * G), w: Math.round(180 * Z), h: Math.round(180 * Z), col: magic.stickyCol || 'yellow', html: '<p>' + esc(t) + '</p>', sh: s.sheet, lay: 'front' }).id);
  }
  if (k === 'm3d') {
    const m = await gen3D({ content: { text, images, hasInk, strokes } });
    if (!m) return [];
    const o = await place3D(m, magicPlace(s, rect, 320, 240));
    return o ? [o.id] : [];
  }
  const own = k === 'once' ? onceRule : (magicCustom(k) || {}).rule;
  if (own) {   // your own button (or a rule for this once)
    const { text: out } = await AI.text(intro + 'Do this with the content, exactly as the student asked:\n' + own + '\n\nIf it fits, use Markdown: a short heading line beginning with “## ”, lists with “- ”, **bold** key terms, tables with | columns |. ' + lang + ' Reply with only the result, no code fences and no remarks about the task.', { ...opt, task: 'magic.custom' });
    const t = stripFence(out || '').trim(); if (!t) throw { code: 'invalid_json' };
    return box(md(t), 400);
  }
  const ask = k === 'mSum'
    ? 'Summarise this content' + (magic.sumLen === 'short' ? ' very briefly (3–5 points)' : magic.sumLen === 'long' ? ' in detail' : '') + (magic.sumForm === 'bullets' ? ' as bullet points (“- ” at the start of each line), with **bold** key terms.' : ' as one clear paragraph.') + ' Start with a short heading line beginning with “## ”. ' + lang
    : k === 'mExplain'
      ? 'Explain this content ' + (magic.level === 'simple' ? 'very simply, as if to a 12-year-old, with an everyday example.' : magic.level === 'expert' ? 'in depth, with the important background and details.' : 'clearly, for a student.') + ' Use short paragraphs or bullet points and **bold** key terms. Start with a heading line beginning with “## ”. ' + lang
      : 'Translate this content into ' + magic.lang + '. Keep headings, lists and line breaks. Reply with only the translation.';
  const { text: out } = await AI.text(intro + ask + ' Reply in Markdown, no code fences.', { ...opt, task: 'magic.text' });
  return box(md(stripFence(out)), k === 'mTrans' ? Math.max(320, Math.min(560, rect.w)) : 380);
}

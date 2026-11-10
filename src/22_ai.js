
/* ================= AI helpers ================= */
function aiErrorText(e) {
  const cp = Platform.host !== 'claude' ? AIConn.current() : null, local = !!(cp && cp.P.local);
  switch (e && e.code) {
    case 'not_granted': return 'Claude isn’t allowed for this app yet. Allow it when the app asks.';
    case 'sampling_disabled': return 'Claude isn’t available for this account.';
    case 'rate_limited': return 'Too many requests right now. Wait a moment, then try again.';
    case 'session_expired': return 'Sign in to Claude again, then try again.';
    case 'images_unavailable': return 'Pictures can’t be sent from here. Untick Pictures and try again.';
    case 'image_rejected': return 'One picture couldn’t be read. Try a JPG or PNG.';
    case 'refused': return AI.name + ' declined this request. Try asking differently.';
    case 'prompt_too_large': return 'That’s too much text at once. Use a smaller part, or fewer sources.' + (local ? ' Local models often have a small context length; you can raise it in ' + AI.name + '’s settings.' : '');
    case 'invalid_json': return 'The answer came back in the wrong shape. Try again' + (Platform.host === 'claude' ? '.' : ', or choose a stronger model in AI settings.');
    case 'empty_completion': return AI.name + ' didn’t answer. Try again with a shorter request.';
    /* the AI connector (desktop app and browser) */
    case 'no_ai': return 'No AI is connected yet. Choose one in AI settings (bottom left).';
    case 'no_key': return 'Add your API key in AI settings first.';
    case 'no_model': return 'Choose a model in AI settings' + (e.message ? ' (the server said: ' + e.message + ')' : '') + '.';
    case 'bad_key': return AI.name + ' didn’t accept the API key. Check it in AI settings.';
    case 'quota': return 'Your ' + AI.name + ' account has no credit or free quota left right now.';
    case 'server': return AI.name + ' is busy or has a problem right now. Try again in a minute.';
    case 'unreachable': return local
      ? 'Couldn’t reach ' + AI.name + ' on this computer. Check that it’s running' + (Platform.host === 'browser' ? ' and allows Cortex Scribe (see AI settings).' : '.')
      : 'Couldn’t reach ' + AI.name + '. Check your internet connection' + (Platform.host === 'browser' ? ', or use the desktop app if this service blocks browsers.' : '.');
    case 'bad_request': return AI.name + ' couldn’t handle this request' + (e.message ? ': ' + e.message : '.');
    default: return 'Couldn’t reach ' + AI.name + '. Try again.';
  }
}
function aiReady() {
  if (AI.ok) return true;
  toast('AI features work ' + Platform.aiWhere + '.', Platform.host !== 'claude' ? { label: 'AI settings', fn: aiSettingsModal } : null);
  return false;
}
function objText(o) {
  switch (o.t) {
    case 'note': case 'text': case 'sticky': case 'shape': case 'paper': { const t = htmlStrToText(o.html || ''); return t ? '[' + (OBJ[o.t] ? OBJ[o.t].label : 'Box') + '] ' + t : ''; }
    case 'chart': { const d = chartData(o); const C = o.chart || {}; return '[Chart' + (C.title ? ': ' + C.title : '') + '] ' + d.series.map((s) => s.name + ': ' + d.cats.map((c, i) => c + ' = ' + s.vals[i] + (C.unit || '')).join(', ')).join('; '); }
    case 'mm': return '[Mind map]\n' + mmToText(o.tree || { text: '' });
    case 'card': { const n = tree.nodes[o.target]; return '[Link to page: ' + (n ? n.name : '?') + ']'; }
    case 'frame': return o.title ? '[Frame: ' + o.title + ']' : '';
    case 'image': return '[Picture: ' + (o.alt || 'no description') + ']';
    case 'm3d': return '[3D model: ' + (o.name || '') + ']';
    default: return '';
  }
}
function docText(d) {
  let out = '';
  const objs = Object.values(d.objs || {}).filter((o) => o && !o.del && o.t !== 'conn');
  const bySheet = (i) => objs.filter((o) => d.kind !== 'a4' || (o.sh || 0) === i).sort((a, b) => a.y - b.y || a.x - b.x);
  if (d.kind === 'board') {
    out = bySheet(0).map(objText).filter(Boolean).join('\n');
  } else {
    d.flows.forEach((f, i) => {
      if (d.kind === 'a4' && d.flows.length > 1) out += '\n--- Page ' + (i + 1) + ' ---\n';
      out += htmlStrToText(f) + '\n';
      if (d.kind === 'a4' || i === 0) { const t = bySheet(i).map(objText).filter(Boolean).join('\n'); if (t) out += t + '\n'; }
    });
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
async function imgBlobFromSrc(src, key) {
  if (key && blobCache.has(key)) return blobCache.get(key);
  const im = await loadImg(src);
  const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height);
  const b = await new Promise((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('encode'))), 'image/jpeg', 0.85));
  if (key) blobCache.set(key, b);
  return b;
}
async function docImages(d, max) {
  const out = [];
  if (!max) return out;
  for (const o of Object.values(d.objs || {})) {
    if (out.length >= max) break;
    if (!o || o.del || (o.t !== 'image' && o.t !== 'm3d')) continue;
    const b = await imgBlobFromSrc(resolveSrc(o.src), o.id).catch(() => null); if (b) out.push(b);
  }
  for (const f of d.flows || []) {
    if (out.length >= max) break;
    for (const img of parse(f).body.querySelectorAll('img')) { if (out.length >= max) break; const b = await imgBlobFromSrc(img.getAttribute('src'), img.getAttribute('data-anchor')).catch(() => null); if (b) out.push(b); }
  }
  return out;
}
function scopeIds(scope) {
  if (!cur) return [];
  const node = tree.nodes[cur.id];
  if (scope === 'page') return [cur.id];
  const root = scope === 'folder' ? tree.nodes[node.parent] : notebookOf(cur.id);
  if (!root || root.type !== 'folder') return [cur.id];
  return descendants(root.id).filter((n) => n.type === 'note').map((n) => n.id);
}
const scopeLabel = (s) => (s === 'page' ? 'This page' : s === 'folder' ? 'This folder' : 'Whole notebook');
async function buildContext(scope, withImages) {
  const ids = scopeIds(scope);
  let maxImgs = withImages && AI.img ? Math.min(AI.img.maxCount || 0, 6) : 0;
  let text = '', chars = 0; const images = [];
  for (const id of ids) {
    const node = tree.nodes[id];
    let d = null;
    try { d = cur && id === cur.id && doc ? doc : (await loadDocData(id)).main; } catch {}
    if (!d) continue;
    const t = docText(d);
    if (maxImgs > images.length) { const im = await docImages(d, maxImgs - images.length); images.push(...im); }
    chars += t.length;
    const path = ancestors(id).map((a) => a.name).join(' / ');
    text += '\n\n### Page: ' + node.name + (path ? ' (in ' + path + ')' : '') + '\n' + (t || '(empty page)');
    if (text.length > 110000) { text = text.slice(0, 110000) + '\n[…the rest of the notes was cut because it is long]'; break; }
  }
  return { text: text.trim(), images, pages: ids.length, hasContent: chars > 0 || images.length > 0 };
}

/* keep pictures and links intact while the AI rewrites text */
function tokenize(html) {
  const d = parse(sanitize(html));
  const map = new Map(); let k = 0;
  d.body.querySelectorAll('img').forEach((img) => { const key = String(++k); map.set('IMG' + key, img.outerHTML); img.replaceWith(d.createTextNode('[[IMG:' + key + ']]')); });
  d.body.querySelectorAll('a.xlink, span.anchor, span.jtag').forEach((el) => {
    const key = String(++k);
    map.set('K' + key, { tag: el.tagName, attrs: [...el.attributes].map((a) => [a.name, a.value]) });
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    el.setAttribute('data-k', key);
  });
  return { html: d.body.innerHTML, map };
}
function restoreTokens(out, map) {
  const d = parse(out);
  d.body.querySelectorAll('[data-k]').forEach((el) => {
    const info = map.get('K' + el.getAttribute('data-k'));
    if (!info) { unwrap(el); return; }
    let t = el;
    if (el.tagName !== info.tag) t = renameEl(el, info.tag);
    for (const a of [...t.attributes]) t.removeAttribute(a.name);
    for (const [n, v] of info.attrs) t.setAttribute(n, v);
  });
  const used = new Set();
  const w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
  const texts = []; while (w.nextNode()) texts.push(w.currentNode);
  for (const t of texts) {
    if (!/\[\[IMG:\d+\]\]/.test(t.data)) continue;
    const frag = d.createDocumentFragment();
    for (const part of t.data.split(/(\[\[IMG:\d+\]\])/)) {
      const m = part.match(/^\[\[IMG:(\d+)\]\]$/);
      if (m) { if (map.has('IMG' + m[1]) && !used.has(m[1])) { used.add(m[1]); const tp = d.createElement('template'); tp.innerHTML = map.get('IMG' + m[1]); frag.append(tp.content.firstChild); } }
      else if (part) frag.append(d.createTextNode(part));
    }
    t.replaceWith(frag);
  }
  for (const [key, v] of map) {
    if (!key.startsWith('IMG') || used.has(key.slice(3))) continue;
    const p = d.createElement('p'); const tp = d.createElement('template'); tp.innerHTML = v; p.append(tp.content.firstChild); d.body.append(p);
  }
  return sanitize(d.body.innerHTML);
}
const stripFence = (t) => String(t || '').trim().replace(/^```(?:html|json)?\s*/i, '').replace(/```\s*$/, '');
function tidyRules(layout) {
  return layout
    ? 'Fix spelling, grammar and punctuation mistakes. Then improve the layout so it is easy to study from: add short headings (<h2>, <h3>) where the topic changes, turn enumerations into bullet lists, put the most important terms in <b>, and split long paragraphs. Keep every fact and keep the order. Do not add new information.'
    : 'Fix spelling, grammar and punctuation mistakes only. Keep the wording, the order and the formatting otherwise exactly as they are. Do not add or remove content.';
}
const KEEP_LANG = 'Keep the language the text is written in; do not translate. Keep regional spelling conventions (for example Swiss “ss” instead of “ß”).';
async function aiRewriteHTML(html, rules, signal, tier) {
  const { html: tok, map } = tokenize(html);
  const prompt = 'You are editing part of a student’s study notes.\n' + rules + '\n' + KEEP_LANG + '\n\nOutput rules:\n- Reply with ONLY the HTML. No explanation, no code fences.\n- Allowed tags: p, h2, h3, b, i, u, s, mark, ul, ol, li, blockquote, br, hr, table, thead, tbody, tr, th, td, span.\n- Text like [[IMG:3]] stands for a picture. Keep every one exactly as written, in the same place, each inside its own <p>.\n- Elements with a data-k attribute are links or link targets. Keep each one with the same tag and the same data-k value; you may change the words inside them.\n- Keep style attributes on spans when you keep their text.\n\nHTML:\n' + tok;
  const { text } = await AI.text(prompt, { task: 'tidy.page', modelTier: tier || 'default', signal });
  return restoreTokens(stripFence(text), map);
}
async function aiRewriteBoxes(objs, rules, signal) {
  const items = objs.map((o) => ({ id: o.id, html: sanitize(o.html || '') }));
  const prompt = 'You are editing the text inside boxes on a student’s study page.\n' + rules + '\n' + KEEP_LANG + '\nEach item is the HTML of one box. Return every item with the same id. Allowed tags: p, h2, h3, b, i, u, s, ul, ol, li, br, span. Keep it short enough to fit the same box.\n\nReply with only JSON: {"items":[{"id":"…","html":"…"}]}\n\nITEMS:\n' + JSON.stringify({ items });
  const data = await AI.json(prompt, { task: 'tidy.boxes', signal, modelTier: 'default' });
  const out = new Map();
  for (const it of (data && data.items) || []) if (it && it.id && typeof it.html === 'string') out.set(it.id, sanitize(it.html));
  return out;
}

/* ================= tidy up (with options) ================= */
function tidyModal() {
  if (!cur || !doc || cur.ro) return;
  const opts = { trans: false, ...prefs.get('tidyOpts', { spell: true, layout: true, shapes: false, hand: false, boxes: false }) };
  const mk = (k, title, sub) => { const c = h('input', { type: 'checkbox', checked: opts[k] ? true : null, 'data-k': k }); return h('label', null, c, h('span', null, title, h('small', null, sub))); };
  const auto = h('input', { type: 'checkbox', checked: inkState.auto ? true : null });
  const body = h('div', { class: 'checks' },
    h('div', { class: 'check-cog' }, mk('spell', 'Auto-correct', 'Fixes spelling, grammar and punctuation on the page and in boxes. ⚙ picks the language.'), langCog(() => magic.corrLang || 'auto', (v) => { magic.corrLang = v; saveMagic(); }, { title: 'Correct in', auto: true })),
    h('div', { class: 'check-cog' }, mk('trans', 'Auto-translate', 'Translates the page text and the boxes. ⚙ picks the language.'), langCog(() => magic.lang || 'English', (v) => { magic.lang = v; saveMagic(); }, { title: 'Translate into' })),
    mk('layout', 'Layout', 'Adds headings, turns lists into bullet points, makes key terms bold.'),
    mk('shapes', 'Drawings → clean shapes', 'Straightens lines and turns rough circles, boxes and triangles into neat shapes.'),
    mk('hand', 'Handwriting → typed text', 'The AI reads what you wrote with the pen and types it into text boxes.'),
    mk('boxes', 'Line up boxes and pictures', 'Moves boxes so they don’t overlap and snaps them to a grid.'));
  modal({ title: 'Tidy up', body: [h('p', { class: 'hint' }, 'Choose what to tidy on this page. You can undo it afterwards.'), body, h('label', { class: 'opt' }, auto, 'Tidy my drawings automatically while I draw')],
    actions: [{ label: 'Cancel' }, { label: 'Tidy up', kind: 'primary', fn: () => {
      const o = {}; $$('input[data-k]', body).forEach((c) => { o[c.dataset.k] = c.checked; });
      prefs.set('tidyOpts', o);
      inkState.auto = auto.checked; prefs.set('autoTidy', auto.checked);
      if (rtab === 'draw') renderRibbon();
      if (!Object.values(o).some(Boolean)) return;
      runTidy(o);
    } }] });
}
let tidyCtl = null;
async function runTidy(o) {
  if (!cur || !doc || cur.ro) return;
  const needsAI = o.spell || o.layout || o.hand || o.trans;
  if (needsAI && !aiReady()) { if (!o.shapes && !o.boxes) return; o = { ...o, spell: false, layout: false, hand: false, trans: false }; }
  verBefore('Before Tidy up');
  pushUndo(true);
  const report = [];
  if (o.shapes) { const n = tidyDrawings(); if (n) report.push(n + ' drawing' + (n === 1 ? '' : 's') + ' → shapes'); }
  if (o.boxes) { const n = lineUpBoxes(); if (n) report.push(n + ' box' + (n === 1 ? '' : 'es') + ' lined up'); }
  view.renderAll(); saveDoc(); markInk();
  if (o.spell || o.layout || o.hand || o.trans) {
    tidyCtl = new AbortController();
    const cRule = corrRule(magic.corrLang || 'auto'), tRule = translateRule(magic.lang || 'English');
    const pageRules = [o.layout ? tidyRules(true) : '', o.spell ? cRule : '', o.trans ? tRule : ''].filter(Boolean).join('\n');
    const boxRules = [o.spell ? cRule : '', o.trans ? tRule : ''].filter(Boolean).join('\n');
    const busyT = h('span', null, 'Tidying…');
    const m = modal({ title: 'Tidying up…', body: [h('div', { class: 'busy' }, h('span', { class: 'spinner' }), busyT)], actions: [{ label: 'Stop', fn: () => tidyCtl && tidyCtl.abort() }] });
    try {
      if (o.spell || o.layout || o.trans) {
        let pages = 0;
        for (let i = 0; i < doc.flows.length; i++) {
          const f = view.flowEl(i); if (!f || !f.textContent.trim()) continue;
          busyT.textContent = (o.trans ? 'Translating' : 'Tidying') + (doc.flows.length > 1 ? ' page ' + (i + 1) + ' of ' + doc.flows.length + '…' : ' the page text…');
          const before = f.innerHTML;
          const after = await aiRewriteHTML(before, pageRules, tidyCtl.signal, o.layout || o.trans ? 'default' : 'quick');
          if (!cur || !view || f.innerHTML !== before) continue;
          f.innerHTML = after || '<p><br></p>'; view.syncFlow(i); pages++;
        }
        if (view.kind === 'a4') for (let i = 0; i < doc.flows.length; i++) view.reflow(i);
        if (pages) report.push(pages > 1 ? pages + ' pages of text' : 'the page text');
        const boxes = objList((x) => /^(note|text|sticky|shape)$/.test(x.t) && htmlStrToText(x.html || '').trim());
        if (boxes.length && (o.spell || o.trans)) {
          busyT.textContent = 'Tidying ' + boxes.length + ' box' + (boxes.length === 1 ? '' : 'es') + '…';
          const res = await aiRewriteBoxes(boxes, boxRules, tidyCtl.signal);
          let n = 0; for (const b of boxes) if (res.has(b.id)) { b.html = res.get(b.id); changed(b); n++; }
          if (n) report.push(n + ' box' + (n === 1 ? '' : 'es'));
        }
      }
      if (o.hand) { busyT.textContent = 'Reading your handwriting…'; const n = await handwritingToText(null, { quiet: true, signal: tidyCtl.signal }); if (n) report.push(n + ' handwritten part' + (n === 1 ? '' : 's') + ' → text'); }
    } catch (e) { if (!e || e.code !== 'cancelled') toast(aiErrorText(e)); }
    finally { tidyCtl = null; m.close(); }
    if (!view) return;
    view.renderAll(true); saveDoc(); markInk();
  }
  toast(report.length ? 'Tidied: ' + report.join(', ') + '.' : 'Nothing needed tidying.', report.length ? { label: 'Undo', fn: undoObjs } : null);
}
function lineUpBoxes() {
  const items = objList((o) => o.t !== 'conn' && o.t !== 'frame').sort((a, b) => (a.sh || 0) - (b.sh || 0) || a.y - b.y || a.x - b.x);
  const placed = []; let n = 0;
  for (const o of items) {
    const ox = o.x, oy = o.y;
    o.x = Math.round(o.x / 8) * 8; o.y = Math.round(o.y / 8) * 8;
    let guard = 0, hit;
    do {
      hit = placed.find((p) => (p.sh || 0) === (o.sh || 0) && o.x < p.x + p.w + 12 && o.x + o.w + 12 > p.x && o.y < p.y + p.h + 12 && o.y + o.h + 12 > p.y);
      if (hit) o.y = Math.round((hit.y + hit.h + 16) / 8) * 8;
    } while (hit && guard++ < 50);
    placed.push(o);
    if (o.x !== ox || o.y !== oy) { changed(o); n++; }
  }
  return n;
}

/* ================= handwriting on the page → typed text ================= */
async function handwritingToText(strokes, opts = {}) {
  if (!cur || !doc || cur.ro) return 0;
  if (!AI.ok) { if (!opts.quiet) aiReady(); return 0; }
  if (!AI.img) { toast(AI.noPics); return 0; }
  strokes = (strokes || strokeList((s) => s.k !== 'hl')).filter((s) => s && !s.del);
  if (!strokes.length) { if (!opts.quiet) toast('There’s no handwriting here. Write with the pen first (Draw tab).'); return 0; }
  const bySheet = new Map();
  for (const s of strokes) { const k = s.sh || 0; if (!bySheet.has(k)) bySheet.set(k, []); bySheet.get(k).push(s); }
  const clusters = [];
  for (const [sh, list] of bySheet) for (const c of clusterStrokes(list, 46, 26)) clusters.push({ sh, strokes: c });
  const maxPer = Math.max(1, Math.min(AI.img.maxCount || 4, 8));
  let made = 0;
  if (!opts.quiet) toast('Reading your handwriting…');
  if (!opts.quiet) pushUndo();
  for (let i = 0; i < clusters.length; i += maxPer) {
    const batch = clusters.slice(i, i + maxPer);
    const images = await Promise.all(batch.map((c) => strokesToBlob(c.strokes)));
    const prompt = 'Each attached image shows handwriting from a student’s notes (dark strokes on white), in order. Transcribe each image exactly as written, keeping line breaks with \\n and the original language. If an image is a drawing or sketch rather than writing, return "" for it.\nReply with only JSON: {"texts": ["…", "…"]} with exactly ' + batch.length + ' entries in the same order.';
    let data;
    try { data = await AI.json(prompt, { task: 'ink.read', images, modelTier: 'default', signal: opts.signal }); }
    catch (e) { if (e && e.code === 'cancelled') throw e; if (!opts.quiet) toast(aiErrorText(e)); break; }
    const texts = (data && Array.isArray(data.texts)) ? data.texts : [];
    batch.forEach((c, j) => {
      const t = String(texts[j] || '').trim(); if (!t) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of c.strokes) { const b = strokeBox(s); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
      const lines = t.split('\n').length;
      const fs = clamp(Math.round((y1 - y0) / lines * 0.62), 14, 40);
      addObj({ t: 'text', x: Math.round(x0), y: Math.round(y0), w: Math.max(120, Math.round(x1 - x0) + 30), ah: true, h: 40, html: t.split('\n').map((l) => '<p><span style="font-size:' + fs + 'px">' + esc(l) + '</span></p>').join(''), sh: c.sh, lay: 'front' });
      if (magic.hwRemove !== false || opts.quiet) for (const s of c.strokes) doc.ink[s.id] = { id: s.id, del: true, u: now() };
      made++;
    });
  }
  if (view) { view.renderAll(); saveDoc('main'); markInk(); }
  if (!opts.quiet) toast(made ? 'Turned ' + made + ' handwritten part' + (made === 1 ? '' : 's') + ' into text.' : 'Couldn’t read any handwriting there.', made ? { label: 'Undo', fn: undoObjs } : null);
  return made;
}

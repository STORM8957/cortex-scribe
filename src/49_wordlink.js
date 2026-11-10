/* ================= Word link (the app side) =================
   An A4 page can be linked with a Word document. The bridge on this computer (npm run word, scripts/word-bridge.mjs)
   connects the page with the Cortex Scribe panel in Word (word-addin/); 48_wordsync.js merges the changes. Text,
   headings and lists stay the same on both sides while you write in either; Word tables are real tables here
   (table.wtable: the cells can be typed into, rows and tables come from Word); pictures, and tables with a picture
   inside, are locked boxes (p.wlock, never changed from here); everything else on the page (drawings, boxes, tags,
   recordings…) stays in Cortex Scribe and never changes the Word file.
   In the desktop app the link starts by itself (WordBridge.ensure → the word_link_start command).
   doc.word = { key, name, url, base, at } on the page and node.word = key in the list. base is the last state both
   sides agreed on, so what was changed on either side while the link was off is merged when it comes back.
   Home shows the Word link card (wordCardHtml); a linked page shows a chip at the top. Not inside Claude. */
const WL = { conn: null, state: 'off', words: [], apps: [], client: null, pageId: null, key: null, tries: 0, timer: 0, err: '', lastSync: 0, conflicts: 0 };
let pendingWordLink = null;
const wlWanted = () => WordBridge.available && (prefs.get('wordUsed', false) || !!(cur && doc && doc.word));
const wlLinkedNodes = () => Object.values(tree.nodes).filter((n) => live(n) && n.type === 'note' && n.word);

/* ---- connection ---- */
async function wlConnect(force) {
  if (!WordBridge.available || WL.conn || WL.starting) return;
  if (!force && !wlWanted()) return;
  if (WordBridge.needsCode && !prefs.get('wordCode', '')) { WL.state = 'code'; wlRefresh(); return; }
  clearTimeout(WL.timer);
  WL.state = 'connecting'; wlRefresh();
  if (Platform.desktop) {              // the desktop app starts the link by itself
    WL.starting = true;
    const r = await WordBridge.ensure();
    WL.starting = false; WL.bridge = r;
    if (r && !['running', 'started'].includes(r.state)) { WL.state = 'nobridge'; wlRefresh(); return; }
    if (WL.conn) return;
  }
  WL.conn = WordBridge.connect({
    open() {
      WL.tries = 0;
      WL.conn.send({ type: 'hello', role: 'app', code: prefs.get('wordCode', ''), key: WL.key, page: WL.key && cur && tree.nodes[cur.id] ? tree.nodes[cur.id].name : '' });
    },
    message: wlMessage,
    close(wasOpen) {
      WL.conn = null;
      if (WL.client) { WL.client.stop(); WL.client = null; }
      if (WL.state !== 'code') WL.state = 'nobridge';
      WL.words = []; wlRefresh();
      if (WL.state !== 'code' && wlWanted()) WL.timer = setTimeout(() => wlConnect(), Math.min(15000, 2000 * ++WL.tries));
    },
  });
}
function wlMessage(m) {
  if (m.type === 'welcome') { WL.state = 'on'; prefs.set('wordUsed', true); wlAttach(); wlRefresh(); }
  else if (m.type === 'status') { WL.words = Array.isArray(m.words) ? m.words : m.word && m.word.connected ? [m.word] : []; WL.apps = m.apps || []; wlTakeFont(); wlRefresh(); wlPendingCheck(); }
  else if (m.type === 'doc') { if (WL.client && m.key === WL.key) WL.client.receive(m); }
  else if (m.type === 'error' && m.why === 'code') { prefs.set('wordCode', ''); WL.state = 'code'; WL.err = 'That code didn’t match. Look at the Word link window again.'; wlRefresh(); }
}

/* ---- the open page ---- */
function wordLinkPageOpened() {
  if (pendingWordLink && cur && !cur.loading && doc && cur.id === pendingWordLink.id) {
    const w = pendingWordLink; pendingWordLink = null;
    doc.word = { key: w.key, name: w.name, url: w.url, base: null, at: now() };
    if (!doc.pcol) { doc.pcol = { bg: '#FFFFFF', line: '#E6E6EA', text: '#141416' }; if (view) view.rebuild(); }   // white paper like Word's page, so Word's colours look the same (Page colour changes it)
    saveDoc('main');
  }
  const key = cur && !cur.loading && doc && doc.word && view ? doc.word.key : null;
  const id = key ? cur.id : null;
  if (WL.pageId === id && WL.key === key && (WL.client || !WL.conn || WL.state !== 'on')) { wlChip(); return; }
  wlDetach();
  WL.pageId = id; WL.key = key;
  if (key) { if (!WL.conn) wlConnect(); else wlAttach(); }
  if (cur && !cur.loading && doc && view) wlApplyFont();
  wlChip();
}
function wlAttach() {
  if (!WL.conn || WL.state !== 'on' || !WL.key || WL.client || !cur || !doc || !doc.word || doc.word.key !== WL.key) return;
  const pageId = cur.id;
  wlUpgradeBase();
  WL.client = WordSync.makeClient({
    base: doc.word.base, waitForDoc: true,
    read: async () => (cur && cur.id === pageId && view ? wlPageModel() : WordSync.norm(doc && doc.word ? doc.word.base : [])),
    write: async (target) => { if (cur && cur.id === pageId && view) wlApply(target); },
    send: (m) => { if (WL.conn) WL.conn.send(Object.assign(m, { key: WL.key })); },
    onSynced: (i) => {
      if (!cur || cur.id !== pageId || !doc || !doc.word) return;
      doc.word.base = i.base; doc.word.at = now(); doc.word.fv = 1; saveDoc('main');
      WL.lastSync = now(); if (i.conflicts) { WL.conflicts += i.conflicts; toast('A paragraph was changed here and in Word at the same moment. The version typed here was kept.'); }
      wlChip();
    },
    onError: (e) => console.error('Word link', e),
  });
  WL.conn.send({ type: 'link', key: WL.key, page: (tree.nodes[pageId] || {}).name || '' });
}
function wlDetach() {
  if (WL.client) { WL.client.stop(); WL.client = null; if (WL.conn) WL.conn.send({ type: 'link', key: null }); }
  WL.pageId = null; WL.key = null;
}
function wordLinkChanged() { if (WL.client) WL.client.changed(300); }
setInterval(() => { if (WL.client) WL.client.changed(0); }, 1500);   // also catches changes that come without an input event (undo, pasting a block…)

/* ---- Word's font on the linked page: the text there uses the font and size most of the document uses, so lines and
   pages break about where Word breaks them (doc.word.font = { name, size in pt }) ---- */
function wlTakeFont() {
  if (!cur || !doc || !doc.word) return;
  const w = wlWordOpen(doc.word.key), f = w && w.font;
  if (f && f.name && f.size > 0 && !(doc.word.font && doc.word.font.name === f.name && doc.word.font.size === f.size)) { doc.word.font = { name: String(f.name).slice(0, 60), size: +f.size }; saveDoc('main'); }
  wlApplyFont();
}
function wlApplyFont() {
  if (!view || !doc) return;
  const f = doc.word && doc.word.font;
  for (const s of view.surfaces) {
    const fl = s && s.L.flow; if (!fl) continue;
    if (f && /^[\w\s.-]{1,60}$/.test(f.name) && f.size > 4 && f.size < 72) { fl.style.fontFamily = '"' + f.name + '", Calibri, Carlito, Arial, sans-serif'; fl.style.fontSize = (f.size * 96 / 72).toFixed(2) + 'px'; fl.classList.add('wfont'); }
    else if (fl.classList.contains('wfont')) { fl.style.fontFamily = ''; fl.style.fontSize = ''; fl.classList.remove('wfont'); }
  }
  if (view.kind === 'a4' && f) for (let i = 0; i < doc.flows.length; i++) if (view.flowEl(i)) view.reflow(i, 'deleteContentBackward');
}

/* ---- the page as paragraphs ---- */
/* the text of a paragraph as pieces { n, t, br?, pgf? } in order (a page number field in a header or footer is
   {PAGE} or {NUMPAGES}); lists inside a list item and pictures don't count */
function wlPieces(el) {
  const out = [];
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out.push({ n: c, t: c.data });
      else if (c.nodeType === 1) {
        if (c.tagName === 'BR') out.push({ n: c, t: ' ', br: true });
        else if (c.tagName === 'UL' || c.tagName === 'OL' || c.tagName === 'IMG') continue;
        else if (c.classList.contains('pgf')) out.push({ n: c, t: c.dataset.f === 'pages' ? '{NUMPAGES}' : '{PAGE}', pgf: true });
        else walk(c);
      }
    }
  };
  walk(el);
  while (out.length && out[out.length - 1].br) out.pop();   // a line break at the end only keeps an empty line open: not a space
  return out;
}
function wlText(el) { return WordSync.clean(wlPieces(el).map((p) => p.t).join('')); }

/* ---- formatting that goes to Word and comes back: bold, italic, underline, struck through, text colour and
   highlight (WordSync fmt, word by word), the alignment, the colours of table cells ---- */
let wlCx = null;
function wlHex(v) {       // any CSS colour → '#rrggbb' (null for none or see-through)
  v = String(v || '').trim();
  if (!v || /^(transparent|inherit|initial|unset|currentcolor)$/i.test(v) || /^var\(/i.test(v)) return null;
  if (!wlCx) wlCx = document.createElement('canvas').getContext('2d');
  wlCx.fillStyle = '#010203'; wlCx.fillStyle = v;
  const f = String(wlCx.fillStyle);
  if (f === '#010203' && v.toLowerCase() !== '#010203') return null;
  if (/^#[0-9a-f]{6}$/i.test(f)) return f.toLowerCase();
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(f);
  if (!m || (m[4] != null && +m[4] < 0.5)) return null;
  return '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('');
}
/* the usual text colour (black in Word, the page's ink here) is no colour at all */
function wlInkish(c) {
  if (['#000000', '#1e2740', '#e7eaf0', '#141416', '#ededf0'].includes(c)) return true;
  const pc = doc && doc.pcol && wlHex(doc.pcol.text);
  return !!pc && pc === c;
}
function wlFmtAt(node, stop) {
  let b = null, i = null, u = null, s = null, c = null, hl = null;
  for (let e = node.nodeType === 1 ? node : node.parentNode; e && e !== stop && e.nodeType === 1; e = e.parentNode) {
    const t = e.tagName, st = e.style;
    if (b == null) { if (t === 'B' || t === 'STRONG') b = true; else if (st && st.fontWeight) b = /^(bold|bolder|[6-9]00)$/.test(st.fontWeight); }
    if (i == null) { if (t === 'I' || t === 'EM') i = true; else if (st && st.fontStyle) i = st.fontStyle === 'italic'; }
    const td = st ? (st.textDecorationLine || st.textDecoration || '') : '';
    if (u == null && (t === 'U' || t === 'INS' || /underline/.test(td))) u = true;
    if (s == null && (t === 'S' || t === 'STRIKE' || t === 'DEL' || /line-through/.test(td))) s = true;
    if (c == null && st && st.color) c = wlHex(st.color) || '';
    if (hl == null) { if (st && st.backgroundColor) hl = wlHex(st.backgroundColor) || ''; else if (t === 'MARK') hl = '#ffff00'; }
  }
  const out = [];
  if (b) out.push('b'); if (i) out.push('i'); if (u) out.push('u'); if (s) out.push('s');
  if (c && !wlInkish(c)) out.push('c=' + c);
  if (hl) out.push('h=' + hl);
  return WordSync.fmt(out.join(';'));
}
/* the text of a paragraph and its formatting as runs over its words */
function wlRuns(el) {
  const ps = wlPieces(el), raw = ps.map((p) => p.t).join(''), t = WordSync.clean(raw);
  if (t.length !== raw.length) return { t, r: undefined };   // can't line the letters up: no formatting
  const fAt = [];
  for (const p of ps) { const f = p.br ? '' : wlFmtAt(p.n, el); for (let k = 0; k < p.t.length; k++) fAt.push(f); }
  const list = []; let pos = 0;
  for (const w of WordSync.words(t)) { const m = /\S/.exec(w); list.push(m ? fAt[pos + m.index] : ''); pos += w.length; }
  return { t, r: WordSync.runsOf(list) };
}
function wlAlign(el) { const a = (el.style && el.style.textAlign) || ''; return a === 'center' ? 'c' : a === 'right' || a === 'end' ? 'r' : a === 'justify' ? 'j' : undefined; }
function wlSetAlign(el, a) {
  const v = a === 'c' ? 'center' : a === 'r' ? 'right' : a === 'j' ? 'justify' : '';
  if ((el.style.textAlign || '') === v) return;
  el.style.textAlign = v;
  if (!el.getAttribute('style')) el.removeAttribute('style');
}
function wlFmtEl(f) {      // the elements for one fmt: <span style="colour, highlight"><b><i><u><s>
  let outer = null, inner = null;
  const add = (e) => { if (!outer) outer = e; else inner.append(e); inner = e; };
  const c = WordSync.fmtGet(f, 'c'), hl = WordSync.fmtGet(f, 'h');
  if (c || hl) { const sp = document.createElement('span'); if (c) sp.style.color = c; if (hl) sp.style.backgroundColor = hl; add(sp); }
  for (const [k, tag] of [['b', 'b'], ['i', 'i'], ['u', 'u'], ['s', 's']]) if (WordSync.fmtGet(f, k)) add(document.createElement(tag));
  return { outer, inner };
}
/* give a paragraph the formatting r (runs over its words): the old bold, colours… come off, the new go on; links,
   tags, font sizes and everything else in the paragraph stay */
function wlSetRuns(el, r) {
  const want = JSON.stringify(WordSync.norm([{ k: 'p', t: wlText(el), r }])[0].r || null);
  const cur0 = wlRuns(el);
  if (JSON.stringify(cur0.r || null) === want) return;
  const raw = wlPieces(el).map((p) => p.t).join('');
  if (WordSync.clean(raw).length !== raw.length) return;
  const strip = (n) => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType !== 1 || c.tagName === 'UL' || c.tagName === 'OL' || c.classList.contains('pgf')) continue;
      strip(c);
      if (/^(B|STRONG|I|EM|U|INS|S|STRIKE|DEL|MARK|FONT)$/.test(c.tagName)) { unwrap(c); continue; }
      if (c.tagName === 'SPAN') {
        for (const pr of ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line']) c.style.removeProperty(pr);
        if (!c.getAttribute('style')) c.removeAttribute('style');
        if (!c.attributes.length) unwrap(c);
      }
    }
  };
  strip(el); el.normalize();
  const t = cur0.t, ws = WordSync.words(t), list = WordSync.perWord(JSON.parse(want) || [], ws.length);
  const spans = []; let pos = 0;
  for (let k = 0; k < ws.length;) {
    const f = list[k]; let j = k, start = null, end = null, p2 = pos;
    while (j < ws.length && list[j] === f) { const w = ws[j], m = /\S/.exec(w); if (m) { if (start == null) start = p2 + m.index; end = p2 + w.replace(/\s+$/, '').length; } p2 += w.length; j++; }
    if (f && start != null) spans.push([start, end, f]);
    pos = p2; k = j;
  }
  const pieces = wlPieces(el);
  for (const [a, b, f] of spans.reverse()) {       // from the end, so the earlier pieces stay where they are
    let at = 0; const hit = [];
    for (const p of pieces) { const s0 = at, e0 = at + p.t.length; at = e0; if (p.br || e0 <= a || s0 >= b) continue; hit.push([p, Math.max(a, s0) - s0, Math.min(b, e0) - s0]); }
    for (const [p, x, y] of hit.reverse()) {
      let n = p.n;
      if (!p.pgf) { if (y < n.data.length) n.splitText(y); if (x > 0) n = n.splitText(x); }
      const w = wlFmtEl(f); if (!w.outer) continue;
      n.before(w.outer); w.inner.append(n);
    }
  }
  el.normalize();
}
const wlCellColor = (td) => (td.style && wlHex(td.style.backgroundColor)) || '';
function wlSetCellColor(td, c) { if (wlCellColor(td) === (c || '')) return; td.style.backgroundColor = c || ''; if (!td.getAttribute('style')) td.removeAttribute('style'); }

/* ---- the header, the footer and the page setup of a linked page (51_pagesetup.js) ---- */
function wlHFItems(k) {
  if (!doc || !doc[k]) return [];
  const box = document.createElement('div'); box.innerHTML = sanitize(doc[k]);
  const out = [];
  const add = (el) => {
    const { t, r } = wlRuns(el), ws = WordSync.words(t), list = WordSync.perWord(r, ws.length);
    const f0 = list.find((f, i) => /\S/.test(ws[i])) || '';     // one formatting per header line (as Word's panel reads it)
    out.push({ k, t, a: wlAlign(el), r: WordSync.runsOf(ws.map((w) => (/\S/.test(w) ? f0 : ''))) });
  };
  for (const el of box.children) {
    if (el.tagName === 'UL' || el.tagName === 'OL') { for (const li of el.querySelectorAll('li')) add(li); }
    else if (el.tagName !== 'TABLE' && el.tagName !== 'HR') add(el);
  }
  return WordSync.norm(out);
}
function wlHFHtml(items) {
  const box = document.createElement('div');
  for (const p of items) {
    const el = document.createElement('p');
    for (const x of p.t.split(/(\{PAGE\}|\{NUMPAGES\})/)) {
      if (!x) continue;
      if (x === '{PAGE}' || x === '{NUMPAGES}') el.append(h('span', { class: 'pgf', 'data-f': x === '{PAGE}' ? 'page' : 'pages', contenteditable: 'false' }, '#'));
      else el.append(document.createTextNode(x));
    }
    if (!el.firstChild) el.append(document.createElement('br'));
    wlSetRuns(el, p.r); wlSetAlign(el, p.a);
    box.append(el);
  }
  return sanitize(box.innerHTML);
}
/* Word's page (points) → the page setup of a doc (px) */
function wlSetupDoc(st) {
  const ps = st.ps, px = (v) => Math.round(v * 4 / 3 * 10) / 10, o = {};
  const a = Math.round(Math.min(ps.w, ps.h) * 4 / 3), b = Math.round(Math.max(ps.w, ps.h) * 4 / 3);
  const k = Object.keys(PAGE_SIZES).find((x) => Math.abs(PAGE_SIZES[x][0] - a) <= 3 && Math.abs(PAGE_SIZES[x][1] - b) <= 3);
  if (k) o.ps = k; else { o.ps = 'custom'; o.pwh = [a, b]; }
  if (ps.o === 'l') o.po = 'l';
  if (ps.m) o.pmg = ps.m.map(px);
  if (ps.hd != null && ps.fd != null) o.hfd = [px(ps.hd), px(ps.fd)];
  return o;
}
function wlSetupSame(st) {        // does the page look like Word's page st?
  const o = wlSetupDoc(st), base = o.ps === 'custom' ? o.pwh : PAGE_SIZES[o.ps], dims = o.po === 'l' ? [base[1], base[0]] : base;
  const near = (x, y) => x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 1);
  return !(doc.pt && doc.pt.some(Boolean)) && near(pageDims(0), dims) && near(pageMg(), o.pmg || PAGE_MARGINS.std) && near(hfDist(), o.hfd || HF_DIST);
}
/* the page setup item this page sends: Word's own as long as nothing was changed here (so no rounding goes back) */
function wlSetupItem() {
  if (!doc || !doc.word || !doc.word.setup || !view || view.kind !== 'a4') return null;
  if (wlSetupSame(doc.word.setup)) return doc.word.setup;
  const [w, hh] = pageDims(0), m = pageMg(), d = hfDist(), pt = (v) => Math.round(v * 0.75 * 10) / 10;
  WL.setupSent = now();
  return { k: 'setup', t: '', ps: { w: pt(w), h: pt(hh), o: w > hh ? 'l' : 'p', m: m.map(pt), hd: pt(d[0]), fd: pt(d[1]) } };
}
function wlTakeSetup(st) {
  if (wlSetupSame(st)) { doc.word.setup = st; return false; }
  const mine = doc.word.setup && !wlSetupSame(doc.word.setup);
  doc.word.setup = st;
  for (const k of ['ps', 'pwh', 'po', 'pt', 'pmg', 'hfd']) delete doc[k];
  Object.assign(doc, cleanPageSetup(wlSetupDoc(st)));
  if (mine && now() - (WL.setupSent || 0) < 20000) toast('Word kept its own page size and margins (this Word can’t change them from the panel). Change them in Word: Layout → Size, Orientation, Margins.');
  return true;
}

/* the paragraphs that go to Word, in order: [{ el, p }] (a paragraph that is only a picture stays here) */
function wlBlocks() {
  const out = [];
  const walkList = (list) => {
    for (const li of list.children) {
      if (li.tagName !== 'LI') continue;
      const { t, r } = wlRuns(li);
      out.push({ el: li, p: { k: list.tagName === 'OL' ? 'ol' : 'li', t, a: wlAlign(li), r } });
      for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') walkList(sub);
    }
  };
  for (const s of view.surfaces) {
    const f = s && s.L.flow; if (!f) continue;
    for (const el of f.children) {
      const t = el.tagName;
      if (t === 'P' && el.classList.contains('wlock')) out.push({ el, p: { k: 'p', t: el.dataset.wt || '', lock: el.dataset.wlock } });
      else if (t === 'TABLE' && el.classList.contains('wtable')) out.push({ el, p: { k: 'table', t: '', rows: [...el.rows].map((tr) => [...tr.cells].map((td) => wlText(td))), sh: [...el.rows].map((tr) => [...tr.cells].map(wlCellColor)) } });
      else if (t === 'P' || t === 'BLOCKQUOTE' || t === 'PRE' || /^H[1-4]$/.test(t)) {
        const { t: tx, r } = wlRuns(el);
        if (!tx.trim() && el.querySelector('img')) continue;
        out.push({ el, p: { k: t === 'H1' ? 'h1' : t === 'H2' ? 'h2' : (t === 'H3' || t === 'H4') ? 'h3' : 'p', t: tx, a: wlAlign(el), r } });
      } else if (t === 'UL' || t === 'OL') walkList(el);
    }
  }
  return out;
}
/* a page linked before formatting crossed (no doc.word.fv) has an agreed state without formatting: the page's own
   formatting goes into it for the paragraphs that are still the same, so it doesn't count as a change here and Word's
   formatting, colours, header and page are taken for them (paragraphs changed here meanwhile keep this page's) */
function wlUpgradeBase() {
  if (!doc || !doc.word || doc.word.fv || !Array.isArray(doc.word.base) || !view) return;
  const pool = new Map(), keyOf = (p) => JSON.stringify([p.k, p.t, p.lock || '']);
  for (const p of wlPageModel()) { const k = keyOf(p); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(p); }
  doc.word.base = WordSync.norm(doc.word.base).map((b) => {
    const m = (pool.get(keyOf(b)) || []).shift(); if (!m) return b;
    const o = { ...b };
    if (m.r) o.r = m.r; if (m.a) o.a = m.a;
    if (m.sh && b.k === 'table' && JSON.stringify(b.rows) === JSON.stringify(m.rows)) o.sh = m.sh;
    return o;
  });
}
/* the whole linked page as Word sees it: page setup, header, text, footer */
function wlPageModel() {
  const st = wlSetupItem();
  return WordSync.norm([...(st ? [st] : []), ...wlHFItems('hd'), ...wlBlocks().map((b) => b.p), ...wlHFItems('ft')]);
}

/* change the page to target, touching only the paragraphs that differ (formatting elsewhere stays) */
function wlApply(target) {
  target = WordSync.norm(target);
  let setupChanged = false;
  const ts = target.find((p) => p.k === 'setup');
  if (ts && doc.word && view.kind === 'a4') { const mine = wlSetupItem(); if (!mine || WordSync.key(mine) !== WordSync.key(ts)) setupChanged = wlTakeSetup(ts); }
  for (const k of ['hd', 'ft']) {
    const want = target.filter((p) => p.k === k);
    if (WordSync.same(want, wlHFItems(k))) continue;
    if (hfEditing && hfEditing.part === k) hfStop();
    const html = want.length ? wlHFHtml(want) : '';
    if (hfHas(html)) doc[k] = html; else delete doc[k];
    setupChanged = true;
  }
  if (setupChanged && view.kind === 'a4') pageSetupChanged();
  target = target.filter((p) => p.k !== 'setup' && p.k !== 'hd' && p.k !== 'ft');
  const blocks = wlBlocks(), cur0 = WordSync.norm(blocks.map((b) => b.p));
  const flows = view.surfaces.map((s) => s && s.L.flow).filter(Boolean);
  const touched = new Set();
  const flowOf = (el) => { const f = el && el.closest('.flow'); if (f) touched.add(+f.dataset.flow || 0); return f; };
  for (const hk of WordSync.hunks(cur0, target)) {
    const A = blocks.slice(hk.a0, hk.a1), T = target.slice(hk.b0, hk.b1);
    const cls = (p) => (p.lock ? 'lock' : p.k === 'table' ? 'table' : 'text');
    const queue = { text: A.filter((b) => cls(b.p) === 'text'), table: A.filter((b) => cls(b.p) === 'table'), lock: [] }, used = new Set();
    let prev = hk.a0 > 0 ? blocks[hk.a0 - 1].el : null;
    for (const p of T) {
      const b = queue[cls(p)].shift();
      if (b) {                                       // change an existing paragraph or table in place
        used.add(b); flowOf(b.el);
        if (p.k === 'table' && WordSync.shape(b.p) === WordSync.shape(p)) {
          const cells = [...b.el.rows].map((tr) => [...tr.cells]);
          p.rows.forEach((r, ri) => r.forEach((c, ci) => { if (b.p.rows[ri][ci] !== c) wlSetText(cells[ri][ci], c); wlSetCellColor(cells[ri][ci], (p.sh && p.sh[ri] && p.sh[ri][ci]) || ''); }));
          prev = b.el;
        } else if (b.p.k === p.k && p.k !== 'table') { wlSetText(b.el, p.t); if (!p.lock) { wlSetRuns(b.el, p.r); wlSetAlign(b.el, p.a); } prev = b.el; }
        else { const el = wlInsertAfter(b.el, p, flows); wlRemove(b.el); prev = el; }
      } else prev = wlInsertAfter(prev, p, flows);
      flowOf(prev);
    }
    for (const b of A) if (!used.has(b)) { flowOf(b.el); wlRemove(b.el); }
  }
  for (const f of flows) if (!f.firstElementChild) f.innerHTML = '<p><br></p>';
  const idx = [...touched].sort((a, b) => a - b);
  for (const i of idx) view.syncFlow(i);
  if (view.kind === 'a4') { for (const i of idx) if (view.flowEl(i)) view.reflow(i, 'deleteContentBackward'); }
  else if (view.kind === 'endless') view.layoutEndless();
  doc.mu = now(); saveDoc('main'); scheduleOutline(); updateGhostCaret();
}
function wlMakeEl(p) {
  if (p.k === 'table') {
    const tb = h('tbody');
    p.rows.forEach((r, ri) => {
      const tr = h('tr');
      r.forEach((c, ci) => { const td = h('td', { contenteditable: 'true' }); if (c) td.textContent = c; else td.append(document.createElement('br')); const col = p.sh && p.sh[ri] && p.sh[ri][ci]; if (col) td.style.backgroundColor = col; tr.append(td); });
      tb.append(tr);
    });
    return h('table', { class: 'wtable', contenteditable: 'false' }, tb);
  }
  if (p.lock) {
    const el = h('p', { class: 'wlock', 'data-wlock': p.lock, 'data-wt': p.t, contenteditable: 'false' });
    el.textContent = p.lock === 'picture' ? 'Picture in Word' + (p.t.trim() ? ': ' + p.t : '') : p.lock === 'table' ? 'Table in Word: ' + (p.t || '(empty)') : 'In Word: ' + p.t;
    return el;
  }
  const el = document.createElement(p.k === 'li' || p.k === 'ol' ? 'li' : p.k === 'p' ? 'p' : p.k);
  if (p.t) el.textContent = p.t; else el.append(document.createElement('br'));
  if (p.r) wlSetRuns(el, p.r);
  if (p.a) wlSetAlign(el, p.a);
  return el;
}
function wlSplitListAfter(li) {   // the list items after li go into a new list right after li's list
  const list = li.parentNode, rest = [];
  for (let n = li.nextSibling; n; n = n.nextSibling) rest.push(n);
  if (!rest.length) return list;
  const nl = document.createElement(list.tagName); if (list.className) nl.className = list.className;
  nl.append(...rest); list.after(nl);
  return list;
}
function wlInsertAfter(prev, p, flows) {
  const el = wlMakeEl(p), isLi = el.tagName === 'LI', listTag = p.k === 'ol' ? 'OL' : 'UL';
  if (!prev) {
    const f = flows[0];
    if (isLi) { const fl = f.firstElementChild; if (fl && fl.tagName === listTag) fl.prepend(el); else { const l = document.createElement(listTag); l.append(el); f.prepend(l); } }
    else f.prepend(el);
    return el;
  }
  if (prev.tagName === 'LI') {
    if (isLi && prev.parentNode.tagName === listTag) { prev.after(el); return el; }
    const list = wlSplitListAfter(prev);
    if (isLi) { const l = document.createElement(listTag); l.append(el); list.after(l); }
    else list.after(el);
    return el;
  }
  if (isLi) {
    const nx = prev.nextElementSibling;
    if (nx && nx.tagName === listTag) nx.prepend(el);
    else { const l = document.createElement(listTag); l.append(el); prev.after(l); }
    return el;
  }
  prev.after(el);
  return el;
}
function wlRemove(el) {
  const list = el.tagName === 'LI' ? el.parentNode : null;
  el.remove();
  if (list && !list.querySelector('li')) list.remove();
}
/* the changes from text a to text b, word by word: [{ a, b, ins }] = a[a..b) becomes ins (positions in a, in order) */
function wlTextOps(a, b) {
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0; while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const A = a.slice(p, a.length - q), B = b.slice(p, b.length - q);
  const ta = A.match(/\s+|[^\s]+/g) || [], tb = B.match(/\s+|[^\s]+/g) || [];
  if (!ta.length || !tb.length || ta.length * tb.length > 1e6) return a === b ? [] : [{ a: p, b: a.length - q, ins: B }];
  const n = ta.length, m = tb.length, dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = ta[i] === tb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; let i = 0, j = 0, oa = p, start = null;
  const offs = []; { let o = p; for (const t of ta) { offs.push(o); o += t.length; } offs.push(o); }
  let insBuf = '', delFrom = null;
  const flush = (to) => { if (delFrom !== null || insBuf) ops.push({ a: delFrom !== null ? delFrom : to, b: to, ins: insBuf }); delFrom = null; insBuf = ''; };
  while (i < n || j < m) {
    if (i < n && j < m && ta[i] === tb[j]) { flush(offs[i]); i++; j++; }
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { insBuf += tb[j]; j++; }
    else { if (delFrom === null) delFrom = offs[i]; i++; }
  }
  flush(offs[n]);
  return ops.filter((o) => o.a !== o.b || o.ins);
}
/* change the text of a paragraph by replacing only the words that differ, so bold, colours and tags elsewhere stay */
function wlSetText(el, text) {
  const old = wlText(el);
  if (old === text) return;
  const segs = []; let pos = 0;
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { segs.push({ n: c, a: pos, b: pos + c.data.length }); pos += c.data.length; }
      else if (c.nodeType === 1) {
        if (c.tagName === 'BR') { segs.push({ n: c, a: pos, b: pos + 1, br: true }); pos += 1; }
        else if (c.tagName === 'UL' || c.tagName === 'OL' || c.tagName === 'IMG') continue;
        else walk(c);
      }
    }
  };
  walk(el);
  const raw = segs.map((s) => (s.br ? ' ' : s.n.data)).join('');
  if (WordSync.clean(raw).length !== raw.length || !segs.length || !old.length) {   // nothing to keep: write it plainly
    const keep = [...el.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
    el.textContent = text; if (!text) el.append(document.createElement('br'));
    el.append(...keep);
    return;
  }
  const at = (o, end) => {
    for (const s of segs) {
      if (o < s.b || (end && o === s.b)) {
        if (s.br) return o <= s.a ? [s.n, 'before'] : [s.n, 'after'];
        return [s.n, o - s.a];
      }
    }
    const last = segs[segs.length - 1];
    return last.br ? [last.n, 'after'] : [last.n, last.n.data.length];
  };
  // change only the words that differ, from the end backwards (so the earlier positions stay right)
  for (const op of wlTextOps(old, text).reverse()) {
    const r = document.createRange();
    const [sn, so] = at(op.a, false), [en, eo] = at(op.b, true);
    if (so === 'before') r.setStartBefore(sn); else if (so === 'after') r.setStartAfter(sn); else r.setStart(sn, so);
    if (op.b === op.a) r.collapse(true);
    else if (eo === 'before') r.setEndBefore(en); else if (eo === 'after') r.setEndAfter(en); else r.setEnd(en, eo);
    r.deleteContents();
    if (op.ins) r.insertNode(document.createTextNode(op.ins));
  }
  // formatting tags left empty by the change go away (marks with data, like jump tags or sound stamps, stay)
  for (const x of [...el.querySelectorAll('b,i,u,s,em,strong,mark,sub,sup,span')]) if (!x.textContent && !x.querySelector('img,br') && ![...x.attributes].some((a) => a.name !== 'style')) x.remove();
  if (!wlText(el) && !el.querySelector('br')) el.append(document.createElement('br'));
  el.normalize();
}

/* ---- linking from Home ---- */
const wlWordOpen = (key) => WL.words.find((w) => w.key === key) || null;
async function wlOpenHere(key) {
  const w = wlWordOpen(key) || WL.words[0]; if (!w) return;
  const had = wlLinkedNodes().find((n) => n.word === w.key);
  if (had) { await openNote(had.id); return; }
  let nb = kids(null).find((n) => n.type === 'folder' && n.name === 'Word documents');
  if (!nb) { nb = mkNode('folder', 'Word documents', null); openSet.add(nb.id); persistOpen(); }
  const n = mkNode('note', String(w.name || 'Word document').replace(/\.docx?$/i, '') || 'Word document', nb.id);
  n.kind = 'a4'; n.word = w.key;
  saveTree();
  pendingWordLink = { id: n.id, key: w.key, name: w.name, url: w.url };
  await openNote(n.id);
  toast('“' + n.name + '” is linked with Word. Write in either: the other follows.');
}
async function wlUnlink() {
  if (!cur || !doc || !doc.word) return;
  if (!(await confirmModal('Unlink this page from Word?', 'The page keeps its text, and the Word document stays as it is. They just stop changing together.', 'Unlink'))) return;
  const node = tree.nodes[cur.id];
  wlDetach();
  delete doc.word; saveDoc('main');
  if (node) { delete node.word; touch(node); saveTree(); }
  wordLinkPageOpened(); wlRefresh();
  toast('Unlinked. The page and the Word document are now separate.');
}
function wlHelp() {
  const code = (t) => h('code', { class: 'wl-code' }, t);
  modal({ title: 'Word link: how to set it up', wide: true, body: [
    h('p', null, 'The Word link keeps a Word document and an A4 page here the same while you write in either. It runs on your computer: in the desktop app and in the browser version (not inside Claude).'),
    h('ol', { class: 'wl-steps' },
      h('li', null, h('b', null, 'Once: '), 'open a terminal in the Cortex Scribe folder and run ', code('npm install'), ' then ', code('npm run word:setup'), '. Windows asks once whether to trust a certificate for “localhost”: choose Yes. Then close Word completely and open it again.'),
      h('li', null, h('b', null, 'Each time: '), Platform.desktop ? 'nothing to do: the desktop app starts the link by itself (open Cortex Scribe before Word, or press Retry in Word).' : ['run ', code('npm run word'), ' and leave that window open. (The desktop app does this by itself.)']),
      h('li', null, h('b', null, 'In Word: '), 'Home tab → ', h('b', null, 'Cortex Scribe'), '. A panel opens and connects.'),
      h('li', null, h('b', null, 'Here: '), 'Home → Word link → ', h('b', null, 'Open it here'), '. The document appears as an A4 page.')),
    h('p', { class: 'hint' }, 'The browser version (inkling.html) asks once for the code shown in the Word link window. Pictures and tables stay exactly as they are in Word and show here as boxes; drawings, boxes and notes you add here never change the Word file.'),
    h('p', { class: 'hint' }, 'This is a first version: try it on a copy of a document before using it for real homework.')],
    actions: [{ label: 'Close', kind: 'primary' }] });
}

/* ---- the Word link screen (sidebar → Word link): the card, finding a Word file and opening it in Word ---- */
WL.pending = null;            // { path, name, at }: a document opened from here, linked as soon as Word's panel says hello
const wlNormPath = (p) => { let v = String(p || ''); try { v = decodeURIComponent(v); } catch {} return v.replace(/^file:\/+/i, '').replace(/\\/g, '/').toLowerCase(); };
const wlBase = (p) => wlNormPath(p).split('/').pop();
function wlPendingCheck() {
  const pd = WL.pending; if (!pd) return;
  if (now() - pd.at > 10 * 60000) { WL.pending = null; return; }
  const w = WL.words.find((x) => wlNormPath(x.url) === wlNormPath(pd.path)) || WL.words.find((x) => wlBase(x.url || x.name) === wlBase(pd.path));
  if (!w) return;
  WL.pending = null;
  wlOpenHere(w.key);
}
function renderWordSection() {
  const find = WordBridge.canFind
    ? '<section class="sx-card sx-wfind" id="sxWordFind"><h3>' + sxIc('search', 'blue') + 'Open a Word document</h3>' +
      '<label class="sx-capture wl-find">' + svg('search').outerHTML + '<input id="wlFind" placeholder="Search your Word files…" aria-label="Search your Word files" autocomplete="off"></label>' +
      '<div class="wl-found" id="wlFound"><p class="muted">Looking in Documents, Desktop, Downloads and OneDrive…</p></div>' +
      '<p class="muted small">It opens in Word and links with a page here by itself. The first time, press <b>Cortex Scribe</b> on Word’s Home tab; after that the panel opens with the document.</p></section>'
    : '<section class="sx-card sx-wfind" id="sxWordFind"><h3>' + sxIc('search', 'blue') + 'Open a Word document</h3><p class="muted">' +
      (WordBridge.available ? 'Open the document in Word and press <b>Cortex Scribe</b> on Word’s Home tab: it shows up on the left, and <b>Open it here</b> links it. (In the desktop app you can search your Word files right here.)' : 'The Word link runs on your computer: in the desktop app or the browser version, not inside Claude.') + '</p></section>';
  const how = '<section class="sx-card"><h3>' + sxIc('info', 'violet') + 'What comes across</h3><ul class="wl-what">' +
    '<li>Text, headings and lists, both ways while you type</li><li>Tables (type in the cells on either side) and their cell colours</li>' +
    '<li>Bold, italic, underline, colours, highlights and alignment</li><li>Page size, sideways pages, margins, the header and footer with page numbers</li>' +
    '<li>Pictures stay as they are in Word (shown here as boxes)</li><li>Your drawings, boxes and notes stay here and never change the Word file</li></ul>' +
    '<div class="sx-row"><button class="sx-btn small" data-act="wlhelp">How to set it up</button></div></section>';
  secView.innerHTML = '<div class="sx sx-wordsec"><div class="sx-top"><div class="sx-hello"><h1>Word link</h1><p>An A4 page here and a Word document stay the same while you write in either.</p></div></div>' +
    '<div class="sx-grid wordsec">' + wordCardHtml() + find + how + '</div></div>';
  wlWireCode(secView); setTimeout(() => wlConnect(), 0);
  const fi = secView.querySelector('#wlFind');
  if (fi) { let t = 0; fi.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => wlFindShow(fi.value), 250); }); wlFindShow(''); }
}
async function wlFindShow(q) {
  const box = secView.querySelector('#wlFound'); if (!box) return;
  let list;
  try { list = await WordBridge.findDocs(q); } catch (e) { box.innerHTML = '<p class="wl-err">Couldn’t look for Word files: ' + sxEsc((e && e.message) || e) + '</p>'; return; }
  if (secOpen !== 'word' || !box.isConnected || (secView.querySelector('#wlFind') || {}).value !== q) return;
  const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  box.innerHTML = list.length ? list.slice(0, 12).map((d, i) => {
    const had = wlLinkedNodes().find((n) => wlNormPath(n.word) === wlNormPath(d.path));
    return '<div class="wl-doc wl-file"><span class="wl-ficon">W</span><div><b>' + sxEsc(d.name.replace(/\.docx$/i, '')) + '</b><small>' + sxEsc([d.folder, when(d.modified)].filter(Boolean).join(' · ')) + '</small></div>' +
      '<button class="sx-btn small primary" data-act="wlopenfile" data-arg="' + i + '">' + (had ? 'Open' : 'Open and link') + '</button></div>';
  }).join('') : '<p class="muted">' + (q ? 'No Word file with “' + sxEsc(q) + '” in its name.' : 'No Word files found in Documents, Desktop, Downloads or OneDrive.') + '</p>';
  WL.found = list;
  wireSecView(box);
}
async function wlOpenFile(i) {
  const d = (WL.found || [])[+i]; if (!d) return;
  const had = wlLinkedNodes().find((n) => wlNormPath(n.word) === wlNormPath(d.path));
  prefs.set('wordUsed', true);
  if (!WL.conn) wlConnect(true);
  try { await WordBridge.openDoc(d.path); } catch (e) { toast('Word couldn’t open “' + d.name + '”: ' + ((e && e.message) || e)); return; }
  if (had) { await openNote(had.id); toast('“' + d.name + '” is opening in Word. The page follows it as soon as Word’s panel is open.'); return; }
  WL.pending = { path: d.path, name: d.name, at: now() };
  toast('“' + d.name + '” is opening in Word. Press Cortex Scribe on Word’s Home tab (only the first time): the page here opens and links by itself.');
  wlPendingCheck();
}

/* ---- Home card and the chip on a linked page ---- */
function wordCardHtml() {
  const head = '<h3>' + sxIc('page', 'blue') + 'Word link<span class="sx-more">new · experiment</span></h3>';
  const help = '<button class="sx-btn small" data-act="wlhelp">How to set it up</button>';
  let body;
  if (!WordBridge.available) body = '<p class="muted">Keep a Word document and a page here the same while you write in either. Works in the desktop app and the browser version on your computer.</p><div class="sx-row">' + help + '</div>';
  else if (WL.state === 'code') body = '<p class="muted">Type the code shown in the Word link window (the one started with <code>npm run word</code>).</p>' + (WL.err ? '<p class="wl-err">' + sxEsc(WL.err) + '</p>' : '') + '<div class="sx-row"><input class="wl-codein" id="wlCode" inputmode="numeric" maxlength="6" placeholder="123456" aria-label="Code from the Word link window"><button class="sx-btn small primary" data-act="wlcode">Connect</button>' + help + '</div>';
  else if (WL.state === 'connecting') body = '<p class="muted">Connecting to the Word link on this computer…</p>';
  else if (WL.state === 'nobridge' && Platform.desktop && WL.bridge && WL.bridge.state === 'missing') body = '<p class="muted">The Word link isn’t in the installed app yet: it comes in a later version. Until then it works when Cortex Scribe runs from its folder (<code>npm run app</code>).</p><div class="sx-row">' + help + '</div>';
  else if (WL.state === 'nobridge' && Platform.desktop && WL.bridge && WL.bridge.detail) body = '<p class="muted">The Word link couldn’t start:</p><pre class="wl-said">' + sxEsc(WL.bridge.detail.slice(-400)) + '</pre><div class="sx-row"><button class="sx-btn small primary" data-act="wlconnect">Try again</button>' + help + '</div>';
  else if (WL.state === 'nobridge') body = '<p class="muted">The Word link isn’t running on this computer. Start it with <code>npm run word</code>, then try again.</p><div class="sx-row"><button class="sx-btn small primary" data-act="wlconnect">Try again</button>' + help + '</div>';
  else if (WL.state !== 'on') body = '<p class="muted">Link a Word document with an A4 page: what you write in one shows up in the other. Your drawings and notes stay here.</p><div class="sx-row"><button class="sx-btn small primary" data-act="wlconnect">Connect</button>' + help + '</div>';
  else if (!WL.words.length) body = '<p class="muted"><span class="wl-dot on"></span>Connected. Now open a document in Word and press <b>Cortex Scribe</b> on Word’s Home tab.</p><div class="sx-row">' + help + '</div>';
  else body = WL.words.slice(0, 4).map((w) => {     // every Word document with the panel open
    const had = wlLinkedNodes().find((n) => n.word === w.key);
    return '<div class="wl-doc"><span class="wl-dot on"></span><div><b>' + sxEsc(w.name) + '</b><small>open in Word</small></div>' +
      '<button class="sx-btn small primary" data-act="wlopen" data-arg="' + sxEsc(w.key) + '">' + (had ? 'Open the linked page' : 'Open it here') + '</button></div>';
  }).join('');
  const pages = wlLinkedNodes().slice(0, 3);
  const list = pages.length ? '<div class="wl-pages">' + pages.map((n) => '<button class="sx-link" data-act="open" data-arg="' + sxEsc(n.id) + '">' + sxEsc(n.name) + '</button>').join('') + '</div>' : '';
  return '<section class="sx-card sx-word" id="sxWord">' + head + body + list + '</section>';
}
function wlRefresh() {
  const card = (secOpen === 'home' || secOpen === 'word') && secView.querySelector('#sxWord');
  if (card) {
    const keep = card.querySelector('#wlCode'), val = keep ? keep.value : '', focus = keep && document.activeElement === keep;
    const t = document.createElement('template'); t.innerHTML = wordCardHtml();
    const el = t.content.firstElementChild; card.replaceWith(el); wireSecView(el); wlWireCode(el);
    const ni = el.querySelector('#wlCode'); if (ni) { ni.value = val; if (focus) ni.focus(); }
  }
  wlChip();
}
function wlWireCode(root) { const i = root.querySelector('#wlCode'); if (i) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') SEC_ACTS.wlcode(); }); }
const wordChip = h('button', { class: 'acc-chip word-chip', id: 'wordChip', hidden: true, title: 'This page is linked with a Word document' });
$('#shareBtn').before(wordChip);
wordChip.addEventListener('click', () => {
  if (!doc || !doc.word) return;
  openMenu(wordChip, [
    { label: 'Linked with “' + doc.word.name + '”', header: true },
    { label: WL.client && wlWordOpen(doc.word.key) ? 'Up to date with Word' + (WL.lastSync ? ' (' + new Date(WL.lastSync).toLocaleTimeString() + ')' : '') : 'Waiting for Word: open the document and press Cortex Scribe there', header: true },
    { label: 'Word link', icon: 'textfile', fn: () => openSection('word') },
    { label: 'How it works', icon: 'info', fn: wlHelp },
    { label: 'Unlink this page', icon: 'unlink', danger: true, fn: wlUnlink },
  ]);
});
function wlChip() {
  const on = !!(cur && !cur.loading && doc && doc.word && !secOpen);
  wordChip.hidden = !on;
  if (!on) return;
  const live = WL.client && wlWordOpen(doc.word.key);
  wordChip.textContent = '';
  wordChip.append(svg('link'), h('span', null, 'Word · ' + (live ? 'linked' : WordBridge.available ? 'waiting' : 'off here')));
  wordChip.classList.toggle('live', !!live);
}
// the desktop app starts the link when it opens (if it was used before), so Word can load its panel right away
setTimeout(() => { if (Platform.desktop && prefs.get('wordUsed', false)) wlConnect(); }, 1200);
Object.assign(SEC_ACTS, {
  wlconnect: () => { prefs.set('wordUsed', true); WL.err = ''; if (WL.conn) return; WL.tries = 0; wlConnect(true); },
  wlcode: () => { const i = $('#wlCode'); const v = i ? i.value.replace(/\D/g, '') : ''; if (v.length !== 6) { WL.err = 'The code has 6 digits.'; wlRefresh(); return; } prefs.set('wordCode', v); prefs.set('wordUsed', true); WL.err = ''; WL.state = 'off'; wlConnect(true); },
  wlopen: (key) => wlOpenHere(key),
  wlopenfile: (i) => wlOpenFile(i),
  wlhelp: () => wlHelp(),
});

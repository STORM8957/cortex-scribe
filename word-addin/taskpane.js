/* Cortex Scribe panel inside Word: links the open document with a Cortex Scribe page through the bridge on this
   computer (npm run word). It reads the document paragraph by paragraph (text, headings, lists, alignment and the
   formatting word by word: bold, italic, underline, struck through, text colour, highlight), sends changes, and writes
   the changes from Cortex Scribe back. Tables come across with their cells and cell colours: typing in a cell on either
   side changes that cell (Word's getCell(...).value); tables are never added or removed from Cortex Scribe. Pictures,
   and tables with a picture inside, are sent as locked boxes and never changed. The header and footer of the first
   section come across too (page numbers as {PAGE} / {NUMPAGES}), and the page size, orientation and margins.
   Uses WordApi 1.3 (Word 2016 and newer, Microsoft 365, Word on the web); the page setup is changed from here only
   where Word has WordApiDesktop 1.3 (otherwise it is read from the document and Cortex Scribe follows Word), and
   page numbers are written as fields with WordApi 1.5 (otherwise as OOXML). */
(() => {
  const $ = (id) => document.getElementById(id);
  const STYLE = { p: 'Normal', h1: 'Heading1', h2: 'Heading2', h3: 'Heading3', li: 'ListBullet', ol: 'ListNumber' };
  const ALIGN_IN = { Centered: 'c', Right: 'r', Justified: 'j' }, ALIGN_OUT = { c: 'Centered', r: 'Right', j: 'Justified' };
  const FONT = ['bold', 'italic', 'underline', 'strikeThrough', 'color', 'highlightColor'];
  const loadList = (pre) => FONT.map((f) => pre + 'font/' + f).join(',');
  const has = (set, v) => { try { return Office.context.requirements.isSetSupported(set, v); } catch { return false; } };
  const hex = (v) => { v = String(v || '').toLowerCase(); return /^#[0-9a-f]{6}$/.test(v) ? v : null; };
  const HL = { yellow: '#ffff00', brightgreen: '#00ff00', turquoise: '#00ffff', pink: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkblue: '#000080', teal: '#008080', green: '#008000', violet: '#800080', darkred: '#800000', darkyellow: '#808000', gray50: '#808080', gray25: '#c0c0c0', black: '#000000', white: '#ffffff' };
  /* a Word font → fmt ('' = plain); null when part of it is mixed (unless loose: then mixed counts as off) */
  function fontFmt(f, loose) {
    if (!f) return '';
    if (!loose && (f.bold == null || f.italic == null || f.underline == null || f.underline === '' || f.strikeThrough == null || f.color == null || f.color === '' || f.highlightColor === '')) return null;
    const out = [];
    if (f.bold) out.push('b'); if (f.italic) out.push('i'); if (f.underline && f.underline !== 'None') out.push('u'); if (f.strikeThrough) out.push('s');
    const c = hex(f.color); if (c && c !== '#000000') out.push('c=' + c);
    const h = f.highlightColor ? (hex(f.highlightColor) || HL[String(f.highlightColor).toLowerCase()] || null) : null; if (h) out.push('h=' + h);
    return WordSync.fmt(out.join(';'));
  }
  /* runs over the words of t: one fmt for all (uniform), or from the word ranges [{ text, f }] */
  function runsFor(t, uniform, ranges) {
    const ws = WordSync.words(t);
    if (!ranges) return WordSync.runsOf(ws.map((w) => (/\S/.test(w) ? uniform || '' : '')));
    const fAt = new Array(t.length).fill(''); let pos = 0;
    for (const r of ranges) {
      const rt = WordSync.clean(r.text).trim(); if (!rt) continue;
      const i = t.indexOf(rt, pos); if (i < 0) continue;
      for (let k = i; k < i + rt.length; k++) fAt[k] = r.f;
      pos = i + rt.length;
    }
    const list = []; pos = 0;
    for (const w of ws) { const m = /\S/.exec(w); list.push(m ? fAt[pos + m.index] : ''); pos += w.length; }
    return WordSync.runsOf(list);
  }
  /* set a Word font to fmt f; have = what is there (a fmt, or undefined when not known), colors = it had a colour */
  function applyFont(font, f, have, colors) {
    const want = (k) => WordSync.fmtGet(f, k), had = (k) => (have == null ? undefined : WordSync.fmtGet(have, k));
    for (const [k, prop, on, off] of [['b', 'bold', true, false], ['i', 'italic', true, false], ['u', 'underline', 'Single', 'None'], ['s', 'strikeThrough', true, false]]) {
      const w = !!want(k); if (have == null || w !== !!had(k)) font[prop] = w ? on : off;
    }
    const c = want('c');
    if (c) { if (c !== had('c')) font.color = c; } else if ((have != null && had('c')) || (have == null && colors)) font.color = '#000000';
    const h = want('h');
    if (h) { if (h !== had('h')) font.highlightColor = h; } else if (have == null || had('h')) font.highlightColor = null;
  }
  const uniformOf = (p) => { const ws = WordSync.words(p.t), l = WordSync.perWord(p.r, ws.length).filter((f, i) => /\S/.test(ws[i])); const set = new Set(l); return set.size <= 1 ? (l[0] || '') : undefined; };
  const anyOf = (p, k) => !!(p && p.r && p.r.some((x) => WordSync.fmtGet(x[1], k)));

  /* ---- the header and footer: page numbers are fields; their text comes from the paragraph's OOXML ---- */
  const fieldCache = new Map();
  const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  function fieldText(ooxml, plain) {      // the paragraph's text with {PAGE} / {NUMPAGES} where those fields are
    const body = String(ooxml || ''); const i = body.indexOf('<w:body'); if (i < 0) return plain;
    const re = /<w:fldSimple\b[^>]*w:instr="([^"]*)"[^>]*>([\s\S]*?)<\/w:fldSimple>|<w:fldChar\b[^>]*w:fldCharType="(begin|separate|end)"|<w:instrText\b[^>]*>([^<]*)<\/w:instrText>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g;
    let m, tok = '', res = '', state = 0, code = '', result = '';
    const tokenOf = (c) => { const k = c.trim().split(/\s+/)[0].toUpperCase(); return k === 'PAGE' ? '{PAGE}' : k === 'NUMPAGES' ? '{NUMPAGES}' : null; };
    re.lastIndex = i;
    while ((m = re.exec(body))) {
      if (m[1] != null) { const r = unxml((m[2].match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g) || []).map((x) => x.replace(/<[^>]+>/g, '')).join('')); const tk = tokenOf(unxml(m[1])); tok += tk || r; res += r; }
      else if (m[3] === 'begin') { state = 1; code = ''; result = ''; }
      else if (m[3] === 'separate') state = 2;
      else if (m[3] === 'end') { const tk = tokenOf(code); tok += tk || result; res += result; state = 0; }
      else if (m[4] != null) { if (state === 1) code += unxml(m[4]); }
      else if (m[5] != null) { const t = unxml(m[5]); if (state === 2) result += t; else if (state === 0) { tok += t; res += t; } }
      else if (state === 0) { tok += '\t'; res += '\t'; }
      if (body.indexOf('</w:p>', re.lastIndex - 1) < 0) break;
    }
    return WordSync.clean(res) === WordSync.clean(plain) && /\{(PAGE|NUMPAGES)\}/.test(tok) ? WordSync.clean(tok) : plain;
  }
  async function readHF(ctx) {
    const sec = ctx.document.sections.getFirst();
    const bodies = { hd: sec.getHeader('Primary'), ft: sec.getFooter('Primary') }, cols = {};
    for (const k of ['hd', 'ft']) { cols[k] = bodies[k].paragraphs; cols[k].load('items/text,items/alignment,' + loadList('items/')); }
    await ctx.sync();
    const need = [];
    for (const k of ['hd', 'ft']) for (const p of cols[k].items) { const t = WordSync.clean(p.text); if (t.trim() && !fieldCache.has(t)) need.push([t, p.getOoxml()]); }
    if (need.length) { await ctx.sync(); for (const [t, ox] of need) fieldCache.set(t, fieldText(ox.value, t)); if (fieldCache.size > 200) fieldCache.clear(); }
    const out = { bodies };
    for (const k of ['hd', 'ft']) {
      out[k] = [];
      for (const p of cols[k].items) {
        const t0 = WordSync.clean(p.text); if (!t0.trim()) continue;
        const t = fieldCache.get(t0) || t0;
        out[k].push({ para: p, item: WordSync.norm([{ k, t, a: ALIGN_IN[p.alignment], r: runsFor(t, fontFmt(p.font) || '', null) }])[0] });
      }
    }
    return out;
  }
  function fieldOoxml(t) {
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const runs = t.split(/(\{PAGE\}|\{NUMPAGES\})/).filter(Boolean).map((b) => (b === '{PAGE}' || b === '{NUMPAGES}' ? '<w:fldSimple w:instr=" ' + b.slice(1, -1) + ' "><w:r><w:t>1</w:t></w:r></w:fldSimple>' : '<w:r><w:t xml:space="preserve">' + esc(b) + '</w:t></w:r>')).join('');
    return '<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage"><pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml"><pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships></pkg:xmlData></pkg:part><pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>' + runs + '</w:p></w:body></w:document></pkg:xmlData></pkg:part></pkg:package>';
  }
  function setHFPara(para, want, was) {
    if (!was || was.t !== want.t) {
      if (/\{(PAGE|NUMPAGES)\}/.test(want.t)) {
        if (has('WordApi', '1.5')) {      // page numbers as real fields
          para.insertText('', 'Replace');
          for (const b of want.t.split(/(\{PAGE\}|\{NUMPAGES\})/).filter(Boolean)) {
            if (b === '{PAGE}' || b === '{NUMPAGES}') para.getRange('End').insertField('Before', b === '{PAGE}' ? 'Page' : 'NumPages');
            else para.insertText(b, 'End');
          }
        } else para.insertOoxml(fieldOoxml(want.t), 'Replace');
      } else para.insertText(want.t, 'Replace');
    }
    if (!was || was.a !== want.a) para.alignment = ALIGN_OUT[want.a] || 'Left';
    const f = uniformOf(want) || '', h0 = was && was.t === want.t ? uniformOf(was) : undefined;
    if (!was || WordSync.key(was) !== WordSync.key(want)) applyFont(para.font, f, h0, anyOf(was, 'c'));
  }
  function writeHF(hf, target) {
    for (const k of ['hd', 'ft']) {
      const want = target.filter((p) => p.k === k), have = hf[k];
      if (WordSync.same(want, have.map((x) => x.item))) continue;
      const n = Math.min(want.length, have.length);
      for (let i = 0; i < n; i++) if (WordSync.key(want[i]) !== WordSync.key(have[i].item)) setHFPara(have[i].para, want[i], have[i].item);
      let ref = have.length ? have[have.length - 1].para : null;
      for (const w of want.slice(n)) { const np = ref ? ref.insertParagraph('', 'After') : hf.bodies[k].insertParagraph('', 'End'); setHFPara(np, w, null); ref = np; }
      for (const x of have.slice(n)) x.para.insertText('', 'Replace');     // emptied, not deleted: Word keeps at least one line there
    }
  }

  /* ---- the page: size, orientation, margins (points) ---- */
  let setupCache = null, setupAt = 0;
  const twip = (v) => Math.abs(+v || 0) / 20;
  function setupFromOoxml(ox) {
    const sz = /<w:pgSz\b([^>]*)>/.exec(ox || ''), mg = /<w:pgMar\b([^>]*)>/.exec(ox || '');
    if (!sz) return null;
    const at = (s, n) => { const m = new RegExp('w:' + n + '="(-?[0-9]+)"').exec(s); return m ? twip(m[1]) : null; };
    const w = at(sz[1], 'w'), h = at(sz[1], 'h'); if (!w || !h) return null;
    const ps = { w, h, o: /w:orient="landscape"/.test(sz[1]) || w > h ? 'l' : 'p' };
    if (mg) { const m = ['top', 'right', 'bottom', 'left'].map((n) => at(mg[1], n)); if (m.every((v) => v != null)) ps.m = m; const hd = at(mg[1], 'header'), fd = at(mg[1], 'footer'); if (hd != null) ps.hd = hd; if (fd != null) ps.fd = fd; }
    return { k: 'setup', t: '', ps };
  }
  async function readSetup(ctx) {
    if (setupCache !== undefined && setupAt && Date.now() - setupAt < 8000) return setupCache;
    setupAt = Date.now();
    try {
      if (has('WordApiDesktop', '1.3')) {
        const ps = ctx.document.sections.getFirst().pageSetup;
        ps.load('orientation,pageWidth,pageHeight,topMargin,bottomMargin,leftMargin,rightMargin,headerDistance,footerDistance');
        await ctx.sync();
        setupCache = { k: 'setup', t: '', ps: { w: ps.pageWidth, h: ps.pageHeight, o: ps.orientation === 'Landscape' ? 'l' : 'p', m: [ps.topMargin, ps.rightMargin, ps.bottomMargin, ps.leftMargin], hd: ps.headerDistance, fd: ps.footerDistance } };
      } else {
        const ox = ctx.document.body.paragraphs.getFirst().getOoxml();
        await ctx.sync();
        setupCache = setupFromOoxml(ox.value) || setupCache;
      }
    } catch (e) { console.warn('page setup', e); }
    return setupCache;
  }
  async function writeSetup(ctx, want, have) {
    if (!want || (have && WordSync.key(want) === WordSync.key(have))) return;
    if (!has('WordApiDesktop', '1.3')) return;      // this Word can't: its own page comes back, and Cortex Scribe says so
    const secs = ctx.document.sections; secs.load('items'); await ctx.sync();
    for (const sec of secs.items) {
      const ps = sec.pageSetup, w = want.ps;
      ps.orientation = w.o === 'l' ? 'Landscape' : 'Portrait';
      ps.pageWidth = w.w; ps.pageHeight = w.h;
      if (w.m) { ps.topMargin = w.m[0]; ps.rightMargin = w.m[1]; ps.bottomMargin = w.m[2]; ps.leftMargin = w.m[3]; }
      if (w.hd != null) ps.headerDistance = w.hd; if (w.fd != null) ps.footerDistance = w.fd;
    }
    setupAt = 0;
  }
  let ws = null, client = null, paused = false, docName = '', docUrl = '', lastStatus = null, retry = 0, takenOver = false;

  function show(state, cls, detail) { $('state').textContent = state; $('dot').className = 'dot ' + (cls || ''); if (detail != null) $('detail').textContent = detail; }
  function kindOf(p, listString) {
    const sb = String(p.styleBuiltIn || '');
    if (sb === 'Heading1' || sb === 'Title') return 'h1';
    if (sb === 'Heading2' || sb === 'Subtitle') return 'h2';
    if (/^Heading[3-9]$/.test(sb)) return 'h3';
    if (p.isListItem || /^List(Bullet|Number)/.test(sb)) return /^ListNumber/.test(sb) || /^\s*([0-9]+|[a-z]|[ivxlc]+)[.)]/i.test(listString || '') ? 'ol' : 'li';
    return 'p';
  }
  /* the document as Cortex Scribe sees it, plus where each item is in Word's paragraph list */
  async function readIn(ctx) {
    const ps = ctx.document.body.paragraphs;
    ps.load('items/text,items/styleBuiltIn,items/isListItem,items/tableNestingLevel,items/alignment,' + loadList('items/'));
    const tbs = ctx.document.body.tables;
    tbs.load('items/values,items/nestingLevel');
    await ctx.sync();
    const items = ps.items;
    const tops = tbs.items.filter((t) => t.nestingLevel === 1);
    let runs = 0; items.forEach((p, i) => { if (p.tableNestingLevel > 0 && (i === 0 || !(items[i - 1].tableNestingLevel > 0))) runs++; });
    const cellsOk = runs === tops.length;   // each run of table paragraphs is one table: then its cells can be used
    let ti = 0;
    const pics = items.map((p) => { const c = p.inlinePictures; c.load('items'); return c; });
    const lists = items.map((p) => (p.isListItem ? p.listItemOrNullObject.load('listString') : null));
    // paragraphs with mixed formatting: word by word
    const uni = items.map((p) => (p.tableNestingLevel > 0 ? '' : fontFmt(p.font)));
    const words = items.map((p, i) => { if (uni[i] !== null) return null; const r = p.getTextRanges([' '], true); r.load('items/text,' + loadList('items/')); return r; });
    // the colours of table cells (not for very big tables)
    let cellsLeft = 600;
    const shades = tops.map((tb) => { if (!cellsOk) return null; const n = tb.values.reduce((a, r) => a + r.length, 0); if (n > cellsLeft) return null; cellsLeft -= n; return tb.values.map((r, ri) => r.map((_, ci) => tb.getCell(ri, ci).load('shadingColor'))); });
    await ctx.sync();
    const doc = [], map = [];
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (p.tableNestingLevel > 0) {           // a table: one item with its cells (or one locked box)
        const last = map[map.length - 1];
        if (last && last.table && last.end === i - 1) {
          last.end = i; last.text = (last.text.length < 400 ? (last.text ? last.text + ' · ' : '') + WordSync.clean(p.text) : last.text);
          if (pics[i].items.length) last.pics = true;
          continue;
        }
        const tsh = cellsOk ? shades[ti] : null, tb = cellsOk ? tops[ti++] : null;
        doc.push(tb ? { k: 'table', t: '', rows: tb.values, sh: tsh ? tsh.map((r) => r.map((c) => hex(c.shadingColor) || '')) : undefined } : { k: 'p', t: '', lock: 'table' });
        map.push({ start: i, end: i, table: true, tbl: tb, text: WordSync.clean(p.text), pics: pics[i].items.length > 0 });
        continue;
      }
      if (pics[i].items.length) { doc.push({ k: 'p', t: p.text, lock: 'picture' }); map.push({ start: i, end: i }); continue; }
      const ls = lists[i] && !lists[i].isNullObject ? lists[i].listString : '';
      const t = WordSync.clean(p.text);
      const r = words[i] ? runsFor(t, null, words[i].items.map((x) => ({ text: x.text, f: fontFmt(x.font, true) }))) : runsFor(t, uni[i], null);
      doc.push({ k: kindOf(p, ls), t, a: ALIGN_IN[p.alignment], r }); map.push({ start: i, end: i, list: !!p.isListItem });
    }
    map.forEach((m, j) => {      // a table with a picture inside stays locked as a whole, so the picture is never lost
      if (!m.table) return;
      if (m.pics || !m.tbl) { doc[j] = { k: 'p', t: m.text, lock: 'table' }; m.tbl = null; }
    });
    return { doc: WordSync.norm(doc), map, items };
  }
  /* the whole document as Cortex Scribe sees it: page setup, header, text, footer */
  async function readAll(ctx) {
    const body = await readIn(ctx);
    let hf = null, st = null;
    try { hf = await readHF(ctx); } catch (e) { console.warn('header and footer', e); }
    try { st = await readSetup(ctx); } catch (e) { console.warn('page setup', e); }
    const doc = WordSync.norm([...(st ? [st] : []), ...(hf ? hf.hd.map((x) => x.item) : []), ...body.doc, ...(hf ? hf.ft.map((x) => x.item) : [])]);
    return { body, hf, st, doc };
  }
  const readWord = () => Word.run(async (ctx) => (await readAll(ctx)).doc);
  /* the font most of the text uses (name and size in points), so the page in Cortex Scribe can look the same */
  async function readFont() {
    try {
      return await Word.run(async (ctx) => {
        const ps = ctx.document.body.paragraphs;
        ps.load('items/font/name,items/font/size,items/text,items/tableNestingLevel');
        await ctx.sync();
        const count = new Map();
        for (const p of ps.items) {
          if (p.tableNestingLevel > 0 || !p.text.trim() || !p.font || !p.font.name || !(p.font.size > 0)) continue;
          const k = p.font.name + '|' + p.font.size; count.set(k, (count.get(k) || 0) + p.text.length);
        }
        const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
        if (!best) return null;
        const [name, size] = best[0].split('|');
        return { name, size: +size };
      });
    } catch { return null; }
  }

  /* change Word to target, touching only the paragraphs that differ */
  function writeWord(target) {
    return Word.run(async (ctx) => {
      const all = await readAll(ctx);
      const { doc: cur, map, items } = all.body;
      target = WordSync.norm(target);
      await writeSetup(ctx, target.find((p) => p.k === 'setup'), all.st);
      if (all.hf) writeHF(all.hf, target);
      target = target.filter((p) => p.k !== 'setup' && p.k !== 'hd' && p.k !== 'ft');
      const fresh = [], fmtJobs = [];
      const last = items.length - 1;
      for (const hk of WordSync.hunks(cur, target).reverse()) {     // from the end, so earlier positions stay right
        // tables: only the cells that differ are written; tables themselves are added or removed only in Word
        const At = [], Tt = target.slice(hk.b0, hk.b1).filter((p) => p.k === 'table');
        for (let i = hk.a0; i < hk.a1; i++) if (cur[i].k === 'table') At.push(i);
        for (let j = 0; j < Math.min(At.length, Tt.length); j++) {
          const was = cur[At[j]], want = Tt[j], tbl = map[At[j]].tbl;
          if (!tbl || WordSync.shape(was) !== WordSync.shape(want)) continue;
          const shOf = (x, ri, ci) => (x.sh && x.sh[ri] && x.sh[ri][ci]) || '';
          want.rows.forEach((r, ri) => r.forEach((c, ci) => {
            if (was.rows[ri][ci] !== c) tbl.getCell(ri, ci).value = c;
            if (shOf(was, ri, ci) !== shOf(want, ri, ci)) tbl.getCell(ri, ci).shadingColor = shOf(want, ri, ci) || '#FFFFFF';
          }));
        }
        const A = []; for (let i = hk.a0; i < hk.a1; i++) if (!cur[i].lock && cur[i].k !== 'table') A.push(i);
        const T = target.slice(hk.b0, hk.b1).filter((p) => !p.lock && p.k !== 'table');   // locked boxes and tables can't be made from here
        const n = Math.min(A.length, T.length);
        for (let j = 0; j < n; j++) {
          const para = items[map[A[j]].start], was = cur[A[j]], want = T[j];
          if (was.t !== want.t) para.insertText(want.t, 'Replace');
          if (was.k !== want.k) {
            para.styleBuiltIn = STYLE[want.k];
            if (map[A[j]].list && (want.k !== 'li' && want.k !== 'ol')) para.detachFromList();
          }
          if ((was.a || '') !== (want.a || '')) para.alignment = ALIGN_OUT[want.a] || 'Left';
          if (was.t !== want.t || JSON.stringify(was.r || null) !== JSON.stringify(want.r || null) || was.k !== want.k) fmtJobs.push({ para, want, have: was.t === want.t && was.k === want.k ? uniformOf(was) : undefined, colors: anyOf(was, 'c') });
        }
        let ref = n ? items[map[A[n - 1]].start] : (hk.a0 > 0 ? items[map[hk.a0 - 1].end] : null);
        let refTable = !n && hk.a0 > 0 && map[hk.a0 - 1].table;
        for (const want of T.slice(n)) {
          const np = !ref ? ctx.document.body.insertParagraph(want.t, 'Start') : refTable ? ref.parentTable.insertParagraph(want.t, 'After') : ref.insertParagraph(want.t, 'After');
          np.styleBuiltIn = STYLE[want.k];
          if (want.a) np.alignment = ALIGN_OUT[want.a];
          fresh.push({ p: np, k: want.k });
          if (want.r) fmtJobs.push({ para: np, want, have: undefined, colors: false, fresh: true });
          ref = np; refTable = false;
        }
        for (const i of A.slice(n)) {
          const para = items[map[i].start];
          if (map[i].start === last) { para.insertText('', 'Replace'); para.styleBuiltIn = 'Normal'; }   // Word keeps its last paragraph
          else para.delete();
        }
      }
      await ctx.sync();
      // a new paragraph written after a list item can come out as a list item: take it out of the list again
      const check = fresh.filter((f) => f.k !== 'li' && f.k !== 'ol');
      if (check.length) {
        for (const f of check) f.p.load('isListItem');
        await ctx.sync();
        let any = false;
        for (const f of check) if (f.p.isListItem) { f.p.detachFromList(); f.p.styleBuiltIn = STYLE[f.k]; any = true; }
        if (any) await ctx.sync();
      }
      // the formatting: one font for the whole paragraph, or word by word
      if (fmtJobs.length) {
        for (const j of fmtJobs) {
          const u = uniformOf(j.want);
          if (u !== undefined) applyFont(j.para.font, u, j.fresh && !u ? '' : j.have, j.colors);
          else { j.ranges = j.para.getTextRanges([' '], true); j.ranges.load('items/text'); }
        }
        await ctx.sync();
        let more = false;
        for (const j of fmtJobs) {
          if (!j.ranges) continue;
          const t = j.want.t, ws = WordSync.words(t), list = WordSync.perWord(j.want.r, ws.length), starts = [];
          let pos = 0; for (const w of ws) { starts.push(pos); pos += w.length; }
          const wordAt = (ch) => { let k = 0; while (k + 1 < starts.length && starts[k + 1] <= ch) k++; return k; };
          pos = 0;
          for (const rg of j.ranges.items) {
            const rt = WordSync.clean(rg.text).trim(); if (!rt) continue;
            const i = t.indexOf(rt, pos); if (i < 0) continue; pos = i + rt.length;
            applyFont(rg.font, list[wordAt(i)] || '', undefined, j.colors || anyOf(j.want, 'c'));
            more = true;
          }
        }
        if (more) await ctx.sync();
      }
    });
  }

  function setParas(n) { $('paras').textContent = n; $('parasW').textContent = n === 1 ? 'part' : 'parts'; }
  function nameOf(url) {
    if (!url) return 'Document (not saved yet)';
    const n = decodeURIComponent(String(url).split(/[\\/]/).pop().split('?')[0] || '');
    return n || 'Document';
  }
  function connect() {
    if (paused) return;
    show('Connecting to Cortex Scribe…', 'wait', '');
    ws = new WebSocket('wss://' + location.host + '/link');
    ws.onopen = async () => {
      retry = 0;
      try {
        const first = await readWord();
        docUrl = (Office.context.document && Office.context.document.url) || '';
        docName = nameOf(docUrl);
        client = WordSync.makeClient({
          base: first,
          read: readWord,
          write: writeWord,
          send: (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); },
          onSynced: (i) => { $('when').textContent = new Date().toLocaleTimeString(); if (i.conflicts) $('detail').textContent = 'A paragraph was changed in Word and in Cortex Scribe at the same moment. The version typed here was kept.'; },
          onError: (e) => { console.error(e); $('detail').textContent = 'Something went wrong while updating: ' + (e && e.message || e) + '. The link keeps trying.'; },
        });
        ws.send(JSON.stringify({ type: 'hello', role: 'word', name: docName, url: docUrl, doc: first, font: await readFont() }));
        setParas(first.length);
      } catch (e) { show('Couldn’t read this document', 'off', String(e && e.message || e)); }
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'doc' && client) { client.receive(m); setParas((m.doc || []).length); $('when').textContent = new Date().toLocaleTimeString(); }
      else if (m.type === 'status') { lastStatus = m; render(); }
      else if (m.type === 'error' && (m.why === 'same-doc' || m.why === 'other-word')) {
        // this document is open in another Word window too, and that window took over: stop here (no fighting back)
        takenOver = true; $('takeover').hidden = false;
        show('Linked in another Word window', 'wait', 'This document is also open in another Word window, and the link is there now. To link it here instead, press the button.');
      }
    };
    ws.onclose = () => {
      if (client) { client.stop(); client = null; }
      if (paused || takenOver) return;
      show('Cortex Scribe’s Word link isn’t running', 'off', 'Start it on this computer with  npm run word  (in the Cortex Scribe folder). This panel connects by itself.');
      setTimeout(connect, Math.min(10000, 1500 * ++retry));
    };
  }
  /* once linked, the document remembers to open this panel by itself next time (Word's AutoShowTaskpaneWithDocument;
     stored in the document when it is saved) */
  function autoOpen() {
    try {
      const st = Office.context.document.settings;
      if (!st || st.get('Office.AutoShowTaskpaneWithDocument')) return;
      st.set('Office.AutoShowTaskpaneWithDocument', true);
      st.saveAsync(() => {});
    } catch (e) { console.warn('auto open', e); }
  }
  function render() {
    const apps = (lastStatus && lastStatus.apps) || [];
    const mine = apps.filter((a) => a.key === (docUrl || docName));
    if (mine.length) autoOpen();
    if (mine.length) show('Linked with Cortex Scribe', 'on', '“' + docName + '” and the page “' + mine[0].page + '” stay the same while you write in either.');
    else show('Connected: waiting for Cortex Scribe', 'wait', 'In Cortex Scribe, open Home → Word link → Open it here. “' + docName + '” then appears as an A4 page.');
    $('pages').textContent = mine.length ? 'Open in Cortex Scribe: ' + mine.map((a) => a.page).join(', ') : '';
  }
  $('takeover').addEventListener('click', () => { takenOver = false; $('takeover').hidden = true; retry = 0; connect(); });
  $('pause').addEventListener('click', () => {
    paused = !paused;
    $('pause').textContent = paused ? 'Resume the link' : 'Pause the link';
    if (paused) { if (client) client.stop(); client = null; if (ws) ws.close(); show('Paused', 'wait', 'Changes stay on each side until you resume. Then both are merged.'); }
    else connect();
  });
  Office.onReady((info) => {
    if (info.host !== Office.HostType.Word) { show('Open this panel in Word', 'off', ''); return; }
    try { Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, () => { if (client) client.changed(350); }); } catch {}
    setInterval(() => { if (client) client.changed(0); }, 1200);    // also catches changes that don't move the cursor
    connect();
  });
})();

// A stand-in for Microsoft's Office.js running Word, for tests of the Word link panel (word-addin/taskpane.js).
// It follows the same rules as the real one where it matters: a property must be loaded and synced before it is
// read (otherwise it throws), changes happen in order at sync(), Word.run syncs at the end, a new paragraph takes the
// style and list of the one it is inserted next to (also inside a table cell), detachFromList on a paragraph that
// isn't in a list fails, and replacing the text of a paragraph with a picture deletes the picture.
// Formatting is kept letter by letter (bold, italic, underline, struck through, colour, highlight): a font read over
// mixed letters gives null (highlight: ''), replaced text takes the formatting of the first letter, typed text that of
// the letter before. Paragraphs have an alignment; table cells a shading colour; the first section a header and footer
// (paragraphs can hold PAGE / NUMPAGES fields, read through getOoxml) and a page setup (WordApiDesktop 1.3, or only the
// OOXML's w:pgSz / w:pgMar when FAKE_WORD_INIT.noDesktopApi). Page numbers are written as fields with WordApi 1.5
// (insertField), or as OOXML (insertOoxml) when FAKE_WORD_INIT.noApi15.
// The document is shown on the left of the page (for screenshots); tests change it with window.fakeWord.
(() => {
  const init = window.FAKE_WORD_INIT || {};
  let uid = 0;
  const F = ['b', 'i', 'u', 's'];
  const fmtObj = (f) => { const o = {}; for (const x of String(f || '').split(';')) { if (F.includes(x)) o[x] = true; const m = /^(c|h)=(#[0-9a-f]{6})$/i.exec(x); if (m) o[m[1]] = m[2].toLowerCase(); } return o; };
  const fmtStr = (o) => [...F.filter((k) => o[k]), o.c ? 'c=' + o.c : '', o.h ? 'h=' + o.h : ''].filter(Boolean).join(';');
  // a paragraph; table: the table's number (0 = not in a table), r / c: its cell (one paragraph per cell here)
  const mk = (p) => {
    const text = p.text || '';
    const o = { id: ++uid, text, style: p.style || 'Normal', list: p.list || null, table: p.table || 0, r: p.r || 0, c: p.c || 0, pics: p.pics || 0, font: p.font || { name: 'Aptos', size: 11 }, align: p.align || 'Left', shade: p.shade || '', fields: [] };
    o.f = Array.isArray(p.f) ? p.f.slice(0, text.length) : Array.from(text, () => p.fmt || (p.style === 'Heading1' ? 'c=#2f5496' : ''));
    while (o.f.length < text.length) o.f.push('');
    o.fields = [];
    for (const code of (p.fields || [])) { const res = fieldResult(code); o.fields.push({ a: o.text.length, len: res.length, code }); o.text += res; o.f.push(...Array.from(res, () => o.f[o.f.length - 1] || '')); }   // fields: codes added at the end
    return o;
  };
  const tableIds = () => [...new Set(D.paras.filter((p) => p.table).map((p) => p.table))];
  const rowsOf = (id) => { const rows = []; for (const p of D.paras) if (p.table === id) (rows[p.r] = rows[p.r] || [])[p.c] = p.text; return rows.map((r) => (r || []).map((x) => x || '')); };
  const cellOf = (id, r, c) => D.paras.find((q) => q.table === id && q.r === r && q.c === c);
  const S0 = { orientation: 'Portrait', pageWidth: 595.3, pageHeight: 841.9, topMargin: 70.85, rightMargin: 70.85, bottomMargin: 56.7, leftMargin: 70.85, headerDistance: 35.4, footerDistance: 35.4 };
  const D = { url: init.url || 'C:\\Users\\Kawi\\Documents\\Aufsatz.docx', paras: (init.paras || [{ text: '' }]).map(mk), head: (init.head || [{ text: '' }]).map(mk), foot: (init.foot || [{ text: '' }]).map(mk),
    setup: Object.assign({}, S0, init.setup || {}), handlers: [], errors: [], lostPictures: 0, pages: init.pages || 3, settings: {}, pendingSettings: {} };
  const listOf = (v) => (v === 'ListBullet' ? 'bullet' : v === 'ListNumber' ? 'number' : null);
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function runsHtml(p) {
    let html = '', i = 0;
    while (i < p.text.length) { let j = i; while (j < p.text.length && p.f[j] === p.f[i]) j++; const o = fmtObj(p.f[i]);
      const st = (o.b ? 'font-weight:700;' : '') + (o.i ? 'font-style:italic;' : '') + (o.u || o.s ? 'text-decoration:' + (o.u ? 'underline ' : '') + (o.s ? 'line-through' : '') + ';' : '') + (o.c ? 'color:' + o.c + ';' : '') + (o.h ? 'background:' + o.h + ';' : '');
      html += st ? '<span style="' + st + '">' + esc(p.text.slice(i, j)) + '</span>' : esc(p.text.slice(i, j)); i = j; }
    return html;
  }
  const ta = (p) => ({ Centered: 'center', Right: 'right', Justified: 'justify' }[p.align] || 'left');
  function render() {
    let box = document.getElementById('fakeWord');
    if (!box) {
      if (!document.body) return;
      box = document.createElement('div'); box.id = 'fakeWord';
      box.style.cssText = 'position:fixed;left:0;top:0;bottom:0;width:58%;overflow:auto;background:#e9e9ec;padding:24px 28px;box-sizing:border-box;font:15px/1.5 Calibri,Carlito,"Segoe UI",sans-serif;color:#111';
      document.body.prepend(box); document.body.style.marginLeft = '58%';
    }
    const land = D.setup.orientation === 'Landscape';
    let html = '<div style="font:600 12px Segoe UI,sans-serif;color:#2b579a;margin-bottom:10px">Word (stand-in) · ' + D.url.split('\\').pop() + ' · ' + (land ? 'landscape' : 'portrait') + '</div><div style="background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);padding:40px 46px;min-height:600px">';
    html += D.head.filter((p) => p.text).map((p) => '<div style="font-size:12px;color:#555;border-bottom:1px dashed #bbb;text-align:' + ta(p) + '">' + runsHtml(p) + '</div>').join('');
    let n = 0;
    for (const p of D.paras) {
      const st = p.style === 'Heading1' ? 'font-size:24px;margin:6px 0' : p.style === 'Heading2' ? 'font-size:19px;color:#2f5496' : p.style === 'Heading3' ? 'font-size:16px;color:#1f3763' : '';
      if (p.table) {
        if (D.paras[D.paras.indexOf(p) - 1] && D.paras[D.paras.indexOf(p) - 1].table === p.table) continue;
        html += '<table style="border-collapse:collapse;margin:6px 0">' + rowsOf(p.table).map((r, ri) => '<tr>' + r.map((c, ci) => '<td style="border:1px solid #888;padding:3px 8px;min-width:110px;background:' + ((cellOf(p.table, ri, ci) || {}).shade || 'none') + '">' + (esc(c) || '&nbsp;') + '</td>').join('') + '</tr>').join('') + '</table>';
        if (D.paras.some((q) => q.table === p.table && q.pics)) html += '<div style="font-size:11px;color:#2b579a">[Bild in der Tabelle]</div>';
      } else if (p.pics) html += '<div style="width:160px;height:70px;background:linear-gradient(135deg,#9ecbff,#3a7bd5);border-radius:4px;color:#fff;font-size:12px;padding:6px">[Bild] ' + esc(p.text) + '</div>';
      else html += '<p style="margin:4px 0;text-align:' + ta(p) + ';' + st + '">' + (p.list === 'bullet' ? '• ' : p.list === 'number' ? (++n) + '. ' : '') + (runsHtml(p) || '&nbsp;') + '</p>';
      if (p.list !== 'number') n = p.list ? n : 0;
    }
    html += D.foot.filter((p) => p.text).map((p) => '<div style="font-size:12px;color:#555;border-top:1px dashed #bbb;margin-top:18px;text-align:' + ta(p) + '">' + runsHtml(p) + '</div>').join('');
    box.innerHTML = html + '</div>';
  }
  const fire = () => { for (const h of D.handlers) try { h({ type: 'documentSelectionChanged' }); } catch {} };
  /* text changes keep the formatting of the letters that stay; new letters take that of the letter before */
  function setText(p, text, mode) {
    const old = p.text, of = p.f;
    if (mode === 'Replace') { const f0 = of[0] || ''; p.text = text; p.f = Array.from(text, () => f0); p.fields = []; return; }
    if (mode === 'Start') { const f0 = of[0] || ''; p.text = text + old; p.f = Array.from(text, () => f0).concat(of); p.fields.forEach((x) => { x.a += text.length; }); return; }
    if (mode === 'End') { const fl = of[of.length - 1] || ''; p.text = old + text; p.f = of.concat(Array.from(text, () => fl)); return; }
    let a = 0; while (a < old.length && a < text.length && old[a] === text[a]) a++;
    let e = 0; while (e < old.length - a && e < text.length - a && old[old.length - 1 - e] === text[text.length - 1 - e]) e++;
    const fl = a > 0 ? of[a - 1] : (of[0] || '');
    p.f = of.slice(0, a).concat(Array.from(text.slice(a, text.length - e), () => fl), of.slice(old.length - e));
    p.text = text;
  }
  const NOT_LOADED = (p) => { const e = new Error('The property ' + p + ' is not available. Load it and call context.sync() first.'); e.code = 'PropertyNotLoaded'; throw e; };
  /* a font over letters [a, b) of a paragraph (getter: the loaded values; setter: queued) */
  function fontOf(ctx, getP, a0, b0) {
    const span = () => { const p = getP(); return [a0 == null ? 0 : a0, b0 == null ? p.text.length : b0]; };
    const read = () => {
      const p = getP(), [a, b] = span(), fs = p.f.slice(a, b).map(fmtObj);
      if (!fs.length) return { bold: false, italic: false, underline: 'None', strikeThrough: false, color: '#000000', highlightColor: null, name: p.font.name, size: p.font.size };
      const all = (k) => (fs.every((o) => o[k]) ? true : fs.every((o) => !o[k]) ? false : null);
      const one = (k, none, mixed) => { const s = new Set(fs.map((o) => o[k] || '')); return s.size > 1 ? mixed : ([...s][0] ? [...s][0].toUpperCase() : none); };
      const u = all('u');
      return { bold: all('b'), italic: all('i'), underline: u == null ? null : u ? 'Single' : 'None', strikeThrough: all('s'), color: one('c', '#000000', null), highlightColor: one('h', null, ''), name: p.font.name, size: p.font.size };
    };
    const f = { _v: null, _snap() { f._v = read(); } };
    const set = (k, fn) => ctx.q.push(() => { const p = getP(), [a, b] = span(); for (let i = a; i < b; i++) { const o = fmtObj(p.f[i]); fn(o); p.f[i] = fmtStr(o); } });
    for (const [prop, k] of [['bold', 'b'], ['italic', 'i'], ['strikeThrough', 's']]) Object.defineProperty(f, prop, { get() { if (!f._v) NOT_LOADED('font/' + prop); return f._v[prop]; }, set(v) { set(prop, (o) => { o[k] = !!v; }); } });
    Object.defineProperty(f, 'underline', { get() { if (!f._v) NOT_LOADED('font/underline'); return f._v.underline; }, set(v) { set('u', (o) => { o.u = v && v !== 'None'; }); } });
    Object.defineProperty(f, 'color', { get() { if (!f._v) NOT_LOADED('font/color'); return f._v.color; }, set(v) { const c = String(v || '').toLowerCase(); set('c', (o) => { o.c = /^#[0-9a-f]{6}$/.test(c) && c !== '#000000' ? c : null; }); } });
    Object.defineProperty(f, 'highlightColor', { get() { if (!f._v) NOT_LOADED('font/highlightColor'); return f._v.highlightColor; }, set(v) { const c = String(v || '').toLowerCase(); set('h', (o) => { o.h = /^#[0-9a-f]{6}$/.test(c) ? c : null; }); } });
    for (const prop of ['name', 'size']) Object.defineProperty(f, prop, { get() { if (!f._v) NOT_LOADED('font/' + prop); return f._v[prop]; } });
    return f;
  }

  class Ctx {
    constructor() { this.q = []; this.document = { body: new Body(this, D.paras), sections: new Sections(this) }; }
    async sync() {
      await new Promise((r) => setTimeout(r, 3));
      const q = this.q.splice(0);
      for (const f of q) f();
      render();
    }
  }
  class Sections {
    constructor(ctx) { this.ctx = ctx; this._items = null; }
    getFirst() { return new Section(this.ctx); }
    load() { this.ctx.q.push(() => { this._items = [new Section(this.ctx)]; }); return this; }
    get items() { if (!this._items) NOT_LOADED('items'); return this._items; }
  }
  class Section {
    constructor(ctx) { this.ctx = ctx; }
    getHeader(type) { if (type !== 'Primary') throw new Error('only Primary here'); return new Body(this.ctx, D.head); }
    getFooter(type) { if (type !== 'Primary') throw new Error('only Primary here'); return new Body(this.ctx, D.foot); }
    get pageSetup() {
      if (init.noDesktopApi) throw new Error('pageSetup needs WordApiDesktop 1.3');
      const ctx = this.ctx, ps = { _v: null, load() { ctx.q.push(() => { ps._v = { ...D.setup }; }); return ps; } };
      for (const k of Object.keys(S0)) Object.defineProperty(ps, k, { get() { if (!ps._v) NOT_LOADED(k); return ps._v[k]; }, set(v) { ctx.q.push(() => {
        if (k === 'orientation' && v !== D.setup.orientation) { const s = D.setup; [s.pageWidth, s.pageHeight] = [s.pageHeight, s.pageWidth]; }
        D.setup[k] = v; }); } });
      return ps;
    }
  }
  const twips = (v) => Math.round(v * 20);
  function sectPr() {
    const s = D.setup;
    return '<w:sectPr><w:pgSz w:w="' + twips(s.pageWidth) + '" w:h="' + twips(s.pageHeight) + '"' + (s.orientation === 'Landscape' ? ' w:orient="landscape"' : '') + '/><w:pgMar w:top="' + twips(s.topMargin) + '" w:right="' + twips(s.rightMargin) + '" w:bottom="' + twips(s.bottomMargin) + '" w:left="' + twips(s.leftMargin) + '" w:header="' + twips(s.headerDistance) + '" w:footer="' + twips(s.footerDistance) + '" w:gutter="0"/></w:sectPr>';
  }
  function ooxmlOf(p) {         // a paragraph as a (flat) OOXML package, fields as complex fields
    let runs = '', i = 0;
    const fields = p.fields.slice().sort((x, y) => x.a - y.a);
    const r = (t) => (t ? '<w:r><w:t xml:space="preserve">' + esc(t) + '</w:t></w:r>' : '');
    for (const fl of fields) { runs += r(p.text.slice(i, fl.a)) + '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ' + fl.code + ' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + r(p.text.slice(fl.a, fl.a + fl.len)) + '<w:r><w:fldChar w:fldCharType="end"/></w:r>'; i = fl.a + fl.len; }
    runs += r(p.text.slice(i));
    return '<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage"><pkg:part pkg:name="/word/document.xml"><pkg:xmlData><w:document><w:body><w:p><w:pPr><w:pStyle w:val="' + p.style + '"/></w:pPr>' + runs + '</w:p>' + sectPr() + '</w:body></w:document></pkg:xmlData></pkg:part></pkg:package>';
  }
  function fieldResult(code) { return /^\s*NUMPAGES/i.test(code) ? String((typeof D !== 'undefined' && D.pages) || init.pages || 3) : '1'; }
  function fromOoxml(p, ox) {     // insertOoxml: only what the panel writes (text runs and fldSimple fields)
    const body = String(ox).slice(String(ox).indexOf('<w:body'));
    if (!/<w:p[\s>]/.test(body)) throw new Error('insertOoxml: no paragraph in the OOXML');
    let text = '', fields = [], m; const re = /<w:fldSimple\b[^>]*w:instr="([^"]*)"[^>]*>[\s\S]*?<\/w:fldSimple>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    while ((m = re.exec(body))) { if (m[1] != null) { const res = fieldResult(m[1]); fields.push({ a: text.length, len: res.length, code: m[1].trim().split(/\s+/)[0].toUpperCase() }); text += res; } else text += m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
    const f0 = p.f[0] || ''; p.text = text; p.f = Array.from(text, () => f0); p.fields = fields;
  }
  class Body {
    constructor(ctx, list) { this.ctx = ctx; this.list = list; }
    get paragraphs() { return new Paras(this.ctx, this.list); }
    get tables() {
      const ctx = this.ctx;
      return { _items: null, load() { ctx.q.push(() => { this._items = tableIds().map((id) => new Table(ctx, id)); }); return this; }, get items() { if (!this._items) NOT_LOADED('items'); return this._items; } };
    }
    insertParagraph(text, loc) {
      const px = new Para(this.ctx, null, this.list);
      this.ctx.q.push(() => { const np = mk({ text, style: 'Normal' }); if (loc === 'Start') this.list.unshift(np); else this.list.push(np); px.p = np; });
      return px;
    }
  }
  class Table {
    constructor(ctx, id) { this.ctx = ctx; this.id = id; this.values = rowsOf(id); this.nestingLevel = 1; this.rowCount = this.values.length; }
    getCell(r, c) {
      const ctx = this.ctx, id = this.id;
      const cell = { _v: null,
        set value(v) { ctx.q.push(() => { const p = cellOf(id, r, c); if (!p) { D.errors.push('no cell ' + r + ',' + c); return; } if (p.pics) { D.lostPictures += p.pics; p.pics = 0; } setText(p, v, 'Replace'); }); },
        set shadingColor(v) { ctx.q.push(() => { const p = cellOf(id, r, c); if (!p) { D.errors.push('no cell ' + r + ',' + c); return; } const s = String(v || '').toUpperCase(); p.shade = s === '#FFFFFF' ? '' : s; }); },
        get shadingColor() { if (!cell._v) NOT_LOADED('shadingColor'); return cell._v.shadingColor; },
        load() { ctx.q.push(() => { const p = cellOf(id, r, c); cell._v = { shadingColor: p && p.shade ? p.shade : '#FFFFFF' }; }); return cell; } };
      return cell;
    }
  }
  class Paras {
    constructor(ctx, list) { this.ctx = ctx; this.list = list; this._items = null; }
    load(props) {
      const want = String(props || '').split(',').map((s) => s.trim().replace(/^items\//, ''));
      this.ctx.q.push(() => { this._items = this.list.map((p) => { const x = new Para(this.ctx, p, this.list); x._snap(want); return x; }); });
      return this;
    }
    getFirst() { const px = new Para(this.ctx, this.list[0], this.list); return px; }
    get items() { if (!this._items) NOT_LOADED('items'); return this._items; }
  }
  class Range {    // a word (getTextRanges) of a paragraph: letters [a, b)
    constructor(ctx, para, a, b) { this.ctx = ctx; this.para = para; this.a = a; this.b = b; this._v = {}; this.font = fontOf(ctx, () => para.p, a, b); }
    _snap(props) { for (const k of props) { if (k === 'text') this._v.text = this.para.p.text.slice(this.a, this.b); else if (k.startsWith('font/')) this.font._snap(); } }
    get text() { if (!('text' in this._v)) NOT_LOADED('text'); return this._v.text; }
  }
  class Para {
    constructor(ctx, p, list) { this.ctx = ctx; this.p = p; this.list = list || D.paras; this._v = {}; this.font = fontOf(ctx, () => this.p); }
    _snap(props) {
      const p = this.p;
      for (const k of props) {
        if (k === 'text') this._v.text = p.text;
        else if (k === 'styleBuiltIn') this._v.styleBuiltIn = p.style;
        else if (k === 'style') this._v.style = p.style;
        else if (k === 'isListItem') this._v.isListItem = !!p.list;
        else if (k === 'tableNestingLevel') this._v.tableNestingLevel = p.table ? 1 : 0;
        else if (k === 'alignment') this._v.alignment = p.align;
        else if (k.startsWith('font/')) this.font._snap();
      }
    }
    load(props) { const want = String(props || '').split(',').map((s) => s.trim()); this.ctx.q.push(() => this._snap(want)); return this; }
    _get(k) { if (!(k in this._v)) NOT_LOADED(k); return this._v[k]; }
    get text() { return this._get('text'); }
    get styleBuiltIn() { return this._get('styleBuiltIn'); }
    get style() { return this._get('style'); }
    get isListItem() { return this._get('isListItem'); }
    get tableNestingLevel() { return this._get('tableNestingLevel'); }
    get alignment() { return this._get('alignment'); }
    set alignment(v) { this.ctx.q.push(() => { if (!['Left', 'Centered', 'Right', 'Justified'].includes(v)) { D.errors.push('alignment ' + v); return; } this.p.align = v; }); }
    set styleBuiltIn(v) { this.ctx.q.push(() => { this.p.style = v; const l = listOf(v); if (l) this.p.list = l; }); }
    get inlinePictures() {
      const ctx = this.ctx, self = this;
      return { _items: null, load() { ctx.q.push(() => { this._items = Array.from({ length: self.p.pics }, () => ({})); }); return this; }, get items() { if (!this._items) NOT_LOADED('items'); return this._items; } };
    }
    get listItemOrNullObject() {
      const ctx = this.ctx, self = this;
      return { _v: null, load() { ctx.q.push(() => { const p = self.p; let n = 0; for (const q of D.paras) { if (q.list === 'number') n++; else n = 0; if (q === p) break; } this._v = { isNullObject: !p.list, listString: p.list === 'number' ? n + '.' : '•' }; }); return this; },
        get isNullObject() { if (!this._v) NOT_LOADED('isNullObject'); return this._v.isNullObject; }, get listString() { if (!this._v) NOT_LOADED('listString'); return this._v.listString; } };
    }
    getTextRanges(marks, trim) {
      const ctx = this.ctx, self = this;
      const col = { _items: null, load(props) {
        const want = String(props || '').split(',').map((s) => s.trim().replace(/^items\//, ''));
        ctx.q.push(() => {
          const t = self.p.text, out = []; let a = 0;
          for (let i = 0; i <= t.length; i++) if (i === t.length || marks.includes(t[i])) {
            let x = a, y = Math.min(t.length, i + 1);
            if (trim) { while (x < y && /\s/.test(t[x])) x++; while (y > x && /\s/.test(t[y - 1])) y--; }   // trimSpacing: without the spaces around the word
            if (y > x) out.push(new Range(ctx, self, x, y)); a = Math.min(t.length, i + 1);
          }
          col._items = out; for (const r of out) r._snap(want);
        }); return col; },
        get items() { if (!col._items) NOT_LOADED('items'); return col._items; } };
      return col;
    }
    getOoxml() { const ctx = this.ctx, self = this, r = { _v: null, get value() { if (r._v == null) NOT_LOADED('value'); return r._v; } }; ctx.q.push(() => { r._v = ooxmlOf(self.p); }); return r; }
    insertOoxml(ox, loc) { this.ctx.q.push(() => { if (loc !== 'Replace') { D.errors.push('insertOoxml ' + loc); return; } fromOoxml(this.p, ox); }); }
    getRange(where) {
      const ctx = this.ctx, self = this;
      return { insertField(loc, type) {
        if (init.noApi15) throw new Error('insertField needs WordApi 1.5');
        ctx.q.push(() => { if (where !== 'End') { D.errors.push('insertField at ' + where); return; } const code = type === 'Page' ? 'PAGE' : type === 'NumPages' ? 'NUMPAGES' : String(type).toUpperCase(); const res = fieldResult(code), p = self.p; p.fields.push({ a: p.text.length, len: res.length, code }); setText(p, res, 'End'); });
      } };
    }
    get parentTable() {
      const ctx = this.ctx, self = this;
      return { insertParagraph(text, loc) {
        const px = new Para(ctx, null, D.paras);
        ctx.q.push(() => { const ps = D.paras; let i = ps.indexOf(self.p); if (loc === 'After') { while (i + 1 < ps.length && ps[i + 1].table) i++; } else { while (i > 0 && ps[i - 1].table) i--; i--; } const np = mk({ text, style: 'Normal' }); ps.splice(i + 1, 0, np); px.p = np; });
        return px;
      } };
    }
    insertText(text, loc) {
      this.ctx.q.push(() => {
        if (loc === 'Replace' && this.p.pics) { D.lostPictures += this.p.pics; this.p.pics = 0; }   // like Word: replacing everything removes the picture
        setText(this.p, text, loc === 'Start' || loc === 'End' ? loc : 'Replace');
      });
    }
    insertParagraph(text, loc) {
      const px = new Para(this.ctx, null, this.list);
      this.ctx.q.push(() => { const ps = this.list, i = ps.indexOf(this.p); const np = mk({ text, style: this.p.style, list: this.p.list, table: this.p.table }); np.align = this.p.align; ps.splice(loc === 'Before' ? i : i + 1, 0, np); px.p = np; });
      return px;
    }
    detachFromList() { this.ctx.q.push(() => { if (!this.p.list) { const e = new Error('detachFromList: this paragraph is not in a list'); D.errors.push(e.message); throw e; } this.p.list = null; if (/^List/.test(this.p.style)) this.p.style = 'Normal'; }); }
    delete() { this.ctx.q.push(() => { const ps = this.list, i = ps.indexOf(this.p); if (ps.length === 1) { D.errors.push('tried to delete the last paragraph'); this.p.text = ''; this.p.f = []; return; } if (i >= 0) ps.splice(i, 1); }); }
  }

  window.Office = {
    HostType: { Word: 'Word' },
    EventType: { DocumentSelectionChanged: 'documentSelectionChanged' },
    onReady(cb) { const info = { host: 'Word', platform: 'PC' }; setTimeout(() => { render(); if (cb) cb(info); }, 20); return Promise.resolve(info); },
    context: {
      document: { get url() { return D.url; }, addHandlerAsync(type, h, cb) { D.handlers.push(h); if (cb) cb({ status: 'succeeded' }); },
        settings: { get: (k) => (D.settings[k] === undefined ? null : D.settings[k]), set: (k, v) => { D.pendingSettings[k] = v; }, saveAsync: (cb) => { Object.assign(D.settings, D.pendingSettings); D.pendingSettings = {}; if (cb) cb({ status: 'succeeded' }); } } },
      requirements: { isSetSupported(set, v) { if (set === 'WordApiDesktop') return !init.noDesktopApi && +v <= 1.3; if (set === 'WordApi') return +v <= (init.noApi15 ? 1.4 : 1.5); return false; } },
    },
  };
  window.Word = { run: async (fn) => { const ctx = new Ctx(); const r = await fn(ctx); await ctx.sync(); return r; } };
  // for tests: change the document like a person working in Word
  const pick = (part) => (part === 'head' ? D.head : part === 'foot' ? D.foot : D.paras);
  window.fakeWord = {
    list: () => D.paras.map((p) => ({ text: p.text, style: p.style, list: p.list, table: p.table, pics: p.pics, align: p.align })),
    type(i, text) { setText(D.paras[i], text); render(); fire(); },
    insert(i, text, style) { D.paras.splice(i, 0, mk({ text, style: style || 'Normal', list: listOf(style) })); render(); fire(); },
    remove(i) { D.paras.splice(i, 1); render(); fire(); },
    cell(table, r, c, text) { setText(cellOf(table, r, c), text); render(); fire(); },
    addRow(table, cells) { const ps = D.paras.filter((q) => q.table === table); const last = ps[ps.length - 1]; const r = last.r + 1; D.paras.splice(D.paras.indexOf(last) + 1, 0, ...cells.map((t, c) => mk({ text: t, table, r, c }))); render(); fire(); },
    rows: (table) => rowsOf(table),
    setStyle(i, style) { D.paras[i].style = style; D.paras[i].list = listOf(style); render(); fire(); },
    // formatting: fmt of the letters [a, b) of paragraph i (part 'head' / 'foot' for the header and footer)
    format(i, a, b, fmt, part) { const p = pick(part)[i]; for (let k = a; k < b && k < p.text.length; k++) p.f[k] = fmt; render(); fire(); },
    fmt(i, part) { const p = pick(part)[i]; const out = []; let k = 0; while (k < p.text.length) { let j = k; while (j < p.text.length && p.f[j] === p.f[k]) j++; if (p.f[k]) out.push(p.text.slice(k, j).trim() + ':' + p.f[k]); k = j; } return out.join(' | '); },
    align(i, v, part) { pick(part)[i].align = v; render(); fire(); },
    shade(table, r, c, col) { cellOf(table, r, c).shade = col; render(); fire(); },
    shades: (table) => rowsOf(table).map((r, ri) => r.map((_, ci) => (cellOf(table, ri, ci) || {}).shade || '')),
    // the header and footer: [{ text, fields: ['PAGE' at the end …] }]
    part: (part) => pick(part).map((p) => ({ text: p.text, align: p.align, fields: p.fields.map((x) => x.code), fmt: [...new Set(p.f)].join('|') })),
    setPart(part, paras) { const L = pick(part); L.length = 0; for (const x of paras) L.push(mk(x)); render(); fire(); },
    get setup() { return { ...D.setup }; },
    setSetup(o) { Object.assign(D.setup, o); render(); fire(); },
    get settings() { return { ...D.settings }; },
    get errors() { return D.errors.slice(); },
    get lostPictures() { return D.lostPictures; },
  };
})();

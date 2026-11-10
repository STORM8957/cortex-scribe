
/* ================= sanitizing rich text ================= */
const BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'TABLE', 'PRE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
const ALLOWED = new Set(['P', 'BR', 'H1', 'H2', 'H3', 'H4', 'B', 'I', 'U', 'S', 'SUB', 'SUP', 'MARK', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'A', 'SPAN', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'PRE', 'CODE']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO', 'CANVAS', 'HEAD', 'TITLE', 'BASE']);
const okSrc = (s) => /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(s || '') || /^(https?:\/\/[^\s"'<>]+)?\/_blob\/[^\s"'<>]+$/i.test(s || '') || /^blob:[^\s"'<>]+$/i.test(s || '');
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i;
const STYLE_OK = {
  color: (v) => COLOR_RE.test(v),
  'background-color': (v) => COLOR_RE.test(v),
  'font-size': (v) => /^\d{1,3}(\.\d+)?(px|pt|em|rem|%)$/.test(v) || /^(x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/.test(v),
  'font-family': (v) => /^[\w\s,"'-]{1,120}$/.test(v),
  'font-weight': (v) => /^(bold|normal|bolder|[1-9]00)$/.test(v),
  'font-style': (v) => /^(italic|normal)$/.test(v),
  'text-decoration-line': (v) => /^(underline|line-through|none)( (underline|line-through))?$/.test(v),
  'vertical-align': (v) => /^(sub|super)$/.test(v),
};
const BLOCK_STYLE_OK = {
  'text-align': (v) => /^(left|right|center|justify|start|end)$/.test(v),
  'line-height': (v) => /^(\d(\.\d+)?|\d{1,3}(px|%))$/.test(v),
  'margin-left': (v) => /^\d{1,3}px$/.test(v) && parseInt(v, 10) <= 400,
};
function filterStyle(el, table) {
  const out = [];
  for (const [p, ok] of Object.entries(table)) {
    let v = el.style.getPropertyValue(p);
    if (!v && p === 'text-decoration-line') v = el.style.getPropertyValue('text-decoration');
    v = (v || '').trim();
    if (v && ok(v)) out.push(p + ':' + v);
  }
  return out.join(';');
}
function unwrap(el) { const p = el.parentNode; if (!p) return; while (el.firstChild) p.insertBefore(el.firstChild, el); p.removeChild(el); }
function renameEl(el, tag) { const n = el.ownerDocument.createElement(tag); for (const a of [...el.attributes]) { try { n.setAttribute(a.name, a.value); } catch {} } while (el.firstChild) n.appendChild(el.firstChild); el.replaceWith(n); return n; }
const FONT_SIZES = { 1: '10px', 2: '13px', 3: '16px', 4: '18px', 5: '24px', 6: '32px', 7: '48px' };
function cleanTree(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) continue;
    if (child.nodeType !== 1) { child.remove(); continue; }
    let el = child;
    const tag = el.tagName;
    if (DROP.has(tag)) { el.remove(); continue; }
    if (tag === 'FONT') {
      const sp = el.ownerDocument.createElement('span');
      if (el.getAttribute('color')) sp.style.color = el.getAttribute('color');
      if (el.getAttribute('face')) sp.style.fontFamily = el.getAttribute('face');
      if (el.getAttribute('size') && FONT_SIZES[el.getAttribute('size')]) sp.style.fontSize = FONT_SIZES[el.getAttribute('size')];
      if (el.getAttribute('style')) sp.setAttribute('style', sp.getAttribute('style') + ';' + el.getAttribute('style'));
      while (el.firstChild) sp.appendChild(el.firstChild);
      el.replaceWith(sp); el = sp;
    }
    cleanTree(el);
    const t0 = el.tagName;
    let t = t0;
    if (t === 'H5' || t === 'H6') t = 'H4';
    else if (t === 'DIV' || t === 'SECTION' || t === 'ARTICLE' || t === 'HEADER' || t === 'FOOTER') t = [...el.children].some((c) => BLOCKS.has(c.tagName)) ? '' : 'P';
    else if (t === 'STRONG') t = 'B';
    else if (t === 'EM') t = 'I';
    else if (t === 'STRIKE' || t === 'DEL') t = 'S';
    else if (t === 'INS') t = 'U';
    if (!t || !ALLOWED.has(t)) { unwrap(el); continue; }
    if (t !== t0) el = renameEl(el, t);
    const keep = {};
    if (t === 'A') {
      if (!el.classList.contains('xlink')) { unwrap(el); continue; }
      keep.class = el.classList.contains('pending') ? 'xlink pending' : 'xlink';
      for (const a of ['data-xid', 'data-target', 'data-atarget']) if (el.hasAttribute(a)) keep[a] = el.getAttribute(a).slice(0, 80);
    } else if (t === 'SPAN') {
      const st = filterStyle(el, STYLE_OK);
      const anc = el.getAttribute('data-anchor');
      const jt = el.classList.contains('jtag') && /^[^"'<>\\`]{1,40}$/.test(el.getAttribute('data-tag') || '') ? el.getAttribute('data-tag') : null;
      const tb = el.classList.contains('tab') && el.textContent.includes('\t');
      const pg = el.classList.contains('pgf') && /^(page|pages)$/.test(el.getAttribute('data-f') || '');   // a page number in a header or footer (51_pagesetup.js)
      if (!st && !anc && !jt && !tb && !pg) { unwrap(el); continue; }
      if (tb) keep.class = 'tab';
      if (pg) { keep.class = 'pgf'; keep['data-f'] = el.getAttribute('data-f'); keep.contenteditable = 'false'; }
      if (st) keep.style = st;
      if (anc) { keep.class = 'anchor'; keep['data-anchor'] = anc.slice(0, 80); }
      if (jt) { keep.class = 'jtag'; keep['data-tag'] = jt; const tid = el.getAttribute('data-tid') || ''; if (/^[a-z0-9_-]{1,40}$/i.test(tid)) keep['data-tid'] = tid; }
    } else if (t === 'IMG') {
      const src = el.getAttribute('src');
      if (!okSrc(src) || /^blob:/.test(src)) { el.remove(); continue; }
      keep.src = src; keep.alt = (el.getAttribute('alt') || 'Picture').slice(0, 200);
      if (el.hasAttribute('data-anchor')) keep['data-anchor'] = el.getAttribute('data-anchor').slice(0, 80);
    } else if (t === 'UL') {
      if (el.classList.contains('check')) keep.class = 'check';
    }
    if (BLOCKS.has(t) && /^[a-z0-9_-]{1,40}@\d{1,9}$/i.test(el.getAttribute('data-at') || '')) keep['data-at'] = el.getAttribute('data-at');
    if (t === 'LI') {
      if (el.getAttribute('data-checked') === 'true') keep['data-checked'] = 'true';
      const st = filterStyle(el, BLOCK_STYLE_OK); if (st) keep.style = st;
    } else if (t === 'TD' || t === 'TH') {
      if (el.closest('table.wtable')) keep.contenteditable = 'true';   // a cell of a Word table (49_wordlink.js)
      for (const a of ['colspan', 'rowspan']) { const v = parseInt(el.getAttribute(a), 10); if (v > 1 && v < 50) keep[a] = String(v); }
      const st = filterStyle(el, { 'text-align': BLOCK_STYLE_OK['text-align'], 'background-color': STYLE_OK['background-color'] }); if (st) keep.style = st;
    } else if (t === 'P' || t === 'H1' || t === 'H2' || t === 'H3' || t === 'H4' || t === 'BLOCKQUOTE' || t === 'PRE') {
      const st = filterStyle(el, BLOCK_STYLE_OK); if (st) keep.style = st;
    } else if (t === 'B' || t === 'I' || t === 'U' || t === 'S' || t === 'MARK' || t === 'SUB' || t === 'SUP') {
      const st = filterStyle(el, { color: STYLE_OK.color, 'background-color': STYLE_OK['background-color'] }); if (st) keep.style = st;
    }
    if (t === 'TABLE' && el.classList.contains('wtable')) { keep.class = 'wtable'; keep.contenteditable = 'false'; }
    if (t === 'P' && /^(picture|table|other)$/.test(el.getAttribute('data-wlock') || '')) {   // a box for a Word picture or table (49_wordlink.js)
      keep.class = 'wlock'; keep['data-wlock'] = el.getAttribute('data-wlock'); keep['data-wt'] = (el.getAttribute('data-wt') || '').slice(0, 20000); keep.contenteditable = 'false';
    }
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    for (const [k, v] of Object.entries(keep)) el.setAttribute(k, v);
  }
}
function sanitize(html, inline) {
  const d = parse(html);
  cleanTree(d.body);
  if (!inline) {
    const body = d.body; let p = null;
    for (const c of [...body.childNodes]) {
      const isInline = c.nodeType === 3 ? c.data.trim() !== '' || (p && c.data) : (c.nodeType === 1 && !BLOCKS.has(c.tagName));
      if (isInline) { if (!p) { p = d.createElement('p'); c.before(p); } p.append(c); }
      else { if (c.nodeType === 3) c.remove(); p = null; }
    }
  }
  return d.body.innerHTML;
}
function htmlToText(root) {
  let out = '';
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { out += c.data; continue; }
      if (c.nodeType !== 1) continue;
      const t = c.tagName;
      if (t === 'BR') out += '\n';
      else if (/^H[1-4]$/.test(t)) { out += '\n' + '#'.repeat(+t[1]) + ' '; walk(c); out += '\n'; }
      else if (t === 'LI') { out += '\n- ' + (c.getAttribute('data-checked') === 'true' ? '[x] ' : ''); walk(c); }
      else if (t === 'TR') { out += '\n| '; for (const td of c.children) { walk(td); out += ' | '; } }
      else if (t === 'P' || t === 'BLOCKQUOTE' || t === 'UL' || t === 'OL' || t === 'PRE' || t === 'TABLE') { out += '\n'; walk(c); out += '\n'; }
      else if (t === 'MARK' || t === 'B') { out += '**'; walk(c); out += '**'; }
      else walk(c);
    }
  };
  walk(root);
  return out.replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
const htmlStrToText = (html) => htmlToText(parse(html).body);

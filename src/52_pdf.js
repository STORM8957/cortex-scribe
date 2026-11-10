/* ================= PDF export: the open page as a PDF file =================
   Each A4 sheet becomes a PDF page of its own size (the page setup: A3, A5, Letter, sideways, one turned page), with
   the text, the header and footer, boxes, pictures, charts and drawings as they look on screen, on white paper (a page
   colour you chose stays). The page is drawn as a picture, so the text in the PDF can't be selected or searched.
   Endless pages are cut into A4-sized pages; a board becomes one page with everything on it.
   Drawing: the browser draws a copy of the page (SVG foreignObject → canvas); where the browser refuses (Safari), the
   html2canvas library does it. The PDF itself is written here (JPEG pictures, one per page): no PDF library needed.
   Saved through Downloads (Claude's downloads, the desktop app's Save dialog, or the browser's download). */
let pdfBusy = false;
async function exportPdf(id) {
  if (pdfBusy) return;
  if (id && (!cur || cur.id !== id)) await openNote(id);
  if (!cur || cur.loading || !doc || !view) return toast('Open a page first.');
  pdfBusy = true;
  const node = tree.nodes[cur.id] || {};
  toast('Making the PDF…');
  try {
    if (typeof hfStop === 'function') hfStop();
    if (typeof exitEdit === 'function' && editing) exitEdit();
    const shots = await pdfShots();
    if (!shots.length) { toast('There is nothing on this page to put in a PDF.'); return; }
    const blob = pdfFromJpegs(shots, node.name || 'Page');
    const name = String(node.name || 'Page').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Page';
    await Downloads.save(name + '.pdf', blob);
    toast('PDF saved: “' + name + '.pdf” (' + shots.length + (shots.length === 1 ? ' page' : ' pages') + ').');
  } catch (e) {
    if (e && e.code === 'declined') toast('Not saved.');
    else { console.error('PDF', e); toast('The PDF couldn’t be made: ' + ((e && e.message) || e)); }
  } finally { pdfBusy = false; }
}

/* ---- the pages as pictures: [{ jpeg: Uint8Array, w, h (page size in px at 96 per inch), iw, ih (picture size) }] ---- */
const PDF_SCALE = 2;
async function pdfShots() {
  const out = [];
  if (view.kind === 'a4') {
    for (const s of view.surfaces) if (s) out.push(await pdfShot(s.el, s.el.offsetWidth, s.el.offsetHeight));
  } else if (view.kind === 'endless') {
    const s = view.surfaces[0]; if (!s) return out;
    const w = s.el.offsetWidth, full = s.el.offsetHeight, ph = Math.round(w * 1123 / 794);
    const big = await pdfCanvas(s.el, w, full);
    for (let y = 0; y < full; y += ph) {
      const hh = Math.min(ph, full - y);
      if (hh < 40 && y > 0) break;                   // a sliver at the end
      const c = document.createElement('canvas'); c.width = w * PDF_SCALE; c.height = ph * PDF_SCALE;
      const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(big, 0, y * PDF_SCALE, big.width, hh * PDF_SCALE, 0, 0, big.width, hh * PDF_SCALE);
      out.push(await pdfJpeg(c, w, ph));
    }
  } else {
    const b = contentBox(), el = view.boardEl; if (!b || !el) return out;
    const pad = 40, w = Math.ceil(b.w + pad * 2), hh = Math.ceil(b.h + pad * 2);
    out.push(await pdfShot(el, w, hh, (clone) => {     // the whole board, from its top left corner
      const world = clone.querySelector('.world');
      if (world) { world.style.transform = 'translate(' + (pad - b.x) + 'px,' + (pad - b.y) + 'px) scale(1)'; world.style.transformOrigin = '0 0'; }
      clone.style.position = 'relative'; clone.style.inset = 'auto';
      clone.querySelectorAll('.zoombox,.board-hint,.zoomscale,.inkcap').forEach((x) => x.remove());
    }));
  }
  return out;
}
async function pdfShot(el, w, hh, fix) { return pdfJpeg(await pdfCanvas(el, w, hh, fix), w, hh); }
async function pdfJpeg(c, w, hh) {
  const blob = await new Promise((res, rej) => { try { c.toBlob((b) => (b ? res(b) : rej(new Error('no picture'))), 'image/jpeg', 0.9); } catch (e) { rej(e); } });
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), w, h: hh, iw: c.width, ih: c.height };
}
/* a copy of the element, ready to draw: white paper and dark ink (the light colours), no selection, handles,
   page tools or editing marks; pictures, canvases and videos as pictures inside it */
async function pdfClone(el, w, hh, fix) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.layer.sel,.page-tools,.page-no,.inkcap,.hnd,.pg-hf.empty,.pg-hf-tag,.ghost-caret,.zoombox,.objbar').forEach((x) => x.remove());
  clone.querySelectorAll('[contenteditable]').forEach((x) => x.removeAttribute('contenteditable'));
  clone.querySelectorAll('.pg-hf.editing,.sel,.selected,.editing').forEach((x) => x.classList.remove('editing', 'selected'));
  Object.assign(clone.style, { width: w + 'px', height: hh + 'px', margin: '0', boxShadow: 'none', borderRadius: '0', border: '0', zoom: '1' });
  // canvases (charts, 3D, calculators) and videos: what they show now, as a picture
  const live = [...el.querySelectorAll('canvas,video')], copies = [...clone.querySelectorAll('canvas,video')];
  live.forEach((src, i) => {
    const dst = copies[i]; if (!dst) return;
    let url = '';
    try {
      if (src.tagName === 'CANVAS') url = src.toDataURL('image/png');
      else if (src.videoWidth) { const c = document.createElement('canvas'); c.width = src.videoWidth; c.height = src.videoHeight; c.getContext('2d').drawImage(src, 0, 0); url = c.toDataURL('image/jpeg', 0.85); }
    } catch {}
    const img = document.createElement('img');
    if (url) img.src = url;
    img.style.cssText = (dst.getAttribute('style') || '') + ';width:' + (src.clientWidth || src.width) + 'px;height:' + (src.clientHeight || src.height) + 'px;object-fit:contain';
    img.className = dst.className;
    dst.replaceWith(img);
  });
  // pictures from elsewhere (Claude's files, this computer) go inside, so the drawing can show them
  await Promise.all([...clone.querySelectorAll('img')].map(async (img) => {
    const s = img.getAttribute('src') || '';
    if (!s || s.startsWith('data:')) return;
    try {
      const url = /^(inkf:|idb:)/.test(s) ? await Files.url(s) : s;
      const b = await (await fetch(url)).blob();
      img.setAttribute('src', await toDataURL(b));
    } catch { img.removeAttribute('src'); }
  }));
  if (fix) fix(clone);
  return clone;
}
/* the custom colours (--ink, --sheet …) as they are in the light colours, so every PDF is on white paper */
let pdfVarsCache = null;
function pdfLightVars() {
  if (pdfVarsCache) return pdfVarsCache;
  const names = new Set();
  for (const st of document.querySelectorAll('style')) for (const m of st.textContent.matchAll(/(--[\w-]+)\s*:/g)) names.add(m[1]);
  const probe = document.createElement('div'); probe.style.display = 'none';
  const root = document.documentElement, had = root.getAttribute('data-theme');
  root.setAttribute('data-theme', 'light'); document.body.append(probe);
  const cs = getComputedStyle(root), out = [];
  for (const n of names) { const v = cs.getPropertyValue(n).trim(); if (v) out.push(n + ':' + v); }
  probe.remove();
  if (had == null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', had);
  pdfVarsCache = out.join(';');
  return pdfVarsCache;
}
function pdfCss() {
  return [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n')
    .replace(/:root/g, '.pdfroot')
    + '\n.pdfroot{background:#ffffff;color:var(--ink)}\n.pdfroot .sheet{position:relative;box-shadow:none}\n.pdfroot .flow{outline:none}';
}
async function pdfCanvas(el, w, hh, fix) {
  const clone = await pdfClone(el, w, hh, fix);
  const c = document.createElement('canvas'); c.width = Math.round(w * PDF_SCALE); c.height = Math.round(hh * PDF_SCALE);
  const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  try {
    const wrap = document.createElement('div');
    wrap.setAttribute('class', 'pdfroot'); wrap.setAttribute('data-theme', 'light');
    wrap.setAttribute('style', pdfLightVars() + ';width:' + w + 'px;height:' + hh + 'px;font:15px/1.5 var(--ff)');
    const st = document.createElement('style'); st.textContent = pdfCss();
    wrap.append(st, clone);
    const xml = new XMLSerializer().serializeToString(wrap);
    const svgText = '<svg xmlns="http://www.w3.org/2000/svg" width="' + c.width + '" height="' + c.height + '" viewBox="0 0 ' + w + ' ' + hh + '"><foreignObject x="0" y="0" width="' + w + '" height="' + hh + '">' + xml + '</foreignObject></svg>';
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);   // a data: address (a blob: one counts as foreign in a file opened in the browser)
    await img.decode();
    x.drawImage(img, 0, 0, c.width, c.height);
    c.toDataURL('image/png').slice(0, 1);          // throws where the browser doesn't allow reading it back (Safari)
    return c;
  } catch (e) {
    console.warn('PDF: the browser’s own drawing didn’t work, using html2canvas', e);
    if (!(await loadLib('h2c')) || !window.html2canvas) throw new Error('this browser can’t draw the page');
    const holder = document.createElement('div');
    holder.className = 'pdfroot'; holder.setAttribute('data-theme', 'light');
    holder.setAttribute('style', pdfLightVars() + ';position:fixed;left:-20000px;top:0;width:' + w + 'px;height:' + hh + 'px;background:#fff');
    holder.append(clone); document.body.append(holder);
    try { return await window.html2canvas(clone, { scale: PDF_SCALE, backgroundColor: '#ffffff', logging: false, useCORS: true, width: w, height: hh }); }
    finally { holder.remove(); }
  }
}

/* ---- a PDF file from JPEG pictures, one per page (page size in px at 96 per inch → points) ---- */
function pdfFromJpegs(pages, title) {
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const pt = (v) => (Math.round(v * 0.75 * 100) / 100).toString();
  const obj = (n, body, stream) => {
    offs[n] = len; add(n + ' 0 obj\n'); add(body);
    if (stream) { add('\nstream\n'); add(stream); add('\nendstream'); }
    add('\nendobj\n');
  };
  const esc = (s) => String(s).replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, (c) => '\\' + c).slice(0, 120);
  add('%PDF-1.4\n%\xff\xff\xff\xff\n');
  const n = pages.length, kids = [];
  for (let i = 0; i < n; i++) kids.push((4 + i * 3) + ' 0 R');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
  obj(3, '<< /Title (' + esc(title) + ') /Producer (Cortex Scribe) /CreationDate (D:' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z) >>');
  pages.forEach((p, i) => {
    const po = 4 + i * 3, co = po + 1, io = po + 2, W = pt(p.w), H = pt(p.h);
    const content = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im0 Do Q';
    obj(po, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 ' + io + ' 0 R >> >> /Contents ' + co + ' 0 R >>');
    obj(co, '<< /Length ' + enc.encode(content).length + ' >>', content);
    obj(io, '<< /Type /XObject /Subtype /Image /Width ' + p.iw + ' /Height ' + p.ih + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>', p.jpeg);
  });
  const count = 3 + n * 3, xref = len;
  let x = 'xref\n0 ' + (count + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i <= count; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  add(x + 'trailer\n<< /Size ' + (count + 1) + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  return new Blob(parts, { type: 'application/pdf' });
}

/* the PDF button in the top bar, next to Share */
const pdfBtn = h('button', { class: 'btn ghost small pdf-btn', id: 'pdfBtn', hidden: true, title: 'Download this page as a PDF', 'aria-label': 'Download this page as a PDF', onclick: () => exportPdf() }, svg('download'), h('span', null, 'PDF'));
$('#shareBtn').before(pdfBtn);

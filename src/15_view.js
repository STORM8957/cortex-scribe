
/* ================= view: A4 pages, endless page, board ================= */
let view = null;
let tool = 'text';
let spaceDown = false;
let activeEd = null;   // the editable that last had focus (page text, box text, mind-map node)
let savedRange = null;
const work = $('#work');
const sel = { surf: null, ids: new Set(), ink: new Set(), get has() { return this.ids.size > 0 || this.ink.size > 0; } };

class Surface {
  constructor(v, el, sheet, L) { this.view = v; this.el = el; this.sheet = sheet; this.L = L; this.objEls = new Map(); this.inkEls = new Map(); }
  get board() { return this.view.kind === 'board'; }
  match(o) { return !o.pin && (this.view.kind !== 'a4' || (o.sh || 0) === this.sheet); }
  k() { if (this.board) return this.view.zoom; const r = this.el.getBoundingClientRect(); return r.width / (this.el.offsetWidth || 1) || 1; }
  toLocal(cx, cy) {
    const r = this.el.getBoundingClientRect();
    if (this.board) return { x: (cx - r.left - this.view.pan.x) / this.view.zoom, y: (cy - r.top - this.view.pan.y) / this.view.zoom };
    const k = (this.el.offsetWidth || 1) / (r.width || 1);
    return { x: (cx - r.left) * k, y: (cy - r.top) * k };
  }
  toClient(x, y) {
    const r = this.el.getBoundingClientRect();
    if (this.board) return { x: r.left + this.view.pan.x + x * this.view.zoom, y: r.top + this.view.pan.y + y * this.view.zoom };
    const k = r.width / (this.el.offsetWidth || 1);
    return { x: r.left + x * k, y: r.top + y * k };
  }
  parentFor(o) {
    if (this.board) return o.t === 'frame' ? this.L.frames : this.L.front;
    return o.lay === 'back' ? this.L.back : this.L.front;
  }
  renderObjects(force) {
    const seen = new Set(), groups = [];
    for (const o of Object.values(doc.objs)) {
      if (!o || o.del || o.t === 'conn' || !OBJ[o.t] || !this.match(o)) continue;
      if (o.t === 'group') { groups.push(o); continue; }
      seen.add(o.id); this.renderObj(o, force);
    }
    for (const g of groups) if (fitGroup(g)) { seen.add(g.id); this.renderObj(g, force); }
    for (const [id, el] of this.objEls) if (!seen.has(id)) { el.remove(); this.objEls.delete(id); }
  }
  renderObj(o, force) {
    const T = OBJ[o.t]; if (!T) return;
    let el = this.objEls.get(o.id);
    if (!el || el.dataset.t !== o.t) {
      if (el) el.remove();
      el = T.create(o, this); el.classList.add('obj', 'obj-' + o.t); el.dataset.id = o.id; el.dataset.t = o.t; el._u = -1;
      this.objEls.set(o.id, el);
    }
    const par = this.parentFor(o); if (el.parentNode !== par) par.append(el);
    if (force || el._u !== o.u) { if (!el.classList.contains('editing')) T.update(el, o, this); tagBadge(el, o); el._u = o.u; }
    this.place(el, o);
  }
  place(el, o) {
    const sc = o.sc && o.sc !== 1 ? o.sc : 1;
    if (o.t !== 'mm') { el.style.width = o.w ? (o.w / sc) + 'px' : ''; el.style.height = (o.ah || !o.h) ? '' : (o.h / sc) + 'px'; }
    if (o.ah) { const hh = el.offsetHeight; if (hh && Math.abs(hh * sc - (o.h || 0)) > 0.5) o.h = hh * sc; }
    const ew = (o.w || 0) / sc, eh = (o.h || 0) / sc;
    el.style.left = (o.x + ((o.w || 0) - ew) / 2) + 'px'; el.style.top = (o.y + ((o.h || 0) - eh) / 2) + 'px';
    el.style.transform = (o.r ? 'rotate(' + o.r + 'deg)' : '') + (sc !== 1 ? ' scale(' + sc + ')' : '');
    el.style.zIndex = String(o.z || 1);
    el.classList.toggle('fixedh', !o.ah);
  }
  renderInk(force) {
    const seen = new Set(), g = this.L.ink;
    for (const s of Object.values(doc.ink)) {
      if (!s || s.del || !this.match(s)) continue;
      seen.add(s.id);
      let p = this.inkEls.get(s.id);
      if (!p) { p = sv('path'); p.dataset.id = s.id; p._u = -1; g.append(p); this.inkEls.set(s.id, p); }
      if (force || p._u !== s.u) { drawStrokeEl(p, s); p._u = s.u; }
    }
    for (const [id, p] of this.inkEls) if (!seen.has(id)) { p.remove(); this.inkEls.delete(id); }
  }
  renderAll(force) { this.renderObjects(force); this.renderInk(force); renderConns(this); renderSel(this); }
}

class PinSurface extends Surface {
  get board() { return false; }
  match(o) { return !!o.pin; }
  k() { return 1; }
  toLocal(cx, cy) { const r = this.el.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; }
  toClient(x, y) { const r = this.el.getBoundingClientRect(); return { x: r.left + x, y: r.top + y }; }
  parentFor() { return this.L.front; }
  renderInk() {}
}
function makePinSurface(v) {
  work.querySelectorAll('.pinlayer').forEach((e) => e.remove());
  const el = h('div', { class: 'pinlayer' });
  const conns = sv('svg', { class: 'connsvg' }), connsL = h('div', { class: 'layer conns' }); connsL.append(conns);
  const back = h('div', { class: 'layer back' }), front = h('div', { class: 'layer front' }), others = h('div', { class: 'layer others' }), selL = h('div', { class: 'layer sel' });
  el.append(back, connsL, front, others, selL);
  work.append(el);
  const s = new PinSurface(v, el, -1, { back, front, conns, ink: sv('svg'), cap: h('div'), others, sel: selL, frames: front });
  wireSurface(s);
  return s;
}
class View {
  constructor(kind) {
    this.kind = kind; this.surfaces = []; this.pan = { x: 0, y: 0 }; this.zoom = 1; this.queued = false;
    const saved = prefs.get('pz:' + kind, null);
    this.pz = saved != null ? saved : kind === 'a4' ? clamp(Math.floor(((work.clientWidth || 900) - 90) / (doc ? pageMaxW() : A4W) * 20) / 20, 0.5, 1) : 1;
  }
  build() {
    work.querySelectorAll('.scroller,.board,.page-zoom').forEach((e) => e.remove());
    for (const s of this.surfaces) if (s) { s.objEls.clear(); s.inkEls.clear(); }
    this.surfaces = [];
    $('#empty').hidden = true;
    if (this.kind === 'board') this.buildBoard(); else this.buildPages();
    this.pinSurf = makePinSurface(this);
    applyToolClass();
    this.renderAll(true);
    if (this.kind === 'endless') this.layoutEndless();
    scheduleOutline();
  }
  rebuild() {
    const st = this.scroller ? this.scroller.scrollTop : null;
    this.build();
    if (st != null && this.scroller) this.scroller.scrollTop = st;
  }
  destroy() { work.querySelectorAll('.scroller,.board,.pinlayer,.page-zoom').forEach((e) => e.remove()); this.surfaces = []; this.pinSurf = null; }
  surf(i) { return this.surfaces[i || 0]; }
  flowEl(i) { const s = this.surfaces[i]; return s && s.L.flow; }
  /* ---- pages ---- */
  buildPages() {
    const sc = h('div', { class: 'scroller', id: 'scroller' });
    const pages = h('div', { class: 'pages' });
    if (this.pz !== 1) pages.style.zoom = String(this.pz);
    sc.append(pages); work.prepend(sc);
    this.scroller = sc; this.pagesEl = pages;
    sc.addEventListener('scroll', () => { updateObjbar(); updateGhostCaret(); presenceViewport(); }, { passive: true });
    this.wirePageZoom(sc);
    if (this.kind === 'a4') {
      pages.append(makeTitleInput('a4'));
      doc.flows.forEach((_, i) => pages.append(this.makeSheet(i)));
      this.addBar = h('div', { class: 'add-page' },
        h('button', { class: 'btn', onclick: () => this.addPage(doc.flows.length) }, svg('plus'), 'Add a page'));
      if (!cur.ro) pages.append(this.addBar);
      pageLayoutAll(false);   // 51_pagesetup.js: now that the sheets are on screen, the header and footer can be measured
      setTimeout(pageFitWide, 60); setTimeout(pageFitWide, 800);
      if (doc.hd || doc.ft) setTimeout(() => { if (view === this) doc.flows.forEach((_, i) => { const f = this.flowEl(i); if (f && f.scrollHeight > f.clientHeight + 2) this.reflow(i); }); }, 0);
    } else pages.append(this.makeSheet(0));
  }
  makeSheet(i) {
    const k = this.kind;
    const s = h('div', { class: 'sheet ' + k + ' bg-' + doc.bg + (doc.margin && k === 'endless' ? ' margin' : ''), 'data-sheet': i });
    paintPage(s);
    if (k === 'endless') s.append(makeTitleInput('endless'));
    const back = h('div', { class: 'layer back' });
    const flow = h('div', { class: 'flow rt', contenteditable: cur.ro ? 'false' : 'true', spellcheck: 'true', 'data-flow': i, 'aria-label': k === 'a4' ? 'Page ' + (i + 1) + ' text' : 'Page text' });
    const connsL = h('div', { class: 'layer conns' }); const conns = sv('svg', { class: 'connsvg' }); connsL.append(conns);
    const front = h('div', { class: 'layer front' });
    const inkL = h('div', { class: 'layer ink' }); const ink = sv('svg', { class: 'inksvg' }); inkL.append(ink);
    const cap = h('div', { class: 'inkcap' });
    const others = h('div', { class: 'layer others' });
    const selL = h('div', { class: 'layer sel' });
    s.append(back, flow, connsL, front, inkL, cap, others, selL);
    if (k === 'a4') {
      s.append(h('div', { class: 'page-no' }, 'Page ' + (i + 1)));
      if (!cur.ro) s.append(h('div', { class: 'page-tools' },
        h('button', { class: 'icon-btn', title: 'Delete this page', 'aria-label': 'Delete page ' + (i + 1), onclick: () => this.deletePage(+s.dataset.sheet) }, svg('trash')),
        h('button', { class: 'icon-btn pg-turn', title: doc.word ? 'Turn the pages (upright / sideways); Word turns the whole document' : 'Turn this page (upright / sideways)', 'aria-label': 'Turn page ' + (i + 1), onclick: () => turnPage(+s.dataset.sheet) }, svg('rotate'))));
    }
    flow.innerHTML = sanitize(doc.flows[i] || '') || '<p><br></p>';
    if (k === 'a4') pageSheetSetup(s, i);   // 51_pagesetup.js: size, margins, header and footer
    const surf = new Surface(this, s, i, { back, front, conns, ink, cap, others, sel: selL, flow });
    this.surfaces[i] = surf;
    wireFlow(flow, surf);
    wireSurface(surf);
    return s;
  }
  setFlowHTML(i, html, remote) {
    const f = this.flowEl(i); if (!f) return;
    const clean = sanitize(html || '');
    if (clean === f.innerHTML) return;
    const focused = remote && document.activeElement === f;
    const off = focused ? caretOffset(f) : null;
    f.innerHTML = clean || '<p><br></p>';
    if (off != null) setCaretOffset(f, off);
    if (this.kind === 'endless') this.layoutEndless();
    scheduleOutline();
  }
  syncFlow(i) { const f = this.flowEl(i); if (!f) return; doc.flows[i] = f.innerHTML; doc.fu[i] = now(); }
  addPage(at, fromReflow) {
    if (cur.ro) return;
    doc.flows.splice(at, 0, '<p><br></p>'); doc.fu.splice(at, 0, now()); pageSetupInsert(at);
    for (const o of Object.values(doc.objs)) if (o && (o.sh || 0) >= at && !o.del) { o.sh = (o.sh || 0) + 1; changed(o); }
    for (const s of Object.values(doc.ink)) if (s && (s.sh || 0) >= at && !s.del) { s.sh = (s.sh || 0) + 1; s.u = now(); }
    doc.mu = now();
    const el = this.makeSheet(at);
    const sheets = $$('.sheet', this.pagesEl);
    if (at < sheets.length) this.pagesEl.insertBefore(el, sheets[at]); else this.pagesEl.insertBefore(el, this.addBar || null);
    this.renumber();
    pageLayoutAll(false);
    this.surfaces[at].renderAll(true);
    saveDoc(); markInk(); scheduleOutline();
    if (!fromReflow) { el.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); placeCaretAt(this.flowEl(at), false); }
  }
  async deletePage(i) {
    if (doc.flows.length <= 1) return toast('A document needs at least one page.');
    const empty = !this.flowEl(i).textContent.trim() && !objList((o) => (o.sh || 0) === i).length && !strokeList((s) => (s.sh || 0) === i).length;
    if (!empty && !(await confirmModal('Delete page ' + (i + 1) + '?', 'Its text, pictures, boxes and drawings are deleted too.', 'Delete page', true))) return;
    pushUndo(true);
    doc.flows.splice(i, 1); doc.fu.splice(i, 1); pageSetupRemove(i);
    for (const o of Object.values(doc.objs)) {
      if (!o || o.del) continue;
      if ((o.sh || 0) === i) delObj(o.id);
      else if ((o.sh || 0) > i) { o.sh--; changed(o); }
    }
    for (const s of Object.values(doc.ink)) {
      if (!s || s.del) continue;
      if ((s.sh || 0) === i) doc.ink[s.id] = { id: s.id, del: true, u: now() };
      else if ((s.sh || 0) > i) { s.sh--; s.u = now(); }
    }
    doc.mu = now(); clearSel();
    this.rebuild(); saveDoc(); markInk();
  }
  renumber() {
    const sheets = $$('.sheet', this.pagesEl);
    this.surfaces = sheets.map((s, i) => {
      s.dataset.sheet = i;
      const surf = this.surfaces.find((x) => x && x.el === s);
      surf.sheet = i; surf.L.flow.dataset.flow = i; surf.L.flow.setAttribute('aria-label', 'Page ' + (i + 1) + ' text');
      const no = $('.page-no', s); if (no) no.textContent = 'Page ' + (i + 1);
      return surf;
    });
  }
  /* push overflowing text to the next page (and pull it back when deleting) */
  reflow(i, inputType) {
    let guard = 0;
    for (let p = i; p < doc.flows.length && guard < 300; p++) {
      const f = this.flowEl(p);
      let moved = false;
      while (f.scrollHeight > f.clientHeight + 2 && f.childNodes.length > 1 && guard++ < 300) {
        const last = f.lastChild;
        if (!this.flowEl(p + 1)) this.addPage(p + 1, true);
        const next = this.flowEl(p + 1);
        const c = caretIn(last);
        if (!next.textContent.trim() && !next.querySelector('img,table,hr')) next.innerHTML = '';
        next.insertBefore(last, next.firstChild);
        if (c) { next.focus({ preventScroll: true }); setCaret(c.node, c.off); }
        moved = true;
      }
      if (moved) { this.syncFlow(p); this.syncFlow(p + 1); }
      else if (p > i) break;
    }
    if (/^delete/.test(inputType || '')) {
      for (let p = i; p < doc.flows.length - 1 && guard < 300; p++) {
        const f = this.flowEl(p), n = this.flowEl(p + 1);
        let pulled = false;
        while (n.firstChild && guard++ < 300) {
          const first = n.firstChild;
          if (!n.textContent.trim() && !n.querySelector('img,table,hr')) break;
          const c = caretIn(first);
          f.appendChild(first);
          if (f.scrollHeight > f.clientHeight + 2) { n.insertBefore(first, n.firstChild); if (c) { n.focus({ preventScroll: true }); setCaret(c.node, c.off); } break; }
          if (c) { f.focus({ preventScroll: true }); setCaret(c.node, c.off); }
          pulled = true;
        }
        if (!n.firstChild) n.innerHTML = '<p><br></p>';
        if (pulled) { this.syncFlow(p); this.syncFlow(p + 1); }
      }
    }
  }
  layoutEndless() {
    const s = this.surfaces[0]; if (!s) return;
    let maxB = 0;
    for (const o of objList((x) => !x.pin)) maxB = Math.max(maxB, (o.y || 0) + (o.h || 0));
    for (const st of strokeList()) { const b = strokeBox(st); maxB = Math.max(maxB, b.y + b.h); }
    const need = Math.ceil(maxB + 160);
    s.el.style.minHeight = 'max(calc(100vh - 230px), ' + need + 'px)';
    const f = s.L.flow; f.style.minHeight = Math.max(0, Math.max(need, s.el.offsetHeight) - f.offsetTop) + 'px';
  }
  /* zoom on pages: − 100% + buttons, Ctrl + scroll and two-finger pinch, keeping the spot under the fingers in place */
  wirePageZoom(sc) {
    const zl = h('span', { id: 'zoomLabel' }, Math.round(this.pz * 100) + '%');
    work.append(h('div', { class: 'zoombox page-zoom' },
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom out', title: 'Zoom out (Ctrl + scroll, or pinch)', onclick: () => this.zoomPageAt(null, null, 1 / 1.2) }, svg('zout')), zl,
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom in', title: 'Zoom in (Ctrl + scroll, or pinch)', onclick: () => this.zoomPageAt(null, null, 1.2) }, svg('zin')),
      h('button', { class: 'icon-btn', 'aria-label': 'Fit to width', title: 'Fit to width', onclick: () => this.fit() }, svg('fit'))));
    sc.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); this.zoomPageAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0022)); }, { passive: false });
    let pinch = null, want = null, raf = 0;
    const mid = (t) => ({ d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    sc.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { const m = mid(e.touches); pinch = { d: m.d || 1, z: this.pz }; } }, { passive: true });
    sc.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const m = mid(e.touches); want = { z: pinch.z * m.d / pinch.d, x: m.x, y: m.y };
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (want) this.zoomPageAt(want.x, want.y, want.z / this.pz); });
    }, { passive: false });
    sc.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; }, { passive: true });
  }
  zoomPageAt(cx, cy, f) {
    const sc = this.scroller; if (!sc) return this.setPageZoom(this.pz * f);
    const r = sc.getBoundingClientRect(); if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const z0 = this.pz, px = (sc.scrollLeft + cx - r.left) / z0, py = (sc.scrollTop + cy - r.top) / z0;
    this.setPageZoom(z0 * f);
    sc.scrollLeft = px * this.pz - (cx - r.left); sc.scrollTop = py * this.pz - (cy - r.top);
  }
  setPageZoom(z) {
    this.pz = clamp(Math.round(z * 100) / 100, 0.4, 2.5); prefs.set('pz:' + this.kind, this.pz);
    if (this.pagesEl) this.pagesEl.style.zoom = String(this.pz);
    updateZoomLabel(); renderSelAll(); updateObjbar();
  }
  /* ---- board ---- */
  buildBoard() {
    const b = h('div', { class: 'board bg-' + doc.bg });
    paintPage(b);
    const w = h('div', { class: 'world' });
    const frames = h('div', { class: 'layer framesL' });
    const connsL = h('div', { class: 'layer conns' }); const conns = sv('svg', { class: 'connsvg' }); connsL.append(conns);
    const front = h('div', { class: 'layer front' });
    const inkL = h('div', { class: 'layer ink' }); const ink = sv('svg', { class: 'inksvg' }); inkL.append(ink);
    const others = h('div', { class: 'layer others' });
    const selL = h('div', { class: 'layer sel' });
    w.append(frames, connsL, front, inkL, others, selL);
    const cap = h('div', { class: 'inkcap' });
    const zl = h('span', { id: 'zoomLabel' }, '100%');
    const zb = h('div', { class: 'zoombox' },
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom out', title: 'Zoom out', onclick: () => this.zoomBy(1 / 1.2) }, svg('zout')), zl,
      h('button', { class: 'icon-btn', 'aria-label': 'Zoom in', title: 'Zoom in', onclick: () => this.zoomBy(1.2) }, svg('zin')),
      h('button', { class: 'icon-btn', 'aria-label': 'Fit everything', title: 'Fit everything', onclick: () => this.fit() }, svg('fit')));
    this.hint = prefs.get('boardHintSeen', false) ? null : h('div', { class: 'board-hint' }, h('b', null, 'Endless board: '), 'double-click to add a note box, scroll to move, Ctrl + scroll to zoom.');
    b.append(w, cap, zb, zoomScaleBox()); if (this.hint) b.append(this.hint);
    b.addEventListener('pointerdown', () => { if (this.hint) { this.hint.remove(); this.hint = null; prefs.set('boardHintSeen', true); } }, true);
    work.prepend(b);
    this.boardEl = b; this.world = w; this.scroller = null;
    const surf = new Surface(this, b, 0, { back: front, front, frames, conns, ink, cap, others, sel: selL, flow: null });
    this.surfaces[0] = surf;
    const v = prefs.get('bv:' + cur.id, null);
    if (v) { this.pan = { x: v.x, y: v.y }; this.zoom = v.z; }
    else { const r = work.getBoundingClientRect(); this.pan = { x: r.width / 2, y: r.height / 2.4 }; this.zoom = 1; }
    this.applyTransform();
    wireSurface(surf);
    wireBoard(this, surf);
    if (!v) setTimeout(() => { if (view === this && (objList().length || strokeList().length)) this.fit(true); }, 30);
  }
  applyTransform() {
    if (!this.world) return;
    const { x, y } = this.pan, z = this.zoom;
    this.world.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + z + ')';
    const g = (doc.bg === 'dots' ? 22 : 28) * z;
    this.boardEl.style.backgroundSize = g + 'px ' + g + 'px';
    this.boardEl.style.backgroundPosition = x + 'px ' + y + 'px';
    this.surfaces[0].L.sel.style.setProperty('--z', z);
    this.surfaces[0].L.others.style.setProperty('--z', z);
    updateZoomLabel(); updateObjbar(); presenceViewport();
    clearTimeout(this.saveT); const id = cur && cur.id;
    this.saveT = setTimeout(() => { if (id) prefs.set('bv:' + id, { x: Math.round(this.pan.x), y: Math.round(this.pan.y), z: this.zoom }); }, 400);
  }
  zoomAt(cx, cy, factor) {
    const r = this.boardEl.getBoundingClientRect();
    const nz = clamp(this.zoom * factor, 0.1, 4);
    const lx = (cx - r.left - this.pan.x) / this.zoom, ly = (cy - r.top - this.pan.y) / this.zoom;
    this.zoom = nz;
    this.pan.x = cx - r.left - lx * nz; this.pan.y = cy - r.top - ly * nz;
    this.applyTransform();
  }
  zoomBy(f) {
    if (this.kind !== 'board') return this.zoomPageAt(null, null, f);
    const r = this.boardEl.getBoundingClientRect(); this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
  }
  zoomReset() { if (this.kind !== 'board') return this.setPageZoom(1); this.zoomBy(1 / this.zoom); }
  fit(quiet) {
    if (this.kind !== 'board') { const w = this.scroller.clientWidth - 40; const pw = this.kind === 'a4' ? pageMaxW() : 860; return this.setPageZoom(clamp(w / pw, 0.4, 1.6)); }
    const b = contentBox(); const r = this.boardEl.getBoundingClientRect();
    if (!b) { if (!quiet) toast('The board is empty.'); return; }
    this.focusBox(b, r, 80);
  }
  focusBox(b, r, pad) {
    r = r || this.boardEl.getBoundingClientRect();
    const z = clamp(Math.min((r.width - pad * 2) / Math.max(b.w, 1), (r.height - pad * 2) / Math.max(b.h, 1)), 0.1, 2);
    this.zoom = z; this.pan.x = r.width / 2 - (b.x + b.w / 2) * z; this.pan.y = r.height / 2 - (b.y + b.h / 2) * z;
    this.applyTransform();
  }
  centerOn(x, y) {
    if (this.kind !== 'board') return;
    const r = this.boardEl.getBoundingClientRect();
    this.pan.x = r.width / 2 - x * this.zoom; this.pan.y = r.height / 2 - y * this.zoom; this.applyTransform();
  }
  /* where new things go: the middle of what you can see */
  visibleCenter(surfHint) {
    if (this.kind === 'board') { const r = this.boardEl.getBoundingClientRect(); const s = this.surfaces[0]; return { surf: s, ...s.toLocal(r.left + r.width / 2, r.top + r.height / 2) }; }
    const sr = this.scroller.getBoundingClientRect();
    let best = surfHint || null;
    if (!best) for (const s of this.surfaces) { const r = s.el.getBoundingClientRect(); if (r.bottom > sr.top + 80 && r.top < sr.bottom - 80) { best = s; break; } }
    best = best || this.surfaces[0];
    const r = best.el.getBoundingClientRect();
    const cy = clamp((sr.top + sr.bottom) / 2, r.top + 40, r.bottom - 40);
    const p = best.toLocal(r.left + r.width / 2, cy);
    return { surf: best, x: p.x, y: p.y };
  }
  renderAll(force) {
    for (const s of this.surfaces) if (s) s.renderAll(force);
    if (this.pinSurf) this.pinSurf.renderAll(force);
    if (this.kind === 'endless') this.layoutEndless();
    if (this.hint) this.hint.hidden = !!(objList().length || strokeList().length);
    updateObjbar(); scheduleOutline(); refreshFormatSoon();
  }
  invalidate() { if (this.queued) return; this.queued = true; raf(() => { this.queued = false; if (view === this) this.renderAll(); }); }
}
function contentBox() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of objList((o) => o.t !== 'conn')) { x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + (o.w || 0)); y1 = Math.max(y1, o.y + (o.h || 0)); }
  for (const s of strokeList()) { const b = strokeBox(s); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function updateZoomLabel() {
  const z = view ? (view.kind === 'board' ? view.zoom : view.pz) : 1;
  const zl = $('#zoomLabel'); if (zl) zl.textContent = Math.round(z * 100) + '%';
  const rz = $('#rZoom'); if (rz) rz.textContent = Math.round(z * 100) + '%';
}
function renderSelAll() { if (view) for (const s of view.surfaces) if (s) renderSel(s); }

/* ---- title field ---- */
function makeTitleInput(kind) {
  const node = tree.nodes[cur.id];
  const ti = h('input', { class: 'title-input' + (kind === 'a4' ? ' a4t' : ''), id: 'titleIn', placeholder: 'Untitled page', 'aria-label': 'Page title', maxlength: 140, value: node.name, readonly: cur.ro ? true : null });
  if (kind === 'a4') Object.assign(ti.style, { width: pageDims(0)[0] + 'px', maxWidth: '100%', margin: '0', padding: '0 4px', fontSize: '26px' });
  let t = null;
  ti.addEventListener('input', () => {
    const n = tree.nodes[cur.id]; if (!n) return;
    n.name = ti.value.trim() || 'Untitled page'; touch(n); saveTree();
    clearTimeout(t); t = setTimeout(() => { renderTree(); renderCrumbs(); }, 300);
    if (n.shared) saveDoc('main');
  });
  ti.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const f = view && view.flowEl(0); if (f) placeCaretAt(f, false); } });
  return ti;
}

/* ---- caret helpers ---- */
function caretIn(el) {
  const s = getSelection();
  if (!s.rangeCount) return null;
  const n = s.anchorNode;
  return n && (n === el || el.contains(n)) ? { node: n, off: s.anchorOffset } : null;
}
function setCaret(node, off) {
  const r = document.createRange();
  try { r.setStart(node, Math.min(off, node.nodeType === 3 ? node.length : node.childNodes.length)); } catch { return; }
  r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r); savedRange = r.cloneRange();
}
function placeCaretAt(el, atStart) {
  if (!el) return;
  el.focus({ preventScroll: true });
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(!!atStart);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r); savedRange = r.cloneRange();
}
function caretOffset(root) {
  const s = getSelection(); if (!s.rangeCount) return null;
  const r = s.getRangeAt(0); if (!root.contains(r.startContainer)) return null;
  const pre = document.createRange(); pre.selectNodeContents(root); pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}
function setCaretOffset(root, off) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let left = off, t = null;
  while (w.nextNode()) { t = w.currentNode; if (left <= t.length) break; left -= t.length; }
  if (!t) return;
  setCaret(t, Math.min(left, t.length));
}
function endRange(el) {
  const r = document.createRange();
  const tgt = el || (view && view.flowEl(0));
  if (!tgt) return null;
  const last = tgt.lastElementChild;
  if (last) { r.selectNodeContents(last); r.collapse(false); } else { r.selectNodeContents(tgt); r.collapse(false); }
  return r;
}
const editableOf = (node) => { const e = node && (node.nodeType === 3 ? node.parentNode : node); return e && e.closest ? e.closest('.flow,.otext,.mm-node,.pg-hf.editing') : null; };
document.addEventListener('selectionchange', () => {
  const s = getSelection();
  if (!s.rangeCount) return;
  const r = s.getRangeAt(0);
  const ed = editableOf(r.startContainer);
  if (ed && work.contains(ed)) { savedRange = r.cloneRange(); activeEd = ed; syncRibbonState(); }
  if (linkMode) $('#linkHere').disabled = !(ed && !r.collapsed);
  updateGhostCaret();
});

/* ---- page text (flows) ---- */
function flowIndex(flow) { return +flow.dataset.flow || 0; }
function onFlowInput(flow, e) {
  if (!cur || cur.loading || cur.ro) return;
  const i = flowIndex(flow);
  lastLocalEdit = now();
  view.syncFlow(i);
  if (view.kind === 'a4') view.reflow(i, e && e.inputType);
  else if (view.kind === 'endless') view.layoutEndless();
  saveDoc('main');
  updateGhostCaret(); scheduleOutline();
  wordLinkChanged();   // 49_wordlink.js
}
function wireFlow(flow, surf) {
  flow.addEventListener('input', (e) => onFlowInput(flow, e));
  flow.addEventListener('focus', () => { activeEd = flow; if (sel.has) clearSel(); updateGhostCaret(); });
  flow.addEventListener('blur', () => setTimeout(updateGhostCaret, 0));
  flow.addEventListener('keydown', (e) => {
    if (view.kind === 'a4' && (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); view.addPage(flowIndex(flow) + 1); }
  });
  flow.addEventListener('paste', async (e) => {
    if (!cur || cur.loading || cur.ro) return;
    const cd = e.clipboardData; if (!cd) return;
    const files = [...cd.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); await addImages(files, caretPoint(surf)); return; }
    const html = cd.getData('text/html');
    if (html) { e.preventDefault(); document.execCommand('insertHTML', false, sanitize(html)); onFlowInput(flow); }
  });
  flow.addEventListener('click', (e) => {
    const li = e.target.closest('ul.check>li');
    if (li && flow.contains(li) && !cur.ro) {
      const r = li.getBoundingClientRect();
      if (e.clientX - r.left < 26) { e.preventDefault(); li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true'); onFlowInput(flow); return; }
    }
    const img = e.target.closest('img');
    if (img && flow.contains(img)) {
      if (linkMode) { e.preventDefault(); if (!img.getAttribute('data-anchor')) img.setAttribute('data-anchor', newId('i')); onFlowInput(flow); completeLink(img.getAttribute('data-anchor')); return; }
      if (!cur.ro) toast('This picture sits in the text.', { label: 'Make it movable', fn: () => floatInlineImage(img, surf) });
      return;
    }
    const a = e.target.closest('a.xlink');
    if (a && flow.contains(a) && !a.classList.contains('pending')) { e.preventDefault(); if (!linkMode) followLink(a); }
  });
}
function caretPoint(surf) {
  const r = savedRange && surf.L.flow && surf.L.flow.contains(savedRange.startContainer) ? savedRange.cloneRange() : null;
  if (!r) return null;
  r.collapse(true);
  const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
  const blk = (n.closest && n.closest('p,h1,h2,h3,h4,li,blockquote,pre,table')) || n;
  const rect = blk.getBoundingClientRect();
  const p = surf.toLocal(rect.left, rect.bottom);
  return { surf, x: Math.max(40, Math.min(p.x, (surf.el.offsetWidth || 600) - 300)), y: p.y + 8 };
}
function floatInlineImage(img, surf) {
  if (!img.isConnected) return;
  const r = img.getBoundingClientRect();
  const p = surf.toLocal(r.left, r.top), k = surf.k();
  pushUndo(true);
  const o = addObj({ t: 'image', x: p.x, y: p.y, w: r.width / k, h: r.height / k, src: img.getAttribute('src'), alt: img.getAttribute('alt') || 'Picture', sh: surf.sheet, lay: 'front' });
  if (img.getAttribute('data-anchor')) o.anc = img.getAttribute('data-anchor');
  const flow = surf.L.flow; const p0 = img.closest('p');
  img.remove(); if (p0 && !p0.textContent.trim() && !p0.querySelector('img')) p0.remove();
  onFlowInput(flow); surf.renderAll(); selectOnly(surf, [o.id]); saveDoc();
}

/* ---- board navigation ---- */
function wireBoard(v, surf) {
  const b = v.boardEl;
  b.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || tool === 'hand') v.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0022));
    else { v.pan.x -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX; v.pan.y -= e.shiftKey && !e.deltaX ? 0 : e.deltaY; v.applyTransform(); }
  }, { passive: false });
  const touches = new Map(); let pinch = null;
  const onDown = (e) => {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const [a, c] = [...touches.values()];
      pinch = { d: Math.hypot(a.x - c.x, a.y - c.y), mx: (a.x + c.x) / 2, my: (a.y + c.y) / 2, z: v.zoom, px: v.pan.x, py: v.pan.y };
      gesture.cancel();
    }
  };
  const onMove = (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size >= 2) {
      const [a, c] = [...touches.values()];
      const d = Math.hypot(a.x - c.x, a.y - c.y), mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      const r = b.getBoundingClientRect();
      const nz = clamp(pinch.z * d / (pinch.d || 1), 0.1, 4);
      const lx = (pinch.mx - r.left - pinch.px) / pinch.z, ly = (pinch.my - r.top - pinch.py) / pinch.z;
      v.zoom = nz; v.pan.x = mx - r.left - lx * nz; v.pan.y = my - r.top - ly * nz; v.applyTransform();
    }
  };
  const onUp = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
  b.addEventListener('pointerdown', onDown, true);
  b.addEventListener('pointermove', onMove, true);
  b.addEventListener('pointerup', onUp, true);
  b.addEventListener('pointercancel', onUp, true);
}
function startPan(e, v) {
  const sx = e.clientX, sy = e.clientY, px = v.pan.x, py = v.pan.y;
  v.boardEl.classList.add('panning');
  gesture.start(e, (ev) => { v.pan.x = px + ev.clientX - sx; v.pan.y = py + ev.clientY - sy; v.applyTransform(); }, () => v.boardEl.classList.remove('panning'));
}

/* one pointer gesture at a time */
const gesture = {
  cur: null,
  start(e, move, end) {
    this.cancel();
    const id = e.pointerId, tgt = e.currentTarget || e.target;
    try { tgt.setPointerCapture(id); } catch {}
    let pend = null, raf = 0;
    const flush = () => { if (raf) cancelAnimationFrame(raf); raf = 0; if (pend) { const p = pend; pend = null; move(p[0], p[1]); } };
    const mv = (ev) => {
      if (ev.pointerId !== id) return;
      let evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]; if (!evs.length) evs = [ev];
      if (ev.pointerType === 'mouse') { move(ev, evs); return; }
      pend = [ev, pend ? pend[1].concat(evs) : evs];   // touch and pen: one update per frame, with every point since the last
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const up = (ev) => { if (ev.pointerId !== id) return; this.finish(true, ev); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    this.cur = { mv, up, end, flush };
  },
  finish(ok, ev) {
    const c = this.cur; if (!c) return; this.cur = null;
    if (c.flush) c.flush();
    removeEventListener('pointermove', c.mv); removeEventListener('pointerup', c.up); removeEventListener('pointercancel', c.up);
    if (c.end) c.end(ok, ev);
  },
  cancel() { this.finish(false); },
};

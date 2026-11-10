
/* ================= window kit (3D windows and screen windows) =================
   - zoom and pan inside a window (live tab, file, screenshot, video, GIF)
   - notes with arrows on top of the window, with a time range for videos
   - recordings library: one folder per window, plus everything else you recorded
   - right-click menus with sub-menus */
const r3 = (x) => Math.round(x * 1000) / 1000;
const fmtDur = (sec) => { sec = Math.max(0, Math.round(sec || 0)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
let lastCtx = null;
document.addEventListener('pointerdown', (e) => { if (e.button === 2) lastCtx = { x: e.clientX, y: e.clientY, t: now() }; }, true);

function winKit(el, body, stage, getObj, s) {
  const zb = h('button', { class: 'w3-zoom', hidden: true, title: 'Back to normal size (or double-click)' });
  zb.addEventListener('pointerdown', (e) => e.stopPropagation());
  const kit = { s: 1, tx: 0, ty: 0, zoomable: false, video: null };
  zb.addEventListener('click', () => kit.reset());
  body.append(zb);
  /* notes live in the page's top layer: always in front, and free to sit outside the window */
  const wrap = h('div', { class: 'wn-wrap' });
  const arrows = document.createElementNS(SVGNS, 'svg'); arrows.setAttribute('class', 'w3-arrows');
  const mk = 'w3ah' + Math.random().toString(36).slice(2, 8);
  wrap.append(arrows);
  const apply = () => { stage.style.transform = kit.s === 1 ? '' : 'translate(' + kit.tx + 'px,' + kit.ty + 'px) scale(' + kit.s + ')'; zb.hidden = kit.s === 1; zb.textContent = Math.round(kit.s * 100) + '%  ↺'; kit.layout(); };
  const clampT = () => { const W = body.clientWidth, H = body.clientHeight; kit.tx = clamp(kit.tx, W - W * kit.s, 0); kit.ty = clamp(kit.ty, H - H * kit.s, 0); };
  const ratio = () => { const r = body.getBoundingClientRect(); return { r, k: r.width / (body.clientWidth || 1) }; };
  const geo = () => ({ bx: el.clientLeft + body.offsetLeft, by: el.clientTop + body.offsetTop, W: body.clientWidth || 1, H: body.clientHeight || 1 });
  const noteOf = (nid) => { const o = getObj(); return o && (o.notes || []).find((x) => x.id === nid); };
  kit.reset = () => { kit.s = 1; kit.tx = 0; kit.ty = 0; apply(); };
  kit.toFrac = (cx, cy) => {
    const { r, k } = ratio();
    const lx = (cx - r.left) / k, ly = (cy - r.top) / k;
    return { x: clamp((lx - kit.tx) / kit.s / (body.clientWidth || 1), 0, 1), y: clamp((ly - kit.ty) / kit.s / (body.clientHeight || 1), 0, 1) };
  };
  body.addEventListener('wheel', (e) => {
    if (!kit.zoomable) return;
    e.preventDefault(); e.stopPropagation();
    const { r, k } = ratio(), lx = (e.clientX - r.left) / k, ly = (e.clientY - r.top) / k;
    const s0 = kit.s, s1 = clamp(s0 * Math.exp(-e.deltaY * 0.0018), 1, 8);
    kit.tx = lx - (lx - kit.tx) * s1 / s0; kit.ty = ly - (ly - kit.ty) * s1 / s0; kit.s = s1;
    clampT(); apply();
  }, { passive: false });
  body.addEventListener('pointerdown', (e) => {
    if (!kit.zoomable || kit.s === 1 || e.button !== 0 || e.target.closest('.w3-zoom,button,.scr-empty')) return;
    e.stopPropagation(); e.preventDefault();
    const sx = e.clientX, sy = e.clientY, tx0 = kit.tx, ty0 = kit.ty, k = ratio().k;
    gesture.start(e, (ev) => { kit.tx = tx0 + (ev.clientX - sx) / k; kit.ty = ty0 + (ev.clientY - sy) / k; clampT(); apply(); }, () => {});
  });
  body.addEventListener('dblclick', (e) => { if (kit.zoomable && kit.s !== 1) { e.stopPropagation(); kit.reset(); } });

  const drawArrows = () => {
    arrows.innerHTML = '<defs><marker id="' + mk + '" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--accent)"/></marker></defs>';
    for (const box of wrap.querySelectorAll('.w3-note')) {
      if (box.classList.contains('off')) continue;
      const head = wrap.querySelector('.w3-ah[data-nid="' + box.dataset.nid + '"]'); if (!head || head.classList.contains('out')) continue;
      const bx = box.offsetLeft, by = box.offsetTop, bw = box.offsetWidth, bh = box.offsetHeight;
      const tx = head.offsetLeft + head.offsetWidth / 2, ty = head.offsetTop + head.offsetHeight / 2;
      const cx = bx + bw / 2, cy = by + bh / 2, dx = tx - cx, dy = ty - cy;
      const t = Math.min(dx ? (bw / 2) / Math.abs(dx) : Infinity, dy ? (bh / 2) / Math.abs(dy) : Infinity);
      if (!(t < 1)) continue;
      const ln = document.createElementNS(SVGNS, 'line');
      ln.setAttribute('x1', cx + dx * t); ln.setAttribute('y1', cy + dy * t); ln.setAttribute('x2', tx); ln.setAttribute('y2', ty);
      ln.setAttribute('marker-end', 'url(#' + mk + ')'); ln.dataset.nid = box.dataset.nid;
      arrows.append(ln);
    }
  };
  kit.layout = () => {
    const o = getObj();
    if (!o || o.del || !el.isConnected || !(o.notes || []).length || !s || !s.L || !s.L.others) { wrap.remove(); return; }
    if (wrap.parentNode !== s.L.others) s.L.others.append(wrap);
    const sc = o.sc || 1, g = geo();
    wrap.dataset.win = o.id;
    wrap.style.left = o.x + 'px'; wrap.style.top = o.y + 'px'; wrap.style.transform = sc !== 1 ? 'scale(' + sc + ')' : '';
    for (const box of wrap.querySelectorAll('.w3-note')) { if (box.dataset.drag) continue; const n = noteOf(box.dataset.nid); if (!n) continue; box.style.left = (g.bx + n.x * g.W) + 'px'; box.style.top = (g.by + n.y * g.H) + 'px'; }
    for (const hd of wrap.querySelectorAll('.w3-ah')) {
      if (hd.dataset.drag) continue;
      const n = noteOf(hd.dataset.nid); if (!n) continue;
      const tx = kit.tx + kit.s * n.ax * g.W, ty = kit.ty + kit.s * n.ay * g.H;
      hd.style.left = (g.bx + tx) + 'px'; hd.style.top = (g.by + ty) + 'px';
      hd.classList.toggle('out', tx < -1 || ty < -1 || tx > g.W + 1 || ty > g.H + 1);
    }
    drawArrows();
  };
  const updNote = (nid, patch) => {
    const o = getObj(); if (!o || !cur || cur.ro) return;
    pushUndo(); o.notes = (o.notes || []).map((x) => (x.id === nid ? { ...x, ...patch } : x));
    changed(o); view.renderAll(); saveDoc('main');
  };
  kit.edit = (box, nid) => {
    const txt = box.querySelector('.w3-ntext'); if (!txt || (cur && cur.ro)) return;
    try { txt.contentEditable = 'plaintext-only'; } catch { txt.contentEditable = 'true'; }
    if (txt.contentEditable !== 'plaintext-only') txt.contentEditable = 'true';
    txt.focus();
    const rg = document.createRange(); rg.selectNodeContents(txt); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg);
    const done = () => {
      txt.removeEventListener('blur', done); txt.contentEditable = 'false';
      const v = txt.innerText.replace(/\n{3,}/g, '\n\n').trim().slice(0, 600);
      const n = noteOf(nid);
      if (n && v !== (n.text || '')) updNote(nid, { text: v }); else drawArrows();
    };
    txt.addEventListener('blur', done);
    txt.addEventListener('input', drawArrows);
    txt.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); txt.blur(); } });
  };
  const noteMenu = (nid) => {
    const o = getObj(), n = noteOf(nid); if (!o || !n) return [];
    return [{ label: 'Note', header: true },
      { label: 'Edit the text', icon: 'edit', fn: () => { const box = wrap.querySelector('.w3-note[data-nid="' + nid + '"]'); if (box) kit.edit(box, nid); } },
      { label: 'When it shows in videos…', icon: 'video', fn: () => editNoteTime(o.id, nid) },
      { label: 'Text size', icon: 'textT', sub: () => [['Small', 11], ['Normal', 12.5], ['Large', 16], ['Huge', 22]].map(([l, v]) => ({ label: l, checked: (n.fs || 12.5) === v, fn: () => updNote(nid, { fs: v }) })) },
      { label: 'Colour', icon: 'palette', sub: () => [['White', '#FFFFFF'], ['Yellow', '#FFE46B'], ['Pink', '#FFC9D9'], ['Blue', '#C6E2FF'], ['Green', '#CDEFC4']].map(([l, c]) => ({ label: l, checked: (n.bg || '#FFFFFF') === c, fn: () => updNote(nid, { bg: c }) })) },
      { label: 'Back to its normal size', icon: 'fit', fn: () => updNote(nid, { w: null, h: null }) },
      { sep: true }, { label: 'Delete the note', icon: 'trash', danger: true, fn: () => { const ob = getObj(); if (!ob) return; pushUndo(); ob.notes = (ob.notes || []).filter((x) => x.id !== nid); changed(ob); view.renderAll(); saveDoc('main'); } }];
  };
  const elK = () => ratio().k;   // screen px per window px
  const wire = (box, head, grip, n) => {
    const txt = box.querySelector('.w3-ntext');
    const ctx = (e) => { e.preventDefault(); e.stopPropagation(); };
    for (const x of [box, head]) x.addEventListener('contextmenu', ctx);
    box.addEventListener('dblclick', (e) => { e.stopPropagation(); kit.edit(box, n.id); });
    const menuAt = (e) => { ctxSuppress = true; openMenu(pointAnchor(e.clientX, e.clientY), noteMenu(n.id)); };
    box.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!cur || cur.ro || e.target === grip) return;
      if (e.button === 2) return menuAt(e);
      if (txt.isContentEditable) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, l0 = box.offsetLeft, t0 = box.offsetTop, k = elK(); let moved = false;
      gesture.start(e, (ev) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        moved = true; box.dataset.drag = '1';
        box.style.left = (l0 + (ev.clientX - sx) / k) + 'px'; box.style.top = (t0 + (ev.clientY - sy) / k) + 'px'; drawArrows();
      }, () => {
        delete box.dataset.drag;
        if (!moved) { kit.edit(box, n.id); return; }
        const g = geo();
        updNote(n.id, { x: r3(clamp((box.offsetLeft - g.bx) / g.W, -3, 4)), y: r3(clamp((box.offsetTop - g.by) / g.H, -3, 4)) });
      });
    });
    grip.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); if (!cur || cur.ro || e.button !== 0) return; e.preventDefault();
      const sx = e.clientX, sy = e.clientY, w0 = box.offsetWidth, h0 = box.offsetHeight, k = elK();
      gesture.start(e, (ev) => { box.style.width = clamp(w0 + (ev.clientX - sx) / k, 70, 800) + 'px'; box.style.minHeight = clamp(h0 + (ev.clientY - sy) / k, 26, 800) + 'px'; drawArrows(); },
        () => updNote(n.id, { w: Math.round(box.offsetWidth), h: Math.round(box.offsetHeight) }));
    });
    head.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (!cur || cur.ro) return;
      if (e.button === 2) return menuAt(e);
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, l0 = head.offsetLeft, t0 = head.offsetTop, k = elK(), hw = head.offsetWidth / 2;
      head.dataset.drag = '1';
      gesture.start(e, (ev) => { head.style.left = (l0 + (ev.clientX - sx) / k) + 'px'; head.style.top = (t0 + (ev.clientY - sy) / k) + 'px'; drawArrows(); }, () => {
        delete head.dataset.drag;
        const g = geo(), tx = head.offsetLeft + hw - g.bx, ty = head.offsetTop + hw - g.by;
        updNote(n.id, { ax: r3(clamp((tx - kit.tx) / kit.s / g.W, 0, 1)), ay: r3(clamp((ty - kit.ty) / kit.s / g.H, 0, 1)) });
      });
    });
  };
  kit.render = (o) => {
    if (!kit.zoomable && kit.s !== 1) { kit.s = 1; kit.tx = 0; kit.ty = 0; stage.style.transform = ''; zb.hidden = true; }
    wrap.querySelectorAll('.w3-note,.w3-ah').forEach((x) => x.remove());
    const ro = !!(cur && cur.ro);
    for (const n of (o && o.notes) || []) {
      const timed = n.from != null || n.to != null;
      const grip = h('span', { class: 'wn-grip', title: 'Drag to change the size' });
      const box = h('div', { class: 'w3-note', 'data-nid': n.id, style: { background: n.bg || null, width: (n.w || 170) + 'px', minHeight: n.h ? n.h + 'px' : null, fontSize: (n.fs || 12.5) + 'px' }, title: ro ? null : 'Drag to move · corner to resize · click to edit · right-click for more' },
        h('div', { class: 'w3-ntext' }, n.text || ''), timed ? h('span', { class: 'w3-ntime' }, '⏱ ' + (n.from != null ? fmtDur(n.from) : 'start') + ' – ' + (n.to != null ? fmtDur(n.to) : 'end')) : null, ro ? null : grip);
      const head = h('div', { class: 'w3-ah', 'data-nid': n.id, title: ro ? null : 'Drag to point the arrow somewhere else' });
      wire(box, head, grip, n);
      wrap.append(box, head);
    }
    kit.layout(); kit.sync();
  };
  kit.sync = () => {
    const o = getObj(); if (!o) return;
    const v = kit.video && !kit.video.hidden ? kit.video : null, t = v ? v.currentTime : null;
    let changedVis = false;
    for (const n of o.notes || []) {
      const vis = t == null || ((n.from == null || t >= n.from - 0.05) && (n.to == null || t <= n.to + 0.05));
      wrap.querySelectorAll('[data-nid="' + n.id + '"]').forEach((x) => { if (x.classList.contains('off') === vis) { x.classList.toggle('off', !vis); changedVis = true; } });
    }
    if (changedVis) drawArrows();
  };
  kit.box = (nid) => wrap.querySelector('.w3-note[data-nid="' + nid + '"]');
  kit.watchVideo = (v) => { v.addEventListener('timeupdate', kit.sync); v.addEventListener('seeked', kit.sync); };
  if (window.ResizeObserver) new ResizeObserver(() => { clampT(); kit.layout(); }).observe(body);
  el._kit = kit;
  return kit;
}
function renderWinNotes(s) {
  if (!s || !s.L || !s.L.others) return;
  for (const el of s.objEls.values()) if (el._kit) el._kit.layout();
  for (const w of s.L.others.querySelectorAll('.wn-wrap')) { const el = s.objEls.get(w.dataset.win); if (!el || !el._kit) w.remove(); }
}
function addWinNote(id) {
  const o = doc && doc.objs[id]; if (!o || !cur || cur.ro) return;
  const el = findObjEl(id), kit = el && el._kit; if (!kit) return;
  const p = lastCtx && now() - lastCtx.t < 60000 ? kit.toFrac(lastCtx.x, lastCtx.y) : { x: 0.62, y: 0.62 };
  const n = { id: newId('wn'), text: '', ax: r3(p.x), ay: r3(p.y), x: r3(clamp(p.x - 0.34, 0.02, 0.62)), y: r3(clamp(p.y - 0.3, 0.02, 0.8)), w: 170, from: null, to: null };
  const v = kit.video && !kit.video.hidden ? kit.video : null;
  if (v && isFinite(v.currentTime) && v.currentTime > 0.2) n.from = round1(v.currentTime);
  pushUndo(); o.notes = (o.notes || []).concat([n]); changed(o); view.renderAll(); saveDoc('main');
  setTimeout(() => { const el2 = findObjEl(id), box = el2 && el2._kit && el2._kit.box(n.id); if (box) el2._kit.edit(box, n.id); }, 60);
  if (n.from != null) toast('The note shows from ' + fmtDur(n.from) + ' in the video. Right-click it to change when it appears.');
}
function videoLength(o, v) {
  if (v && isFinite(v.duration) && v.duration > 0) return v.duration;
  return o.recDur ? o.recDur / 1000 : null;
}
function editNoteTime(id, nid) {
  const o = doc && doc.objs[id]; const n = o && (o.notes || []).find((x) => x.id === nid); if (!n) return;
  const el = findObjEl(id), kit = el && el._kit, v = kit && kit.video && !kit.video.hidden ? kit.video : null;
  const len = videoLength(o, v);
  const always = h('input', { type: 'checkbox', checked: n.from == null && n.to == null ? true : null });
  const num = (val) => h('input', { type: 'number', min: '0', step: '0.1', value: val == null ? '' : String(val), class: 'field', style: { width: '110px', margin: '0' } });
  const fIn = num(n.from), tIn = num(n.to);
  const nowB = (inp) => h('button', { class: 'btn small', onclick: () => { if (v) { inp.value = String(round1(v.currentTime)); always.checked = false; } else toast('Show the video in the window first.'); } }, 'Now in the video');
  const row2 = (label, inp) => h('div', { class: 'frow', style: { alignItems: 'center', gap: '8px', margin: '8px 0' } }, h('span', { style: { width: '110px' } }, label), inp, h('span', null, 'seconds'), nowB(inp));
  [fIn, tIn].forEach((i) => i.addEventListener('input', () => { always.checked = false; }));
  modal({ title: 'When should this note show?', body: [
    h('label', { class: 'checkrow' }, always, ' Always show it'),
    row2('Appears at', fIn), row2('Disappears at', tIn),
    h('p', { class: 'hint' }, (len ? 'The video is ' + fmtDur(len) + ' long. ' : '') + 'Leave “Disappears at” empty to keep it until the end. In live view and on screenshots, notes always show.')],
    actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', fn: () => {
      let from = null, to = null;
      if (!always.checked) { const f = parseFloat(fIn.value), t = parseFloat(tIn.value); from = isFinite(f) ? Math.max(0, round1(f)) : null; to = isFinite(t) ? Math.max(0, round1(t)) : null; if (from != null && to != null && to < from) [from, to] = [to, from]; }
      const ob = doc && doc.objs[id]; if (!ob) return;
      pushUndo(); ob.notes = (ob.notes || []).map((x) => (x.id === nid ? { ...x, from, to } : x)); changed(ob); view.renderAll(); saveDoc('main');
    } }] });
}

/* ---------- recordings library ---------- */
let mediaLib = { items: [], loaded: false };
let mediaLibP = null;
function loadMediaLib() {
  if (mediaLib.loaded) return Promise.resolve(mediaLib);
  if (!mediaLibP) mediaLibP = Store.get('media').catch(() => null).then((d) => { mediaLib = { items: d && Array.isArray(d.items) ? d.items : [], loaded: true }; mediaLibP = null; return mediaLib; });
  return mediaLibP;
}
function saveMediaLib() { Saver.schedule('media', { items: mediaLib.items.slice(0, 800) }, (x) => Store.set('media', x), 500); }
async function libAdd(id, e) {
  await loadMediaLib();
  const o = doc && doc.objs[id];
  const when = new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const it = { id: newId('mv'), created: now(), win: id, winName: (o && o.name) || '', winType: o && o.t, page: cur ? cur.id : null, ...e };
  if (!it.name) it.name = (e.kind === 'video' ? 'Recording ' : e.kind === 'shot' ? 'Screenshot ' : 'File ') + when;
  mediaLib.items.unshift(it); saveMediaLib();
  return it;
}
async function migrateDocMedia() {
  await loadMediaLib(); if (!doc || !cur) return;
  const known = new Set(); for (const it of mediaLib.items) { if (it.src) known.add(it.src); if (it.gif) known.add(it.gif); }
  for (const o of objList((x) => x.t === 'm3d' || x.t === 'scr')) {
    if ((o.rec || o.gif) && !known.has(o.rec || o.gif)) { const it = await libAdd(o.id, { kind: 'video', src: o.rec || null, gif: o.gif || null, dur: o.recDur || null, name: (o.name || 'Window') + ' recording' }); known.add(o.rec || o.gif); if (!o.recId) o.recId = it.id; }
    if (o.shot && !known.has(o.shot)) { await libAdd(o.id, { kind: 'shot', src: o.shot, name: (o.name || 'Window') + ' screenshot' }); known.add(o.shot); }
    if (o.file && !known.has(o.file)) { await libAdd(o.id, { kind: 'file', src: o.file, fileType: o.fileType, name: o.srcLabel || 'File' }); known.add(o.file); }
  }
}
const MEDIA_KIND_LABEL = { video: 'Recording', shot: 'Screenshot', file: 'File', audio: 'Sound recording' };
function mediaThumb(it) {
  const box = h('div', { class: 'mthumb' });
  const pic = it.kind === 'shot' ? it.src : it.kind === 'video' ? it.gif : it.fileType === 'image' ? it.src : null;
  if (pic) { const img = h('img', { alt: '' }); Files.url(pic).then((u) => { if (u) img.src = u; }); box.append(img); }
  else box.append(svg(it.kind === 'shot' ? 'image' : it.kind === 'audio' ? 'mic' : 'video'));
  return box;
}
function mediaRow(it, acts) {
  const meta = [MEDIA_KIND_LABEL[it.kind] || 'File', it.dur ? fmtDur(it.dur / 1000) : null, it.kind === 'video' ? (it.src ? (it.gif ? 'video + GIF' : 'video') + (it.sound ? ' with sound' : '') : 'GIF') : null, new Date(it.created).toLocaleDateString()].filter(Boolean).join(' · ');
  return h('div', { class: 'mrow' }, mediaThumb(it), h('div', { class: 'minfo' }, h('b', null, it.name), h('small', null, meta)),
    h('div', { class: 'macts' }, acts.map((a) => h('button', { class: 'btn small' + (a.primary ? ' primary' : ''), title: a.title || null, onclick: a.fn }, a.icon ? svg(a.icon) : null, a.label))));
}
function mediaPlace(it) {
  const pg = tree.nodes[it.page], nb = pg ? notebookOf(pg.id) : null;
  return { nb: nb && live(nb) ? nb.name : 'Deleted notebook', page: pg && live(pg) ? pg.name : 'Deleted page', win: it.winName || 'Window' };
}
function groupedMedia(items, actsFor) {
  if (!items.length) return [h('p', { class: 'hint' }, 'Nothing here yet.')];
  const groups = new Map();
  for (const it of items) { const p = mediaPlace(it), key = p.nb + ' › ' + p.page + ' › ' + p.win + '|' + it.win; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(it); }
  const out = [];
  for (const [key, list] of groups) out.push(h('div', { class: 'mgroup' }, svg('folder'), key.split('|')[0]), h('div', { class: 'mlist' }, list.map((it) => mediaRow(it, actsFor(it)))));
  return out;
}
function applyEntry(id, it) {
  const o = doc && doc.objs[id]; if (!o || !cur || cur.ro) return;
  pushUndo();
  if (it.win !== id && !(o.extra || []).includes(it.id)) o.extra = (o.extra || []).concat([it.id]);
  if (it.kind === 'video') { o.rec = it.src || null; o.gif = it.gif || null; o.recDur = it.dur || null; o.recId = it.id; o.disp = 'video'; o.vmode = it.src ? 'video' : 'gif'; }
  else if (it.kind === 'shot' || (it.kind === 'file' && it.fileType === 'image' && o.t !== 'scr')) { o.shot = it.src; o.disp = 'img'; }
  else if (it.kind === 'file' && o.t === 'scr') { o.file = it.src; o.fileType = it.fileType; o.srcLabel = it.name; o.disp = 'live'; }
  else { o.rec = it.src; o.gif = null; o.recDur = it.dur || null; o.recId = it.id; o.disp = 'video'; o.vmode = 'video'; }
  changed(o); view.renderAll(); saveDoc('main');
  toast('Showing “' + it.name + '” in this window.');
}
function previewMedia(it) {
  if (it.kind === 'audio') {
    const au = h('audio', { class: 'mprev', controls: true, autoplay: true });
    Files.url(it.src).then((u) => { if (u) au.src = u; else au.replaceWith(h('p', { class: 'hint' }, 'This file isn’t available on this device.')); });
    modal({ title: it.name, body: [au], actions: [{ label: 'Close' }] });
    return;
  }
  const isVid = it.kind === 'video' ? !!it.src : it.kind === 'file' && it.fileType === 'video';
  const el = isVid ? h('video', { class: 'mprev', controls: true, autoplay: true, playsinline: true }) : h('img', { class: 'mprev', alt: it.name });
  Files.url(isVid || it.kind !== 'video' ? it.src : it.gif).then((u) => { if (u) el.src = u; else el.replaceWith(h('p', { class: 'hint' }, 'This file isn’t available on this device.')); });
  modal({ title: it.name, body: [el], actions: [{ label: 'Close' }], wide: true });
}
async function openWinFolder(id) {
  const o = doc && doc.objs[id]; if (!o) return;
  await migrateDocMedia();
  const extra = new Set(o.extra || []);
  const mine = mediaLib.items.filter((it) => it.kind !== 'audio' && (it.win === id || extra.has(it.id)));
  const others = mediaLib.items.filter((it) => it.kind !== 'audio' && !mine.includes(it));
  let m = null;
  const acts = (it) => [{ label: 'Show here', icon: 'eye', primary: true, fn: () => { m.close(); applyEntry(id, it); } }, { label: 'Preview', fn: () => previewMedia(it) }];
  m = modal({ title: 'Recordings folder: ' + (o.name || 'window'), wide: true, body: [
    h('h3', null, 'This window'), mine.length ? h('div', { class: 'mlist' }, mine.map((it) => mediaRow(it, acts(it)))) : h('p', { class: 'hint' }, 'Nothing recorded in this window yet. Right-click → Recording to make one.'),
    h('h3', null, 'Add from everything else you recorded'), ...groupedMedia(others, acts)], actions: [{ label: 'Close' }] });
}
async function openLibrary() {
  if (!cur && !Object.keys(tree.nodes).length) return;
  await migrateDocMedia();
  let m = null;
  const acts = (it) => {
    const pg = tree.nodes[it.page];
    return [{ label: 'Preview', icon: 'eye', fn: () => previewMedia(it) },
      pg && live(pg) ? { label: 'Go to it', fn: async () => { m.close(); await openNote(it.page); setTimeout(() => { if (it.kind === 'audio') audOpenPlayer(it); else if (doc && doc.objs[it.win]) jumpToObj(it.win); }, 300); } } : null,
      { label: 'Rename', fn: async () => { const n = await promptModal('Rename', 'Name', it.name, 'Rename'); if (n && n.trim()) { it.name = n.trim().slice(0, 80); saveMediaLib(); m.close(); openLibrary(); } } },
      { label: 'Remove', fn: async () => { if (!(await confirmModal('Remove “' + it.name + '” from the library?', 'Windows that show it keep showing it.', 'Remove', true))) return; mediaLib.items = mediaLib.items.filter((x) => x !== it); saveMediaLib(); m.close(); openLibrary(); } }].filter(Boolean);
  };
  const counts = ['video', 'shot', 'file', 'audio'].map((k) => mediaLib.items.filter((x) => x.kind === k).length);
  m = modal({ title: 'Recordings and files', wide: true, body: [
    h('p', { class: 'hint' }, counts[0] + ' recording' + (counts[0] === 1 ? '' : 's') + ', ' + counts[1] + ' screenshot' + (counts[1] === 1 ? '' : 's') + ', ' + counts[2] + ' file' + (counts[2] === 1 ? '' : 's') + ', ' + counts[3] + ' sound recording' + (counts[3] === 1 ? '' : 's') + '. Each window has its own folder (Notebook › Page › Window); sound recordings are under Sound recordings.'),
    ...groupedMedia(mediaLib.items, acts)], actions: [{ label: 'Close' }] });
}

/* ---------- right-click sub-menus for windows ---------- */
function recordingSub(o) {
  const rec = recState.get(o.id), mode = w3Mode(o), items = [];
  if (rec) items.push({ label: 'Stop recording (' + fmtDur((now() - (rec.t0 || now())) / 1000) + ')', icon: 'video', fn: () => rec.stop() });
  else {
    items.push({ label: 'Record (up to 5 minutes)', icon: 'video', fn: () => (o.t === 'm3d' ? startRecord(o.id, false) : scrRecord(o.id)) });
    if (o.t === 'm3d') items.push({ label: 'Record one full turn (spin)', icon: 'video', fn: () => startRecord(o.id, true) });
    items.push({ label: 'Record sound too (microphone)', icon: 'mic', checked: !!o.recMic, fn: () => setOpt(o, 'recMic', !o.recMic) });
  }
  items.push({ sep: true }, { label: 'Play the recording', header: true },
    { label: 'As a video', checked: mode === 'video', fn: () => (o.rec ? showOrSpawn(o, 'video', 'video') : toast('Record something first, or pick a recording from the folder.')) },
    { label: 'As a GIF', checked: mode === 'gif', fn: () => gifOrSpawn(o) },
    { label: 'Repeat the video', checked: o.loop !== false, fn: () => setOpt(o, 'loop', o.loop === false) },
    o.recSound ? { label: 'Play its sound', icon: 'mic', checked: !o.mute, fn: () => setOpt(o, 'mute', !o.mute) } : null,
    { sep: true }, { label: 'Recordings folder…', icon: 'folder', fn: () => openWinFolder(o.id) });
  return items.filter(Boolean);
}
function showSub(o) {
  const mode = w3Mode(o), items = [];
  const liveLabel = o.t === 'm3d' ? 'Live 3D' : (liveStreams.has(o.id) ? 'Live view' : (o.file ? 'The file' : 'Live view'));
  items.push({ label: liveLabel, checked: mode === 'live', fn: () => setDisp(o, 'live') });
  if (o.shot) items.push({ label: 'Screenshot', checked: mode === 'img', fn: () => showOrSpawn(o, 'img') });
  if (o.rec) items.push({ label: 'Video', checked: mode === 'video', fn: () => showOrSpawn(o, 'video', 'video') });
  if (o.gif || recFrames.has(o.id)) items.push({ label: 'GIF', checked: mode === 'gif', fn: () => gifOrSpawn(o) });
  items.push({ sep: true }, { label: 'Recordings folder…', icon: 'folder', fn: () => openWinFolder(o.id) });
  return items;
}
$('#libraryBtn').append(svg('video'), 'Recordings and files');
$('#libraryBtn').addEventListener('click', openLibrary);

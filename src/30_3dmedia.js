
/* ================= 3D windows: screenshots, recordings, display, camera windows ================= */
const recState = new Map();   // window id → { stop, raf, frames }
const recFrames = new Map();  // window id → { frames, w, h } kept in memory for GIFs
const w3Mode = (o) => (!o.disp || o.disp === 'live') ? 'live' : o.disp === 'img' ? 'img' : (o.vmode === 'gif' ? 'gif' : 'video');
function srcOf(id) { const o = doc && doc.objs[id]; return o && o.camOf && doc.objs[o.camOf] && !doc.objs[o.camOf].del ? o.camOf : id; }

/* settings on a window */
function setDisp(o, disp, vmode) { if (!o) return; o.disp = disp; if (vmode) o.vmode = vmode; changed(o); view.renderAll(); saveDoc('main'); }
/* plays a window's recording, with its sound when it has some (muted if the browser won't allow sound yet) */
function recPlay(v, o) { v.muted = !o.recSound || !!o.mute; v.play().catch(() => { if (!v.muted) { v.muted = true; v.play().catch(() => {}); } }); }
function setOpt(o, k, v) { if (!o) return; o[k] = v; changed(o); view.renderAll(); saveDoc('main'); }
function w3View(id) { const el = findObjEl(id); return el && el._w3 ? el._w3.view : null; }

/* screenshot */
async function takeShot(id) {
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  const v = w3View(id), el = findObjEl(id);
  if (!v || !el) return toast('3D can’t start in this browser, so there’s nothing to photograph.');
  const b = el._w3.body;
  const k = Math.min(2, window.devicePixelRatio || 1) * 2;
  const W = clamp(Math.round(b.clientWidth * k), 200, 2400), H = clamp(Math.round(b.clientHeight * k), 150, 1800);
  const c = v.capture(W, H); if (!c) return toast('The screenshot didn’t work.');
  v.draw();
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  toast('Saving the screenshot…');
  const src = await mediaPut(blob) || c.toDataURL('image/jpeg', 0.85);
  const o2 = doc.objs[id]; if (!o2) return;
  o2.shot = src; changed(o2); saveDoc('main'); libAdd(id, { kind: 'shot', src });
  afterShot(id);
}

/* recording */
async function startRecord(id, turn) {
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  if (recState.size) return toast('Another recording is running. Stop it first (right-click → Recording → Stop recording).');
  if (w3Mode(o) !== 'live') { setDisp(o, 'live'); await sleep(120); }
  const el = findObjEl(id), v = w3View(id);
  if (!v || !el) return toast('3D can’t start in this browser, so it can’t be recorded.');
  v.setPaused(false); v.renderNow();
  const cv = v.cv; if (!cv.width) return toast('Make the 3D window a bit bigger first.');
  const fw = Math.min(360, cv.width), fh = Math.max(2, Math.round(fw * cv.height / cv.width));
  const tmp = document.createElement('canvas'); tmp.width = fw; tmp.height = fh;
  const tctx = tmp.getContext('2d', { willReadFrequently: true });
  let frames = [], times = [], interval = 100, lastF = -1e9;
  let recorder = null; const chunks = [];
  const mic = await recMic(o);
  if (cv.captureStream && window.MediaRecorder) {
    try {
      const stream = withMic(cv.captureStream(30), mic);
      const mime = recMime(mic);
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: turn ? 3000000 : 1500000 } : undefined);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.start(500);
    } catch { recorder = null; }
  }
  const dur = turn ? 6000 : 300000, th0 = v.st.th, t0 = performance.now();
  const rs = { raf: 0, stop: null, t0: now() };
  recState.set(id, rs); v.live = true; el._w3.recBadge.hidden = false;
  const tick = (t) => {
    if (!recState.has(id)) return;
    const dt = t - t0;
    if (turn) v.st.th = th0 + Math.min(1, dt / dur) * Math.PI * 2;
    v.renderNow();
    if (t - lastF >= interval) {
      lastF = t;
      try { tctx.drawImage(cv, 0, 0, fw, fh); frames.push(tctx.getImageData(0, 0, fw, fh)); times.push(t); } catch {}
      if (frames.length >= 200) { frames = frames.filter((_, i) => i % 2 === 0); times = times.filter((_, i) => i % 2 === 0); interval *= 2; }
    }
    if (dt >= dur) { finish(); return; }
    rs.raf = requestAnimationFrame(tick);
  };
  const finish = async () => {
    if (!recState.has(id)) return;
    const durMs = performance.now() - t0;
    recState.delete(id); cancelAnimationFrame(rs.raf); v.live = false;
    if (el._w3) el._w3.recBadge.hidden = true;
    if (turn) { v.st.th = th0; v.draw(); }
    let blob = null;
    if (recorder) blob = await new Promise((res) => { recorder.onstop = () => res(chunks.length ? new Blob(chunks, { type: 'video/webm' }) : null); try { recorder.stop(); } catch { res(null); } });
    if (mic) mic.getTracks().forEach((t) => t.stop());
    const avg = times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : interval;
    saveRecording(id, blob, frames, fw, fh, Math.round(avg / 10), durMs, !!(mic && recorder));
  };
  rs.stop = finish;
  rs.raf = requestAnimationFrame(tick);
  toast((turn ? 'Recording one full turn' : 'Recording for up to 5 minutes') + (mic ? ', with sound' : '') + (turn ? '…' : '. Turn and zoom the model, then right-click → Recording → Stop recording.'));
}
/* sound for window recordings: the microphone, when “Record sound too” is on */
async function recMic(o) {
  if (!o.recMic) return null;
  if (!Capture.micOk) { toast('This browser can’t record sound. Recording without it.'); return null; }
  try { return await Capture.mic(); } catch (e) { toast(micErrorText(e) + ' Recording without sound.'); return null; }
}
const withMic = (stream, mic) => (mic ? new MediaStream([...stream.getVideoTracks(), ...mic.getAudioTracks()]) : stream);
const recMime = (mic) => (mic ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']).find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
async function saveRecording(id, blob, frames, fw, fh, delayCs = 10, durMs = 0, sound = false) {
  if (!doc || !doc.objs[id]) return;
  const gd = clamp(delayCs, 4, 10);
  if (frames.length) recFrames.set(id, { frames, w: fw, h: fh, delay: gd });
  let vsrc = null, gsrc = null;
  if (blob && blob.size) { toast('Saving the video…'); vsrc = await mediaPut(blob); }
  if (frames.length) {
    toast('Making the GIF…'); await sleep(30);
    try { gsrc = await mediaPut(gifEncode(frames, fw, fh, gd)); } catch (e) { console.error(e); }
  }
  if (!doc || !doc.objs[id]) return;
  if (!vsrc && !gsrc) return toast('Recording didn’t work in this browser.');
  const it = await libAdd(id, { kind: 'video', src: vsrc, gif: gsrc, dur: Math.round(durMs) || null, w: fw, h: fh, sound: !!(sound && vsrc) });
  const o = doc && doc.objs[id]; if (!o) return;
  o.rec = vsrc; o.gif = gsrc; o.recDur = Math.round(durMs) || null; o.recId = it.id; o.recSound = !!(sound && vsrc);
  if (o.loop == null) o.loop = true;
  changed(o); view.renderAll(); saveDoc('main');
  if (o.newWin) { spawnMediaWindow(id, 'video', vsrc ? 'video' : 'gif', 'video'); toast('Recording ready. It plays in a new window; this one keeps running live.'); return; }
  const localOnly = Store.mode === 'db' && vsrc && vsrc.startsWith('idb:');
  toast((vsrc ? 'Recording ready (video and GIF).' : 'Recording ready as a GIF (this browser can’t make videos).') + (localOnly ? ' It’s too big for Claude’s storage, so it’s kept in this browser only.' : '') + (delayCs > 10 ? ' The GIF plays faster than real time.' : ''),
    { label: 'Show it', fn: () => setDisp(doc.objs[id], 'video', vsrc ? 'video' : 'gif') });
}
async function showGif(id) {
  const o = doc && doc.objs[id]; if (!o) return;
  if (o.gif) return setDisp(o, 'video', 'gif');
  const f = recFrames.get(id);
  if (!f) return toast('Record again to make a GIF.');
  toast('Making the GIF…'); await sleep(30);
  const src = await mediaPut(gifEncode(f.frames, f.w, f.h, f.delay || 10));
  const o2 = doc.objs[id]; if (!o2 || !src) return toast('The GIF couldn’t be saved.');
  o2.gif = src; setDisp(o2, 'video', 'gif');
}

/* a second window looking at the same 3D model */
function newCameraWindow(id) {
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  const rootId = srcOf(id), root = doc.objs[rootId] || o;
  const v = w3View(id);
  const cam = v && v.st.tgt ? { th: v.st.th + Math.PI / 2, ph: v.st.ph, dist: v.st.dist, tgt: [v.st.tgt.x, v.st.tgt.y, v.st.tgt.z] } : (o.cam ? { ...o.cam, th: (o.cam.th || 0.8) + Math.PI / 2 } : null);
  pushUndo();
  const n = addObj({ t: 'm3d', name: (root.name || '3D model') + ' camera', camOf: rootId, model: root.model, scene: root.scene ? deep(root.scene) : undefined, links: deep(root.links || []), cam, w: o.w, h: o.h, sc: o.sc, x: Math.round(o.x + o.w + 60 * (o.sc || 1)), y: o.y, sh: o.sh, lay: o.lay, src: root.src });
  addObj({ t: 'conn', a: { id: o.id }, b: { id: n.id }, cs: 'curve', ar: 'end', dash: true, label: 'camera', sh: o.sh, sw: round1(2 * (o.sc || 1)) });
  view.renderAll();
  const s = view.kind === 'a4' ? view.surf(o.sh || 0) : view.surf(0);
  selectOnly(s, [n.id]); saveDoc('main');
  if (view.kind === 'board') view.centerOn(n.x + n.w / 2, n.y + n.h / 2);
  toast('New camera window. Turn it to look at the same 3D model from another side. Changes to the model show in both.');
}

/* the description of a 3D window's object (o.desc): the AI keeps to it in Cmd, Dissect and internal components */
async function describeWin(id) {
  id = srcOf(id);
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  const ta = h('textarea', { class: 'field', rows: 5, maxlength: 1500, placeholder: 'e.g. a 1960s Ford V8 engine: cast-iron block, aluminium heads, 8 cylinders in a V', 'aria-label': 'Describe the object' });
  ta.value = o.desc || (model3D(o.model) || {}).desc || '';
  const save = () => { const ob = doc.objs[id]; if (!ob) return null; ob.desc = ta.value.trim().slice(0, 1500); changed(ob); saveDoc('main'); return ob; };
  modal({ title: 'Describe “' + (o.name || '3D model') + '” for the AI', body: [h('p', { class: 'hint' }, 'What it is, what it is made of, what matters. The AI keeps to it whenever it changes, dissects or adds parts inside this model.'), ta], actions: [
    { label: 'Cancel' },
    { label: 'Save', fn: () => { save(); toast('Description saved.'); } },
    { label: 'Save and change the model to match', kind: 'primary', fn: () => { const ob = save(); if (!ob || !ob.desc) { toast('Write a description first.'); return false; } cmdWin(id, 'Adjust the model so it matches the description of the object: its parts, proportions, colours and materials. Keep what already matches.'); } }] });
}
/* right-click menu items for a 3D window */
function w3MenuItems(o) {
  const items = [{ label: '3D window: ' + (o.name || '3D model'), header: true }];
  if (cur.ro) return items;
  items.push({ label: 'Add a note with an arrow', icon: 'note', fn: () => addWinNote(o.id) },
    { label: 'Take a screenshot', icon: 'image', fn: () => takeShot(o.id) },
    { label: 'Put screenshots and videos in a new window (keep this one live)', checked: !!o.newWin, fn: () => setOpt(o, 'newWin', !o.newWin) },
    { label: recState.has(o.id) ? 'Recording (running)' : 'Recording', icon: 'video', sub: () => recordingSub(o) },
    { label: 'Show in the window', icon: 'eye', sub: () => showSub(o) },
    { sep: true },
    { label: 'Pause the 3D engine behind pictures and videos', checked: o.engineOff !== false, fn: () => setOpt(o, 'engineOff', o.engineOff === false) },
    { label: 'Spin', checked: !!o.spin, fn: () => setOpt(o, 'spin', !o.spin) },
    { label: 'Spin speed', icon: 'refresh', sub: () => SPIN_SPEEDS.map(([l, v]) => ({ label: l + (v === SPIN_DEFAULT ? ' (normal)' : ''), checked: spinRate(o) === v, fn: () => { o.spinSpeed = v; setOpt(o, 'spin', true); } })) },
    { label: 'Pieces: dissect, inside parts, arrange', icon: 'dissect', sub: () => piecesItems(o) },
    { label: 'Describe the object for the AI…', icon: 'edit', fn: () => describeWin(o.id) },
    { label: 'New camera angle window', icon: 'cube', fn: () => newCameraWindow(o.id) }, { sep: true });
  return items;
}
/* several windows chosen (Ctrl + right-click): one menu whose choices change all of them.
   Items are matched by their label; a tick shows when it is on in all of them, and choosing it sets all the same way. */
function mergeMenus(lists, n) {
  const order = [], byKey = new Map();
  lists.forEach((items, wi) => (items || []).forEach((it) => {
    if (!it || it.header) return;
    if (it.sep) { if (wi === 0) order.push({ sep: true }); return; }
    const key = String(it.label || '').replace(/\s*\((running|normal)\)$/i, '');
    let m = byKey.get(key);
    if (!m) { m = { key, icon: it.icon, danger: it.danger, parts: [] }; byKey.set(key, m); order.push(m); }
    m.parts.push(it);
  }));
  return order.map((m) => {
    if (m.sep) return m;
    const parts = m.parts, item = { label: m.key + (parts.length < n ? ' (' + parts.length + ' of ' + n + ')' : ''), icon: m.icon, danger: m.danger };
    if (parts[0].sub) { item.sub = () => mergeMenus(parts.map((p) => (typeof p.sub === 'function' ? p.sub() : p.sub) || []), parts.length); return item; }
    if (parts.some((p) => p.checked != null)) {
      item.checked = parts.every((p) => !!p.checked);
      const target = !item.checked;
      item.fn = () => { for (const p of parts) if (!!p.checked !== target && p.fn) p.fn(); };
    } else item.fn = () => { for (const p of parts) if (p.fn) { try { p.fn(); } catch (e) { console.error(e); } } };
    return item;
  });
}
function multiWinItems(wins) {
  const n3d = wins.filter((o) => o.t === 'm3d').length, nScr = wins.length - n3d;
  const what = [n3d ? n3d + ' 3D window' + (n3d > 1 ? 's' : '') : '', nScr ? nScr + ' screen window' + (nScr > 1 ? 's' : '') : ''].filter(Boolean).join(' and ');
  const head = { label: what + ': changes apply to all', header: true };
  if (cur.ro) return [head];
  return [head, ...mergeMenus(wins.map((o) => (o.t === 'm3d' ? w3MenuItems(o) : scrMenuItems(o))), wins.length), { sep: true }];
}

/* ---------- GIF encoder (median-cut palette + LZW) ---------- */
function medianCut(cols, max) {
  let boxes = [cols];
  while (boxes.length < max) {
    let bi = -1, best = 0, bch = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]; if (b.length < 2) continue;
      let r0 = 255, g0 = 255, b0 = 255, r1 = 0, g1 = 0, b1 = 0;
      for (const c of b) { const r = (c >> 16) & 255, g = (c >> 8) & 255, bl = c & 255; if (r < r0) r0 = r; if (r > r1) r1 = r; if (g < g0) g0 = g; if (g > g1) g1 = g; if (bl < b0) b0 = bl; if (bl > b1) b1 = bl; }
      const rg = [r1 - r0, g1 - g0, b1 - b0], m = Math.max(rg[0], rg[1], rg[2]);
      if (m > best) { best = m; bi = i; bch = rg.indexOf(m); }
    }
    if (bi < 0) break;
    const b = boxes[bi], sh = 16 - bch * 8;
    b.sort((x, y) => ((x >> sh) & 255) - ((y >> sh) & 255));
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.filter((b) => b.length).map((b) => { let r = 0, g = 0, bl = 0; for (const c of b) { r += (c >> 16) & 255; g += (c >> 8) & 255; bl += c & 255; } const n = b.length; return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)]; });
}
function lzw(idx, mcs) {
  const clear = 1 << mcs, eoi = clear + 1;
  let cs = mcs + 1, next = eoi + 1, table = new Map();
  const out = []; let acc = 0, nb = 0;
  const emit = (c) => { acc |= c << nb; nb += cs; while (nb >= 8) { out.push(acc & 255); acc >>>= 8; nb -= 8; } };
  emit(clear);
  let ib = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = (ib << 8) | k;
    const c = table.get(key);
    if (c !== undefined) { ib = c; continue; }
    emit(ib);
    if (next === 4096) { emit(clear); next = eoi + 1; cs = mcs + 1; table = new Map(); }
    else { if (next >= (1 << cs)) cs++; table.set(key, next++); }
    ib = k;
  }
  emit(ib); emit(eoi);
  if (nb > 0) out.push(acc & 255);
  return out;
}
function gifEncode(frames, w, hgt, delayCs) {
  const samples = [];
  const step = Math.max(1, Math.floor((frames.length * w * hgt) / 40000));
  let cnt = 0;
  for (const f of frames) { const d = f.data; for (let i = 0; i < d.length; i += 4) { if (cnt++ % step) continue; samples.push((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); } }
  const pal = medianCut(samples, 256);
  while (pal.length < 256) pal.push([0, 0, 0]);
  const lut = new Int16Array(32768).fill(-1);
  const nearest = (r, g, b) => { let bi = 0, bd = Infinity; for (let i = 0; i < 256; i++) { const p = pal[i], dd = (p[0] - r) * (p[0] - r) + (p[1] - g) * (p[1] - g) + (p[2] - b) * (p[2] - b); if (dd < bd) { bd = dd; bi = i; } } return bi; };
  const out = [];
  const str = (s) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); };
  const u16 = (v) => out.push(v & 255, (v >> 8) & 255);
  str('GIF89a'); u16(w); u16(hgt); out.push(0xF7, 0, 0);
  for (const p of pal) out.push(p[0], p[1], p[2]);
  out.push(0x21, 0xFF, 11); str('NETSCAPE2.0'); out.push(3, 1, 0, 0, 0);
  for (const f of frames) {
    out.push(0x21, 0xF9, 4, 0x04, delayCs & 255, (delayCs >> 8) & 255, 0, 0);
    out.push(0x2C); u16(0); u16(0); u16(w); u16(hgt); out.push(0);
    const d = f.data, idx = new Uint8Array(w * hgt);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      let c = lut[key]; if (c < 0) { c = nearest(d[i], d[i + 1], d[i + 2]); lut[key] = c; }
      idx[j] = c;
    }
    out.push(8);
    const data = lzw(idx, 8);
    for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); out.push(n); for (let k = 0; k < n; k++) out.push(data[i + k]); }
    out.push(0);
  }
  out.push(0x3B);
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}

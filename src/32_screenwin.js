
/* ================= Screen windows =================
   Same window design and right-click recording features as 3D windows.
   Shows a shared tab / app window / screen (live, through Capture in the platform layer)
   or a video or picture file. Object type 'scr'. */
BASE_NAMES.scr = 'Screen window';
OBJ_ICON.scr = 'screen';
const liveStreams = new Map();   // window id → { stream, label, note }
let expandedScr = null;
OBJ.scr = {
  label: 'Screen window', handles: 'all', norot: true, conn: true, min: 180,
  create: (o, s) => makeScrWindow(o, s),
  update: (el, o) => updateScrWindow(el, o),
};
function insertScreenWin() {
  const o = insertObj({ t: 'scr', w: 480, h: 320 });
  if (o) toast('Screen window added. Choose a tab or window to show in it, or use a video or picture file.');
}
const CAP_BLOCKED = 'Claude’s page doesn’t allow screen sharing. It works when Cortex Scribe runs on its own (the file opened in your browser, or the full app). A video or picture file works here too.';
const stopTracks = (stream) => { try { stream.getTracks().forEach((t) => t.stop()); } catch {} };
function refreshScr(id) {
  const el = findObjEl(id), o = doc && doc.objs[id];
  if (el && o) updateScrWindow(el, o);
  if (expandedScr && expandedScr.id === id) expandedScr.refresh();
}
async function chooseScreen(id) {
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  if (!Capture.ok) return toast('This browser can’t share a tab or window. You can show a video or picture file instead.');
  if (Capture.allowed() === false) return toast(CAP_BLOCKED);
  let stream;
  try { stream = await Capture.screen(); }
  catch (e) {
    if (e && /polic/i.test(e.message || '')) return toast(CAP_BLOCKED);
    if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return toast('Sharing was cancelled.');
    return toast(CAP_BLOCKED);
  }
  const old = liveStreams.get(id); if (old) stopTracks(old.stream);
  const track = stream.getVideoTracks()[0];
  const label = ((track && track.label) || 'Shared screen').slice(0, 80);
  liveStreams.set(id, { stream, label, note: cur.id });
  if (track) track.addEventListener('ended', () => {
    const l = liveStreams.get(id); if (!l || l.stream !== stream) return;
    const r = recState.get(id); if (r) r.stop();
    liveStreams.delete(id); refreshScr(id); toast('Screen sharing stopped.');
  });
  const o2 = doc.objs[id]; if (!o2) return stopTracks(stream);
  o2.srcLabel = label; o2.disp = 'live'; changed(o2); view.renderAll(); saveDoc('main');
}
function stopScreen(id) {
  const l = liveStreams.get(id); if (!l) return;
  const r = recState.get(id); if (r) r.stop();
  liveStreams.delete(id); stopTracks(l.stream); refreshScr(id);
}
function chooseScrFile(id) {
  const inp = h('input', { type: 'file', accept: 'video/*,image/*', hidden: true });
  document.body.append(inp);
  inp.addEventListener('change', () => { const f = inp.files[0]; inp.remove(); if (f) useScrFile(id, f); }, { once: true });
  inp.click();
}
async function useScrFile(id, f) {
  if (cur && cur.ro) return;
  const isVid = f.type.startsWith('video/'), isImg = f.type.startsWith('image/');
  if (!isVid && !isImg) return toast('Choose a video or picture file.');
  toast('Adding the file…');
  const src = await Files.put(f);
  if (!src) return toast(isVid && f.size > 20e6 ? 'That video is too big (over 20 MB). Try a shorter one.' : 'The file couldn’t be saved.');
  const o = doc && doc.objs[id]; if (!o) return;
  pushUndo();
  o.file = src; o.fileType = isVid ? 'video' : 'image'; o.srcLabel = f.name.slice(0, 80); o.disp = 'live';
  if (/^Screen window( \d+)?$/.test(o.name || '')) o.name = uniqueName(f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Screen window', o.id);
  libAdd(id, { kind: 'file', src, fileType: o.fileType, name: f.name.slice(0, 80) });
  changed(o); view.renderAll(); saveDoc('main'); toast('The file now shows in the window.');
}
function makeScrWindow(o, s) {
  const el = h('div');
  dropFiles(el, (files) => useScrFile(el.dataset.id, files[0]), /^(image|video)\//, 'Drop a video or picture file onto the window.');
  const stop = (b) => { b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('dblclick', (e) => e.stopPropagation()); return b; };
  const oid = () => el.dataset.id;
  const name = h('span', { class: 'w3-name' });
  const del = stop(h('button', { class: 'w3-btn del', title: 'Delete this screen window', onclick: () => { const ob = doc && doc.objs[oid()]; if (!ob || cur.ro) return; stopScreen(ob.id); pushUndo(); delObj(ob.id); clearSel(); view.renderAll(); saveDoc('main'); toast('Screen window deleted.', { label: 'Undo', fn: undoObjs }); } }, svg('trash'), h('span', null, 'Delete')));
  const pick = stop(h('button', { class: 'w3-btn', title: 'Choose a tab, app window or screen to show', onclick: () => chooseScreen(oid()) }, svg('screen'), h('span', null, 'Choose')));
  const file = stop(h('button', { class: 'w3-btn', title: 'Show a video or picture file', onclick: () => chooseScrFile(oid()) }, svg('upload'), h('span', null, 'File')));
  const exp = stop(h('button', { class: 'w3-btn', title: 'Expand to full screen', onclick: () => expandScr(oid()) }, svg('fit'), h('span', null, 'Expand')));
  const body = h('div', { class: 'w3-body' });
  const mkVid = (extra) => { const v = h('video', { class: 'w3-media', hidden: true, muted: true, playsinline: true, autoplay: true, ...extra }); v.muted = true; return v; };
  const live = mkVid({ 'aria-label': 'Shared tab or window' });
  const fvid = mkVid({ loop: true });
  const fimg = h('img', { class: 'w3-media', alt: '', hidden: true, draggable: 'false' });
  const video = mkVid({ title: 'Click to play again' });
  video.addEventListener('click', () => { if (video.ended || video.paused) { video.currentTime = 0; video.play().catch(() => {}); } });
  const media = h('img', { class: 'w3-media', alt: '', hidden: true, draggable: 'false' });
  const msg = h('div', { class: 'w3-msg scr-empty', hidden: true }, h('div', null,
    h('p', null, 'Show a browser tab, an app window or your whole screen here, or a video or picture file.'),
    h('div', { class: 'btnrow' },
      stop(h('button', { class: 'btn small primary', onclick: () => chooseScreen(oid()) }, svg('screen'), 'Choose a tab or window')),
      stop(h('button', { class: 'btn small', onclick: () => chooseScrFile(oid()) }, svg('upload'), 'Use a file')))));
  const recBadge = h('span', { class: 'w3-rec', hidden: true }, '● REC');
  const stage = h('div', { class: 'w3-stage' });
  stage.append(live, fvid, fimg, video, media);
  body.append(stage, msg, recBadge);
  el.append(h('div', { class: 'w3-head', title: 'Drag here to move the window. Right-click for more.' }, del, name, pick, file, exp), body);
  el._sw = { name, del, pick, file, live, fvid, fimg, video, media, msg, recBadge, mediaKey: null, fileKey: null };
  const kit = winKit(el, body, stage, () => doc && doc.objs[oid()], s); kit.watchVideo(video); kit.watchVideo(fvid);
  return el;
}
function scrMediaSrc(o, mode) { return mode === 'img' ? o.shot : mode === 'gif' ? o.gif : mode === 'video' ? o.rec : null; }
function updateScrWindow(el, o) {
  const w = el._sw; if (!w || !o) return;
  w.name.textContent = o.name || 'Screen window';
  const ro = !!(cur && cur.ro);
  w.del.hidden = ro; w.pick.hidden = ro; w.file.hidden = ro;
  const l = liveStreams.get(o.id), mode = w3Mode(o), mSrc = scrMediaSrc(o, mode);
  const showSrc = mode === 'live' || !mSrc;
  w.media.hidden = showSrc || mode === 'video';
  w.video.hidden = showSrc || mode !== 'video';
  if (!showSrc) {
    const mk = mode + '|' + mSrc;
    if (w.mediaKey !== mk) { w.mediaKey = mk; Files.url(mSrc).then((u) => { if (w.mediaKey !== mk || !u) return; if (mode === 'video') { w.video.src = u; recPlay(w.video, o); } else w.media.src = u; }); }
    if (mode === 'video') w.video.muted = !o.recSound || !!o.mute;
    if (mode === 'video') { w.video.loop = o.loop !== false; if (w.video.paused && w.video.src && !w.video.ended) w.video.play().catch(() => {}); }
  } else { w.mediaKey = null; if (!w.video.paused) w.video.pause(); }
  const paused = !showSrc && o.engineOff !== false;
  w.live.hidden = !showSrc || !l;
  if (l) {
    if (w.live.srcObject !== l.stream) w.live.srcObject = l.stream;
    for (const t of l.stream.getVideoTracks()) t.enabled = !paused;
    if (paused) w.live.pause(); else w.live.play().catch(() => {});
  } else if (w.live.srcObject) w.live.srcObject = null;
  const hasFile = !!o.file;
  w.fimg.hidden = !showSrc || !!l || !hasFile || o.fileType !== 'image';
  w.fvid.hidden = !showSrc || !!l || !hasFile || o.fileType !== 'video';
  if (hasFile && w.fileKey !== o.file) {
    const fk = w.fileKey = o.file;
    Files.url(o.file).then((u) => { if (w.fileKey !== fk || !u) return; if (o.fileType === 'video') { w.fvid.src = u; w.fvid.play().catch(() => {}); } else w.fimg.src = u; });
  }
  if (hasFile && o.fileType === 'video' && w.fvid.src) { if (paused || l) w.fvid.pause(); else if (w.fvid.paused) w.fvid.play().catch(() => {}); }
  w.msg.hidden = !showSrc || !!l || hasFile;
  w.recBadge.hidden = !recState.has(o.id);
  if (el._kit) { el._kit.zoomable = w.msg.hidden; el._kit.video = !showSrc && mode === 'video' ? w.video : (showSrc && !l && hasFile && o.fileType === 'video' ? w.fvid : null); el._kit.render(o); }
  if (expandedScr && expandedScr.id === o.id) expandedScr.refresh();
}

/* screenshot of whatever the window shows as its source */
async function scrShot(id) {
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  if (!liveStreams.has(id) && !o.file) return toast('Choose a tab, window or file first.');
  if (w3Mode(o) !== 'live') { setDisp(o, 'live'); await sleep(350); }
  const el = findObjEl(id), w = el && el._sw; if (!w) return;
  const srcEl = liveStreams.has(id) ? w.live : (o.fileType === 'video' ? w.fvid : w.fimg);
  const vw = srcEl.videoWidth || srcEl.naturalWidth, vh = srcEl.videoHeight || srcEl.naturalHeight;
  if (!vw || !vh) return toast('Nothing to photograph yet. Try again in a moment.');
  const k = Math.min(1, 2400 / Math.max(vw, vh));
  const c = document.createElement('canvas'); c.width = Math.round(vw * k); c.height = Math.round(vh * k);
  let blob = null;
  try { c.getContext('2d').drawImage(srcEl, 0, 0, c.width, c.height); blob = await new Promise((r) => c.toBlob(r, 'image/png')); } catch {}
  if (!blob) return toast('The screenshot didn’t work.');
  toast('Saving the screenshot…');
  const src = await Files.put(blob);
  const o2 = doc && doc.objs[id]; if (!o2 || !src) return toast('The screenshot couldn’t be saved.');
  o2.shot = src; changed(o2); saveDoc('main'); libAdd(id, { kind: 'shot', src });
  afterShot(id);
}

/* recording of the live tab or window: video from the stream itself, GIF from sampled frames */
async function scrRecord(id) {
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  if (recState.size) return toast('Another recording is running. Stop it first (right-click → Stop recording).');
  const l = liveStreams.get(id);
  if (!l) return toast(o.file ? 'Recording works with a live tab or window. The file is already saved; use Choose to share a tab or window.' : 'Choose a tab or window first, then record it.');
  if (w3Mode(o) !== 'live') { setDisp(o, 'live'); await sleep(300); }
  const el = findObjEl(id), w = el && el._sw; if (!w) return;
  const vid = w.live;
  let recorder = null; const chunks = [];
  const mic = await recMic(o);
  if (window.MediaRecorder) {
    try {
      const mime = recMime(mic);
      recorder = new MediaRecorder(withMic(l.stream, mic), mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.start(500);
    } catch { recorder = null; }
  }
  const vw = vid.videoWidth || 640, vh = vid.videoHeight || 360;
  const fw = Math.min(400, vw), fh = Math.max(2, Math.round(fw * vh / vw));
  const tmp = document.createElement('canvas'); tmp.width = fw; tmp.height = fh;
  const tctx = tmp.getContext('2d', { willReadFrequently: true });
  let frames = [], times = [], interval = 100;
  const t0 = performance.now(), dur = 300000;
  const rs = { frames, timer: 0, stop: null, t0: now() };
  recState.set(id, rs); w.recBadge.hidden = false;
  const grab = () => {
    if (!recState.has(id)) return;
    const t = performance.now();
    if (vid.videoWidth) { try { tctx.drawImage(vid, 0, 0, fw, fh); frames.push(tctx.getImageData(0, 0, fw, fh)); times.push(t); } catch {} }
    if (frames.length >= 200) { frames = frames.filter((_, i) => i % 2 === 0); times = times.filter((_, i) => i % 2 === 0); rs.frames = frames; interval *= 2; clearInterval(rs.timer); rs.timer = setInterval(grab, interval); }
    if (t - t0 >= dur) finish();
  };
  const finish = async () => {
    if (!recState.has(id)) return;
    recState.delete(id); clearInterval(rs.timer);
    const el2 = findObjEl(id); if (el2 && el2._sw) el2._sw.recBadge.hidden = true;
    let blob = null;
    if (recorder) blob = await new Promise((res) => { recorder.onstop = () => res(chunks.length ? new Blob(chunks, { type: 'video/webm' }) : null); try { recorder.stop(); } catch { res(null); } });
    if (mic) mic.getTracks().forEach((t) => t.stop());
    const avg = times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : interval;
    saveRecording(id, blob, frames, fw, fh, Math.round(avg / 10), performance.now() - t0, !!(mic && recorder));
  };
  rs.stop = finish;
  rs.timer = setInterval(grab, interval); grab();
  toast('Recording the shared tab or window (up to 5 minutes). Right-click → Recording → Stop recording to finish.');
}

/* right-click menu */
function scrMenuItems(o) {
  const items = [{ label: 'Screen window: ' + (o.name || 'Screen window'), header: true }];
  if (cur.ro) return items;
  const l = liveStreams.get(o.id);
  items.push({ label: 'Add a note with an arrow', icon: 'note', fn: () => addWinNote(o.id) },
    { label: 'Take a screenshot', icon: 'image', fn: () => scrShot(o.id) },
    { label: 'Put screenshots and videos in a new window (keep this one live)', checked: !!o.newWin, fn: () => setOpt(o, 'newWin', !o.newWin) },
    { label: recState.has(o.id) ? 'Recording (running)' : 'Recording', icon: 'video', sub: () => recordingSub(o) },
    { label: 'Show in the window', icon: 'eye', sub: () => showSub(o) },
    { label: 'What to show', icon: 'screen', sub: () => [
      { label: l ? 'Share a different tab or window' : 'Choose a tab or window', icon: 'screen', fn: () => chooseScreen(o.id) },
      { label: o.file ? 'Use a different video or picture file' : 'Use a video or picture file', icon: 'upload', fn: () => chooseScrFile(o.id) },
      l ? { label: 'Stop sharing', icon: 'close', fn: () => stopScreen(o.id) } : null] },
    { sep: true },
    { label: 'Pause the live view behind pictures and videos', checked: o.engineOff !== false, fn: () => setOpt(o, 'engineOff', o.engineOff === false) }, { sep: true });
  return items;
}

/* full screen */
function expandScr(id) {
  const o0 = doc && doc.objs[id]; if (!o0) return;
  const host = h('div', { class: 'v3-host scr-host' });
  const refresh = () => {
    const o = doc && doc.objs[id]; host.textContent = ''; if (!o) return;
    const l = liveStreams.get(id), mode = w3Mode(o), mSrc = scrMediaSrc(o, mode);
    const vid = () => { const v = h('video', { class: 'w3-media', autoplay: true, muted: true, playsinline: true }); v.muted = true; return v; };
    if (mode !== 'live' && mSrc) {
      const m = mode === 'video' ? vid() : h('img', { class: 'w3-media', alt: '' });
      if (mode === 'video') m.loop = o.loop !== false;
      Files.url(mSrc).then((u) => { if (u) m.src = u; }); host.append(m);
    } else if (l) { const v = vid(); v.srcObject = l.stream; v.play().catch(() => {}); host.append(v); }
    else if (o.file) { const m = o.fileType === 'video' ? vid() : h('img', { class: 'w3-media', alt: '' }); if (o.fileType === 'video') m.loop = true; Files.url(o.file).then((u) => { if (u) m.src = u; }); host.append(m); }
    else host.append(h('div', { class: 'w3-msg' }, 'Nothing to show yet. Choose a tab, window or file first.'));
  };
  const key = (e) => { if (e.key === 'Escape' && !document.querySelector('.scrim,.menu')) { e.preventDefault(); e.stopPropagation(); close(); } };
  const close = async () => { document.removeEventListener('keydown', key, true); if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} } ov.remove(); expandedScr = null; };
  const ov = h('div', { class: 'v3-full', role: 'dialog', 'aria-label': o0.name || 'Screen window' },
    h('div', { class: 'v3-head' }, h('span', { class: 'v3-name' }, o0.name || 'Screen window'), h('span', { class: 'hint', style: { margin: '0 10px' } }, 'Esc to close'), h('button', { class: 'btn small', onclick: close }, svg('close'), 'Close')), host);
  document.body.append(ov); document.addEventListener('keydown', key, true);
  try { const fs = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (fs && fs.catch) fs.catch(() => {}); } catch {}
  expandedScr = { id, refresh }; refresh();
}

/* stop sharing for windows that were deleted */
setInterval(() => {
  if (!doc || !cur) return;
  for (const [id, l] of liveStreams) { if (l.note !== cur.id) continue; const o = doc.objs[id]; if (!o || o.del) { liveStreams.delete(id); stopTracks(l.stream); } }
}, 4000);

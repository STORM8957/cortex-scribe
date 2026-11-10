/* ================= Sound recording during class =================
   Insert → Record sound records the microphone while you take notes. What you write, draw or add
   while it records remembers the moment it was made: text blocks get data-at="<recId>@<ms>",
   boxes and other objects o.at = { r, t }, drawings st.at = { r, t }. The recording goes into the
   recordings library (mediaLib, kind 'audio', pages: the pages it was used on).
   The player bar: play / pause, ±10 s, speed, and clicking text, a box or a drawing made during the
   recording plays from that moment. “Fade what came later” shows the notes as they were written. */
const AUD_RE = /^([a-z0-9_-]{1,40})@(\d{1,9})$/i;
let audRec = null;   // the running recording
let audPlay = null;  // the open player: { it, el, fade, timer }
const audBar = h('div', { class: 'aud-bar', id: 'audBar', hidden: true, role: 'region', 'aria-label': 'Sound recording' });
$('#work').before(audBar);
const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return (s >= 3600 ? Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') : Math.floor(s / 60)) + ':' + String(s % 60).padStart(2, '0'); };
function audElapsed() { const r = audRec; return r ? (r.paused ? r.pausedAt : performance.now()) - r.t0 - r.pausedTotal : 0; }
/* marks an object or a drawing with the current moment of the recording */
function audStamp(x) {
  const r = audRec; if (!r || r.paused || !x || x.at || !cur) return;
  x.at = { r: r.id, t: Math.round(audElapsed()) }; r.pages.add(cur.id);
}
/* text: the paragraph you type in remembers when you started it */
document.addEventListener('input', (e) => {
  const ed = e.target && e.target.closest && e.target.closest('.flow,.otext'); if (!ed || !work.contains(ed)) return;
  const sl = getSelection(), n = sl && sl.anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement);
  const blk = el && el.closest('p,h1,h2,h3,h4,li,blockquote,pre'); if (!blk || !ed.contains(blk)) return;
  const r = audRec;
  if (r && !r.paused && cur) {
    if (!blk.hasAttribute('data-at') || e.inputType === 'insertParagraph') { blk.setAttribute('data-at', r.id + '@' + Math.round(audElapsed())); r.pages.add(cur.id); }
    const oel = ed.closest('.obj'); if (oel && doc && doc.objs[oel.dataset.id]) audStamp(doc.objs[oel.dataset.id]);
  } else if (e.inputType === 'insertParagraph' && blk.hasAttribute('data-at') && blk.previousElementSibling && blk.previousElementSibling.getAttribute('data-at') === blk.getAttribute('data-at')) blk.removeAttribute('data-at');
}, true);
function micErrorText(e) {
  const n = e && e.name;
  if ((n === 'NotAllowedError' || n === 'SecurityError') && Capture.micAllowed() === false) return Platform.host === 'claude' ? 'Inside Claude, Cortex Scribe isn’t allowed to use the microphone. Sound recording works in the browser version (inkling.html) and in the desktop app.' : 'This page isn’t allowed to use the microphone.';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'The microphone isn’t allowed. Allow it for ' + (Platform.host === 'claude' ? 'this Claude page' : Platform.host === 'desktop' ? 'Cortex Scribe' : 'this page') + ' in the browser’s site settings, then try again.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No microphone was found.';
  if (n === 'NotReadableError') return 'The microphone is busy in another app.';
  return 'The microphone couldn’t be started.';
}
async function audStart() {
  if (!cur || !doc) return toast('Open a page first.');
  if (cur.ro) return toast('This page is view only.');
  if (audRec) return;
  if (!Capture.micOk || !window.MediaRecorder) return toast('This browser can’t record sound.');
  let stream;
  try { stream = await Capture.mic(); } catch (e) { return toast(micErrorText(e)); }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
  let rec;
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined); }
  catch { stream.getTracks().forEach((t) => t.stop()); return toast('This browser can’t record sound.'); }
  const r = { id: newId('au'), rec, chunks: [], stream, mime: rec.mimeType || mime || 'audio/webm', t0: performance.now(), paused: false, pausedAt: 0, pausedTotal: 0, pages: new Set([cur.id]), start: now(), page: cur.id, timer: 0 };
  rec.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
  try { rec.start(1000); } catch { stream.getTracks().forEach((t) => t.stop()); return toast('This browser can’t record sound.'); }
  audClosePlayer();
  audRec = r; r.timer = setInterval(renderAudBar, 500);
  renderAudBar(); if (typeof renderRibbon === 'function' && rtab === 'insert') renderRibbon();
  toast('Recording sound. What you write and draw now remembers this moment.');
}
function audPause() {
  const r = audRec; if (!r) return;
  if (!r.paused) { r.paused = true; r.pausedAt = performance.now(); try { r.rec.pause(); } catch {} }
  else { r.pausedTotal += performance.now() - r.pausedAt; r.paused = false; try { r.rec.resume(); } catch {} }
  renderAudBar();
}
async function audStop() {
  const r = audRec; if (!r) return;
  audRec = null; clearInterval(r.timer);
  const dur = Math.round((r.paused ? r.pausedAt : performance.now()) - r.t0 - r.pausedTotal);
  const blob = await new Promise((res) => { r.rec.onstop = () => res(r.chunks.length ? new Blob(r.chunks, { type: r.mime.split(';')[0] }) : null); try { r.rec.stop(); } catch { res(null); } });
  r.stream.getTracks().forEach((t) => t.stop());
  renderAudBar(); if (rtab === 'insert') renderRibbon();
  if (!blob) return toast('Nothing was recorded.');
  toast('Saving the sound recording…');
  const src = await mediaPut(blob);
  if (!src) return toast('The sound recording couldn’t be saved.');
  await loadMediaLib();
  const when = new Date(r.start).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const it = { id: r.id, kind: 'audio', src, dur, created: r.start, name: 'Class recording ' + when, page: r.page, pages: [...r.pages], winName: 'Sound recordings', fileType: blob.type };
  mediaLib.items.unshift(it); saveMediaLib();
  if (cur && it.pages.includes(cur.id)) audOpenPlayer(it);
  toast('Sound recording saved. Click something you wrote while it recorded to hear that moment.');
}
addEventListener('beforeunload', (e) => { if (audRec) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- the recordings of a page, and the player ---------- */
async function pageAudios(pid) {
  await loadMediaLib();
  return mediaLib.items.filter((it) => it.kind === 'audio' && (it.page === pid || (it.pages || []).includes(pid)));
}
async function audOpenPlayer(it) {
  if (audRec) return toast('Stop the recording first.');
  if (!it) {
    const list = cur ? await pageAudios(cur.id) : [];
    if (!list.length) return toast('No sound recordings on this page yet. Insert → Record sound.');
    it = list[0];
  }
  const url = await Files.url(it.src);
  if (!url) return toast('This recording isn’t available on this device.');
  audClosePlayer(true);
  const el = h('audio', { preload: 'auto', src: url });
  audPlay = { it, el, fade: prefs.get('audFade', true), speed: prefs.get('audSpeed', 1) };
  el.playbackRate = audPlay.speed;
  el.addEventListener('timeupdate', () => { audFadeNow(); renderAudTime(); });
  el.addEventListener('play', renderAudBar); el.addEventListener('pause', () => { renderAudBar(); audFadeNow(); });
  el.addEventListener('ended', renderAudBar);
  el.addEventListener('loadedmetadata', renderAudTime);
  /* recorded WebM files don't say how long they are, which breaks jumping: read to the end once, then go back */
  audPlay.ready = new Promise((res) => {
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    setTimeout(fin, 4000);
    el.addEventListener('loadedmetadata', () => {
      if (isFinite(el.duration)) return fin();
      const chk = () => { if (isFinite(el.duration)) { el.removeEventListener('durationchange', chk); el.currentTime = 0; renderAudTime(); fin(); } };
      el.addEventListener('durationchange', chk); el.currentTime = 1e101;
    }, { once: true });
  });
  work.classList.add('aud-on');
  renderAudBar();
}
function audClosePlayer(keepBar) {
  const p = audPlay; audPlay = null;
  if (p) { try { p.el.pause(); } catch {} p.el.removeAttribute('src'); }
  work.classList.remove('aud-on');
  $$('.aud-later').forEach((x) => x.classList.remove('aud-later'));
  if (!keepBar) renderAudBar();
}
/* plays recording `rid` from `t` milliseconds (a little earlier, so the start of the sentence is heard) */
async function audJump(rid, t) {
  await loadMediaLib();
  const it = mediaLib.items.find((x) => x.id === rid && x.kind === 'audio');
  if (!it) return toast('The sound recording for this was deleted.');
  if (!audPlay || audPlay.it.id !== rid) await audOpenPlayer(it);
  const p = audPlay; if (!p) return;
  await p.ready;
  if (audPlay !== p) return;
  p.el.currentTime = Math.max(0, t / 1000 - 2); p.el.play().catch(() => {});
}
const atOf = (x) => (x && x.at && x.at.r ? x.at : null);
function audFadeNow() {
  const p = audPlay; if (!p || !view) return;
  const on = p.fade && !p.el.paused, rid = p.it.id, t = p.el.currentTime * 1000;
  for (const b of work.querySelectorAll('[data-at]')) { const m = AUD_RE.exec(b.getAttribute('data-at') || ''); b.classList.toggle('aud-later', !!(on && m && m[1] === rid && +m[2] > t)); }
  for (const o of objList((x) => x.at)) { const el = findObjEl(o.id); if (el) el.classList.toggle('aud-later', !!(on && o.at.r === rid && o.at.t > t)); }
  for (const st of strokeList((x) => x.at)) for (const el of work.querySelectorAll('path[data-id="' + cssq(st.id) + '"]')) el.classList.toggle('aud-later', !!(on && st.at.r === rid && st.at.t > t));
}
/* clicking something made during a recording plays from that moment (while the player is open) */
work.addEventListener('pointerdown', (e) => {
  if (!audPlay || e.button !== 0 || !cur || !doc) return;
  if (e.target.closest('.hnd,.zoombox,.page-zoom,.w3-head,.w3-btn,button,input,select')) return;
  const blk = e.target.closest('[data-at]');
  const m = blk && AUD_RE.exec(blk.getAttribute('data-at') || '');
  if (m) { audJump(m[1], +m[2]); return; }
  const oel = e.target.closest('.obj'), o = oel && doc.objs[oel.dataset.id];
  if (o && atOf(o)) { audJump(o.at.r, o.at.t); return; }
  const s = view && view.surfaces && view.surfaces.find((x) => x && x.el.contains(e.target)); if (!s) return;
  const pt = s.toLocal(e.clientX, e.clientY), rad = 10 / s.k();
  const st = strokeList((x) => x.at && (x.sh || 0) === (s.sheet || 0)).find((x) => distToStroke(pt, x) <= rad + (x.s || 3) / 2);
  if (st) audJump(st.at.r, st.at.t);
}, true);
function renderAudTime() {
  const p = audPlay; if (!p) return;
  const t = $('#audTime'), r = $('#audSeek'), dur = (isFinite(p.el.duration) && p.el.duration ? p.el.duration * 1000 : p.it.dur) || 0;
  if (t) t.textContent = fmtClock(p.el.currentTime * 1000) + ' / ' + fmtClock(dur);
  if (r && document.activeElement !== r) { r.max = String(Math.round(dur)); r.value = String(Math.round(p.el.currentTime * 1000)); }
}
async function renderAudBar() {
  audBar.textContent = '';
  const r = audRec, p = audPlay;
  audBar.hidden = !r && !p;
  if (r) {
    audBar.classList.add('rec');
    audBar.append(h('span', { class: 'aud-dot' + (r.paused ? ' paused' : '') }), h('b', null, r.paused ? 'Paused' : 'Recording sound'), h('span', { class: 'aud-clock', id: 'audClock' }, fmtClock(audElapsed())),
      h('button', { class: 'btn small', id: 'audPause', onclick: audPause }, svg(r.paused ? 'mic' : 'pause'), r.paused ? 'Go on' : 'Pause'),
      h('button', { class: 'btn small primary', id: 'audStop', onclick: audStop }, svg('stopSq'), 'Stop and save'));
    return;
  }
  audBar.classList.remove('rec');
  if (!p) return;
  const list = cur ? await pageAudios(cur.id) : [p.it];
  if (audPlay !== p) return;
  const pick = h('button', { class: 'btn small aud-name', title: 'Choose another recording of this page', onclick: (e) => openMenu(e.currentTarget, [{ label: 'Sound recordings of this page', header: true }, ...list.map((it) => ({ label: it.name + ' (' + fmtClock(it.dur) + ')', icon: 'mic', checked: it.id === p.it.id, fn: () => audOpenPlayer(it) })), { sep: true }, { label: 'Rename this recording…', icon: 'edit', fn: async () => { const n = await promptModal('Rename the recording', 'Name', p.it.name, 'Rename'); if (n && n.trim()) { p.it.name = n.trim().slice(0, 80); saveMediaLib(); renderAudBar(); } } }]) }, svg('mic'), h('span', null, p.it.name));
  const seek = h('input', { type: 'range', id: 'audSeek', min: 0, max: String(p.it.dur || 0), value: 0, step: 100, 'aria-label': 'Position in the recording' });
  seek.addEventListener('input', () => { p.el.currentTime = +seek.value / 1000; renderAudTime(); });
  const playing = !p.el.paused && !p.el.ended;
  const fade = h('input', { type: 'checkbox', checked: p.fade ? true : null });
  fade.addEventListener('change', () => { p.fade = fade.checked; prefs.set('audFade', fade.checked); audFadeNow(); });
  audBar.append(pick,
    h('button', { class: 'icon-btn', title: 'Back 10 seconds', 'aria-label': 'Back 10 seconds', onclick: () => { p.el.currentTime = Math.max(0, p.el.currentTime - 10); } }, svg('undo')),
    h('button', { class: 'icon-btn aud-play', id: 'audPlayBtn', title: playing ? 'Pause' : 'Play', 'aria-label': playing ? 'Pause' : 'Play', onclick: () => { if (p.el.paused || p.el.ended) p.el.play().catch(() => toast('The recording couldn’t be played.')); else p.el.pause(); } }, svg(playing ? 'pause' : 'play')),
    h('button', { class: 'icon-btn', title: 'Forward 10 seconds', 'aria-label': 'Forward 10 seconds', onclick: () => { p.el.currentTime = p.el.currentTime + 10; } }, svg('redo')),
    h('span', { class: 'aud-clock', id: 'audTime' }), seek,
    h('button', { class: 'btn small', title: 'Speed', onclick: () => { const sp = [1, 1.25, 1.5, 2, 0.75]; p.speed = sp[(sp.indexOf(p.speed) + 1) % sp.length]; p.el.playbackRate = p.speed; prefs.set('audSpeed', p.speed); renderAudBar(); } }, p.speed + '×'),
    h('label', { class: 'aud-fade', title: 'While it plays, what you wrote later is faded, so you see the notes as they were written' }, fade, 'Fade what came later'),
    h('button', { class: 'icon-btn', title: 'Close the player', 'aria-label': 'Close the player', onclick: () => audClosePlayer() }, svg('close')));
  renderAudTime();
}
setInterval(() => { if (audRec) { const c = $('#audClock'); if (c) c.textContent = fmtClock(audElapsed()); } }, 500);
/* the Insert tab buttons */
function audRibbonButtons() {
  return [rb(audRec ? 'stopSq' : 'mic', audRec ? 'Stop the sound recording' : 'Record sound: what you write remembers the moment', () => (audRec ? audStop() : audStart()), { big: true, text: audRec ? 'Stop sound' : 'Record sound', cls: audRec ? 'rec-on' : '' }),
    rb('play', 'Play the sound recordings of this page', () => audOpenPlayer(), { big: true, text: 'Recordings' })];
}

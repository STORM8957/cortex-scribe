
/* ================= handwriting pad extras: modes, colours, style, drawing → picture ================= */
const PAD_BASIC = ['#E5383B', '#FF5FA2', '#2563EB', '#16A34A', 'ink'];   // the 5 basic colours; “Any colour” for the rest
const PAD_COLORS = ['ink', '#000000', '#7F7F7F', '#880015', '#ED1C24', '#FF7F27', '#FFF200', '#22B14C', '#00A2E8', '#3F48CC', '#A349A4', '#FFFFFF', '#C3C3C3', '#B97A57', '#FFAEC9', '#FFC90E', '#EFE4B0', '#B5E61D', '#99D9EA', '#7092BE', '#C8BFE7'];
const padMode = () => prefs.get('padMode', 'write');
let padStyleBlob = null;
const busyRow = (t) => h('div', { class: 'busy' }, h('span', { class: 'spinner' }), h('span', null, t));
function dataURLtoBlob(d) {
  const m = String(d).match(/^data:([^;,]+)(;base64)?,(.*)$/); if (!m) return null;
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: m[1] });
}
function renderPadTools() {
  const box = $('#padTools'); if (!box) return; box.textContent = '';
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'What the pad is for' }, [['write', 'Write text'], ['draw', 'Draw a picture']].map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String(padMode() === k), onclick: () => { prefs.set('padMode', k); clearTimeout(pad.timer); renderPadTools(); } }, l)));
  const sws = h('div', { class: 'swatches pad-sw' }, PAD_BASIC.map((c) => h('button', { class: 'sw', style: { background: c === 'ink' ? 'var(--ink)' : c }, title: c === 'ink' ? 'Black (white on a dark page)' : c, 'aria-label': 'Pad colour ' + (c === 'ink' ? 'ink' : c), 'aria-pressed': String(pad.color === c), onclick: () => { pad.color = c; prefs.set('padColor', c); renderPadTools(); } })),
    h('input', { type: 'color', 'aria-label': 'Any colour', value: /^#[0-9a-f]{6}$/i.test(pad.color) ? pad.color : '#e5383b', onchange: (e) => { pad.color = e.target.value; prefs.set('padColor', pad.color); renderPadTools(); } }));
  const sizes = h('div', { class: 'sizes' }, [2, 3.6, 7, 12].map((s, i) => h('button', { class: 'tb', 'aria-label': ['Thin', 'Normal', 'Thick', 'Very thick'][i] + ' line', 'aria-pressed': String(pad.size === s), onclick: () => { pad.size = s; prefs.set('padSize', s); renderPadTools(); } }, h('span', { style: { width: (3 + i * 3) + 'px', height: (3 + i * 3) + 'px' } }))));
  box.append(seg, h('div', { class: 'pad-row' }, sws, sizes));
  $('#padAutoWrap').hidden = padMode() !== 'write';
}
async function loadPadStyle() {
  const d = prefs.get('padStyleImg', null);
  const th = $('#padStyleThumb'), del = $('#padStyleDel');
  if (d) { th.src = d; th.hidden = false; del.hidden = false; padStyleBlob = dataURLtoBlob(d); }
  else { th.hidden = true; del.hidden = true; padStyleBlob = null; }
  if (typeof padSendStyle === 'function') padSendStyle();   // the pad on another screen shows the same style (37_pad.js)
}
async function setStyleImage(f) {
  try { const s = await shrink(f, 560, 0.78); const d = await toDataURL(s.blob); prefs.set('padStyleImg', d); loadPadStyle(); toast('Style picture saved. Pictures and 3D models will copy its look.'); }
  catch { toast('That picture couldn’t be used. Try a JPG or PNG.'); }
}
$('#padStyle').value = prefs.get('padStyle', '');
$('#padStyle').addEventListener('input', (e) => prefs.set('padStyle', e.target.value));
$('#padStyleBtn').addEventListener('click', () => $('#styleIn').click());
$('#styleIn').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  setStyleImage(f);
});
for (const el of [$('#padStyle'), $('.style-img')]) dropFiles(el, (files) => setStyleImage(files[0]));
$('#padStyleBtn').textContent = 'Upload or drop an image for your style';
$('#padStyleDel').addEventListener('click', () => { prefs.set('padStyleImg', null); loadPadStyle(); });
function cleanSVG(t) {
  const m = String(t || '').match(/<svg[\s\S]*<\/svg>/i); if (!m) return null;
  const d = new DOMParser().parseFromString(m[0], 'image/svg+xml');
  const root = d.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || d.getElementsByTagName('parsererror').length) return null;
  for (const e of [...root.querySelectorAll('script,foreignObject,iframe,image,a,audio,video')]) e.remove();
  for (const e of [root, ...root.querySelectorAll('*')]) {
    for (const a of [...e.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on')) e.removeAttribute(a.name);
      else if ((n === 'href' || n === 'xlink:href') && !a.value.startsWith('#')) e.removeAttribute(a.name);
      else if (/url\(\s*['"]?(?!#)/i.test(a.value)) e.removeAttribute(a.name);
    }
    if (e.nodeName.toLowerCase() === 'style') e.textContent = e.textContent.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none');
  }
  root.setAttribute('xmlns', SVGNS);
  let vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !isFinite(v)) || vb[2] <= 0 || vb[3] <= 0) { const w = parseFloat(root.getAttribute('width')) || 600, hh = parseFloat(root.getAttribute('height')) || 450; vb = [0, 0, w, hh]; root.setAttribute('viewBox', vb.join(' ')); }
  root.setAttribute('width', String(vb[2])); root.setAttribute('height', String(vb[3]));
  const s = new XMLSerializer().serializeToString(root);
  return s.length > 180000 ? null : s;
}
function svgSize(s) { const m = s.match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/); return m ? { w: +m[1] || 600, h: +m[2] || 450 } : { w: 600, h: 450 }; }
async function storeBlobSrc(blob, fallbackDataURL) {
  { const up = await Files.upload(blob); if (up) return up; }
  return fallbackDataURL || toDataURL(blob);
}
const storeSVG = (s) => storeBlobSrc(new Blob([s], { type: 'image/svg+xml' }), 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s))));
const styleText = () => { const s = ($('#padStyle').value || '').trim(); return s ? 'Style the student wants: ' + s + '.' : ''; };
const SVG_RULES = 'Output one standalone SVG: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H">…</svg> with W and H between 300 and 900. Use paths, basic shapes, groups and gradients only. No <script>, no <foreignObject>, no <image>, no links, no external fonts, no event attributes. Add text only if words are written in the sketch. Keep it under 50 KB. Reply with only the SVG code.';
async function sketchToSVG(sketch, signal) {
  const images = [sketch];
  let prompt = 'The attached image is a rough sketch a student drew (coloured strokes on white). Turn it into a clean, finished illustration of the same subject and composition. Keep the colours the student used where they make sense. ' + (styleText() || 'Style: clean, friendly flat illustration with clear outlines.') + ' ' + padBgRule() + '\n' + SVG_RULES;
  if (padStyleBlob && AI.img && (AI.img.maxCount || 0) > 1) { images.push(padStyleBlob); prompt += '\nThe last attached image shows the style to copy (colours, line style, mood). Do not copy what it shows.'; }
  const opts = { task: 'sketch.svg', modelTier: 'default', cache: false, images }; if (signal) opts.signal = signal;
  const { text } = await AI.text(prompt, opts);
  const s = cleanSVG(text); if (!s) throw { code: 'nosvg' };
  return padSvgBg(s);
}
/* strokes: a drawing sent from the pad on another screen (otherwise the pad in the panel). Returns true when a picture was made. */
async function padToImage(more, strokes) {
  const local = !strokes;
  strokes = strokes || pad.strokes;
  if (!cur || !doc || cur.ro) { toast('Open a page you can edit first.'); padState('Open a page you can edit first.'); return false; }
  if (!aiReady()) { padState('Pictures from drawings work ' + Platform.aiWhere + '.'); return false; }
  if (!more && !strokes.length) { padState('Draw something on the pad first.'); return false; }
  if (!more && !AI.img) { padState(AI.noPics); return false; }
  if (more && !pad.lastSvg) { toast('Make a picture first (Drawing → picture).'); return false; }
  if (pad.busy) { padState('The pad is still busy. Try again in a moment.'); return false; }
  if (local) clearTimeout(pad.timer);
  pad.busy = true; padState(more ? 'Adding more detail…' : 'Turning your drawing into a picture…', true);
  try {
    let svgText;
    if (more) {
      const { text } = await AI.text('Here is an SVG illustration a student made from a sketch. Add more detail so it looks more finished: shading, texture, highlights, small details and depth. Keep the same subject, composition, colours and proportions. ' + styleText() + '\n' + SVG_RULES + '\n\nSVG:\n' + pad.lastSvg, { task: 'sketch.detail', modelTier: 'default', cache: false });
      svgText = padSvgBg(cleanSVG(text)); if (!svgText) throw { code: 'nosvg' };
    } else svgText = await sketchToSVG(await padBlob(strokes, true));
    const { w, h: hh } = svgSize(svgText);
    const src = await storeSVG(svgText);
    const old = pad.lastObj && doc.objs[pad.lastObj] && !doc.objs[pad.lastObj].del ? doc.objs[pad.lastObj] : null;
    if (more && old) { pushUndo(); old.src = src; old.h = Math.round(old.w * hh / w); changed(old); view.renderAll(); saveDoc('main'); }
    else { const W = Math.min(view.kind === 'a4' ? 380 : 420, w); const o = insertObj({ t: 'image', w: W, h: Math.round(W * hh / w), src, alt: 'Drawing' }); if (o) pad.lastObj = o.id; if (local) { pad.strokes = []; padDraw(); } }
    pad.lastSvg = svgText; pad.lastKind = 'img';
    padState(''); $('#padLast').textContent = more ? 'Added more detail to the picture.' : 'Picture added to the page. “Add more detail” refines it.';
    return true;
  } catch (e) { padState(e && e.code === 'nosvg' ? 'That didn’t work. Try again, or draw a bit clearer.' : aiErrorText(e)); return false; }
  finally { pad.busy = false; }
}
$('#kImg').addEventListener('click', () => padToImage(false));
$('#k3d').addEventListener('click', () => gen3D({ fromPad: true }));
$('#kDetail').addEventListener('click', () => { if (pad.lastKind === '3d' && model3D(m3dCur)) detail3D(model3D(m3dCur)); else padToImage(true); });

/* ================= 3D models (library per notebook) ================= */
let lib3d = { nb: null, items: [], loaded: false };
let m3dCur = null, m3dBusy = null;
const model3D = (id) => lib3d.items.find((m) => m.id === id) || null;
async function load3D(nb) {
  if (lib3d.nb === nb && lib3d.loaded) return;
  lib3d = { nb, items: [], loaded: false };
  if (!nb) return;
  const d = await Store.get('models_' + nb).catch(() => null);
  if (lib3d.nb !== nb) return;
  lib3d.items = (d && Array.isArray(d.items)) ? d.items : []; lib3d.loaded = true;
}
function save3D() { const nb = lib3d.nb; if (!nb) return; const items = lib3d.items.slice(0, 40).map((m) => ({ ...m, prev: undefined })); Saver.schedule('models_' + nb, { items }, (x) => Store.set('models_' + nb, x), 400); }
const SCENE_SPEC = 'Describe the model with simple 3D parts. Units are metres, Y is up, the model stands on the ground at y = 0 and is about 1 to 4 units big. Part types:\n' +
  '- {"type":"box","size":[w,h,d]}\n- {"type":"sphere","r":0.5}\n- {"type":"cylinder","rTop":0.3,"rBottom":0.3,"h":1}\n- {"type":"cone","r":0.5,"h":1}\n- {"type":"torus","r":0.6,"tube":0.15}\n' +
  '- {"type":"extrude","points":[[x,y],…],"depth":0.3}: a flat 2D outline in the x/y plane pulled out along z (good for stars, hearts, letters, logos)\n- {"type":"lathe","points":[[radius,y],…]}: a profile spun around the Y axis (good for vases, bottles, cups)\n- {"type":"plane","size":[w,h]}\n' +
  'Every part may also have "name":"short name of the component", "pos":[x,y,z], "rot":[x,y,z] in degrees, "scale":[x,y,z], "color":"#rrggbb", "metal":0-1, "rough":0-1, "opacity":0-1. Parts are centred on their pos. Use at most 60 parts.';
/* “2× more detail” (3D studio): twice the parts and finer details in everything the AI builds */
const detail2 = () => !!prefs.get('m3dDetail2', false);
const DETAIL2_RULE = 'Make it twice as detailed as you normally would: about twice as many parts, with small details such as bolts, seams, trims, panels, handles and bevels.';
/* “Max effort” (3D studio): the AI copies the object as exactly as it can, with the most parts, and thinks hardest */
const maxEffort = () => !!prefs.get('m3dMax', false);
const MAX_RULE = 'Replicate the object as faithfully as you can, like an engineering model: real proportions and dimensions, every visible component as its own named part, the right colours and materials (metal, rough), and parts that touch exactly where they should. Before you answer, check every part’s size and position.';
const sceneSpec = (rule = true) => (maxEffort() ? SCENE_SPEC.replace('Use at most 60 parts.', 'Use at most 160 parts.') + (rule ? '\n' + MAX_RULE : '')
  : detail2() ? SCENE_SPEC.replace('Use at most 60 parts.', 'Use at most 120 parts.') + (rule ? '\n' + DETAIL2_RULE : '') : SCENE_SPEC);
/* AI options for building models: the most careful answer when Max effort is on */
const m3dOpts = (task) => ({ task, modelTier: 'default', cache: false, ...(maxEffort() ? { effort: 'max' } : {}) });
const n3 = (v, d, lo, hi) => { v = +v; if (!isFinite(v)) v = d; return clamp(v, lo, hi); };
const v3v = (a, d, lo, hi) => [0, 1, 2].map((i) => n3(Array.isArray(a) ? a[i] : undefined, d[i], lo, hi));
function normScene(d) {
  if (!d || !Array.isArray(d.parts)) return null;
  const parts = [];
  for (const p of d.parts.slice(0, 160)) {
    if (!p || typeof p !== 'object') continue;
    const t = String(p.type || '').toLowerCase();
    const q = { type: t, pos: v3v(p.pos, [0, 0, 0], -60, 60), rot: v3v(p.rot, [0, 0, 0], -720, 720), scale: v3v(p.scale, [1, 1, 1], 0.01, 50), color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#cccccc', metal: n3(p.metal, 0.1, 0, 1), rough: n3(p.rough, 0.55, 0, 1), opacity: n3(p.opacity, 1, 0.05, 1) };
    if (t === 'box') q.size = v3v(p.size, [1, 1, 1], 0.005, 60);
    else if (t === 'sphere') q.r = n3(p.r, 0.5, 0.005, 60);
    else if (t === 'cylinder') { q.rTop = n3(p.rTop != null ? p.rTop : p.r, 0.3, 0, 60); q.rBottom = n3(p.rBottom != null ? p.rBottom : p.r, 0.3, 0, 60); q.h = n3(p.h, 1, 0.005, 60); }
    else if (t === 'cone') { q.r = n3(p.r, 0.5, 0.005, 60); q.h = n3(p.h, 1, 0.005, 60); }
    else if (t === 'torus') { q.r = n3(p.r, 0.6, 0.005, 60); q.tube = n3(p.tube, 0.15, 0.002, 30); }
    else if (t === 'plane') q.size = v3v(p.size, [1, 1, 0], 0.005, 120);
    else if (t === 'extrude' || t === 'lathe') {
      const pts = (Array.isArray(p.points) ? p.points : []).slice(0, 400).filter((a) => Array.isArray(a)).map((a) => [n3(a[0], 0, -60, 60), n3(a[1], 0, -60, 60)]);
      if (pts.length < 3) continue;
      q.points = pts;
      if (t === 'extrude') { q.depth = n3(p.depth, 0.3, 0.005, 30); q.bevel = p.bevel !== false; }
    } else continue;
    if (typeof p.name === 'string' && p.name.trim()) q.name = p.name.trim().slice(0, 40);
    if (p.internal) q.internal = true;
    parts.push(q);
  }
  return parts.length ? { name: String(d.name || 'Model').slice(0, 80), parts } : null;
}
function inkHex(c) { return !c || c === 'ink' || c === 'var(--ink)' || c === '#1E2740' ? '#d9d9de' : (/^#[0-9a-f]{6}$/i.test(c) ? c : '#e5383b'); }
function extrudeFromStrokes(list, colors) {
  const strokes = list.map((pts, i) => ({ pts, c: colors[i] })).filter((s) => s.pts.length > 4);
  if (!strokes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const k = 2.4 / Math.max(1, x1 - x0, y1 - y0), cx = (x0 + x1) / 2;
  const parts = strokes.sort((a, b) => b.pts.length - a.pts.length).slice(0, 6).map((s) => {
    const simp = rdp(s.pts, Math.max(1, Math.max(x1 - x0, y1 - y0) * 0.012));
    return { type: 'extrude', points: simp.map(([x, y]) => [round1((x - cx) * k * 100) / 100, round1((y1 - y) * k * 100) / 100]), depth: 0.35, bevel: true, color: inkHex(s.c), pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], metal: 0.15, rough: 0.45, opacity: 1 };
  });
  return normScene({ name: 'My drawing', parts });
}
function outlinesText(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pts of list) for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const k = 100 / Math.max(1, x1 - x0, y1 - y0);
  return list.slice(0, 6).map((pts, i) => 'Stroke ' + (i + 1) + ': ' + JSON.stringify(rdp(pts, Math.max(1, (x1 - x0) * 0.015)).slice(0, 60).map(([x, y]) => [Math.round((x - x0) * k), Math.round((y1 - y) * k)]))).join('\n');
}
async function gen3D(o) {
  if (!cur) { toast('Open a page first.'); return null; }
  if (m3dBusy) return null;
  await load3D(currentNb());
  let prompt = '', images = [], local = null;
  if (o.fromPad) {
    const ps = o.strokes || pad.strokes;
    if (!ps.length) { toast('Draw something on the handwriting pad first (right panel, pen icon).'); openPanel('pen'); return null; }
    const list = ps.map((s) => s.pts);
    local = extrudeFromStrokes(list, ps.map((s) => s.c));
    if (AI.img) images.push(await padBlob(ps, true));
    prompt = 'Build a 3D model of what this sketch shows (the sketch is attached as an image; here are its strokes as points from 0 to 100, y up):\n' + outlinesText(list) + '\nIf the sketch is one flat outline (like a star, heart or letter), use an "extrude" part with that outline, scaled to about 2 units, and use the colours of the strokes.';
  } else if (o.fromSel || o.content) {
    const strokes = o.content ? (o.content.strokes || []).filter((s) => s.k !== 'hl') : [...sel.ink].map((id) => doc.ink[id]).filter((s) => s && !s.del && s.k !== 'hl');
    const objs = o.content ? [] : selObjs();
    const text = o.content ? o.content.text : objs.map(objText).filter(Boolean).join('\n');
    if (!strokes.length && !objs.length && !text) { toast('Select a drawing on the page first (Select tool, then drag around it).'); return null; }
    if (strokes.length) local = extrudeFromStrokes(strokes.map((s) => toPts(s.p)), strokes.map((s) => s.c));
    if (o.content && o.content.images) images.push(...o.content.images);
    else { if (strokes.length && AI.img) images.push(await strokesToBlob(strokes, true)); for (const ob of objs) if ((ob.t === 'image' || ob.t === 'm3d') && images.length < 3 && ob.src) { const b = await imgBlobFromSrc(resolveSrc(ob.src), ob.id).catch(() => null); if (b) images.push(b); } }
    prompt = 'Build a 3D model of what this part of a student’s notes shows.' + (text ? '\nText in it:\n' + text : '') + (strokes.length ? '\nDrawn strokes as points from 0 to 100, y up:\n' + outlinesText(strokes.map((s) => toPts(s.p))) + '\nIf the drawing is one flat outline, use an "extrude" part with that outline.' : '');
  } else if (o.photo) {
    if (!AI.ok) { aiReady(); return null; }
    if (!AI.img) { toast(AI.noPics); return null; }
    try { images.push((await shrink(o.photo, 1024, 0.85)).blob); } catch { toast('That photo couldn’t be read. Try a JPG or PNG.'); return null; }
    prompt = 'Build a 3D model of the main object in the attached photo. Match its shape, proportions and colours as closely as simple parts allow, and leave out the background.';
  } else {
    if (!o.desc || !o.desc.trim()) { toast('Describe the model first.'); return null; }
    prompt = 'Build a 3D model of: ' + o.desc.trim();
  }
  const finish = (sc) => {
    const m = { id: newId('m3'), name: sc.name, scene: { parts: sc.parts }, links: [], page: cur ? cur.id : null, created: now(), u: now() };
    if (o.desc && o.desc.trim()) m.desc = o.desc.trim().slice(0, 1500);   // what it was made from is its first description
    lib3d.items.unshift(m); save3D(); m3dCur = m.id; m3dSub = null; m3dTab = 'preview'; m3dNewOpen = false; pad.lastKind = '3d';
    return m;
  };
  if (!AI.ok) {
    if (local) { const m = finish(local); openPanel('m3d'); toast('Turned your outline into 3D. More detail needs an AI.'); return m; }
    aiReady(); return null;
  }
  m3dBusy = (o.photo ? 'Building a 3D model from your photo' : 'Building the 3D model') + (maxEffort() ? ' with max effort (this can take a few minutes)…' : '…'); if (!o.content) openPanel('m3d');
  try {
    if (padStyleBlob && AI.img && !o.photo) { images.push(padStyleBlob); prompt += '\nThe last attached image shows the style and colours the student likes.'; }
    const opts = m3dOpts(o.photo ? 'model3d.photo' : 'model3d.create'); if (images.length && AI.img) opts.images = images.slice(0, AI.img.maxCount || 4);
    const d = await AI.json(prompt + '\n' + styleText() + '\n' + sceneSpec() + '\nReply with only JSON: {"name":"short name","parts":[…]}', opts);
    const sc = normScene(d) || local;
    if (!sc) throw { code: 'invalid_json' };
    return finish(sc);
  } catch (e) {
    if (local) { const m = finish(local); toast(AI.name.replace(/^t/, 'T') + ' couldn’t build it, so your outline was turned into 3D.'); return m; }
    toast(aiErrorText(e)); return null;
  } finally { m3dBusy = null; if (ptab === 'm3d') render3DPanel(); }
}
const descText = (d) => { d = String(d || '').trim(); return d ? '\nWhat the student says about this object (keep to it): ' + d.slice(0, 1500) + '\n' : ''; };
async function aiChangeScene(name, parts, instruction, desc) {
  const d = await AI.json('Here is a 3D model as JSON:\n' + JSON.stringify({ name, parts }) + '\n' + descText(desc) + '\nChange it like this: ' + instruction.trim() + '\nKeep everything else the same. ' + styleText() + '\n' + sceneSpec(false) + '\nReply with only the whole updated model as JSON: {"name":"…","parts":[…]}', { task: 'model3d.edit', modelTier: 'default', cache: false });
  const sc = normScene(d); if (!sc) throw { code: 'invalid_json' };
  return sc;
}
const DETAIL_CMD = 'Add more detail so it looks more finished and realistic: extra small parts, bevels, trims, texture-like details and a nicer colour scheme. Keep the overall shape, size and position.';
async function change3D(m, instruction, busyText) {
  if (!m || !instruction.trim() || m3dBusy) return;
  if (!aiReady()) return;
  m3dBusy = busyText || 'Changing the model…'; render3DPanel();
  try { const sc = await aiChangeScene(m.name, m.scene.parts, instruction, m.desc); m.prev = m.scene; m.scene = { parts: sc.parts }; delete m.pieces; m.u = now(); save3D(); }
  catch (e) { toast(aiErrorText(e)); }
  finally { m3dBusy = null; render3DPanel(); }
}
const detail3D = (m) => change3D(m, DETAIL_CMD, 'Adding more detail…');

/* ================= one shared 3D renderer, many views ================= */
const V3 = { T: null, r: null, scene: null, cam: null, grid: null, cache: new WeakMap(), ok: null, views: new Set() };
let v3Promise = null;
function v3Init() {
  if (!v3Promise) v3Promise = (async () => {
    try { await loadLib('three'); } catch { V3.ok = false; return false; }
    const T = window.THREE; if (!T) { V3.ok = false; return false; }
    let r; try { r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch { V3.ok = false; return false; }
    if ('outputEncoding' in r && T.sRGBEncoding) r.outputEncoding = T.sRGBEncoding;
    V3.T = T; V3.r = r; V3.scene = new T.Scene(); V3.cam = new T.PerspectiveCamera(40, 1.5, 0.05, 1000);
    V3.scene.add(new T.HemisphereLight(0xffffff, 0x444455, 0.9));
    const d1 = new T.DirectionalLight(0xffffff, 0.95); d1.position.set(5, 9, 7); V3.scene.add(d1);
    const d2 = new T.DirectionalLight(0xffffff, 0.35); d2.position.set(-6, 4, -5); V3.scene.add(d2);
    V3.grid = new T.GridHelper(14, 28, 0x888888, 0x444444); V3.grid.material.transparent = true; V3.grid.material.opacity = 0.3; V3.scene.add(V3.grid);
    V3.ok = true; v3Theme();
    return true;
  })();
  return v3Promise;
}
function v3Theme() {
  if (!V3.r) return;
  try { V3.r.setClearColor(new V3.T.Color(cssVar('--sheet') || '#161618'), 1); } catch { V3.r.setClearColor(0x161618, 1); }
  for (const v of [...V3.views]) { if (!v.cv.isConnected) V3.views.delete(v); else v.draw(); }
}
function partMesh(p) {
  const T = V3.T; let g = null;
  switch (p.type) {
    case 'box': g = new T.BoxGeometry(p.size[0], p.size[1], p.size[2]); break;
    case 'sphere': g = new T.SphereGeometry(p.r, 40, 24); break;
    case 'cylinder': g = new T.CylinderGeometry(p.rTop, p.rBottom, p.h, 40); break;
    case 'cone': g = new T.ConeGeometry(p.r, p.h, 40); break;
    case 'torus': g = new T.TorusGeometry(p.r, p.tube, 20, 56); break;
    case 'plane': g = new T.PlaneGeometry(p.size[0], p.size[1]); break;
    case 'extrude': { const sh = new T.Shape(); p.points.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); const bs = Math.min(p.depth * 0.25, 0.06); g = new T.ExtrudeGeometry(sh, { depth: p.depth, bevelEnabled: p.bevel, bevelThickness: bs, bevelSize: bs, bevelSegments: 3, curveSegments: 16 }); g.translate(0, 0, -p.depth / 2); break; }
    case 'lathe': g = new T.LatheGeometry(p.points.map(([x, y]) => new T.Vector2(Math.max(0, x), y)), 56); break;
  }
  if (!g) return null;
  const mat = new T.MeshStandardMaterial({ color: new T.Color(p.color), metalness: p.metal, roughness: p.rough, transparent: p.opacity < 1, opacity: p.opacity, side: p.type === 'plane' || p.type === 'lathe' ? T.DoubleSide : T.FrontSide });
  const mesh = new T.Mesh(g, mat);
  mesh.userData.internal = !!p.internal; mesh.userData.op = p.opacity;
  mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
  mesh.rotation.set(p.rot[0] * Math.PI / 180, p.rot[1] * Math.PI / 180, p.rot[2] * Math.PI / 180);
  mesh.scale.set(p.scale[0], p.scale[1], p.scale[2]);
  return mesh;
}
function groupFor(scene) {
  let g = V3.cache.get(scene);
  if (!g) {
    g = new V3.T.Group(); g.userData.model = true;
    for (const p of (scene && scene.parts) || []) { try { const m = partMesh(p); if (m) g.add(m); } catch {} }
    V3.cache.set(scene, g); V3.scene.add(g);
  }
  return g;
}
function dropScene(scene) {
  const g = scene && V3.cache.get(scene); if (!g) return;
  V3.scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  V3.cache.delete(scene);
}
function showOnly(items) {
  for (const c of V3.scene.children) if (c.userData && c.userData.model) c.visible = false;
  for (const it of items) { const g = groupFor(it.scene); g.visible = true; const p = it.pos || [0, 0, 0]; g.position.set(p[0], p[1], p[2]); applyXray(g, !!it.xray); }
}
/* X-ray: the outside parts turn see-through so the parts inside show */
function applyXray(g, on) {
  if (!!g.userData.xray === on) return;
  g.userData.xray = on;
  g.traverse((m) => {
    if (!m.isMesh || !m.material) return;
    const base = m.userData.op == null ? 1 : m.userData.op, ghost = on && !m.userData.internal;
    m.material.transparent = ghost || base < 1; m.material.opacity = ghost ? Math.min(base, 0.16) : base;
    m.material.depthWrite = !ghost; m.material.needsUpdate = true;
  });
}
function fitState(st) {
  const T = V3.T, box = new T.Box3();
  for (const c of V3.scene.children) if (c.visible && c.userData && c.userData.model) box.expandByObject(c);
  if (box.isEmpty()) { st.tgt = new T.Vector3(0, 0.8, 0); st.dist = 6; st.gy = 0; st.floor = null; return; }
  st.tgt = box.getCenter(new T.Vector3());
  const s = box.getSize(new T.Vector3());
  st.dist = Math.max(s.x, s.y, s.z) * 2.1 + 0.6;
  floorFor(st, box);
}
/* the floor grid grows (in steps of 2) so the model and all its pieces stand on it, and sits under them */
function floorFor(st, box) {
  const T = V3.T;
  if (!box) { box = new T.Box3(); for (const c of V3.scene.children) if (c.visible && c.userData && c.userData.model) box.expandByObject(c); }
  if (box.isEmpty()) { st.floor = null; return; }
  const need = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 1.4 + 2;
  const k = need <= 14 ? 1 : Math.pow(2, Math.ceil(Math.log2(need / 14))), cell = 0.5 * k, c = box.getCenter(new T.Vector3());
  st.floor = { k, cx: Math.round(c.x / cell) * cell, cz: Math.round(c.z / cell) * cell };
  st.gy = Math.min(0, box.min.y);
}
function renderState(st, W, H) {
  const r = V3.r, cam = V3.cam, t = st.tgt;
  r.setPixelRatio(1); r.setSize(W, H, false);
  cam.aspect = W / H; cam.updateProjectionMatrix();
  const f = st.floor;
  const gk = f ? f.k : 1; V3.grid.scale.set(gk, gk, gk); V3.grid.position.set(f ? f.cx : 0, st.gy || 0, f ? f.cz : 0);
  cam.position.set(t.x + st.dist * Math.sin(st.ph) * Math.sin(st.th), t.y + st.dist * Math.cos(st.ph), t.z + st.dist * Math.sin(st.ph) * Math.cos(st.th));
  cam.lookAt(t); r.render(V3.scene, cam);
}
/* spinning speed in radians per second: Slow is the normal one (a turn in about 25 s) */
const SPIN_SPEEDS = [['Very slow', 0.12], ['Slow', 0.25], ['Medium', 0.5], ['Fast', 1]];
const SPIN_DEFAULT = 0.25;
const spinRate = (o) => (o && +o.spinSpeed > 0 ? clamp(+o.spinSpeed, 0.02, 3) : SPIN_DEFAULT);
function make3DView(host, getItems, opts = {}) {
  const cv = h('canvas', { class: 'v3-canvas', role: 'img', 'aria-label': '3D view. Drag to turn, Shift and drag to move, scroll to zoom, double-click to reset, right-click for more.' });
  host.append(cv);
  const st = { th: 0.8, ph: 1.15, dist: 6, tgt: null, gy: 0, key: null, raf: 0 };
  if (opts.cam && V3.T && Array.isArray(opts.cam.tgt)) {
    const c = opts.cam; st.th = +c.th || 0.8; st.ph = clamp(+c.ph || 1.15, 0.08, Math.PI - 0.08); st.dist = clamp(+c.dist || 6, 0.3, 400);
    st.tgt = new V3.T.Vector3(+c.tgt[0] || 0, +c.tgt[1] || 0, +c.tgt[2] || 0); st.key = '__cam';
  }
  const v = { cv, st, paused: false, spin: false, live: false, rate: SPIN_DEFAULT };
  const render = () => {
    if (!V3.r || !cv.isConnected || (v.paused && !v.live)) return;
    const items = getItems(); if (!items) return;
    const w = cv.clientWidth, hh = cv.clientHeight; if (!w || !hh) return;
    const k = clamp((window.devicePixelRatio || 1) * (opts.scale ? opts.scale() : 1), 1, 2.5);
    const W = Math.round(w * k), H = Math.round(hh * k);
    showOnly(items);
    const key = items.map((i) => i.key).join('|');
    if (st.key === '__cam') { const t = {}; fitState(t); st.gy = t.gy; st.floor = t.floor; st.key = key; }
    else if (st.key !== key || !st.tgt) { fitState(st); st.key = key; }
    const fk = key + '#' + items.map((i) => (i.pos || [0, 0, 0]).join(',')).join('|');
    if (st.floorKey !== fk) { st.floorKey = fk; floorFor(st); }   // pieces moved: the floor follows them
    renderState(st, W, H);
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, W, H); ctx.drawImage(V3.r.domElement, 0, 0, W, H);
  };
  const draw = () => { if (st.raf) return; st.raf = requestAnimationFrame(() => { st.raf = 0; try { render(); } catch (e) { console.error(e); } }); };
  let loopRaf = 0;
  let lastT = 0;
  const loop = (t) => { loopRaf = 0; if (!cv.isConnected || !v.spin || v.paused || v.live) { lastT = 0; return; } const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0; lastT = t; st.th += v.rate * dt; try { render(); } catch {} loopRaf = requestAnimationFrame(loop); };
  let ro = null;
  Object.assign(v, {
    draw,
    renderNow() { try { render(); } catch (e) { console.error(e); } },
    refit() { st.key = null; draw(); },
    setSpin(on, rate) { v.spin = !!on; if (rate) v.rate = rate; if (v.spin && !v.paused && !loopRaf) loopRaf = requestAnimationFrame(loop); },
    setPaused(p) { v.paused = !!p; if (!v.paused) { draw(); if (v.spin && !loopRaf) loopRaf = requestAnimationFrame(loop); } },
    capture(W, H) {
      const items = getItems(); if (!items || !V3.r) return null;
      showOnly(items);
      if (!st.tgt) { fitState(st); st.key = items.map((i) => i.key).join('|'); }
      renderState(st, W, H);
      const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(V3.r.domElement, 0, 0, W, H);
      return c;
    },
    destroy() { V3.views.delete(v); if (ro) ro.disconnect(); if (loopRaf) cancelAnimationFrame(loopRaf); },
  });
  let camT = null;
  const camSaved = () => { if (!opts.onCam || !st.tgt) return; clearTimeout(camT); camT = setTimeout(() => { const r3 = (x) => Math.round(x * 1000) / 1000; opts.onCam({ th: r3(st.th), ph: r3(st.ph), dist: r3(st.dist), tgt: [r3(st.tgt.x), r3(st.tgt.y), r3(st.tgt.z)] }); }, 400); };
  const ptrs = new Map(); let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (opts.onDown) opts.onDown(e);
    try { cv.setPointerCapture(e.pointerId); } catch {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { x: e.clientX, y: e.clientY, button: e.button, moved: false, pan: e.button === 2 || e.shiftKey, th: st.th, ph: st.ph, tgt: st.tgt ? { x: st.tgt.x, y: st.tgt.y, z: st.tgt.z } : null, dist: st.dist };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag.pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || !ptrs.has(e.pointerId) || !st.tgt) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    if (ptrs.size === 2 && drag.pinch) { const [a, b] = [...ptrs.values()]; st.dist = clamp(drag.dist * drag.pinch / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), 0.3, 400); draw(); return; }
    if (drag.pan && drag.tgt) { const k = st.dist / 700, c = Math.cos(st.th), s2 = Math.sin(st.th); st.tgt.set(drag.tgt.x - c * dx * k, drag.tgt.y + dy * k, drag.tgt.z + s2 * dx * k); }
    else { st.th = drag.th - dx * 0.008; st.ph = clamp(drag.ph - dy * 0.008, 0.08, Math.PI - 0.08); }
    draw();
  });
  const up = (e) => {
    if (drag && ptrs.has(e.pointerId)) {
      if (drag.button === 2 && !drag.moved && opts.onContext && e.type === 'pointerup') opts.onContext(e);
      else if (drag.moved) camSaved();
    }
    ptrs.delete(e.pointerId); if (!ptrs.size) drag = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('dblclick', (e) => { e.stopPropagation(); v.refit(); camSaved(); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); st.dist = clamp(st.dist * Math.exp(e.deltaY * 0.0012), 0.3, 400); draw(); camSaved(); }, { passive: false });
  ro = window.ResizeObserver ? new ResizeObserver(() => draw()) : null;
  if (ro) ro.observe(cv);
  V3.views.add(v);
  return v;
}
function snapshotItems(items, W, H) {
  if (!V3.r) return null;
  showOnly(items);
  const st = { th: 0.8, ph: 1.15 }; fitState(st); renderState(st, W, H);
  const url = V3.r.domElement.toDataURL('image/jpeg', 0.84);
  for (const v of V3.views) v.draw();
  return url;
}
function itemsForModel(m) {
  const out = [{ scene: m.scene, pos: [0, 0, 0], key: m.id + ':' + m.u }];
  for (const l of m.links || []) { const lm = model3D(l.id); if (lm && lm.id !== m.id) out.push({ scene: lm.scene, pos: l.pos || [0, 0, 0], key: lm.id + ':' + lm.u }); }
  return out;
}
function itemsForObj(o) {
  if (o.camOf) { const src = doc && doc.objs[o.camOf]; if (src && !src.del && !src.camOf) { const it = itemsForObj(src); if (it) return it.map((x) => ({ ...x, xray: !!o.xray })); } }
  const xr = !!o.xray;
  if (o.scene && Array.isArray(o.scene.parts)) return [{ scene: o.scene, pos: [0, 0, 0], key: o.id + ':s', xray: xr }, ...(o.links || []).filter((l) => l && l.scene && Array.isArray(l.scene.parts)).map((l, i) => ({ scene: l.scene, pos: l.pos || [0, 0, 0], key: o.id + ':l' + i, xray: xr }))];
  const m = model3D(o.model); return m ? itemsForModel(m).map((it) => ({ ...it, xray: xr })) : null;
}

/* ================= 3D windows inside notes ================= */
let expandedWin = null;
function findObjEl(id) { if (!view) return null; for (const s of [...view.surfaces, view.pinSurf]) if (s && s.objEls.has(id)) return s.objEls.get(id); return null; }
function make3DWindow(o, s) {
  const el = h('div');
  const stop = (b) => { b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('dblclick', (e) => e.stopPropagation()); return b; };
  const oid = () => el.dataset.id;
  const name = h('span', { class: 'w3-name' });
  const del = stop(h('button', { class: 'w3-btn del', title: 'Delete this 3D window', onclick: () => { const ob = doc && doc.objs[oid()]; if (!ob || cur.ro) return; const r = recState.get(ob.id); if (r) r.stop(); pushUndo(); delObj(ob.id); clearSel(); view.renderAll(); saveDoc('main'); toast('3D window deleted.', { label: 'Undo', fn: undoObjs }); } }, svg('trash'), h('span', null, 'Delete')));
  const cmdIn = h('input', { class: 'w3-in', placeholder: 'Tell the AI what to change, e.g. make it gold', 'aria-label': 'What should change in the 3D model?' });
  const cmdRow = stop(h('div', { class: 'w3-cmd', hidden: true }, cmdIn, h('button', { class: 'btn small primary', onclick: () => cmdWin(oid(), cmdIn.value, cmdRow) }, 'Change')));
  cmdIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); cmdWin(oid(), cmdIn.value, cmdRow); } else if (e.key === 'Escape') cmdRow.hidden = true; });
  const cmdB = stop(h('button', { class: 'w3-btn', title: 'Command: tell the AI what to change', onclick: () => { cmdRow.hidden = !cmdRow.hidden; if (!cmdRow.hidden) cmdIn.focus(); } }, svg('cmd'), h('span', null, 'Cmd')));
  const linkB = stop(h('button', { class: 'w3-btn', title: 'Link another 3D model into this window', onclick: (e) => linkMenuWin(e.currentTarget, oid()) }, svg('link'), h('span', null, 'Link')));
  const expB = stop(h('button', { class: 'w3-btn', title: 'Expand to full screen', onclick: () => expandWin(oid()) }, svg('fit'), h('span', null, 'Expand')));
  const disB = stop(h('button', { class: 'w3-btn', title: 'Dissect: the AI takes the model apart into its pieces. Right-click → Pieces for more.', onclick: (e) => piecesMenu(e.currentTarget, oid()) }, svg('dissect'), h('span', null, 'Dissect')));
  const body = h('div', { class: 'w3-body' });
  const fallback = h('img', { class: 'w3-fallback', alt: '', hidden: true, draggable: 'false' });
  const media = h('img', { class: 'w3-media', alt: '', hidden: true, draggable: 'false' });
  const video = h('video', { class: 'w3-media', hidden: true, muted: true, playsinline: true, autoplay: true, title: 'Click to play again' });
  video.muted = true;
  video.addEventListener('click', () => { if (video.ended || video.paused) { video.currentTime = 0; video.play().catch(() => {}); } });
  const msg = h('div', { class: 'w3-msg', hidden: true });
  const recBadge = h('span', { class: 'w3-rec', hidden: true }, '● REC');
  const stage = h('div', { class: 'w3-stage' });
  stage.append(fallback, media, video);
  body.append(stage, msg, recBadge);
  el.append(h('div', { class: 'w3-head', title: 'Drag here to move the window. Right-click for more.' }, del, name, cmdB, disB, linkB, expB), body, cmdRow);
  el._w3 = { name, body, stage, fallback, media, video, msg, recBadge, del, cmdB, disB, linkB, cmdRow, view: null, scene: null, mediaKey: null };
  winKit(el, body, stage, () => doc && doc.objs[oid()], s).watchVideo(video);
  v3Init().then((ok) => {
    if (!ok) { update3DWindow(el, doc && doc.objs[oid()]); return; }
    const ob0 = doc && doc.objs[oid()];
    el._w3.view = make3DView(body, () => { const ob = doc && doc.objs[oid()]; return ob && !ob.del ? itemsForObj(ob) : null; }, {
      cam: ob0 && ob0.cam,
      scale: () => s.k() * (((doc && doc.objs[oid()]) || {}).sc || 1),
      onDown: (e) => { if (e && e.ctrlKey) return; const id = oid(); if (!cur || !(sel.surf === s && sel.ids.has(id))) selectOnly(s, [id]); },
      onContext: (e) => { const id = oid(); if (e.ctrlKey && cur && !cur.ro) return ctrlPick(s, id); if (!(sel.surf === s && sel.ids.has(id))) selectOnly(s, [id]); openMenu(pointAnchor(e.clientX, e.clientY), selMenuItems()); },
      onCam: (cam) => { const ob = doc && doc.objs[oid()]; if (!ob || !cur || cur.ro) return; ob.cam = cam; saveDoc('main'); },
    });
    body.append(recBadge);
    update3DWindow(el, doc && doc.objs[oid()]);
  });
  return el;
}
function update3DWindow(el, o) {
  const w = el._w3; if (!w || !o) return;
  w.name.textContent = o.name || '3D model';
  const ro = !!(cur && cur.ro);
  w.del.hidden = ro; w.cmdB.hidden = ro; w.linkB.hidden = ro; w.disB.hidden = ro;
  if (w.scene && w.scene !== o.scene && V3.r) dropScene(w.scene);
  w.scene = o.scene;
  const items = itemsForObj(o);
  const mode = w3Mode(o);
  const mSrc = mode === 'img' ? o.shot : mode === 'gif' ? o.gif : mode === 'video' ? o.rec : null;
  const showLive = mode === 'live' || !mSrc;
  w.media.hidden = showLive || mode === 'video';
  w.video.hidden = showLive || mode !== 'video';
  if (!showLive) {
    const mk = mode + '|' + mSrc;
    if (w.mediaKey !== mk) {
      w.mediaKey = mk;
      mediaURL(mSrc).then((u) => {
        if (w.mediaKey !== mk) return;
        if (!u) { toast('That recording isn’t available on this device.'); return; }
        if (mode === 'video') { w.video.src = u; recPlay(w.video, o); } else w.media.src = u;
      });
    }
    if (mode === 'video') { w.video.muted = !o.recSound || !!o.mute; w.video.loop = o.loop !== false; if (w.video.paused && w.video.src) w.video.play().catch(() => {}); }
  } else { w.mediaKey = null; if (!w.video.paused) w.video.pause(); }
  const live = !!items && V3.ok === true;
  w.fallback.hidden = !showLive || live || !o.src;
  if (showLive && !live && o.src) w.fallback.src = resolveSrc(o.src);
  w.msg.hidden = !showLive || live || !!o.src || V3.ok === null;
  w.msg.textContent = V3.ok === false ? '3D can’t start in this browser.' : 'This 3D model belongs to another notebook.';
  if (w.view) {
    w.view.cv.hidden = !showLive || !live;
    w.view.setPaused(!showLive && o.engineOff !== false);
    w.view.setSpin(!!o.spin, spinRate(o));
    if (live && showLive) w.view.draw();
  }
  w.recBadge.hidden = !recState.has(o.id);
  if (el._kit) { el._kit.zoomable = !showLive; el._kit.video = !showLive && mode === 'video' ? w.video : null; el._kit.render(o); }
  if (expandedWin && expandedWin.id === o.id) expandedWin.view.draw();
  if (!o.camOf) for (const c of objList((x) => x.camOf === o.id)) { const ce = findObjEl(c.id); if (ce && ce._w3 && ce._w3.view) ce._w3.view.draw(); }
}
async function cmdWin(id, text, row) {
  id = srcOf(id);
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  text = String(text || '').trim(); if (!text) return;
  if (!aiReady()) return;
  const base = o.scene || (model3D(o.model) || {}).scene;
  if (!base) return toast('This 3D model can’t be changed here.');
  toast('Changing the 3D model…');
  try {
    const sc = await aiChangeScene(o.name || 'Model', base.parts, text, o.desc || (model3D(o.model) || {}).desc);
    const o2 = doc && doc.objs[id]; if (!o2) return;
    pushUndo(); o2.scene = { parts: sc.parts }; changed(o2); view.renderAll(); saveDoc('main');
    if (row) { row.hidden = true; const i = row.querySelector('input'); if (i) i.value = ''; }
    refreshWinSnapshot(id);
    toast('3D model changed.', { label: 'Undo', fn: undoObjs });
  } catch (e) { toast(aiErrorText(e)); }
}
async function refreshWinSnapshot(id) {
  const o = doc && doc.objs[id]; if (!o || !(await v3Init())) return;
  const items = itemsForObj(o); if (!items) return;
  const url = snapshotItems(items, 480, 360); if (!url) return;
  const src = await storeBlobSrc(dataURLtoBlob(url), url);
  const o2 = doc && doc.objs[id]; if (!o2 || o2.del) return;
  o2.src = src; saveDoc('main');
}
function linkMenuWin(anchor, id) {
  id = srcOf(id);
  const o = doc && doc.objs[id]; if (!o || cur.ro) return;
  const items = [];
  if (lib3d.items.length) { items.push({ label: 'From your 3D models', header: true }); for (const m of lib3d.items) if (m.id !== o.model) items.push({ label: m.name, icon: 'cube', fn: () => addLinkWin(id, m.name, m.scene) }); }
  const wins = objList((x) => x.t === 'm3d' && x.id !== id && x.scene);
  if (wins.length) { items.push({ label: 'From this page', header: true }); for (const w of wins) items.push({ label: w.name || '3D model', icon: 'cube', fn: () => addLinkWin(id, w.name, w.scene) }); }
  if ((o.links || []).length) { items.push({ sep: true }); o.links.forEach((l, i) => items.push({ label: 'Remove “' + (l.name || 'model') + '”', icon: 'unlink', fn: () => { const ob = doc.objs[id]; if (!ob) return; pushUndo(); ob.links = ob.links.filter((_, j) => j !== i); changed(ob); view.renderAll(); saveDoc('main'); refreshWinSnapshot(id); } })); }
  if (!items.some((x) => x.fn)) return toast('Make another 3D model first (3D studio or Magic box), then link it here.');
  openMenu(anchor, items);
}
function addLinkWin(id, name, scene) {
  const o = doc && doc.objs[id]; if (!o || !scene) return;
  if (!o.scene) { const m = model3D(o.model); if (!m) return; o.scene = deep(m.scene); }
  let off = 2.5;
  if (V3.r) {
    const box = new V3.T.Box3();
    for (const it of itemsForObj(o) || []) { const g = groupFor(it.scene); const p = it.pos || [0, 0, 0]; g.position.set(p[0], p[1], p[2]); box.expandByObject(g); }
    if (!box.isEmpty()) off = round1(box.max.x + 1.4);
  }
  pushUndo();
  o.links = (o.links || []).concat([{ name: name || 'Model', scene: deep(scene), pos: [off, 0, 0] }]);
  changed(o); view.renderAll(); saveDoc('main');
  const el = findObjEl(id); if (el && el._w3 && el._w3.view) el._w3.view.refit();
  refreshWinSnapshot(id);
  toast('“' + (name || 'Model') + '” is linked. Move it in Format (right panel) under “Linked models”.');
}
function openExpanded(title, getItems, extra) {
  const host = h('div', { class: 'v3-host' });
  let v = null;
  const key = (e) => { if (e.key === 'Escape' && !document.querySelector('.scrim,.menu')) { e.preventDefault(); e.stopPropagation(); close(); } };
  const close = async () => {
    document.removeEventListener('keydown', key, true);
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch {} }
    ov.remove(); if (v) v.destroy(); expandedWin = null;
    if (ptab === 'm3d') render3DPanel();
  };
  const ov = h('div', { class: 'v3-full', role: 'dialog', 'aria-label': title },
    h('div', { class: 'v3-head' }, h('span', { class: 'v3-name' }, title), h('span', { class: 'hint', style: { margin: '0 10px' } }, 'Drag to turn · Shift + drag to move · scroll to zoom'), ...(extra || []), h('button', { class: 'btn small', onclick: close }, svg('close'), 'Close')), host);
  document.body.append(ov);
  document.addEventListener('keydown', key, true);
  try { const fs = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (fs && fs.catch) fs.catch(() => {}); } catch {}
  v = make3DView(host, getItems, {});
  v.draw();
  return { view: v, close };
}
async function expandWin(id) {
  const o0 = doc && doc.objs[id]; if (!o0) return;
  if (!(await v3Init())) return toast('3D can’t start in this browser (WebGL is switched off or blocked).');
  const get = () => { const o = doc && doc.objs[id]; return o && !o.del ? itemsForObj(o) : null; };
  const extra = cur.ro ? [] : [
    h('button', { class: 'tb', title: 'Command: tell the AI what to change', onclick: async () => { const t = await promptModal('Change the 3D model', 'What should change?', '', 'Change', 'e.g. make it gold, add a stand'); if (t) cmdWin(id, t); } }, svg('cmd'), h('span', null, 'Cmd')),
    h('button', { class: 'tb', title: 'Link another 3D model', onclick: (e) => linkMenuWin(e.currentTarget, id) }, svg('link'), h('span', null, 'Link')),
  ];
  const x = openExpanded(o0.name || '3D model', get, extra);
  expandedWin = { id, view: x.view, close: x.close };
}
function linkRowWin(o, i) {
  const l = o.links[i];
  const label = h('small', null, 'x ' + l.pos[0] + ', y ' + l.pos[1] + ', z ' + l.pos[2]);
  let pushed = false;
  const nudge = (k, d) => {
    const ob = doc.objs[o.id]; if (!ob || !ob.links[i]) return;
    if (!pushed) { pushUndo(); pushed = true; }
    ob.links[i].pos[k] = round1(ob.links[i].pos[k] + d); changed(ob); view.renderAll(); saveDoc('main');
    label.textContent = 'x ' + ob.links[i].pos[0] + ', y ' + ob.links[i].pos[1] + ', z ' + ob.links[i].pos[2];
  };
  const b = (t, lab, k, d) => h('button', { class: 'icon-btn', 'aria-label': lab, title: lab, onclick: () => nudge(k, d) }, t);
  return h('div', { class: 'src' }, h('span', { class: 'si' }, svg('cube')), h('div', { class: 'sn' }, h('b', null, l.name || 'Model'), label),
    h('div', { class: 'nudge' }, b('←', 'Move left', 0, -0.25), b('→', 'Move right', 0, 0.25), b('↑', 'Move up', 1, 0.25), b('↓', 'Move down', 1, -0.25), b('⤓', 'Move forward', 2, 0.25), b('⤒', 'Move back', 2, -0.25)));
}

/* ================= 3D studio (right panel) ================= */
async function place3D(m, at) {
  if (!cur || cur.ro || !m) return null;
  const ok = await v3Init();
  const scene = deep(m.scene);
  const links = (m.links || []).map((l) => { const lm = model3D(l.id); return lm && lm.id !== m.id ? { name: lm.name, scene: deep(lm.scene), pos: (l.pos || [0, 0, 0]).slice() } : null; }).filter(Boolean);
  let src = '';
  if (ok) { const url = snapshotItems([{ scene, pos: [0, 0, 0], key: 'a' }, ...links.map((l, i) => ({ scene: l.scene, pos: l.pos, key: 'l' + i }))], 480, 360); if (url) src = await storeBlobSrc(dataURLtoBlob(url), url); }
  const spec = { t: 'm3d', model: m.id, name: m.name, scene, links, w: 420, h: 300, src, ...(m.desc ? { desc: m.desc } : {}) };
  const Z = newScale(); if (at && Z !== 1) { spec.w = Math.round(spec.w * Z); spec.h = Math.round(spec.h * Z); spec.sc = Z; }
  if (at) { const o = addObj({ ...spec, x: at.x, y: at.y, sh: at.surf.sheet, lay: 'front' }); view.renderAll(); saveDoc('main'); return o; }
  const o = insertObj(spec);
  if (o) toast('3D window added to the page. Drag inside it to turn the model.');
  return o;
}
function linkMenu3D(anchor) {
  const m = model3D(m3dCur); if (!m) return toast('Make a model first.');
  const others = lib3d.items.filter((x) => x.id !== m.id && !(m.links || []).some((l) => l.id === x.id));
  if (!others.length) return toast('Make another 3D model first, then link it to this one.');
  openMenu(anchor, [{ label: 'Link a model into this scene', header: true }, ...others.map((x) => ({ label: x.name, icon: 'cube', fn: () => {
    let off = 2.5;
    if (V3.r) { const box = new V3.T.Box3(); for (const it of itemsForModel(m)) { const g = groupFor(it.scene); const p = it.pos || [0, 0, 0]; g.position.set(p[0], p[1], p[2]); box.expandByObject(g); } if (!box.isEmpty()) off = round1(box.max.x + 1.4); }
    m.links = m.links || []; m.links.push({ id: x.id, pos: [off, 0, 0] }); m.u = now(); save3D(); render3DPanel();
    toast('“' + x.name + '” is linked. Move it with the arrows below.');
  } }))]);
}
function linkRow3D(m, l, lm) {
  const nudge = (i, d) => { l.pos = l.pos || [0, 0, 0]; l.pos[i] = round1(l.pos[i] + d); m.u = now(); save3D(); if (studioView) studioView.draw(); lab.textContent = 'x ' + l.pos[0] + ', y ' + l.pos[1] + ', z ' + l.pos[2]; };
  const lab = h('small', null, 'x ' + l.pos[0] + ', y ' + l.pos[1] + ', z ' + l.pos[2]);
  const b = (t, label, i, d) => h('button', { class: 'icon-btn', 'aria-label': label, title: label, onclick: () => nudge(i, d) }, t);
  return h('div', { class: 'src' }, h('span', { class: 'si' }, svg('cube')), h('div', { class: 'sn' }, h('b', null, lm.name), lab),
    h('div', { class: 'nudge' }, b('←', 'Move left', 0, -0.25), b('→', 'Move right', 0, 0.25), b('↑', 'Move up', 1, 0.25), b('↓', 'Move down', 1, -0.25), b('⤓', 'Move forward', 2, 0.25), b('⤒', 'Move back', 2, -0.25),
      h('button', { class: 'icon-btn', 'aria-label': 'Unlink', title: 'Unlink', onclick: () => { m.links = m.links.filter((x) => x !== l); m.u = now(); save3D(); render3DPanel(); } }, svg('unlink'))));
}
async function del3D(m) {
  if (!(await confirmModal('Delete “' + m.name + '”?', 'The 3D model is removed from this notebook’s list. 3D windows on your pages keep their own copy.', 'Delete', true))) return;
  lib3d.items = lib3d.items.filter((x) => x.id !== m.id);
  for (const x of lib3d.items) if (x.links) x.links = x.links.filter((l) => l.id !== m.id);
  m3dCur = null; save3D(); render3DPanel();
}
let r3Seq = 0, studioView = null, studioExtra = [];
/* the 3D studio has two tabs: Preview (the model, more views of it, what to do with it) and Assets (this page's models
   with their pieces or parts as folders, other pages in a folder, and + for a new model) */
let m3dTab = prefs.get('m3dTab', 'preview'), m3dNewOpen = false;
const m3dViews = new Map();   // model id → extra views [{ kind: 'whole' | 'piece' | 'part', i, n }]
function setM3dTab(t) { m3dTab = t; prefs.set('m3dTab', t); render3DPanel(); }
/* another view of the model, or a close-up of one piece or part, under the main view (Preview tab) */
function addView(m, kind, i) {
  if (!m) return;
  const vs = m3dViews.get(m.id) || [];
  if (vs.length >= 6) return toast('That’s 6 extra views already. Close one first (× on its top bar).');
  vs.push({ kind: kind || 'whole', i: i || 0, n: vs.filter((v) => v.kind === 'whole').length + 2 });
  m3dViews.set(m.id, vs); m3dCur = m.id; m3dTab = 'preview';
  render3DPanel();
}
function viewMenu(anchor, m) {
  if (!m) return toast('Make or choose a model first.');
  const parts = m.pieces ? m.pieces.map((pc, i) => ({ label: pc.name, icon: 'dissect', fn: () => addView(m, 'piece', i) }))
    : m.scene.parts.slice(0, 40).map((pt, i) => ({ label: (pt.name || pt.type + ' ' + (i + 1)) + (pt.internal ? ' (inside)' : ''), icon: pt.internal ? 'cog' : 'cube', fn: () => addView(m, 'part', i) }));
  openMenu(anchor, [{ label: 'Add a view window', header: true },
    { label: 'Another view of the whole model', icon: 'cube', fn: () => addView(m, 'whole') },
    { label: 'Close-up of one ' + (m.pieces ? 'piece' : 'part'), icon: 'zin', sub: () => parts }]);
}
/* “Describe the object”: what the AI should know about the model; it keeps to it in every change (Cmd, More detail,
   Dissect, internal components), and “Change the model to match” rebuilds the model from it */
function descBox(m) {
  const ta = h('textarea', { class: 'field', id: 'm3dDesc', rows: 3, maxlength: 1500, placeholder: 'e.g. a 1960s Ford V8 engine: cast-iron block, aluminium heads, 8 cylinders in a V, chrome air filter on top', 'aria-label': 'Describe the object for the AI' });
  ta.value = m.desc || '';
  let t = 0;
  ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { m.desc = ta.value.trim().slice(0, 1500); save3D(); }, 400); });
  return h('details', { class: 'm3d-desc', open: m.desc ? true : null },
    h('summary', null, svg('edit'), 'Describe the object for the AI'),
    h('p', { class: 'hint' }, 'What it is, what it is made of, what matters. The AI keeps to it whenever it changes, details, dissects or adds parts inside this model.'), ta,
    h('div', { class: 'btnrow' }, h('button', { class: 'btn small primary', id: 'm3dDescApply', onclick: () => { m.desc = ta.value.trim().slice(0, 1500); save3D(); if (!m.desc) return toast('Write a description first.'); change3D(m, 'Adjust the model so it matches the description of the object: its parts, proportions, colours and materials. Keep what already matches.', 'Changing the model to match your description…'); } }, svg('sparkle'), 'Change the model to match')));
}
function newModelBox() {
  const desc = h('textarea', { class: 'field', placeholder: 'Describe a 3D model, e.g. a red rocket with three fins', style: { minHeight: '64px' }, 'aria-label': 'Describe a 3D model' });
  const photoIn = h('input', { type: 'file', accept: 'image/*', hidden: true, id: 'm3dPhotoIn' });
  photoIn.addEventListener('change', () => { const f = photoIn.files[0]; photoIn.value = ''; if (f) gen3D({ photo: f }); });
  const d2 = h('input', { type: 'checkbox', id: 'm3dDetail2', checked: detail2() ? true : null });
  d2.addEventListener('change', () => prefs.set('m3dDetail2', d2.checked));
  const mx = h('input', { type: 'checkbox', id: 'm3dMax', checked: maxEffort() ? true : null });
  mx.addEventListener('change', () => prefs.set('m3dMax', mx.checked));
  const box = h('div', { class: 'm3d-new' }, desc, h('div', { class: 'btnrow' },
    h('button', { class: 'btn small primary', onclick: () => gen3D({ desc: desc.value }) }, svg('cube'), 'Create from text'),
    h('button', { class: 'btn small', id: 'm3dPhotoBtn', title: 'The AI looks at a photo and builds a model of the object in it. You can also drop a photo here.', onclick: () => photoIn.click() }, svg('image'), 'From a photo'),
    h('button', { class: 'btn small', onclick: () => gen3D({ fromPad: true }) }, svg('pen'), 'From the drawing pad'),
    h('button', { class: 'btn small', onclick: () => gen3D({ fromSel: true }) }, svg('pointer'), 'From selected drawing'), photoIn),
    h('label', { class: 'opt', title: 'The AI uses about twice as many parts, with small details. Takes a bit longer.' }, d2, '2× more detail (new models and inside parts)'),
    h('label', { class: 'opt', title: 'The AI copies the object as exactly as it can: real proportions, every component, up to 160 parts, and it thinks as hard as it can. Slower, and uses more of your AI allowance.' }, mx, h('span', null, h('b', null, 'Max effort'), ': as exact a copy as the AI can make (slower)')),
    h('p', { class: 'hint', style: { margin: '2px 0 0' } }, 'Or drop a photo here, and the AI makes it a 3D model.'));
  dropFiles(box, (files) => gen3D({ photo: files[0] }), /^image\//, 'Drop a photo (JPG or PNG) here.');
  return box;
}
async function render3DPanel() {
  const p = $('#ptab-m3d'); if (!p) return;
  const seq = ++r3Seq;
  if (!cur) { p.textContent = ''; p.append(h('p', { class: 'empty-panel' }, 'Open a page first.')); return; }
  const nb = currentNb();
  if (lib3d.nb !== nb || !lib3d.loaded) { p.textContent = ''; p.append(busyRow('Loading your 3D models…')); await load3D(nb); }
  const ok = await v3Init();
  if (seq !== r3Seq) return;
  p.textContent = '';
  if (studioView) { studioView.destroy(); studioView = null; }
  for (const v of studioExtra) v.destroy();
  studioExtra = [];
  const here = models3DHere();
  if (m3dPage !== cur.id) { m3dPage = cur.id; m3dCur = here[0] ? here[0].id : null; m3dSub = null; }   // another page: its own models
  const m = model3D(m3dCur) || here[0] || null; m3dCur = m ? m.id : null;
  const tab = (t, label, icon, n) => h('button', { class: 'm3d-tab', role: 'tab', id: 'm3dTab-' + t, 'aria-selected': String(m3dTab === t), onclick: () => setM3dTab(t) }, svg(icon), h('span', null, label), n != null ? h('span', { class: 'm3d-count' }, String(n)) : null);
  p.append(h('div', { class: 'm3d-tabs', role: 'tablist', 'aria-label': '3D studio' }, tab('preview', 'Preview', 'eye'), tab('assets', 'Assets', 'folder', lib3d.items.length)));
  if (m3dBusy) p.append(busyRow(m3dBusy));
  if (m3dTab === 'assets') {
    p.append(h('div', { class: 'm3d-assets-head' }, h('h3', null, 'Assets'),
      h('button', { class: 'btn small' + (m3dNewOpen || !lib3d.items.length ? '' : ' primary'), id: 'm3dNew', 'aria-expanded': String(m3dNewOpen || !lib3d.items.length), title: 'Make a new 3D model', onclick: () => { m3dNewOpen = !m3dNewOpen; render3DPanel(); } }, svg(m3dNewOpen ? 'close' : 'plus'), m3dNewOpen ? 'Close' : 'New model')));
    if (m3dNewOpen || !lib3d.items.length) p.append(newModelBox());
    if (lib3d.items.length) studioModelList(p, here);
    return;
  }
  const sub = m ? studioSub(m) : null;
  const host = h('div', { class: 'v3-host' });
  const cmdIn = h('input', { class: 'field', placeholder: 'e.g. make it gold, add a stand, twice as tall', style: { margin: '0', flex: '1' }, 'aria-label': 'What should change?' });
  const cmdRow = h('div', { class: 'frow', hidden: true }, cmdIn, h('button', { class: 'btn primary small', onclick: () => change3D(m, cmdIn.value) }, 'Change'));
  cmdIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); change3D(m, cmdIn.value); } });
  const head = h('div', { class: 'v3-head' },
    m ? h('button', { class: 'tb', title: 'Delete this model', onclick: () => del3D(m), style: { color: 'var(--danger)' } }, svg('trash'), h('span', null, 'Delete')) : null,
    h('span', { style: { flex: '1' } }),
    h('button', { class: 'tb', id: 'm3dAddView', title: 'Add a view window: another angle, or a close-up of one piece or part', onclick: (e) => viewMenu(e.currentTarget, m) }, svg('plus'), h('span', null, 'View')),
    h('button', { class: 'tb', title: 'Command: tell the AI what to change', onclick: () => { if (!m) return toast('Make a model first.'); cmdRow.hidden = !cmdRow.hidden; if (!cmdRow.hidden) cmdIn.focus(); } }, svg('cmd'), h('span', null, 'Cmd')),
    h('button', { class: 'tb', title: 'Link another 3D model into this scene', onclick: (e) => linkMenu3D(e.currentTarget) }, svg('link'), h('span', null, 'Link')),
    h('button', { class: 'tb', title: 'Expand to full screen', onclick: () => { if (!m) return; if (studioView) { studioView.destroy(); studioView = null; } openExpanded(m.name, () => { const mm = model3D(m.id); return mm ? itemsForModel(mm) : null; }, []); } }, svg('fit'), h('span', null, 'Expand')));
  p.append(h('div', { class: 'm3d-title' }, svg(sub ? 'dissect' : 'cube'), h('span', { class: 'v3-name' }, m ? m.name + (sub ? ' › ' + sub.name : '') : 'No 3D model on this page yet')),
    h('div', { class: 'v3-card' }, head, host), cmdRow);
  if (!ok) p.append(h('p', { class: 'ai-off' }, '3D can’t start in this browser (WebGL is switched off or blocked).'));
  else if (m) { studioView = make3DView(host, () => { const mm = model3D(m.id); if (!mm) return null; const sb = studioSub(mm); return sb ? [{ scene: sb.scene, pos: [0, 0, 0], key: sb.key }] : itemsForModel(mm); }); studioView.draw(); }
  if (!m) {   // also when 3D can't start: models can still be made and put on pages
    host.append(h('div', { class: 'w3-msg' }, 'No 3D model on this page yet. Make one below.'));
    p.append(h('h3', null, 'New 3D model'), newModelBox());   // an empty page: the form right here
    if (lib3d.items.length) p.append(h('div', { class: 'btnrow' }, h('button', { class: 'btn small', onclick: () => { m3dShowOther = true; setM3dTab('assets'); } }, svg('folder'), 'Models of other pages')));
  }
  // more view windows: other angles of the whole model, close-ups of pieces or parts
  const vs = m ? (m3dViews.get(m.id) || []).filter((v) => v.kind === 'whole' || subFor(m, v.kind, v.i)) : [];
  if (m) m3dViews.set(m.id, vs);
  if (ok && m && vs.length) {
    const grid = h('div', { class: 'm3d-views' });
    vs.forEach((v) => {
      const sb = v.kind === 'whole' ? null : subFor(m, v.kind, v.i);
      const vh = h('div', { class: 'v3-host' });
      const close = h('button', { class: 'icon-btn', 'aria-label': 'Close this view', title: 'Close this view', onclick: () => { m3dViews.set(m.id, (m3dViews.get(m.id) || []).filter((x) => x !== v)); render3DPanel(); } }, svg('close'));
      grid.append(h('div', { class: 'v3-card m3d-view' }, h('div', { class: 'v3-head' }, svg(sb ? 'zin' : 'cube'), h('span', { class: 'v3-name' }, sb ? 'Close-up: ' + sb.name : 'View ' + v.n), close), vh));
      const ev = make3DView(vh, () => { const mm = model3D(m.id); if (!mm) return null; const s2 = v.kind === 'whole' ? null : subFor(mm, v.kind, v.i); return s2 ? [{ scene: s2.scene, pos: [0, 0, 0], key: s2.key }] : itemsForModel(mm); });
      if (v.kind === 'whole') { ev.st.th = 0.8 + (v.n - 1) * Math.PI / 2; if (v.n % 3 === 0) ev.st.ph = 0.35; }   // each new view looks from another side (every third from above)
      studioExtra.push(ev);
    });
    p.append(grid);
    raf(() => studioExtra.forEach((ev) => ev.draw()));
  }
  if (m && sub) {   // one piece or part of the model is shown
    p.append(h('div', { class: 'btnrow' },
      !cur.ro ? h('button', { class: 'btn small primary', id: 'm3dPlaceSub', onclick: () => place3D({ id: m.id, name: sub.name, scene: sub.scene, links: [] }) }, svg('plus'), 'Put this ' + sub.kind + ' on the page') : null,
      h('button', { class: 'btn small', onclick: () => addView(m, sub.kind, m3dSub.i) }, svg('zin'), 'Close-up view'),
      h('button', { class: 'btn small', onclick: () => { m3dSub = null; render3DPanel(); } }, svg('chevL'), 'The whole model')));
  } else if (m) {
    p.append(h('div', { class: 'btnrow' },
      !cur.ro ? h('button', { class: 'btn small primary', onclick: () => place3D(m) }, svg('plus'), 'Put on the page as a 3D window') : null,
      h('button', { class: 'btn small', id: 'm3dDissect', title: 'The AI sorts the parts into the pieces the object comes apart into. They show as a folder under the model in Assets.', onclick: () => dissect3D(m) }, svg('dissect'), m.pieces ? 'Dissect again' : 'Dissect'),
      h('button', { class: 'btn small', onclick: () => detail3D(m) }, svg('sparkle'), 'Add more detail'),
      !cur.ro ? h('button', { class: 'btn small', title: 'Puts the model on the page as a 3D window, and the AI takes it apart into pieces there', onclick: async () => { const o = await place3D(m); if (o) dissectWin(o.id); } }, svg('dissect'), 'Dissect on the page') : null,
      !cur.ro ? h('button', { class: 'btn small', title: 'Puts the model on the page as a 3D window, and the AI designs the parts inside it', onclick: async () => { const o = await place3D(m); if (o) internalsWin(o.id); } }, svg('cog'), 'Internal components on the page') : null,
      m.prev ? h('button', { class: 'btn small', onclick: () => { const t = m.scene; m.scene = m.prev; m.prev = t; delete m.pieces; m3dSub = null; m.u = now(); save3D(); render3DPanel(); } }, svg('undo'), 'Undo change') : null,
      h('button', { class: 'btn small', onclick: async () => { const n = await promptModal('Rename model', 'Name', m.name, 'Rename'); if (n && n.trim()) { m.name = n.trim(); m.u = now(); save3D(); render3DPanel(); } } }, svg('edit'), 'Rename')));
    const links = (m.links || []).filter((l) => model3D(l.id));
    if (links.length) { p.append(h('h3', null, 'Linked models')); for (const l of links) p.append(linkRow3D(m, l, model3D(l.id))); }
    p.append(descBox(m));
  }
  p.append(h('p', { class: 'hint', style: { marginTop: '10px' } }, 'Drag to turn, Shift + drag to move, scroll to zoom, double-click to reset. “+ View” adds another view or a close-up. Assets (tab above) has all your models.'));
}

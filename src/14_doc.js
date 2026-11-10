
/* ================= note documents ================= */
// doc = { kind:'a4'|'endless'|'board', bg, margin, flows:[html], fu:[ts], objs:{id:obj}, ink:{id:stroke}, mu }
let doc = null;
const A4W = 794, A4H = 1123;
function blankDoc(kind) {
  return { v: 2, kind, bg: kind === 'board' ? 'dots' : 'blank', margin: kind === 'endless', flows: kind === 'board' ? [] : ['<p><br></p>'], fu: [], objs: {}, ink: {}, mu: 0 };
}
function normalizeMain(d, kindHint) {
  if (!d) return blankDoc(kindHint || 'endless');
  if (!d.v || d.v < 2) {
    const b = blankDoc('endless');
    b.flows = [d.html || '<p><br></p>'];
    return b;
  }
  const out = blankDoc(['a4', 'endless', 'board'].includes(d.kind) ? d.kind : 'endless');
  out.bg = ['blank', 'lined', 'vlined', 'grid', 'dots'].includes(d.bg) ? d.bg : out.bg;
  if (d.pcol && typeof d.pcol === 'object') { const pc = cleanStyle({ bg: d.pcol.bg, line: d.pcol.line, text: d.pcol.text }); if (pc && pc.bg && pc.line && pc.text) out.pcol = pc; }
  out.margin = d.margin != null ? !!d.margin : out.margin;
  out.flows = Array.isArray(d.flows) ? d.flows.map((x) => String(x || '')) : out.flows;
  if (out.kind !== 'board' && !out.flows.length) out.flows = ['<p><br></p>'];
  out.fu = Array.isArray(d.fu) ? d.fu.slice() : [];
  out.objs = (d.objs && typeof d.objs === 'object') ? d.objs : {};
  out.mu = d.mu || 0;
  out.title = d.title;
  copyPageSetup(d, out);   // 51_pagesetup.js: size, turning, margins, header and footer of A4 pages
  if (d.word && typeof d.word === 'object' && d.word.key) out.word = { key: String(d.word.key).slice(0, 500), name: String(d.word.name || '').slice(0, 200), url: String(d.word.url || '').slice(0, 500), base: Array.isArray(d.word.base) ? deep(d.word.base) : null, at: +d.word.at || 0, font: d.word.font && d.word.font.name ? { name: String(d.word.font.name).slice(0, 60), size: +d.word.font.size || 11 } : undefined, setup: d.word.setup && d.word.setup.k === 'setup' && d.word.setup.ps ? deep(d.word.setup) : undefined, fv: d.word.fv ? 1 : undefined };
  return out;
}
async function readShared(path) {
  if (!Shared.ok) return null;
  return Shared.get(path);
}
async function loadDocData(id) {
  const node = tree.nodes[id];
  let main, ink;
  if (node.shared) {
    main = Saver.latest('shared:' + node.shared);
    if (main === undefined) main = await readShared('shared/' + node.shared);
    ink = Saver.latest('sharedink:' + node.shared);
    if (ink === undefined) ink = await readShared('sharedink/' + node.shared).catch(() => null);
  } else {
    main = Saver.latest('note_' + id);
    if (main === undefined) main = await Store.get('note_' + id);
    ink = Saver.latest('ink_' + id);
    if (ink === undefined) ink = await Store.get('ink_' + id).catch(() => null);
  }
  return { main: normalizeMain(main, node.kind), ink: (ink && ink.ink) || {}, exists: !!main };
}
function pruneTomb(map) {
  const cutoff = now() - 4 * 864e5;
  const out = {};
  for (const [k, v] of Object.entries(map)) if (!(v && v.del && (v.u || 0) < cutoff)) out[k] = v;
  return out;
}
function serializeMain(d, nodeId) {
  const node = tree.nodes[nodeId];
  return { v: 2, kind: d.kind, bg: d.bg, pcol: d.pcol || undefined, margin: d.margin, ...cleanPageSetup(d), flows: d.flows, fu: d.fu, objs: pruneTomb(d.objs), mu: d.mu, title: node ? node.name : '', word: d.word || undefined, session: SESSION, u: now() };
}
function serializeInk(d) { return { ink: pruneTomb(d.ink), session: SESSION, u: now() }; }
async function writeShared(path, data) {
  if (byteSize(data) > Store.maxDoc) throw { code: 'too_big' };
  return Shared.set(path, data);
}
let inkDirty = false;
function saveDoc(part) {
  if (!cur || cur.loading || cur.ro || !doc) return;
  const node = tree.nodes[cur.id]; if (!node) return;
  verOnSave();
  const d = doc, id = cur.id;
  if (part !== 'ink') {
    if (node.shared) { const code = node.shared; Saver.schedule('shared:' + code, () => serializeMain(d, id), (x) => writeShared('shared/' + code, x), 700); }
    else Saver.schedule('note_' + id, () => serializeMain(d, id), (x) => Store.set('note_' + id, x), 800);
    if (node.kind !== d.kind) { node.kind = d.kind; touch(node); saveTree(); renderTree(); }
  }
  if (part === 'ink' || (part !== 'main' && inkDirty)) {
    inkDirty = false;
    if (node.shared) { const code = node.shared; Saver.schedule('sharedink:' + code, () => serializeInk(d), (x) => writeShared('sharedink/' + code, x), 900); }
    else Saver.schedule('ink_' + id, () => serializeInk(d), (x) => Store.set('ink_' + id, x), 900);
  }
}
const markInk = () => { inkDirty = true; saveDoc('ink'); };

/* objects helpers */
let zTop = 1;
function objList(filterFn) { return Object.values(doc ? doc.objs : {}).filter((o) => o && !o.del && (!filterFn || filterFn(o))); }
function strokeList(filterFn) { return Object.values(doc ? doc.ink : {}).filter((s) => s && !s.del && (!filterFn || filterFn(s))); }
function nextZ() { let m = 0; for (const o of objList()) m = Math.max(m, o.z || 0); return m + 1; }
function addObj(o) {
  o.id = o.id || newId('o'); o.u = now(); if (o.z == null) o.z = nextZ();
  if (o.t !== 'conn') o.name = uniqueName(o.name || baseName(o), o.id);
  if (audRec) audStamp(o);
  doc.objs[o.id] = o; return o;
}
function changed(o) { o.u = now(); }
function delObj(id) {
  const o = doc.objs[id]; if (!o) return;
  doc.objs[id] = { id, del: true, u: now(), t: o.t };
  for (const c of objList((x) => x.t === 'conn')) if ((c.a && c.a.id === id) || (c.b && c.b.id === id)) doc.objs[c.id] = { id: c.id, del: true, u: now(), t: 'conn' };
}

/* undo / redo for boxes, pictures and drawings (text uses the browser's own undo) */
const hist = { undo: [], redo: [] };
function snap(withFlows) { return JSON.stringify({ objs: doc.objs, ink: doc.ink, flows: withFlows ? doc.flows : null, ps: withFlows ? cleanPageSetup(doc) : null }); }   // ps: the page setup (51_pagesetup.js)
let undoHold = false;
function pushUndo(withFlows) {
  if (!doc || undoHold) return;
  hist.undo.push(snap(withFlows)); if (hist.undo.length > 60) hist.undo.shift();
  hist.redo.length = 0;
}
function restoreSnap(s) {
  const d = JSON.parse(s);
  const t = now();
  const apply = (curMap, oldMap) => {
    const out = {};
    for (const id of new Set([...Object.keys(curMap), ...Object.keys(oldMap)])) {
      const a = curMap[id], b = oldMap[id];
      if (!b) { out[id] = { id, del: true, u: t, t: a && a.t }; continue; }
      if (!a || JSON.stringify(a) !== JSON.stringify(b)) out[id] = { ...b, u: t };
      else out[id] = a;
    }
    return out;
  };
  doc.objs = apply(doc.objs, d.objs);
  doc.ink = apply(doc.ink, d.ink);
  if (d.flows) { doc.flows = d.flows; doc.fu = d.flows.map(() => t); }
  if (d.ps && pageSetupKey(d.ps) !== pageSetupKey(doc)) { copyPageSetup(d.ps, doc); doc.mu = t; }
  return !!d.flows;
}
function undoObjs() {
  if (!doc || !hist.undo.length) return toast('Nothing to undo.');
  const s = hist.undo.pop();
  hist.redo.push(snap(JSON.parse(s).flows != null));
  const fl = restoreSnap(s); afterRestore(fl);
}
function redoObjs() {
  if (!doc || !hist.redo.length) return toast('Nothing to redo.');
  const s = hist.redo.pop();
  hist.undo.push(snap(JSON.parse(s).flows != null));
  const fl = restoreSnap(s); afterRestore(fl);
}
function afterRestore(flows) {
  clearSel();
  if (flows) view.rebuild(); else view.renderAll();
  saveDoc(); markInk();
}

/* merging remote changes into the open doc */
let lastLocalEdit = 0, pendingRemote = null, remoteTimer = null;
function mergeRemoteMain(raw) {
  if (!doc || !raw) return;
  const r = normalizeMain(raw, doc.kind);
  let objsChanged = false, structural = false;
  const flowsChanged = [];
  for (const [id, ro] of Object.entries(r.objs)) {
    const lo = doc.objs[id];
    if (!lo || (ro.u || 0) > (lo.u || 0)) { doc.objs[id] = ro; objsChanged = true; }
  }
  if ((r.mu || 0) > (doc.mu || 0)) {
    if (r.kind !== doc.kind || r.flows.length !== doc.flows.length || pageSetupKey(r) !== pageSetupKey(doc)) structural = true;
    doc.kind = r.kind; doc.bg = r.bg; doc.margin = r.margin; doc.mu = r.mu; copyPageSetup(r, doc);
    if (r.pcol) doc.pcol = r.pcol; else delete doc.pcol;
    if (structural) { doc.flows = r.flows.slice(); doc.fu = r.fu.slice(); }
  }
  if (!structural) {
    for (let i = 0; i < r.flows.length; i++) {
      if ((r.fu[i] || 0) > (doc.fu[i] || 0)) { doc.flows[i] = r.flows[i]; doc.fu[i] = r.fu[i]; flowsChanged.push(i); }
    }
  }
  const node = cur && tree.nodes[cur.id];
  if (node && r.title && r.title !== node.name) {
    const ti = $('#titleIn');
    if (!ti || document.activeElement !== ti) { node.name = r.title; if (ti) ti.value = r.title; touch(node); saveTree(); renderTree(); renderCrumbs(); }
  }
  if (structural) { view.rebuild(); return; }
  if (flowsChanged.length) { pendingRemote = flowsChanged; applyRemoteFlows(); }
  if (objsChanged) view.renderAll(true);
}
function applyRemoteFlows() {
  clearTimeout(remoteTimer);
  if (!pendingRemote || !view) return;
  if (now() - lastLocalEdit < 1500 || pad.busy) { remoteTimer = setTimeout(applyRemoteFlows, 700); return; }
  const list = pendingRemote; pendingRemote = null;
  for (const i of list) view.setFlowHTML(i, doc.flows[i], true);
}
function mergeRemoteInk(raw) {
  if (!doc || !raw || !raw.ink) return;
  let ch = false;
  for (const [id, rs] of Object.entries(raw.ink)) {
    const ls = doc.ink[id];
    if (!ls || (rs.u || 0) > (ls.u || 0)) { doc.ink[id] = rs; ch = true; }
  }
  if (ch) view.renderAll(true);
}

/* templates */
function applyTemplate(kind, tpl) {
  const d = blankDoc(kind);
  const P = (s) => '<p>' + s + '</p>';
  if (tpl === 'cornell') {
    d.flows = ['<h2>Notes</h2>' + P('Write your main notes here during class.') + P('<br>') + P('<br>')];
    if (kind === 'a4') {
      d.objs = {};
      addObjTo(d, { t: 'note', x: 40, y: 860, w: 714, ah: true, h: 160, html: '<h3>Summary</h3><p>Sum up the page in 2–3 sentences after class.</p>', bg: 'var(--accent-soft)' });
      addObjTo(d, { t: 'note', x: 560, y: 150, w: 200, ah: true, h: 200, html: '<h3>Key questions</h3><ul><li>…</li></ul>', bg: 'var(--st-yellow)', tc: '#1E2740' });
    } else {
      addObjTo(d, { t: 'note', x: 560, y: 120, w: 230, ah: true, h: 160, html: '<h3>Key questions</h3><ul><li>…</li></ul>', bg: 'var(--st-yellow)', tc: '#1E2740' });
      d.flows[0] += '<h2>Summary</h2>' + P('Sum up the page in 2–3 sentences after class.');
    }
  } else if (tpl === 'vocab') {
    d.flows = ['<h2>Vocabulary</h2><table><thead><tr><th>Word</th><th>Meaning</th><th>Example</th></tr></thead><tbody>' + '<tr><td><br></td><td><br></td><td><br></td></tr>'.repeat(8) + '</tbody></table><p><br></p>'];
  } else if (tpl === 'plan') {
    d.flows = ['<h2>Study plan</h2><p>Goal: </p><ul class="check"><li>Read chapter 1</li><li>Make flashcards</li><li>Do a quiz in Learn</li><li>Fact check my notes</li></ul><p><br></p>'];
  } else if (tpl === 'mindmap') {
    addObjTo(d, { t: 'mm', x: -120, y: -60, lay: 'balanced', sty: 0, tree: { id: newId('m'), text: 'Main topic', ch: [{ id: newId('m'), text: 'Idea 1', ch: [] }, { id: newId('m'), text: 'Idea 2', ch: [] }, { id: newId('m'), text: 'Idea 3', ch: [] }, { id: newId('m'), text: 'Idea 4', ch: [] }] } });
  } else if (tpl === 'brainstorm') {
    addObjTo(d, { t: 'note', x: -140, y: -40, w: 280, ah: true, h: 60, html: '<h2 style="text-align:center">Topic</h2>' });
    const cols = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple'];
    cols.forEach((c, i) => {
      const a = (i / cols.length) * Math.PI * 2;
      addObjTo(d, { t: 'sticky', x: Math.round(Math.cos(a) * 330 - 80), y: Math.round(Math.sin(a) * 230 - 80), w: 160, h: 160, html: '', col: c });
    });
  }
  return d;
}
function addObjTo(d, o) { o.id = newId('o'); o.u = now(); o.z = Object.keys(d.objs).length + 1; d.objs[o.id] = o; return o; }

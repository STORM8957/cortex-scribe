/* ================= AI editor: the chat can change the open page =================
   With “Can edit the page” on (Chat tab), a message goes to the connected AI with the open page as numbered parts:
   paragraphs, headings and list items (b1, b2 …), table cells (b4.r0.c1), note boxes, text boxes, sticky notes and
   shapes (o1 …) and mind map ideas (m1.0 …). The AI answers { reply, edits } (task 'page.edit'); the edits are applied
   right away: “set” changes only the part of a text that differs (formatting elsewhere stays), “add” puts a new
   paragraph after a part (or a note box after a box), “delete” removes a paragraph. Before that, the page is saved in
   page history (“Before the AI edit”) and to Undo (Ctrl+Z); the chat message has its own Undo. Parts from Word that are
   locked (pictures) are shown to the AI but never changed. Works on A4, endless and board pages; on a page linked with
   Word, the changes go to Word like typing does. */
const AI_EDIT_TEXT = ['note', 'text', 'sticky', 'shape'];
const AI_EDIT_NAMES = { note: 'note box', text: 'text box', sticky: 'sticky note', shape: 'shape' };
const aiEditUndo = new Map();          // chat message time → { pageId, flows, objs } to put the page back
const aiTextToHtml = (t) => String(t || '').split(/\n+/).map((p) => '<p>' + (esc(p) || '<br>') + '</p>').join('');

/* the open page as parts the AI can name */
function aiParts() {
  const parts = [];
  let b = 0;
  const add = (p) => { parts.push(p); return p; };
  const walk = (container) => {
    for (const el of container.children) {
      const t = el.tagName;
      if (t === 'P' && el.classList.contains('wlock')) add({ id: 'b' + (++b), kind: 'locked', text: el.textContent, el, lock: true });
      else if (t === 'P' || t === 'BLOCKQUOTE' || t === 'PRE' || /^H[1-4]$/.test(t)) {
        const tx = wlText(el);
        if (!tx.trim() && el.querySelector('img')) { add({ id: 'b' + (++b), kind: 'picture', text: '', el, lock: true }); continue; }
        add({ id: 'b' + (++b), kind: t === 'H1' ? 'h1' : t === 'H2' ? 'h2' : (t === 'H3' || t === 'H4') ? 'h3' : 'p', text: tx, el });
      } else if (t === 'UL' || t === 'OL') {
        for (const li of el.children) {
          if (li.tagName !== 'LI') continue;
          add({ id: 'b' + (++b), kind: t === 'OL' ? 'ol' : 'li', text: wlText(li), el: li });
          for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') walk({ children: [sub] });
        }
      } else if (t === 'TABLE') {
        const id = 'b' + (++b);
        add({ id, kind: 'table', text: '', el, table: true });
        [...el.rows].forEach((tr, r) => [...tr.cells].forEach((td, c) => add({ id: id + '.r' + r + '.c' + c, kind: 'cell', text: wlText(td), el: td, cell: true, row: r })));
      }
    }
  };
  if (view.kind !== 'board') for (const s of view.surfaces) if (s && s.L.flow) walk(s.L.flow);
  const byPlace = (a, z) => ((a.sh || 0) - (z.sh || 0)) || ((a.y || 0) - (z.y || 0)) || ((a.x || 0) - (z.x || 0));
  let o = 0;
  for (const ob of objList((x) => AI_EDIT_TEXT.includes(x.t)).sort(byPlace)) add({ id: 'o' + (++o), kind: AI_EDIT_NAMES[ob.t], text: htmlStrToText(ob.html || '').trim(), o: ob });
  let m = 0;
  for (const ob of objList((x) => x.t === 'mm' && x.tree).sort(byPlace)) {
    m++; let k = 0;
    const walkMM = (n, depth) => { add({ id: 'm' + m + '.' + (k++), kind: 'idea', text: n.text || '', o: ob, node: n, depth }); for (const c of n.ch || []) walkMM(c, depth + 1); };
    walkMM(ob.tree, 0);
  }
  return parts;
}
/* which parts are selected right now (text selection on the page, or chosen boxes) */
function aiSelected(parts) {
  const out = new Set();
  // the selection on the page (or the last one, if the chat box has the focus now)
  let r = savedRange; const s = getSelection();
  if (s && s.rangeCount) { const rr = s.getRangeAt(0); if (!rr.collapsed && editableOf(rr.startContainer)) r = rr; }
  if (r && !r.collapsed) for (const p of parts) if (p.el && !p.table && r.intersectsNode(p.el)) out.add(p.id);
  if (sel.has) for (const p of parts) if (p.o && sel.ids.has(p.o.id)) out.add(p.id);
  const txt = r && !r.collapsed ? String(r).trim().slice(0, 600) : '';
  return { ids: [...out].slice(0, 30), text: txt };
}
function aiPageText(parts, max) {
  const lines = [];
  const flow = parts.filter((p) => p.id[0] === 'b' && !p.cell), boxes = parts.filter((p) => p.id[0] === 'o'), ideas = parts.filter((p) => p.id[0] === 'm');
  for (const p of flow) {
    if (p.table) {
      lines.push('[' + p.id + '] table:');
      const cells = parts.filter((c) => c.cell && c.id.startsWith(p.id + '.'));
      const rows = new Map(); for (const c of cells) { if (!rows.has(c.row)) rows.set(c.row, []); rows.get(c.row).push('[' + c.id + '] ' + c.text); }
      for (const r of rows.values()) lines.push('  ' + r.join(' | '));
    } else if (p.lock) lines.push('[' + p.id + '] (locked ' + (p.kind === 'picture' ? 'picture' : 'part from Word') + ', can’t be changed): ' + p.text);
    else lines.push('[' + p.id + '] ' + p.kind + ': ' + p.text);
  }
  if (boxes.length) { lines.push('', 'BOXES ON THE PAGE:'); for (const p of boxes) lines.push('[' + p.id + '] ' + p.kind + ': ' + p.text.replace(/\n+/g, ' / ')); }
  if (ideas.length) { lines.push('', 'MIND MAPS:'); for (const p of ideas) lines.push('  '.repeat(p.depth) + '[' + p.id + '] idea: ' + p.text); }
  let out = lines.join('\n');
  if (out.length > max) out = out.slice(0, max) + '\n(… the rest of the page is left out because it is long)';
  return out || '(the page is empty)';
}
function aiEditPrompt(parts, selected, request, history) {
  const node = tree.nodes[cur.id] || {};
  return 'You edit a page in “Cortex Scribe”, a student’s notebook app. The page is given below as parts; each part has an id in square brackets. Do what the student asks: fix, rewrite, shorten, translate, fill in, add or remove parts. Change only what the request is about and keep everything else exactly as it is. Write in the language of the page unless the student asks for another one.\n\n' +
    'Answer with JSON only, in exactly this form:\n{"reply": "one or two sentences to the student: what you changed, or the answer to their question", "edits": [ … ]}\n' +
    'Each edit is one of:\n' +
    '{"op": "set", "id": "b3", "text": "the whole new text of that part"}   for paragraphs, headings, list items, table cells (ids like b5.r1.c2), boxes (o2) and mind map ideas (m1.4)\n' +
    '{"op": "add", "after": "b3", "kind": "p", "text": "…"}   a new part after b3; kind is p, h1, h2, h3, li (bullet) or ol (numbered); "after": "start" puts it at the top; after a box (o2) it becomes a new note box\n' +
    '{"op": "delete", "id": "b3"}   removes a paragraph, heading or list item\n' +
    'Rules: use only ids that are on the page. Plain text only: no Markdown, no HTML. Tables keep their rows and columns: only “set” their cells. Parts marked (locked) can’t be changed. If the student only asks a question, answer it in "reply" and leave "edits" empty.\n\n' +
    'PAGE “' + (node.name || 'Untitled') + '” (' + (KIND_LABEL[doc.kind] || doc.kind) + '):\n' + aiPageText(parts, 60000) +
    (selected.ids.length ? '\n\nThe student has selected: ' + selected.ids.join(', ') + (selected.text ? ' (selected text: “' + selected.text + '”)' : '') : '') +
    (history ? '\n\nThe conversation so far:\n' + history : '') +
    '\n\nThe student asks: ' + request;
}

/* apply the AI's edits; returns how many parts changed */
function aiApply(parts, edits, msgT) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const flows = view.kind !== 'board' ? view.surfaces.map((s) => s && s.L.flow).filter(Boolean) : [];
  const snapObjs = {};
  const keep = (o) => { if (o && !snapObjs[o.id]) snapObjs[o.id] = deep(o); };
  const before = { pageId: cur.id, flows: doc.flows.slice(), objs: snapObjs, added: [] };
  pushUndo(true); verBefore('Before the AI edit');
  const clean = (t) => String(t == null ? '' : t).replace(/\r/g, '').slice(0, 8000);
  let n = 0; const flash = [];
  const list = (Array.isArray(edits) ? edits : []).slice(0, 300).filter((e) => e && typeof e === 'object');
  for (const e of list.filter((x) => x.op === 'set')) {
    const p = byId.get(String(e.id)); if (!p || p.lock || p.table) continue;
    const t = clean(e.text);
    if (p.node) { const v = t.replace(/\n+/g, ' ').slice(0, 200); if (p.node.text !== v) { keep(p.o); p.node.text = v; changed(p.o); n++; } }
    else if (p.o) { if (htmlStrToText(p.o.html || '').trim() !== t.trim()) { keep(p.o); p.o.html = aiTextToHtml(t); changed(p.o); n++; } }
    else if (p.el) { const v = WordSync.clean(t); if (wlText(p.el) !== v) { wlSetText(p.el, v); flash.push(p.el); n++; } }
  }
  const lastAfter = new Map();
  for (const e of list.filter((x) => x.op === 'add')) {
    const after = String(e.after || 'start'), t = clean(e.text); if (!t.trim()) continue;
    const anchor = after === 'start' ? null : byId.get(after);
    if (anchor && anchor.o) {           // after a box: a new note box below it
      const a = lastAfter.get(after) || anchor.o;
      const ob = addObj({ t: 'note', x: a.x || 0, y: (a.y || 0) + (a.h || 60) + 16, w: Math.max(200, a.w || 260), h: 60, ah: true, html: aiTextToHtml(t), sh: a.sh, lay: a.lay });
      before.added.push(ob.id); lastAfter.set(after, ob); n++; continue;
    }
    if (!flows.length || (anchor && (anchor.cell || !anchor.el))) continue;
    const k = ['p', 'h1', 'h2', 'h3', 'li', 'ol'].includes(e.kind) ? e.kind : 'p';
    const prev = lastAfter.get(after) || (anchor ? anchor.el : null);
    const el = wlInsertAfter(prev, { k, t: WordSync.clean(t) }, flows);
    lastAfter.set(after, el); flash.push(el); n++;
  }
  for (const e of list.filter((x) => x.op === 'delete')) {
    const p = byId.get(String(e.id)); if (!p || p.lock || p.table || p.cell || !p.el || p.o) continue;
    if (p.el.isConnected) { wlRemove(p.el); n++; }
  }
  for (const f of flows) if (!f.firstElementChild) f.innerHTML = '<p><br></p>';
  for (let i = 0; i < flows.length; i++) view.syncFlow(i);
  if (view.kind === 'a4') { for (let i = 0; i < doc.flows.length; i++) if (view.flowEl(i)) view.reflow(i, 'deleteContentBackward'); }
  else if (view.kind === 'endless') view.layoutEndless();
  view.renderAll(true);
  doc.mu = now(); saveDoc('main'); markInk(); scheduleOutline(); wordLinkChanged();
  for (const el of flash) { el.classList.add('ai-flash'); setTimeout(() => el.classList.remove('ai-flash'), 2200); }
  if (n) aiEditUndo.set(msgT, before);
  return n;
}
function aiUndoEdit(m) {
  const b = aiEditUndo.get(m.t);
  if (!b || !cur || cur.id !== b.pageId || !doc) return toast('That change can’t be undone from here any more. Page history (View → History) still has the version from before.');
  pushUndo(true);
  doc.flows = b.flows.slice(); doc.fu = doc.flows.map(() => now());
  for (const [id, o] of Object.entries(b.objs)) { doc.objs[id] = deep(o); changed(doc.objs[id]); }
  for (const id of b.added) if (doc.objs[id]) doc.objs[id] = { id, del: true, u: now() };
  doc.mu = now();
  view.rebuild(); saveDoc('main'); markInk(); wordLinkChanged();
  aiEditUndo.delete(m.t); m.edit.undone = true; saveChat(); renderChat();
  toast('The AI’s changes are undone.');
}
/* the line under an AI message that changed the page */
function aiEditLine(m) {
  const n = m.edit.n;
  const line = h('div', { class: 'ai-edit-line' + (m.edit.undone ? ' undone' : '') }, svg('edit'),
    h('span', null, m.edit.undone ? 'Changes undone' : 'Changed ' + n + (n === 1 ? ' part' : ' parts') + ' on this page'));
  if (!m.edit.undone && aiEditUndo.has(m.t)) line.append(h('button', { class: 'btn small', onclick: () => aiUndoEdit(m) }, 'Undo'));
  return line;
}

/* send a chat message that may change the page */
async function sendAiEdit(text) {
  if (!cur || !doc || !view) return toast('Open a page first.');
  if (cur.ro) return toast('This page is view only, so the AI can’t change it. Turn off “Can edit the page” to ask about it.');
  const nb = chat.nb, pageId = cur.id;
  chat.messages.push({ role: 'user', content: text, t: now() });
  renderChat();
  const bubble = h('div', { class: 'msg assistant' }, 'Changing the page…'); msgsEl.append(bubble); msgsEl.scrollTop = msgsEl.scrollHeight;
  chatCtl = new AbortController(); setChatBusy(true);
  try {
    const parts = aiParts(), selected = aiSelected(parts);
    const history = chat.messages.filter((x) => !x.err).slice(-7, -1).map((x) => (x.role === 'user' ? 'Student: ' : 'You: ') + String(x.content).slice(0, 600)).join('\n');
    let prompt = aiEditPrompt(parts, selected, text, history);
    if ($('#chatSrc').checked) { const src = await getSourceContext(30000, 0); if (src.count) prompt += '\n\nSOURCES the student added (use them to check facts):\n' + src.text; }
    const data = await AI.json(prompt, { task: 'page.edit', cache: false, signal: chatCtl.signal });
    if (!cur || cur.id !== pageId) throw new Error('The page was closed before the answer came.');
    const reply = String((data && data.reply) || '').slice(0, 2000) || 'Done.';
    const t = now();
    const n = aiApply(aiParts(), data && data.edits, t);   // the page as it is now (it may have changed while waiting)
    if (chat.nb === nb) chat.messages.push({ role: 'assistant', content: reply, t, edit: n ? { n } : undefined });
  } catch (e) {
    if (chat.nb === nb) {
      if (e && e.code === 'cancelled') chat.messages.push({ role: 'assistant', content: '(Stopped. The page wasn’t changed.)', t: now() });
      else chat.messages.push({ role: 'assistant', content: aiErrorText(e), err: true, t: now() });
    }
  } finally {
    chatCtl = null; setChatBusy(false);
    if (chat.nb === nb) { saveChat(); renderChat(); }
  }
}
/* the switch in the Chat tab */
(() => {
  const box = h('input', { type: 'checkbox', id: 'chatEdit', checked: prefs.get('chatEdit', true) ? true : null });
  const lab = h('label', { class: 'opt', title: 'The AI can change this page when you ask it to (Undo is always one click away)' }, box, ' Can edit the page');
  $('#chatClear').before(lab);
  const hint = () => { $('#chatIn').placeholder = box.checked ? 'Ask, or tell the AI what to change on this page…' : 'Ask about your notes…'; };
  box.addEventListener('change', () => { prefs.set('chatEdit', box.checked); hint(); });
  hint();
})();

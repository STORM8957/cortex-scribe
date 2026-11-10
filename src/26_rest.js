
/* ================= links between pages ================= */
let linkMode = null; // { xid, sourceId, text }
function linkMenu(a, ed) {
  openMenu($('#rbody [aria-label^="Link a word"]') || a, [
    { label: 'Open the linked page', icon: 'open', fn: () => followLink(a) },
    { label: 'Remove link', icon: 'unlink', fn: () => { unwrap(a); if (ed) edChanged(ed); } },
  ]);
}
function startLink() {
  if (!cur || cur.ro) return;
  const ed = activeEd && work.contains(activeEd) && activeEd.isContentEditable ? activeEd : null;
  const s = getSelection();
  let r = null;
  if (ed) { if (s.rangeCount && ed.contains(s.getRangeAt(0).startContainer)) r = s.getRangeAt(0); else if (savedRange && ed.contains(savedRange.startContainer)) r = savedRange; }
  const n0 = r && (r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer);
  const existing = n0 && n0.closest ? n0.closest('a.xlink') : null;
  if (existing && (r.collapsed || existing.contains(r.endContainer))) return linkMenu(existing, ed);
  if (linkMode) return toast('Finish or cancel the link you started first.');
  if (!r || r.collapsed || !r.toString().trim()) return toast('Select the word you want to turn into a link first.');
  const text = r.toString();
  const xid = newId('x');
  const a = h('a', { class: 'xlink pending', 'data-xid': xid }, text);
  r.deleteContents(); r.insertNode(a);
  s.removeAllRanges();
  edChanged(ed);
  linkMode = { xid, sourceId: cur.id, text };
  applyToolClass();
  $('#linkText').textContent = 'Now choose where “' + text + '” should take you. Open any page, then click a picture or box, or select some words and press “Link here”.';
  $('#linkHere').disabled = true;
  $('#linkbar').hidden = false;
}
async function editLinkInNote(id, xid, mutate) {
  const q = 'a.xlink[data-xid="' + cssq(xid) + '"]';
  if (cur && cur.id === id && view) {
    const a = work.querySelector(q); if (!a) return false;
    const ed = a.closest('.flow,.otext');
    mutate(a); if (ed) edChanged(ed); return true;
  }
  const node = tree.nodes[id]; if (!node) return false;
  let data; try { data = await loadDocData(id); } catch { return false; }
  const d = data.main; let found = false;
  d.flows = d.flows.map((f) => { if (!f.includes(xid)) return f; const p = parse(f); const a = p.body.querySelector(q); if (!a) return f; mutate(a); found = true; return p.body.innerHTML; });
  for (const o of Object.values(d.objs)) if (o && o.html && o.html.includes(xid)) { const p = parse(o.html); const a = p.body.querySelector(q); if (a) { mutate(a); o.html = p.body.innerHTML; o.u = now(); found = true; } }
  if (!found) return false;
  d.fu = d.flows.map(() => now());
  const main = serializeMain(d, id);
  if (node.shared) await writeShared('shared/' + node.shared, main).catch(() => {});
  else Saver.schedule('note_' + id, main, (x) => Store.set('note_' + id, x), 100);
  return true;
}
async function completeLink(anchorId) {
  const lm = linkMode; if (!lm || !cur) return;
  const targetId = cur.id;
  await editLinkInNote(lm.sourceId, lm.xid, (a) => { a.classList.remove('pending'); a.setAttribute('data-target', targetId); if (anchorId) a.setAttribute('data-atarget', anchorId); else a.removeAttribute('data-atarget'); });
  endLinkMode();
  const where = targetId === lm.sourceId ? 'this page' : '“' + tree.nodes[targetId].name + '”';
  toast('Linked “' + lm.text + '” to ' + where + '.', lm.sourceId !== targetId ? { label: 'Go back', fn: () => openNote(lm.sourceId, lm.xid) } : null);
}
function endLinkMode() { linkMode = null; $('#linkbar').hidden = true; applyToolClass(); }
$('#linkWhole').addEventListener('click', () => completeLink(null));
$('#linkHere').addEventListener('mousedown', (e) => e.preventDefault());
$('#linkHere').addEventListener('click', () => {
  const ed = activeEd && work.contains(activeEd) && activeEd.isContentEditable ? activeEd : null;
  const s = getSelection();
  const r = ed && s.rangeCount && ed.contains(s.getRangeAt(0).startContainer) ? s.getRangeAt(0) : (ed && savedRange && ed.contains(savedRange.startContainer) ? savedRange : null);
  if (!r || r.collapsed || !r.toString().trim()) return toast('Select some words on this page first, or click a picture or box.');
  const id = newId('t');
  const span = h('span', { class: 'anchor', 'data-anchor': id });
  try { span.appendChild(r.extractContents()); r.insertNode(span); } catch { return toast('Select words inside one paragraph.'); }
  s.removeAllRanges(); edChanged(ed);
  completeLink(id);
});
$('#linkCancel').addEventListener('click', async () => {
  const lm = linkMode; if (!lm) return;
  endLinkMode();
  await editLinkInNote(lm.sourceId, lm.xid, (a) => unwrap(a));
});
function followLink(a) {
  const t = a.getAttribute('data-target');
  if (!t || !live(tree.nodes[t])) return toast('That page no longer exists.', { label: 'Remove link', fn: () => { const ed = a.closest('.flow,.otext'); unwrap(a); if (ed) edChanged(ed); } });
  const anc = a.getAttribute('data-atarget');
  if (cur && t === cur.id) jumpTo(anc); else openNote(t, anc);
}
function jumpTo(anchor) {
  if (!view) return;
  if (!anchor) { if (view.scroller) view.scroller.scrollTop = 0; return; }
  const el = work.querySelector('[data-anchor="' + cssq(anchor) + '"],[data-xid="' + cssq(anchor) + '"],[data-tid="' + cssq(anchor) + '"]');
  if (el) {
    const objEl = el.closest('.obj');
    if (objEl && view.kind === 'board') { const o = doc.objs[objEl.dataset.id]; if (o) view.centerOn(o.x + o.w / 2, o.y + o.h / 2); }
    else el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    flashEl(el); return;
  }
  if (doc && doc.objs[anchor] && !doc.objs[anchor].del) { jumpToObj(anchor); return; }
  const o = objList((x) => x.anc === anchor)[0];
  if (o) { jumpToObj(o.id); return; }
  toast('The linked spot isn’t on this page any more.');
}

/* ================= live sharing ================= */
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
let unsubShared = null, unsubInk = null, presenceRoom = null, presenceOff = null, peerState = [];
const PEER_COLORS = ['#D9480F', '#1C5BCB', '#2F855A', '#6B4FD8', '#B83280', '#B7791F'];
const myColor = PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)];
function canShare() { return Store.mode === 'db' && Shared.ok; }
function openShared(node) {
  if (!Shared.ok) return Promise.resolve(null);
  const code = node.shared;
  return new Promise((resolve) => {
    let first = true, inkSeen = false, inkFirst = null;
    const finish = (v) => { if (first) { first = false; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => finish(null), 10000);
    try {
      unsubShared = Shared.watch('shared/' + code, (d, pending) => {
        if (!cur || cur.id !== node.id) return;
        if (!d) { if (first) finish({ gone: true }); else showGone(node); return; }
        if (first) { finish({ main: normalizeMain(d, node.kind), ink: inkFirst || {}, exists: true }); return; }
        if (pending || d.session === SESSION) return;
        mergeRemoteMain(d);
      }, () => { toast('Lost the live connection to this shared page.'); finish(null); });
      unsubInk = Shared.watch('sharedink/' + code, (d, pending) => {
        if (!cur || cur.id !== node.id || !d) return;
        if (!inkSeen) { inkSeen = true; if (first) { inkFirst = d.ink || {}; return; } mergeRemoteInk(d); return; }
        if (pending || d.session === SESSION) return;
        mergeRemoteInk(d);
      });
    } catch { finish(null); }
  });
}
function showGone(node) {
  toast('This page is no longer shared.', { label: 'Remove it from my list', fn: async () => { node.deleted = true; touch(node); saveTree(); await closeNote(); showEmpty(); } });
  if (cur) { cur.ro = true; renderRibbon(); applyToolClass(); showRoBar(); }
}
async function leaveShared() {
  clearTimeout(remoteTimer); pendingRemote = null;
  if (unsubShared) { try { unsubShared(); } catch {} unsubShared = null; }
  if (unsubInk) { try { unsubInk(); } catch {} unsubInk = null; }
  if (presenceOff) { try { presenceOff(); } catch {} presenceOff = null; }
  if (presenceRoom) { const r = presenceRoom; presenceRoom = null; try { await r.leave(); } catch {} }
  peerState = []; $('#people').hidden = true;
  work.querySelectorAll('.cursor-peer').forEach((e) => e.remove());
}
function onWriteRefused(key) {
  if (/^shared/.test(key)) {
    if (cur && !cur.ro) { cur.ro = true; if (editing) exitEdit(); renderRibbon(); applyToolClass(); showRoBar(); setStatus(); if (view) view.rebuild(); }
    permHelp();
  } else toast('Couldn’t save that change. You may not have permission to change this app’s data.');
}
function permHelp() {
  modal({ title: 'How to get edit access', body: [
    h('p', null, 'Right now you can see this page but not change it. That’s a setting in Claude, not a problem with the page. Ask the person who owns Cortex Scribe to do this:'),
    h('ol', { class: 'steps' },
      h('li', null, 'Open Cortex Scribe in Claude and click ', h('b', null, 'Share'), ' at the top.'),
      h('li', null, h('b', null, 'Same organisation: '), 'change your access to ', h('b', null, 'Contributor'), ' or ', h('b', null, 'Editor'), '.'),
      h('li', null, h('b', null, 'Not in the same organisation: '), 'invite you ', h('b', null, 'by email as Editor'), ' and switch off link sharing. People who open a public link can only view.'),
      h('li', null, 'Then reload this page.'))],
    actions: [{ label: 'Got it', kind: 'primary' }] });
}
function showRoBar() {
  let bar = $('#roBar');
  if (!cur || !cur.ro) { if (bar) bar.remove(); return; }
  if (bar) return;
  bar = h('div', { class: 'toolhint', id: 'roBar', style: { background: 'var(--warn-soft)' } }, h('p', null, 'View only: you can read this page but not change it.'), h('button', { class: 'btn small', onclick: permHelp }, 'How to get edit access'));
  $('#main').insertBefore(bar, work);
}
const initials = (n) => (String(n || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?');
async function joinPresence(code) {
  if (!Live.ok) return;
  try {
    const r = await Live.join('p' + code);
    const node = cur && tree.nodes[cur.id];
    if (!node || node.shared !== code) { r.leave().catch(() => {}); return; }
    presenceRoom = r;
    r.presence({ here: 1, c: myColor, uid: Me.id }).catch(() => {});
    presenceOff = r.onPeers((ch) => { peerState = (ch && ch.peers) || r.peers(); renderPeers(); }, () => {});
    peerState = r.peers(); renderPeers();
  } catch {}
}
let presT = 0;
function presenceMove(s, e) {
  if (!presenceRoom || !cur) return;
  const t = now(); if (t - presT < 50) return; presT = t;
  const p = s.toLocal(e.clientX, e.clientY);
  presenceRoom.presence({ x: Math.round(p.x), y: Math.round(p.y), sh: s.sheet || 0 }).catch(() => {});
}
function presenceViewport() {}
let peerSeq = 0;
async function renderPeers() {
  const seq = ++peerSeq;
  const others = peerState.filter((p) => !p.isMe && p.presence && p.presence.here);
  const names = {};
  const ids = others.map((p) => p.by || p.presence.uid).filter(Boolean);
  { const pr = await Me.profiles(ids); for (const id of ids) names[id] = (pr && pr[id] && pr[id].name) || ''; }
  if (seq !== peerSeq) return;
  const ppl = $('#people'); ppl.textContent = ''; ppl.hidden = !others.length;
  const colOf = (p) => (/^#[0-9a-f]{6}$/i.test(p.presence.c || '') ? p.presence.c : '#5B6576');
  for (const p of others) { const nm = names[p.by || p.presence.uid] || 'Someone'; ppl.append(h('span', { class: 'av', style: { background: colOf(p) }, title: nm + ' is here' }, initials(nm))); }
  work.querySelectorAll('.cursor-peer').forEach((e) => e.remove());
  if (!view) return;
  for (const p of others) {
    const pr = p.presence; if (pr.x == null) continue;
    const s = view.kind === 'a4' ? view.surf(pr.sh || 0) : view.surf(0); if (!s) continue;
    const c = colOf(p), nm = names[p.by || pr.uid] || 'Someone';
    const el = h('div', { class: 'cursor-peer', style: { left: (+pr.x || 0) + 'px', top: (+pr.y || 0) + 'px', transform: s.board ? 'scale(' + (1 / view.zoom) + ')' : '', transformOrigin: '0 0' } });
    el.innerHTML = '<svg viewBox="0 0 18 18"><path d="M2 2l13 6-6 1.5L7 16z" fill="' + c + '" stroke="#fff" stroke-width="1.2"/></svg>';
    el.append(h('span', { style: { background: c } }, nm));
    s.L.others.append(el);
  }
}
function shareModal() {
  if (!cur || !doc) return;
  const node = tree.nodes[cur.id];
  if (!canShare()) {
    if (Shared.ok && Store.reason === 'readonly') return permHelp();
    return modal({ title: 'Sharing isn’t available here', body: [h('p', null, Platform.shareWhere || 'Open this app in Claude while you’re signed in to share pages live.')], actions: [{ label: 'OK', kind: 'primary' }] });
  }
  const accessSteps = h('ol', { class: 'steps' },
    h('li', null, 'Click ', h('b', null, 'Share'), ' at the top of Cortex Scribe in Claude.'),
    h('li', null, h('b', null, 'Same organisation: '), 'give your friend ', h('b', null, 'Contributor'), ' or ', h('b', null, 'Editor'), ' access.'),
    h('li', null, h('b', null, 'Not in your organisation: '), 'invite them ', h('b', null, 'by email as Editor'), ' and switch off link sharing. Anyone who opens a public link can only view, so they can’t edit.'),
    h('li', null, 'Send them the code below. In Cortex Scribe they press ', h('b', null, 'Join a shared page'), '.'));
  if (!node.shared) {
    return modal({
      title: 'Share “' + node.name + '” live',
      body: [h('p', null, 'You’ll get a code. Everyone with the code and edit access works on the same page. Changes, drawings and cursors show up live while you’re both online, and everything is saved for later.'), h('p', null, h('b', null, 'So your friend can edit, not just view:')), accessSteps],
      actions: [{ label: 'Cancel' }, { label: 'Start sharing', kind: 'primary', fn: async () => {
        const code = makeCode();
        try {
          await Saver.flushAll();
          await writeShared('shared/' + code, serializeMain(doc, node.id));
          await writeShared('sharedink/' + code, serializeInk(doc));
        } catch (e) { toast(e && e.code === 'too_big' ? 'This page is too big to share. Move some pictures to another page.' : 'Couldn’t start sharing. Check your connection and try again.'); return; }
        node.shared = code; node.owner = true; touch(node); saveTree();
        await openNote(node.id); shareModal();
      } }],
    });
  }
  const codeEl = h('div', { class: 'code' }, node.shared);
  const copy = h('button', { class: 'btn' }, svg('copy'), h('span', null, 'Copy code'));
  copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(node.shared); copy.lastChild.textContent = 'Copied'; } catch { const r = document.createRange(); r.selectNodeContents(codeEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Select the code and copy it.'); } });
  modal({
    title: 'Shared live',
    body: [h('p', null, 'Give this code to your friend. In Cortex Scribe they press “Join a shared page” and type it in.'), codeEl, copy, h('p', { style: { marginTop: '14px' } }, h('b', null, 'If your friend can only view:')), accessSteps],
    actions: [
      node.owner
        ? { label: 'Stop sharing', fn: async () => {
            if (!(await confirmModal('Stop sharing?', 'The page becomes private again. People you shared it with lose access.', 'Stop sharing', true))) return false;
            try {
              await Saver.flushAll();
              await Store.set('note_' + node.id, serializeMain(doc, node.id)); await Store.set('ink_' + node.id, serializeInk(doc));
              await Shared.del('shared/' + node.shared); Shared.del('sharedink/' + node.shared).catch(() => {});
            } catch { toast('Couldn’t stop sharing. Try again.'); return; }
            delete node.shared; delete node.owner; touch(node); saveTree(); openNote(node.id);
          } }
        : { label: 'Keep a private copy', fn: async () => {
            await Saver.flushAll();
            const c = mkNode('note', node.name + ' (my copy)', node.parent); c.kind = doc.kind;
            try { await Store.set('note_' + c.id, serializeMain(doc, c.id)); await Store.set('ink_' + c.id, serializeInk(doc)); } catch { toast('Couldn’t make a copy.'); return; }
            saveTree(); openNote(c.id);
          } },
      { label: 'Done', kind: 'primary' },
    ],
  });
}
async function joinModal() {
  if (!Shared.ok) return modal({ title: 'Joining isn’t available here', body: [h('p', null, Platform.shareWhere || 'Open this app in Claude while you’re signed in to join shared pages.')], actions: [{ label: 'OK', kind: 'primary' }] });
  const code = await promptModal('Join a shared page', 'Code', '', 'Join', 'e.g. k7m2xq9pna');
  if (code == null) return;
  const c = code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!c) return;
  const existing = Object.values(tree.nodes).find((n) => live(n) && n.shared === c);
  if (existing) return openNote(existing.id);
  let d;
  try { d = await Shared.get('shared/' + c); } catch { return toast('Couldn’t check that code. Try again.'); }
  if (!d) return toast('No shared page has that code. Check the spelling.');
  let inbox = Object.values(tree.nodes).find((n) => live(n) && n.inbox);
  if (!inbox) { inbox = mkNode('folder', 'Shared with me', null); inbox.inbox = true; }
  const n = mkNode('note', d.title || 'Shared page', inbox.id);
  n.shared = c; n.kind = d.kind || 'endless'; openSet.add(inbox.id); persistOpen(); saveTree();
  await openNote(n.id);
  if (caps.canWrite === false) permHelp();
}
$('#shareBtn').addEventListener('click', shareModal);
$('#joinBtn').append(svg('shared'), 'Join a shared page');
$('#joinBtn').addEventListener('click', joinModal);

/* ================= opening and closing pages ================= */
function renderCrumbs() {
  const c = $('#crumbs'); c.textContent = '';
  wordLinkPageOpened();   // 49_wordlink.js: link or unlink the open page with Word
  if (secOpen) { const s = SECTIONS.find((x) => x[0] === secOpen); c.append(h('b', null, s ? s[1] : '')); return; }
  if (!cur || !tree.nodes[cur.id]) return;
  for (const a of ancestors(cur.id)) c.append(h('span', null, a.name), h('span', { 'aria-hidden': 'true' }, '›'));
  const n = tree.nodes[cur.id];
  c.append(h('b', { title: cur.ro ? n.name : 'Rename', style: { cursor: cur.ro ? '' : 'pointer' }, onclick: () => { if (!cur.ro) renameNode(n); } }, n.name));
  if (doc) c.append(h('span', { class: 'kind-chip' }, KIND_LABEL[doc.kind]));
}
function showEmpty() {
  if (view) { view.destroy(); view = null; }
  doc = null; cur = null; renderDock(); $('#psearch').hidden = true;
  $('#ribbon').hidden = true; $('#shareBtn').hidden = true; $('#pdfBtn').hidden = true; $('#accChip').hidden = true; $('#objbar').hidden = true; $('#toolhint').hidden = true; showRoBar();
  renderCrumbs(); renderTree(); updateGhostCaret();
  const e = $('#empty'); e.textContent = ''; e.hidden = false;
  if (!kids(null).length) {
    e.append(h('h1', null, 'Your notes, with pictures, boards and a pen.'),
      h('p', null, 'Make a notebook for each subject. Inside, add folders and pages: A4 pages, endless pages or drawing boards.'),
      h('ul', null, h('li', null, 'Write and format like in Word, add pictures, sticky notes, mind maps and charts.'), h('li', null, 'Draw on the page, or write on the pad and it’s typed for you.'), h('li', null, 'Magic box: drag around anything to turn it into a chart, mind map, table or summary.'), h('li', null, 'Fact check your notes against your sources and get an accuracy score.'), h('li', null, 'Chat about your notes and test yourself with scored quizzes.')),
      h('button', { class: 'btn primary', onclick: newNotebook }, 'New notebook'));
  } else {
    e.append(h('h1', null, 'Pick a page.'), h('p', null, 'Open a page from the list, or add one with + next to a notebook or folder.'));
    if (isMobile() || app.classList.contains('side-closed')) e.append(h('button', { class: 'btn primary', onclick: () => (isMobile() ? setSide(true) : toggleSide()) }, 'Show notebooks'));
  }
  if (isMobile()) {   // a phone is often used as the drawing pad: make that easy to find
    e.append(h('div', { class: 'empty-pad' }, h('button', { class: 'btn', id: 'emptyPadBtn', onclick: () => padHubModal() }, svg('pen'), 'Be the drawing pad'),
      Platform.host === 'claude' && Store.mode !== 'db' ? h('p', { class: 'hint' }, 'This screen isn’t signed in to Claude, so it can’t reach your notes or be the pad for them. Sign in at claude.ai with the same account (or open the link in the Claude app), then scan the QR code again.') : null));
  }
  loadNotebookSide(null);
  for (const t of ['fact', 'sources', 'outline', 'format', 'm3d']) if (ptab === t) setPtab(t);
  if (kids(null).length && !secSuppress && !secOpen) openSection('home');   // nothing open: show Home (47_sections.js)
}
async function closeNote() {
  if (editing) exitEdit();
  if (mmEditing) MM.commit();
  if (sel.has) clearSel();
  await Promise.race([Saver.flushAll(), sleep(1500)]);
  await leaveShared();
  if (view) { view.destroy(); view = null; }
  doc = null; cur = null; activeEd = null; savedRange = null;
  hist.undo = []; hist.redo = [];
}
async function openNote(id, anchor) {
  closeSection();
  try { await openNoteInner(id, anchor); }
  catch (err) { console.error(err); showOpenError(id, err); }
}
function showOpenError(id, err) {
  if (view) { try { view.destroy(); } catch {} view = null; }
  work.querySelectorAll('.busy').forEach((x) => x.remove());
  const e = $('#empty'); e.textContent = ''; e.hidden = false;
  e.append(h('h1', null, 'This page couldn’t be shown.'), h('p', null, 'Error: ' + String((err && (err.message || err.code)) || err)), h('p', { class: 'hint' }, 'Your notes are safe. Please send me a screenshot of this message so I can fix it.'), h('button', { class: 'btn primary', onclick: () => openNote(id) }, 'Try again'));
}
async function openNoteInner(id, anchor) {
  const node = tree.nodes[id];
  if (!live(node) || node.type !== 'note') return;
  if (linkMode && cur && cur.id === id && !anchor) return;
  await closeNote();
  cur = { id, loading: true, ro: false };
  prefs.set('last', id);
  for (const a of ancestors(id)) openSet.add(a.id);
  persistOpen();
  $('#empty').hidden = true;
  renderTree(); renderCrumbs(); setSide(false);
  $('#shareBtn').hidden = false; $('#shareBtn').textContent = node.shared ? 'Shared' : 'Share'; $('#pdfBtn').hidden = false;
  const loadingEl = h('div', { class: 'busy', style: { padding: '30px' } }, h('span', { class: 'spinner' }), h('span', null, 'Opening the page…'));
  work.append(loadingEl);
  let data = null;
  try {
    if (node.shared) data = await openShared(node);
    else data = await loadDocData(id);
  } catch { data = null; }
  loadingEl.remove();
  if (!cur || cur.id !== id) return;
  if (!data || data.gone) {
    cur = null;
    const e = $('#empty'); e.textContent = ''; e.hidden = false;
    e.append(h('h1', null, data && data.gone ? 'This page is no longer shared.' : 'This page couldn’t be opened.'), h('p', null, data && data.gone ? 'The owner stopped sharing it.' : 'Your notes are safe. Check your connection and try again.'),
      data && data.gone ? h('button', { class: 'btn', onclick: () => { node.deleted = true; touch(node); saveTree(); renderTree(); showEmpty(); } }, 'Remove it from my list') : h('button', { class: 'btn primary', onclick: () => openNote(id) }, 'Try again'));
    return;
  }
  let fresh = false;
  if (pendingTemplate && pendingTemplate.id === id) { if (!data.exists) { data.main = applyTemplate(pendingTemplate.kind, pendingTemplate.tpl); fresh = true; } pendingTemplate = null; }
  else if (!data.exists) fresh = true;
  doc = data.main; doc.ink = data.ink || {};
  if (fresh && !doc.pcol && !(node.shared && caps.canWrite === false)) { const ps = cleanStyle(prefs.get('pageStyle', null)); if (ps && ps.bg && ps.line && ps.text) doc.pcol = { bg: ps.bg, line: ps.line, text: ps.text }; }
  if (node.kind !== doc.kind) { node.kind = doc.kind; touch(node); saveTree(); }
  cur.ro = !!(node.shared && caps.canWrite === false);
  cur.loading = false;
  if (!cur.ro) ensureNames();
  view = new View(doc.kind); view.build();
  verOnOpen(fresh);
  $('#psearch').hidden = false; $('#pageSearch').value = '';
  tool = defaultTool(); setTool(tool);
  $('#ribbon').hidden = false; buildRibbonTabs(); renderRibbon();
  showRoBar(); setStatus(); renderCrumbs();
  if (fresh && !cur.ro) { saveDoc(); markInk(); }
  if (node.shared) joinPresence(node.shared);
  loadFact(id);
  load3D((notebookOf(id) || {}).id || null).then(() => { if (view && cur && cur.id === id && objList((o) => o.t === 'm3d' && !o.scene).length) view.renderAll(true); });
  await loadNotebookSide((notebookOf(id) || {}).id || null);
  if (!cur || cur.id !== id) return;
  if (ptab === 'format') refreshFormat(); if (ptab === 'outline') renderOutline(); if (ptab === 'fact') renderFact(); if (ptab === 'sources') renderSources();
  if (ptab === 'm3d') render3DPanel();   // each page lists its own 3D models
  if (anchor) setTimeout(() => jumpTo(anchor), 80);
  else if (doc.kind !== 'board' && fresh) { const f = view.flowEl(0); if (f && !cur.ro && !htmlStrToText(doc.flows[0]).trim()) { const ti = $('#titleIn'); if (ti && /^(Untitled page)$/.test(ti.value)) { ti.focus(); ti.select(); } else placeCaretAt(f, false); } }
}

/* ================= presenting frames ================= */
let presenting = null;
function present(startId) {
  if (!view || view.kind !== 'board') return toast('Presenting works on drawing boards with frames.');
  const frames = objList((o) => o.t === 'frame').sort((a, b) => a.y - b.y || a.x - b.x);
  if (!frames.length) return toast('Add a frame first: Insert → Frame.');
  let i = Math.max(0, frames.findIndex((f) => f.id === startId));
  const before = { pan: { ...view.pan }, z: view.zoom };
  clearSel(); setTool('select');
  app.classList.add('presenting');
  const label = h('span', { class: 'rlabel' });
  const bar = h('div', { class: 'pbar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Previous', onclick: () => go(-1) }, svg('chevL')), label,
    h('button', { class: 'icon-btn', 'aria-label': 'Next', onclick: () => go(1) }, svg('chevR')),
    h('button', { class: 'btn small', onclick: () => stop() }, 'Exit'));
  document.body.append(bar);
  const show = () => { const f = frames[i]; label.textContent = (f.title || 'Frame') + ' · ' + (i + 1) + ' of ' + frames.length; setTimeout(() => view.focusBox({ x: f.x, y: f.y, w: f.w, h: f.h }, null, 24), 30); };
  const go = (d) => { i = clamp(i + d, 0, frames.length - 1); show(); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); stop(); } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); } };
  const stop = () => { document.removeEventListener('keydown', key, true); bar.remove(); app.classList.remove('presenting'); presenting = null; if (view) { view.pan = before.pan; view.zoom = before.z; setTimeout(() => view && view.applyTransform(), 30); } };
  document.addEventListener('keydown', key, true);
  presenting = { stop };
  show();
}

/* ================= help ================= */
function helpModal() {
  modal({
    title: 'How Cortex Scribe works', wide: true,
    body: [h('ul', null,
      h('li', null, h('b', null, 'Notebooks, folders, pages. '), 'Use + next to a notebook or folder. Pages can be A4 pages (like Word), one endless page, or an endless drawing board.'),
      h('li', null, h('b', null, 'Ribbon. '), 'Home formats text like Word. Insert adds pictures, note boxes, sticky notes, shapes, connectors, mind maps, charts and tables. Draw lets you write and draw right on the page.'),
      h('li', null, h('b', null, 'Boxes and pictures. '), 'Drag to move, use the corners to resize and the round handle to rotate. The blue dots on a box connect it to another box; click one to add a new connected box. Use “In front of / Behind text” on pages.'),
      h('li', null, h('b', null, 'Mind maps. '), 'Click an idea, press Tab for a new child idea, Enter for one next to it. Double-click to edit.'),
      h('li', null, h('b', null, 'Bottom toolbar. '), 'Select, type, pen, highlight marker, eraser, boxes, sticky notes, shapes, connectors, mind maps, pictures and the ★ Magic box. Click the pen or marker again for colours and size.'),
      h('li', null, h('b', null, '3D studio. '), 'Draw on the pad and press “Make it a 3D model”, or describe one in the 3D studio. “Put on the page” makes a live 3D window in your note: drag inside it to turn the model, Delete removes it, Cmd changes it, Link joins other models, Expand goes full screen.'),
      h('li', null, h('b', null, 'Magic box (★). '), 'Pick what it should make (diagram, mind map, table, summary…), press Magic box and drag a box around text, pictures or drawings. “18% apple, the rest banana” becomes a pie chart.'),
      h('li', null, h('b', null, 'Fact check. '), 'Add sources (PDF, Word, Excel, pictures, YouTube transcripts, text), then check the whole note or an area. You get an accuracy score and fixes.'),
      h('li', null, h('b', null, 'Handwriting. '), 'Write on the pad in the right panel and it’s typed where your cursor is, or write on the page and use Draw → Writing → text.'),
      h('li', null, h('b', null, 'Tidy up. '), 'Choose what to tidy: spelling, layout, drawings into clean shapes, handwriting into text, or lining up boxes.'),
      h('li', null, h('b', null, 'Links. '), 'Select a word, press Link, open the page you want and click a picture or box (or select words and press Link here).'),
      h('li', null, h('b', null, 'Chat and Learn. '), 'Chat about your notes and sources. Learn makes scored quizzes, flashcards, summaries and mind maps.'),
      h('li', null, h('b', null, 'Backup and move. '), 'Export everything saves all notebooks, pictures, 3D models and recordings into one file. Import adds a backup as copies.'),
      h('li', null, h('b', null, 'Sharing. '), 'Share live gives you a code. Your friend needs edit access in Claude (Contributor/Editor, or invited by email as Editor) to change the page.'),
      h('li', null, h('b', null, 'Shortcuts. '), 'V select, T text, P pen, H highlighter, E eraser, M Magic box, N note box, S sticky note, C connector, Ctrl+Z undo, Ctrl+D duplicate, Delete removes, hold Space to move the board. Right-click and drag to select, Ctrl+G groups, Ctrl+Shift+G ungroups, Ctrl+L locks, Ctrl+K finds things on the page. With the hand tool, scrolling zooms. The search box above your notebooks finds pages by name and by what’s written in them.')),
      h('p', { class: 'hint' }, Platform.host === 'claude' ? 'Everything Claude does here uses your normal Claude usage.' : 'AI features use the AI you choose in AI settings (bottom left): Claude, ChatGPT, Gemini, OpenRouter, or a free AI on your own computer.')],
    actions: [{ label: 'Got it', kind: 'primary' }],
  });
}
$('#helpBtn').textContent = 'How it works';
$('#helpBtn').addEventListener('click', helpModal);
$('#newNotebook').append(svg('plus'), 'New notebook');
$('#newNotebook').addEventListener('click', newNotebook);

/* ================= start ================= */
let lastErrT = 0;
function reportErr(err) {
  const msg = String((err && (err.message || err.code)) || err || '');
  if (!msg || /ResizeObserver|Script error|cancelled|AbortError/i.test(msg)) return;
  if (now() - lastErrT < 4000) return; lastErrT = now();
  toast('Something went wrong: ' + msg.slice(0, 140) + '. A screenshot of this helps me fix it.');
}
addEventListener('error', (e) => reportErr(e.error || e.message));
addEventListener('unhandledrejection', (e) => { const r = e.reason; if (r && r.code && !(r instanceof Error)) return; reportErr(r); });
async function boot() {
  applyTheme();
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
  $('#padAuto').checked = prefs.get('padAuto', true);
  $('#padSpace').checked = prefs.get('padSpace', false);
  renderPadTools(); loadPadStyle();
  const dl = prefs.get('padDelay', 1000); $('#padDelay').value = dl; $('#padDelayV').textContent = (dl / 1000).toFixed(1) + ' s';
  if (prefs.get('sideClosed', false) && !isMobile()) app.classList.add('side-closed');
  if (!panelOpen) app.classList.add('panel-closed');
  await Promise.all([Store.init(), Platform.init()]);
  let t = null;
  try { t = await Store.get('tree'); }
  catch {
    $('#loading').textContent = '';
    $('#loading').append(h('span', null, 'Your notebooks couldn’t be loaded.'), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Try again'));
    return;
  }
  tree = t && t.nodes ? { nodes: t.nodes } : { nodes: {} };
  purgeOldTrash();
  $('#loading').remove();
  let started = false;
  const startUi = () => {
    if (started) return; started = true;
    showStoreNote();
    renderAIState();
    buildRail(); setPtab(ptab);
    setStatus();
    watchTree();
    renderTree();
    const last = prefs.get('last', null);
    if (last && live(tree.nodes[last])) openNote(last); else showEmpty();
    setTimeout(padOfferCheck, 600);
  };
  if (await padBootCheck(startUi)) return;   // opened as the drawing pad (#pad=<code>, or a phone right after a pad link started): see 37_pad.js
  startUi();
}
boot();
})();
</script>

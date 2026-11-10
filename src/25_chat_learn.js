
/* ================= chat ================= */
let chat = { nb: undefined, messages: [] }, studio = { nb: undefined, items: [] }, scores = { nb: undefined, items: [] };
let chatCtl = null;
async function loadNotebookSide(nbId) {
  if (chat.nb === nbId) return;
  chat = { nb: nbId, messages: [] }; studio = { nb: nbId, items: [] }; scores = { nb: nbId, items: [] };
  renderChat(); renderStudio(); renderScoreboard();
  if (!nbId) return;
  const [c, s, sc] = await Promise.all([Store.get('chat_' + nbId).catch(() => null), Store.get('studio_' + nbId).catch(() => null), Store.get('scores_' + nbId).catch(() => null)]);
  if (chat.nb !== nbId) return;
  chat.messages = (c && c.messages) || []; studio.items = (s && s.items) || []; scores.items = (sc && sc.items) || [];
  renderChat(); renderStudio(); renderScoreboard();
  loadSources(nbId).then(() => { if (ptab === 'sources') renderSources(); if (ptab === 'fact') renderFact(); });
}
const saveChat = () => { if (chat.nb) { const nb = chat.nb, m = chat.messages.slice(-60); Saver.schedule('chat_' + nb, { messages: m }, (d) => Store.set('chat_' + nb, d), 400); } };
const saveStudio = () => { if (studio.nb) { const nb = studio.nb, it = studio.items.slice(0, 15); Saver.schedule('studio_' + nb, { items: it }, (d) => Store.set('studio_' + nb, d), 400); } };
const saveScores = () => { if (scores.nb) { const nb = scores.nb, it = scores.items.slice(0, 60); Saver.schedule('scores_' + nb, { items: it }, (d) => Store.set('scores_' + nb, d), 400); } };
function md(src) {
  const lines = esc(src).split('\n'); let out = '', list = null, inCode = false, code = '';
  const inline = (s) => s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>');
  const close = () => { if (list) { out += '</' + list + '>'; list = null; } };
  for (const line of lines) {
    if (/^\s*```/.test(line)) { if (inCode) { out += '<pre><code>' + code + '</code></pre>'; code = ''; inCode = false; } else { close(); inCode = true; } continue; }
    if (inCode) { code += line + '\n'; continue; }
    let m;
    if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += '<li>' + inline(m[1]) + '</li>'; continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += '<li>' + inline(m[1]) + '</li>'; continue; }
    close();
    if ((m = line.match(/^\s*(#{1,4})\s+(.*)/))) { out += m[1].length <= 2 ? '<h3>' + inline(m[2]) + '</h3>' : '<p><b>' + inline(m[2]) + '</b></p>'; continue; }
    if (line.trim()) out += '<p>' + inline(line) + '</p>';
  }
  close(); if (inCode) out += '<pre><code>' + code + '</code></pre>';
  return out;
}
const msgsEl = $('#msgs');
function addToNote(html) {
  if (!cur || !doc || cur.ro) return toast('Open a page you can edit first.');
  const o = insertObj({ t: 'note', w: view.kind === 'a4' ? 520 : 420, h: 120, ah: true, html: sanitize(html) });
  if (o) toast('Added to the page as a note box.');
}
function renderChat() {
  msgsEl.textContent = '';
  if (!chat.nb) { msgsEl.append(h('p', { class: 'chat-empty' }, 'Open a page to chat about your notes.')); return; }
  if (!chat.messages.length) msgsEl.append(h('p', { class: 'chat-empty' }, 'Ask anything about this notebook: “Explain this simpler”, “What did I forget?”, “Test me on chapter 2”.'));
  for (const m of chat.messages) {
    const b = h('div', { class: 'msg ' + (m.role === 'user' ? 'user' : 'assistant') + (m.err ? ' err' : '') });
    if (m.role === 'user' || m.err) b.textContent = m.content;
    else { b.innerHTML = md(m.content); if (m.edit) b.append(aiEditLine(m)); else b.append(h('button', { class: 'madd', onclick: () => addToNote(md(m.content)) }, '+ Add to page')); }
    msgsEl.append(b);
  }
  msgsEl.scrollTop = msgsEl.scrollHeight;
}
function setChatBusy(on) { $('#chatSend').textContent = on ? 'Stop' : 'Send'; }
async function sendChat() {
  if (chatCtl) { chatCtl.abort(); return; }
  const input = $('#chatIn');
  const text = input.value.trim(); if (!text) return;
  if (!aiReady()) return;
  if (!cur || !chat.nb) return toast('Open a page first.');
  input.value = ''; growInput();
  if ($('#chatEdit') && $('#chatEdit').checked) return sendAiEdit(text);   // the AI may change the page (50_ai_edit.js)
  chat.messages.push({ role: 'user', content: text, t: now() });
  renderChat();
  const empty = msgsEl.querySelector('.chat-empty'); if (empty) empty.remove();
  const bubble = h('div', { class: 'msg assistant' }, 'Thinking…'); msgsEl.append(bubble); msgsEl.scrollTop = msgsEl.scrollHeight;
  chatCtl = new AbortController(); setChatBusy(true);
  const nb = chat.nb;
  try {
    const scope = $('#chatScope').value;
    const ctx = await buildContext(scope, $('#chatPics').checked);
    const src = $('#chatSrc').checked ? await getSourceContext(60000, AI.img ? Math.max(0, Math.min(AI.img.maxCount || 0, 8) - ctx.images.length, 0) : 0) : { text: '', images: [], count: 0 };
    const intro = 'You are the study helper inside “Cortex Scribe”, a student’s notebook app. Help the student understand and learn their own notes. Use the notes' + (src.count ? ' and the sources' : '') + ' below when they are relevant and say clearly when something is not in them (you may still explain it). Answer in the language the student writes in. Keep answers short and clear; use short paragraphs or bullet points, and **bold** for key terms.' +
      (ctx.images.length ? ' Pictures from the notes are attached first, in order.' : '') + (src.images.length ? ' Source pictures are attached after them.' : '') +
      '\n\nThe student’s notes (' + scopeLabel(scope).toLowerCase() + '):\n' + (ctx.text || '(the selected pages are empty)') + (src.count ? '\n\nSOURCES the student added:\n' + src.text : '');
    const history = [];
    for (const m of chat.messages.filter((x) => !x.err).slice(-14)) {
      if (!history.length && m.role !== 'user') continue;
      const last = history[history.length - 1];
      if (last && last.role === m.role) last.content += '\n\n' + m.content; else history.push({ role: m.role, content: m.content });
    }
    const opts = { task: 'chat', cache: false, signal: chatCtl.signal, onText: ({ text: t }) => { bubble.innerHTML = md(t); msgsEl.scrollTop = msgsEl.scrollHeight; } };
    const imgs = ctx.images.concat(src.images);
    if (imgs.length) opts.images = imgs;
    const { text: answer, truncated } = await AI.text([{ role: 'user', content: intro }, { role: 'assistant', content: 'Understood. I have the notes. What would you like to know?' }, ...history], opts);
    if (chat.nb === nb) chat.messages.push({ role: 'assistant', content: answer + (truncated ? '\n\n(The answer was cut short.)' : ''), t: now() });
  } catch (e) {
    if (chat.nb === nb) {
      if (e && e.code === 'cancelled') { if (e.text) chat.messages.push({ role: 'assistant', content: e.text + '\n\n(Stopped.)', t: now() }); }
      else chat.messages.push({ role: 'assistant', content: aiErrorText(e), err: true, t: now() });
    }
  } finally {
    chatCtl = null; setChatBusy(false);
    if (chat.nb === nb) { saveChat(); renderChat(); }
  }
}
function growInput() { const t = $('#chatIn'); t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight + 2) + 'px'; }
$('#chatIn').addEventListener('input', growInput);
$('#chatIn').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); } });
$('#chatSend').addEventListener('click', sendChat);
$('#chatClear').append(svg('trash'));
$('#chatClear').addEventListener('click', async () => {
  if (!chat.nb || !chat.messages.length) return;
  if (!(await confirmModal('Clear this chat?', 'The chat for this notebook will be deleted. Your notes stay as they are.', 'Clear chat', true))) return;
  chat.messages = []; saveChat(); renderChat();
});

/* ================= learn ================= */
const KINDS = {
  summary: {
    label: 'Summary', busy: 'Writing a summary…',
    ask: () => 'Write a study summary of these notes: a short overview, the 4–8 most important points, and the key terms with a one-line meaning.',
    shape: '{"title": "short title", "lang": "BCP-47 code of the notes’ language, e.g. de-CH", "overview": "2–4 sentences", "keyPoints": ["…"], "terms": [{"term": "…", "meaning": "…"}]}',
    check: (d) => d && typeof d.overview === 'string' && Array.isArray(d.keyPoints),
  },
  cards: {
    label: 'Flashcards', busy: 'Making flashcards…',
    ask: () => 'Make ' + ($('#learnCount').value || 10) + ' flashcards that test the important facts in these notes. Fronts are short questions or terms; backs are short answers (at most 25 words).',
    shape: '{"title": "short title", "cards": [{"front": "…", "back": "…"}]}',
    check: (d) => d && Array.isArray(d.cards) && d.cards.length > 0 && d.cards.every((c) => c && c.front && c.back),
  },
  quiz: {
    label: 'Quiz', busy: 'Writing a quiz…',
    ask: () => { const n = +$('#learnCount').value || 10, lv = $('#learnLevel').value; return 'Write a quiz of exactly ' + n + ' multiple-choice questions about these notes' + (lv === 'easy' ? ', easy: about the main facts' : lv === 'hard' ? ', hard: about details, connections and applying the knowledge' : ', from easy to hard') + '. Each question has exactly 4 options and one correct answer. "answer" is the index (0–3) of the correct option; mix up where the correct answer is. "explain" says in one sentence why it is correct.'; },
    shape: '{"title": "short title", "questions": [{"question": "…", "options": ["…", "…", "…", "…"], "answer": 0, "explain": "…"}]}',
    check: (d) => d && Array.isArray(d.questions) && d.questions.length > 0 && d.questions.every((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(+q.answer)),
  },
  map: {
    label: 'Mind map', busy: 'Drawing a mind map…',
    ask: () => 'Make a mind map of these notes: one central topic, 3–6 branches, each with 2–5 short details (at most 6 words each).',
    shape: '{"center": "main topic", "branches": [{"label": "…", "children": ["…", "…"]}]}',
    check: (d) => d && d.center && Array.isArray(d.branches),
  },
};
let learnCtl = null;
async function runLearn(kind) {
  if (learnCtl || !aiReady()) return;
  if (!cur || !studio.nb) return toast('Open a page first.');
  const K = KINDS[kind];
  const scope = $('#learnScope').value, focus = $('#learnFocus').value.trim();
  const nb = studio.nb;
  learnCtl = new AbortController();
  $('#learnBusyT').textContent = K.busy; $('#learnBusy').hidden = false;
  $$('[data-learn]').forEach((b) => (b.disabled = true));
  try {
    const ctx = await buildContext(scope, true);
    if (!ctx.hasContent) { toast('These pages are empty. Write some notes first.'); return; }
    const prompt = K.ask() + '\n' + (focus ? 'Focus on: ' + focus + '\n' : '') +
      'Write in the same language as the notes. Base everything on the notes' + (ctx.images.length ? ' and the attached pictures' : '') + '; do not invent facts that are not there.\n\n' +
      'Reply with only JSON in this shape:\n' + K.shape + '\n\nNOTES:\n' + ctx.text;
    const opts = { task: 'learn.' + kind, signal: learnCtl.signal, cache: false };
    if (ctx.images.length) opts.images = ctx.images;
    const data = await AI.json(prompt, opts);
    if (!K.check(data)) throw { code: 'invalid_json' };
    if (studio.nb !== nb) return;
    const item = { id: newId('o'), kind, created: now(), scope: scopeLabel(scope), title: String(data.title || data.center || K.label).slice(0, 120), data };
    studio.items.unshift(item); studio.items = studio.items.slice(0, 15);
    saveStudio(); renderStudio(item.id);
  } catch (e) {
    if (!e || e.code !== 'cancelled') toast(aiErrorText(e));
  } finally {
    learnCtl = null; $('#learnBusy').hidden = true;
    $$('[data-learn]').forEach((b) => (b.disabled = false));
  }
}
$$('[data-learn]').forEach((b) => b.addEventListener('click', () => runLearn(b.dataset.learn)));
$('#learnStop').addEventListener('click', () => learnCtl && learnCtl.abort());
function recordScore(kind, right, total, title) {
  if (!scores.nb || !total) return;
  scores.items.unshift({ kind, right, total, t: now(), title: String(title || '').slice(0, 80) });
  scores.items = scores.items.slice(0, 60); saveScores(); renderScoreboard();
}
function renderScoreboard() {
  const b = $('#scoreboard'); if (!b) return; b.textContent = '';
  const it = scores.items || [];
  const pct = (x) => Math.round(x.right / x.total * 100);
  if (!it.length) { b.append(h('div', null, h('b', null, '–'), h('span', null, 'Last score')), h('div', null, h('b', null, '–'), h('span', null, 'Average')), h('div', null, h('b', null, '0'), h('span', null, 'Tests done'))); return; }
  const last10 = it.slice(0, 10), avg = Math.round(last10.reduce((a, x) => a + pct(x), 0) / last10.length), best = Math.max(...it.map(pct));
  b.append(h('div', { title: it[0].title }, h('b', null, pct(it[0]) + '%'), h('span', null, 'Last (' + it[0].right + '/' + it[0].total + ')')),
    h('div', null, h('b', null, avg + '%'), h('span', null, 'Average')),
    h('div', null, h('b', null, best + '%'), h('span', null, 'Best of ' + it.length)));
}
function renderStudio(openId) {
  const box = $('#studio'); box.textContent = '';
  if (!studio.nb) return;
  if (!studio.items.length) { box.append(h('p', { class: 'hint' }, 'Your quizzes, flashcards, summaries and mind maps appear here. Quizzes and flashcards give you a score.')); return; }
  studio.items.forEach((it, i) => box.append(renderItem(it, openId ? it.id === openId : i === 0)));
}
function renderItem(it, open) {
  const K = KINDS[it.kind] || { label: it.kind };
  const d = h('details', { class: 'card', open: open || null });
  const more = h('button', { class: 'icon-btn', 'aria-label': 'More', onclick: (e) => { e.preventDefault(); e.stopPropagation(); openMenu(e.currentTarget, [{ label: 'Delete', icon: 'trash', danger: true, fn: () => { studio.items = studio.items.filter((x) => x.id !== it.id); saveStudio(); renderStudio(); } }]); } }, svg('dots'));
  d.append(h('summary', null, h('span', { class: 'k' }, K.label), h('span', { class: 't' }, it.title), more));
  const body = h('div', { class: 'card-body' }, h('p', { class: 'meta' }, it.scope + ', ' + new Date(it.created).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })));
  try {
    if (it.kind === 'summary') body.append(...summaryView(it.data));
    else if (it.kind === 'cards') body.append(cardsView(it.data.cards, it.title));
    else if (it.kind === 'quiz') body.append(quizView(it.data.questions, it.title));
    else if (it.kind === 'map') body.append(mapView(it.data));
  } catch { body.append(h('p', null, 'This item couldn’t be shown.')); }
  d.append(body);
  return d;
}
function summaryView(s) {
  const out = [h('p', null, String(s.overview || ''))];
  if (Array.isArray(s.keyPoints) && s.keyPoints.length) out.push(h('h4', null, 'Key points'), h('ul', null, s.keyPoints.map((p) => h('li', null, String(p)))));
  if (Array.isArray(s.terms) && s.terms.length) out.push(h('h4', null, 'Key terms'), h('dl', { class: 'terms' }, s.terms.flatMap((t) => [h('dt', null, String(t.term || '')), h('dd', null, String(t.meaning || ''))])));
  const row = h('div', { class: 'fc-nav' });
  row.append(h('button', { class: 'btn small', onclick: () => addToNote('<h3>' + esc(s.title || 'Summary') + '</h3><p>' + esc(s.overview || '') + '</p>' + (Array.isArray(s.keyPoints) ? '<ul>' + s.keyPoints.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '')) }, svg('plus'), 'Add to page'));
  if ('speechSynthesis' in window) {
    const btn = h('button', { class: 'btn small' }, 'Read aloud');
    btn.addEventListener('click', () => {
      if (speechSynthesis.speaking) { speechSynthesis.cancel(); btn.textContent = 'Read aloud'; return; }
      const u = new SpeechSynthesisUtterance([s.title, s.overview, ...(s.keyPoints || [])].filter(Boolean).join('. '));
      if (s.lang) u.lang = String(s.lang);
      u.onend = u.onerror = () => { btn.textContent = 'Read aloud'; };
      speechSynthesis.speak(u); btn.textContent = 'Stop reading';
    });
    row.append(btn);
  }
  out.push(row);
  return out;
}
function cardsView(cards, title) {
  let order = cards.map((_, i) => i), i = 0, back = false;
  const known = new Map();
  const wrap = h('div');
  const card = h('button', { class: 'fc', 'aria-live': 'polite' });
  const count = h('span');
  const result = h('p', { class: 'score', hidden: true });
  const show = () => {
    const c = cards[order[i]];
    card.classList.toggle('back', back); card.textContent = '';
    card.append(h('div', null, h('small', null, back ? 'Answer' : 'Question, tap to flip'), String(back ? c.back : c.front)));
    count.textContent = (i + 1) + ' of ' + cards.length + ' · ' + [...known.values()].filter(Boolean).length + ' known';
  };
  const mark = (ok) => {
    known.set(order[i], ok);
    if (known.size === cards.length) {
      const right = [...known.values()].filter(Boolean).length;
      result.hidden = false; result.textContent = 'You knew ' + right + ' of ' + cards.length + ' (' + Math.round(right / cards.length * 100) + '%).';
      recordScore('cards', right, cards.length, title);
      known.clear();
    }
    i = (i + 1) % cards.length; back = false; show();
  };
  card.addEventListener('click', () => { back = !back; show(); });
  const nav = h('div', { class: 'fc-nav' },
    h('button', { class: 'btn small', onclick: () => { i = (i - 1 + cards.length) % cards.length; back = false; show(); } }, 'Back'), count,
    h('button', { class: 'btn small', onclick: () => { order = order.sort(() => Math.random() - 0.5); i = 0; back = false; known.clear(); show(); } }, 'Shuffle'));
  const grade = h('div', { class: 'fc-nav' }, h('button', { class: 'btn small', style: { flex: '1' }, onclick: () => mark(false) }, 'Not yet'), h('button', { class: 'btn small primary', style: { flex: '1' }, onclick: () => mark(true) }, 'I knew it'));
  wrap.append(result, card, grade, nav); show();
  return wrap;
}
function quizView(qs, title) {
  const wrap = h('div'); let right = 0, done = 0;
  const score = h('p', { class: 'score' }, 'Score: 0 of ' + qs.length);
  const again = h('button', { class: 'btn small', hidden: true, onclick: () => { const n = quizView(qs, title); wrap.replaceWith(n); } }, svg('refresh'), 'Try again');
  wrap.append(score);
  qs.forEach((q, qi) => {
    const box = h('div', { class: 'q' }, h('p', null, (qi + 1) + '. ' + String(q.question)));
    const ex = h('p', { class: 'ex', hidden: true }, String(q.explain || ''));
    const btns = q.options.map((o, oi) => h('button', { class: 'ob', onclick: () => {
      if (box.dataset.done) return; box.dataset.done = '1'; done++;
      const ok = oi === +q.answer; if (ok) right++;
      btns.forEach((b, bi) => { if (bi === +q.answer) b.classList.add('right'); });
      if (!ok) btns[oi].classList.add('wrong');
      ex.hidden = !q.explain;
      const pct = Math.round(right / qs.length * 100);
      score.textContent = 'Score: ' + right + ' of ' + qs.length + (done === qs.length ? ' (' + pct + '%)' + (right === qs.length ? '. All right!' : '.') : '');
      if (done === qs.length) { recordScore('quiz', right, qs.length, title); again.hidden = false; }
    } }, String(o)));
    box.append(...btns, ex); wrap.append(box);
  });
  wrap.append(again);
  return wrap;
}
function mapView(m) {
  return h('div', null, h('div', { class: 'mm-list' }, h('span', { class: 'c' }, String(m.center)),
    h('ul', null, (m.branches || []).map((b) => h('li', null, h('span', { class: 'b' }, String((b && b.label) || b || '')),
      b && Array.isArray(b.children) && b.children.length ? h('ul', null, b.children.map((c) => h('li', null, String((c && c.label) || c)))) : null)))),
    h('div', { class: 'fc-nav' }, h('button', { class: 'btn small primary', onclick: () => { if (!cur || cur.ro) return toast('Open a page you can edit first.'); insertMindMap(mmFromOutline(m.center, m.branches)); toast('Mind map added to the page.'); } }, svg('mindmap'), 'Put on the page')));
}

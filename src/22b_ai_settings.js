/* ================= AI settings: which AI Cortex Scribe uses =================
   The window behind “AI: …” at the bottom of the sidebar. In the desktop app and the browser version the
   student chooses a provider (AI_PROVIDERS in 11c_ai.js), pastes a key, picks a model and tests it.
   Inside Claude it only explains that Claude itself is used. renderAIState() keeps the sidebar button and
   the “AI features work …” notes in the panels up to date. */
function aiConnErrText(e, p) {
  const n = p.id === 'custom' ? 'The server' : p.P.short;
  switch (e && e.code) {
    case 'bad_key': return n + ' didn’t accept the key. Copy it again from the website and paste it here.';
    case 'quota': return 'The key works, but the account has no credit or free quota left.';
    case 'no_model': return 'That model wasn’t found. Load the list and pick one.' + (e.message ? ' (' + e.message + ')' : '');
    case 'unreachable': return p.P.local
      ? 'Couldn’t reach ' + n + ' at ' + p.base + '. Is it running?' + (Platform.host === 'browser' && p.P.browserNote ? ' ' + p.P.browserNote : '')
      : 'Couldn’t reach ' + n + '. Check the internet connection' + (p.id === 'custom' ? ' and the address' : '') + '.' + (Platform.host === 'browser' ? ' Some services don’t answer web pages opened from a file; the desktop app avoids that.' : '');
    case 'rate_limited': return n + ' says there were too many requests. Wait a moment and try again.';
    case 'server': return n + ' has a problem right now. Try again later.';
    case 'refused': return n + ' declined the test request.';
    case 'empty_completion': return n + ' answered with nothing. Try another model.';
    default: return 'That didn’t work' + (e && e.message ? ': ' + e.message : '.');
  }
}
function aiSettingsModal() {
  if (Platform.host === 'claude') {
    modal({ title: 'AI', body: [
      h('p', null, 'Inside Claude, Cortex Scribe uses Claude itself. There’s nothing to set up, and it uses your normal Claude usage.'),
      h('p', { class: 'hint' }, 'In the Cortex Scribe desktop app, or when Cortex Scribe is opened as a file in a browser, you can choose another AI here: Claude with an API key, ChatGPT, Gemini, OpenRouter, or a free AI on your own computer (Ollama, LM Studio).')],
    actions: [{ label: 'OK', kind: 'primary' }] });
    return;
  }
  const work = deep(AISettings.load());
  let pid = work.active || '';
  const field = (attrs) => h('input', { class: 'field', autocomplete: 'off', spellcheck: 'false', ...attrs });
  const sel = h('select', { class: 'field', id: 'aiProv', 'aria-label': 'Which AI' },
    h('option', { value: '' }, 'No AI (AI features switched off)'),
    Object.entries(AI_PROVIDERS).map(([id, P]) => h('option', { value: id }, P.label)));
  const note = h('p', { class: 'hint ai-note' });
  const keyIn = field({ id: 'aiKey', type: 'password', placeholder: 'Paste your API key here', 'aria-label': 'API key' });
  const keyShow = h('button', { class: 'btn ghost', type: 'button', onclick: () => { const v = keyIn.type === 'password'; keyIn.type = v ? 'text' : 'password'; keyShow.textContent = v ? 'Hide' : 'Show'; } }, 'Show');
  const keyLink = h('a', { target: '_blank', rel: 'noopener' });
  const keyRow = h('div', { class: 'ai-row' }, h('label', { for: 'aiKey' }, 'API key'), h('div', { class: 'ai-line' }, keyIn, keyShow));
  const dl = h('datalist', { id: 'aiModels' });
  const modelIn = field({ id: 'aiModel', list: 'aiModels', 'aria-label': 'Model' });
  const listNote = h('p', { class: 'hint', id: 'aiListNote', 'aria-live': 'polite' });
  const loadB = h('button', { class: 'btn', type: 'button', id: 'aiLoad' }, 'Load list');
  const quickIn = field({ id: 'aiQuick', list: 'aiModels', placeholder: 'Empty = the main model', 'aria-label': 'Quick model' });
  const baseIn = field({ id: 'aiBase', 'aria-label': 'Server address' });
  const visSel = h('select', { class: 'field', id: 'aiVision', 'aria-label': 'Can the model read pictures?' },
    h('option', { value: 'auto' }, 'Guess from the model name'), h('option', { value: 'yes' }, 'Yes'), h('option', { value: 'no' }, 'No'));
  const more = h('details', { class: 'ai-more' }, h('summary', null, 'More settings'), h('div', null,
    h('label', { for: 'aiQuick' }, 'Quick model'), h('p', { class: 'hint' }, 'Optional: a faster, cheaper model for the handwriting pad and spelling fixes.'), quickIn,
    h('label', { for: 'aiBase' }, 'Server address'), baseIn,
    h('label', { for: 'aiVision' }, 'Can the model read pictures?'), h('p', { class: 'hint' }, 'Needed for handwriting, drawings and pictures in notes.'), visSel));
  const testOut = h('p', { class: 'hint ai-test', id: 'aiTestOut', 'aria-live': 'polite' });
  const testB = h('button', { class: 'btn', type: 'button', id: 'aiTest' }, 'Test');
  const privacy = h('p', { class: 'hint' });
  const form = h('div', { id: 'aiForm' },
    keyRow,
    h('div', { class: 'ai-row' }, h('label', { for: 'aiModel' }, 'Model'), h('div', { class: 'ai-line' }, modelIn, loadB), dl, listNote),
    more,
    h('div', { class: 'ai-line ai-testrow' }, testB, testOut),
    privacy);

  const stash = () => {
    if (!pid) return;
    work.profiles[pid] = { key: keyIn.value.trim(), model: modelIn.value.trim(), quick: quickIn.value.trim(), base: baseIn.value.trim(), vision: visSel.value };
  };
  const formProfile = () => { stash(); return AIConn.profile(pid, work); };
  const fillList = (ids) => { dl.textContent = ''; for (const id of ids || []) dl.append(h('option', { value: id })); };
  const fill = () => {
    sel.value = pid; testOut.textContent = ''; testOut.className = 'hint ai-test'; listNote.textContent = '';
    form.hidden = !pid;
    if (!pid) { note.textContent = 'Cortex Scribe works without AI too. Choose an AI to use fact checks, chat, quizzes, handwriting and the Magic box.'; return; }
    const P = AI_PROVIDERS[pid], pr = work.profiles[pid] || {};
    note.textContent = P.note + (Platform.host === 'browser' && P.browserNote ? ' ' + P.browserNote : '') + ' ';
    if (P.keyUrl) { keyLink.href = P.keyUrl; keyLink.textContent = P.key ? 'Get a key' : 'Download ' + P.short; note.append(keyLink); }
    keyRow.hidden = P.key === false;
    keyIn.placeholder = P.key === 'optional' ? 'Only if the server needs one' : 'Paste your API key here';
    keyIn.value = pr.key || '';
    modelIn.value = pr.model != null && pr.model !== '' ? pr.model : P.model || '';
    modelIn.placeholder = P.placeholder || '';
    quickIn.value = pr.quick || '';
    baseIn.value = pr.base || '';
    baseIn.placeholder = P.base || 'https://…/v1';
    visSel.value = pr.vision || 'auto';
    fillList(AIConn.models[pid]);
    privacy.textContent = P.local
      ? 'Everything stays on this computer: your notes are only sent to ' + P.short + ' running here.'
      : 'When you use an AI feature, the notes it works on (their text, and their pictures if the model can read them) are sent to ' + P.short + '. Your key is saved only ' + (Platform.desktop ? 'in this app' : 'in this browser') + ' on this computer, never in backups.';
  };
  const loadModels = async (quiet) => {
    const p = formProfile();
    if (!p.base) { listNote.textContent = 'Enter the server address first (More settings).'; return; }
    if (p.P.key === true && !p.key) { if (!quiet) listNote.textContent = 'Paste your API key first.'; return; }
    listNote.textContent = 'Loading the list…';
    try {
      const ids = await AIConn.listModels(p);
      if (pid !== p.id) return;
      fillList(ids);
      if (!modelIn.value.trim() && ids.length) modelIn.value = AIConn.pickModel(p, ids);
      listNote.textContent = ids.length ? ids.length + ' model' + (ids.length === 1 ? '' : 's') + ' available. Click the field to pick one.' : (p.P.local ? 'No models yet. Download one first (see above).' : 'The list is empty.');
    } catch (e) { if (pid === p.id) listNote.textContent = aiConnErrText(e, p); }
  };
  sel.addEventListener('change', () => {
    stash(); pid = sel.value; fill();
    const p = pid && AIConn.profile(pid, work);
    if (p && (p.P.local || (p.key && !AIConn.models[pid]))) loadModels(true);
  });
  keyIn.addEventListener('change', () => { if (keyIn.value.trim() && !AIConn.models[pid]) loadModels(true); });
  loadB.addEventListener('click', () => loadModels(false));
  testB.addEventListener('click', async () => {
    const p = formProfile();
    testOut.className = 'hint ai-test';
    if (p.P.key === true && !p.key) { testOut.textContent = 'Paste your API key first.'; return; }
    if (!p.model) { testOut.textContent = 'Choose a model first (Load list).'; return; }
    if (!p.base) { testOut.textContent = 'Enter the server address first (More settings).'; return; }
    testB.disabled = true; testOut.textContent = 'Asking ' + (p.id === 'custom' ? 'the server' : p.P.short) + '…';
    try {
      const r = await AIConn.test(p);
      testOut.textContent = '✓ It works: ' + p.model + ' answered in ' + (r.ms / 1000).toFixed(1) + ' s.' + (AIConn.sees(p) ? '' : ' (It can’t read pictures, so handwriting won’t work with it.)');
      testOut.classList.add('ok');
    } catch (e) { testOut.textContent = aiConnErrText(e, p); testOut.classList.add('bad'); }
    finally { testB.disabled = false; }
  });
  fill();
  modal({ title: 'AI settings', body: [h('label', { for: 'aiProv', class: 'ai-lead' }, 'Which AI should Cortex Scribe use?'), sel, note, form], actions: [
    { label: 'Cancel' },
    { label: 'Save', kind: 'primary', fn: () => {
      stash();
      const p = pid ? AIConn.profile(pid, work) : null;
      if (p && !AIConn.usable(p)) {
        testOut.className = 'hint ai-test bad';
        testOut.textContent = p.P.key === true && !p.key ? 'Paste your API key first.' : !p.base ? 'Enter the server address first (More settings).' : 'Choose a model first (Load list).';
        return false;
      }
      work.active = pid || null;
      AISettings.save(work);
      toast(pid ? 'AI connected: ' + AI.label + '.' : 'AI features switched off.');
    } }] });
}
function renderAIState() {
  const b = $('#aiBtn');
  b.textContent = '';
  b.append(svg('sparkle'), h('span', { class: 'ai-btn-t' }, 'AI: ' + AI.label));
  b.title = AI.ok ? 'Change which AI Cortex Scribe uses' : 'Connect an AI';
  b.classList.toggle('ai-btn-off', !AI.ok);
  $$('[data-aioff]').forEach((p) => {
    p.hidden = AI.ok; p.textContent = '';
    if (AI.ok) return;
    if (Platform.host === 'claude') p.textContent = 'AI features work when this app is open in Claude and you allow it to use Claude.';
    else p.append('AI features work once you connect an AI. ', h('button', { class: 'btn ghost ai-connect', type: 'button', onclick: aiSettingsModal }, 'Connect an AI'));
  });
}
$('#aiBtn').addEventListener('click', aiSettingsModal);
window.addEventListener('inkling-ai-changed', renderAIState);

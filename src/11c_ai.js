/* ================= AI CONNECTOR (platform layer) =================
   Every feature uses one object, AI. Nothing else in the app talks to an AI service.

     AI.ok                  true when an AI can be used right now
     AI.name                what to call the AI in messages: "Claude", "Gemini", "Ollama", or "the AI"
     AI.label               longer text for the settings button, e.g. "Gemini · gemini-2.5-flash"
     AI.img                 picture limits { maxCount, maxInputBytes, mediaTypes }, or null if pictures can't be sent
     AI.noPics              a sentence saying why pictures can't be sent (for messages)
     AI.text(input, opts)   → { text, truncated }
     AI.json(input, opts)   → the parsed JSON value

   input  a string (one message from the student's side), or a conversation:
          [{ role: 'user' | 'assistant', content: string }, …] starting with 'user'
   opts   task       id of the job in AI_TASKS (11d_ai_tasks.js). Says what the request is for and what the
                     answer must look like. Every call in the app passes one.
          images     [Blob, …] pictures, attached to the first 'user' message, before its text
          modelTier  'quick' (short, simple jobs) or 'default'
          effort     'max': the student asked for the most careful answer (3D Max effort). Claude 5 models get
                     output_config.effort 'max'; OpenAI and Gemini reasoning models reasoning_effort 'high'
          signal     an AbortSignal; stopping throws { code: 'cancelled', text: <the answer so far> }
          onText     called with { text } (the whole answer so far) while it streams in
          cache      only used inside Claude
   errors are thrown as { code, message? }. The codes are listed in AI_ERROR_CODES at the end of this file;
   aiErrorText() in 22_ai.js turns them into sentences.

   Where the answers come from:
     inside Claude            Claude's own AI (caps.sample). Free for the student, nothing to set up.
     desktop app, or the      the AI chosen in AI settings: Claude API, OpenAI, Gemini, OpenRouter,
     file opened in a browser Ollama or LM Studio on this computer, or any OpenAI-compatible server.

   To add an AI provider: add an entry to AI_PROVIDERS. Most services speak one of the two protocols below
   (Anthropic Messages or OpenAI Chat Completions); only a service that speaks neither needs a new entry in
   AI_PROTOCOLS with the same four functions. */

/* ---- settings: kept in this browser / app only (never in backups, never in Claude's database) ---- */
const AI_SETTINGS_KEY = 'inkling:ai';
const AISettings = {
  empty: () => ({ v: 1, active: null, profiles: {} }),
  load() {
    try { const s = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || 'null'); return s && s.v === 1 && s.profiles ? s : this.empty(); }
    catch { return this.empty(); }
  },
  save(s) {
    try { localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(s)); } catch {}
    AIConn.models = {};
    window.dispatchEvent(new Event('inkling-ai-changed'));
  },
};

/* guesses whether a model can look at pictures, from its name */
const VISION_RE = /vision|[-_.]vl\b|vl[-:]|llava|bakllava|gemma-?3|gemma-?4|pixtral|minicpm-v|moondream|qwen.?2\.5.?vl|qwen.?3.?vl|llama-?4|mistral-small-3|mistral-medium|gpt-4o|gpt-4\.1|gpt-5|claude|gemini|grok-.*vision|internvl/i;
const guessVision = (model) => VISION_RE.test(model || '');

/* ---- providers: one entry per AI service ----
   label     shown in AI settings        short   used in messages ("Gemini didn't accept the key")
   protocol  'anthropic' or 'openai'     base    server address (the user can change it)
   key       true (needed), 'optional' or false
   keyUrl    where to get a key          model   suggested model ('' = choose from the list)
   pick      regexes to choose a model from the loaded list when none is set
   filter    which listed model ids to show
   json      'json_object' if the server supports JSON mode (OpenAI protocol)
   headers   extra request headers       vision(model)  can this model read pictures?
   local     runs on this computer       note    one or two sentences of help
   placeholder  example model name for the model field */
const AI_PROVIDERS = {
  anthropic: {
    label: 'Claude (Anthropic)', short: 'Claude', protocol: 'anthropic', base: 'https://api.anthropic.com/v1',
    key: true, keyUrl: 'https://platform.claude.com/settings/keys', model: 'claude-opus-5-5', placeholder: 'claude-opus-5-5',
    filter: (id) => /^claude-/.test(id), vision: () => true,
    note: 'Pay as you go with an API key from Anthropic (separate from a Claude subscription).',
  },
  openai: {
    label: 'ChatGPT (OpenAI)', short: 'ChatGPT', protocol: 'openai', base: 'https://api.openai.com/v1',
    key: true, keyUrl: 'https://platform.openai.com/api-keys', model: '', placeholder: 'e.g. gpt-5-mini', json: 'json_object',
    pick: [/^gpt-5(\.\d+)?-mini$/, /^gpt-5(\.\d+)?$/, /^gpt-4\.1$/, /^gpt-4o$/],
    filter: (id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !/(audio|realtime|tts|transcribe|search|image|embedding|instruct|codex)/.test(id),
    vision: (m) => !/^(o1-mini|o3-mini|gpt-3\.5)/.test(m || ''),
    note: 'Pay as you go with an API key from OpenAI (separate from a ChatGPT subscription).',
  },
  gemini: {
    label: 'Gemini (Google)', short: 'Gemini', protocol: 'openai', base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    key: true, keyUrl: 'https://aistudio.google.com/apikey', model: '', placeholder: 'e.g. gemini-2.5-flash',
    pick: [/^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-pro$/, /^gemini-.*flash/],
    filter: (id) => /^gemini-/.test(id) && !/(embedding|tts|image|live|audio|native)/.test(id), vision: () => true,
    note: 'Google AI Studio has a free tier, so this is a good way to start without paying.',
  },
  openrouter: {
    label: 'OpenRouter (many AIs, one key)', short: 'OpenRouter', protocol: 'openai', base: 'https://openrouter.ai/api/v1',
    key: true, keyUrl: 'https://openrouter.ai/keys', model: 'openrouter/auto', placeholder: 'openrouter/auto',
    headers: { 'X-Title': 'Cortex Scribe' }, vision: guessVision,
    note: 'One key for hundreds of models from many companies. Models whose name ends in “:free” cost nothing.',
  },
  ollama: {
    label: 'Ollama (on this computer)', short: 'Ollama', protocol: 'openai', base: 'http://localhost:11434/v1', local: true,
    key: false, keyUrl: 'https://ollama.com/download', model: '', placeholder: 'e.g. gemma3', json: 'json_object', vision: guessVision,
    note: 'Free and private: the AI runs on your own computer. Install Ollama, then download a model, for example “ollama pull gemma3” (it can read pictures too). For long notes, raise the context length in Ollama’s settings.',
    browserNote: 'Opened as a file in a browser, Ollama only answers if you allow it once: set OLLAMA_ORIGINS to * and restart Ollama. The desktop app doesn’t need this.',
  },
  lmstudio: {
    label: 'LM Studio (on this computer)', short: 'LM Studio', protocol: 'openai', base: 'http://localhost:1234/v1', local: true,
    key: false, keyUrl: 'https://lmstudio.ai', model: '', placeholder: 'load a model in LM Studio first', vision: guessVision,
    note: 'Free and private: the AI runs on your own computer. In LM Studio, load a model and start the local server (Developer tab).',
    browserNote: 'Opened as a file in a browser, also turn on “Enable CORS” in LM Studio’s server settings. The desktop app doesn’t need this.',
  },
  custom: {
    label: 'Other (OpenAI-compatible)', short: 'the AI', protocol: 'openai', base: '',
    key: 'optional', keyUrl: '', model: '', placeholder: 'the model name', vision: guessVision,
    note: 'Any server that speaks the OpenAI “chat completions” API, for example Groq, Mistral, DeepSeek or a school server. Enter its address, ending in /v1.',
  },
};

/* the jobs' rules every model gets (the job itself is described in the request and in AI_TASKS) */
function aiSystemPrompt(task, json) {
  let s = 'You are the AI inside Cortex Scribe, a study notebook app for students. Every request comes from one feature of the app and says what to do and how to answer. ' +
    (json ? 'Answer with one JSON value only: no code fences, no comments, no words before or after it.'
      : 'When the request asks for HTML, SVG or Markdown, answer with only that, without code fences.') +
    ' Keep the language of the student’s notes unless the request says otherwise.';
  if (task) { s += '\n\nThis request: ' + task.does; if (json && task.output) s += '\nThe JSON must have this shape: ' + task.output; }
  return s;
}

/* ---- protocols: how to talk to a kind of server ----
   build(p, c)        → { url, headers, body } for one streaming request
                         c = { model, quick, json, safe, system, msgs, imgs, imgAt }
   event(data, st)    one streamed event (parsed JSON); adds to st.text, sets st.stop ('end'|'length'|'refusal')
   full(data, st)     a whole non-streamed answer (some servers ignore "stream")
   models(p)          → { url, headers } to list models; listIds(data) → [ids] */
const CLAUDE_FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1)$/;
const CLAUDE_EFFORT_MODELS = /^claude-(opus|sonnet|haiku|fable|mythos)-5/;
const OPENAI_REASONING_MODELS = /^(o\d|gpt-5|gemini-(2\.5|[3-9]))/i;
const anthropicHeaders = (p) => ({ 'content-type': 'application/json', 'x-api-key': p.key || '', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
const AI_PROTOCOLS = {
  anthropic: {
    build(p, c) {
      const messages = c.msgs.map((m, i) => ({
        role: m.role,
        content: i === c.imgAt && c.imgs.length
          ? [...c.imgs.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.type, data: im.b64 } })), { type: 'text', text: m.content }]
          : m.content,
      }));
      const body = { model: c.model, max_tokens: c.safe ? 8192 : 64000, system: c.system, messages, stream: true };
      const headers = anthropicHeaders(p);
      if (!c.safe && CLAUDE_EFFORT_MODELS.test(c.model) && (c.quick || c.max)) body.output_config = { effort: c.max ? 'max' : 'low' };
      // if a safety check declines, the API answers with a suitable fallback model instead of stopping
      if (!c.safe && CLAUDE_FALLBACK_MODELS.test(c.model)) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
      return { url: p.base + '/messages', headers, body };
    },
    event(d, st) {
      if (d.type === 'content_block_delta' && d.delta && d.delta.type === 'text_delta') st.text += d.delta.text || '';
      else if (d.type === 'message_delta' && d.delta && d.delta.stop_reason) st.stop = d.delta.stop_reason === 'max_tokens' ? 'length' : d.delta.stop_reason === 'refusal' ? 'refusal' : 'end';
      else if (d.type === 'error') throw aiHttpError(d.error && d.error.type === 'overloaded_error' ? 529 : 500, d);
    },
    full(d, st) {
      st.text = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      st.stop = d.stop_reason === 'max_tokens' ? 'length' : d.stop_reason === 'refusal' ? 'refusal' : 'end';
    },
    models: (p) => ({ url: p.base + '/models?limit=200', headers: anthropicHeaders(p) }),
    listIds: (d) => (d.data || []).map((m) => m.id),
  },
  openai: {
    build(p, c) {
      const messages = [{ role: 'system', content: c.system }, ...c.msgs.map((m, i) => ({
        role: m.role,
        content: i === c.imgAt && c.imgs.length
          ? [...c.imgs.map((im) => ({ type: 'image_url', image_url: { url: im.dataURL } })), { type: 'text', text: m.content }]
          : m.content,
      }))];
      const body = { model: c.model, messages, stream: true };
      if (c.json && p.P.json && !c.safe) body.response_format = { type: p.P.json };
      if (c.max && !c.safe && OPENAI_REASONING_MODELS.test(c.model)) body.reasoning_effort = 'high';   // a model that doesn't take it gets the request again without it
      const headers = { 'content-type': 'application/json', ...(p.P.headers || {}) };
      if (p.key) headers.authorization = 'Bearer ' + p.key;
      return { url: p.base + '/chat/completions', headers, body };
    },
    event(d, st) {
      if (d.error) throw aiHttpError(500, d);
      const ch = d.choices && d.choices[0]; if (!ch) return;
      if (ch.delta && typeof ch.delta.content === 'string') st.text += ch.delta.content;
      if (ch.finish_reason) st.stop = ch.finish_reason === 'length' ? 'length' : ch.finish_reason === 'content_filter' ? 'refusal' : 'end';
    },
    full(d, st) {
      const ch = d.choices && d.choices[0];
      st.text = (ch && ch.message && typeof ch.message.content === 'string') ? ch.message.content : '';
      st.stop = ch && ch.finish_reason === 'length' ? 'length' : ch && ch.finish_reason === 'content_filter' ? 'refusal' : 'end';
    },
    models: (p) => ({ url: p.base + '/models', headers: p.key ? { authorization: 'Bearer ' + p.key, ...(p.P.headers || {}) } : { ...(p.P.headers || {}) } }),
    listIds: (d) => (Array.isArray(d) ? d : d.data || d.models || []).map((m) => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean),
  },
};

/* ---- errors ---- */
function aiHttpError(status, body) {
  const msg = String((body && body.error && (body.error.message || body.error)) || (body && body.message) || '').slice(0, 300);
  const low = msg.toLowerCase();
  let code = 'bad_request';
  if (status === 401 || status === 403) code = /credit|billing|quota/.test(low) ? 'quota' : 'bad_key';
  else if (status === 402 || /insufficient_quota|credit balance|exceeded your current quota|billing/.test(low)) code = 'quota';
  else if (status === 404 || /model.*(not found|does not exist|not exist|unknown)|no such model/.test(low)) code = 'no_model';
  else if (status === 413 || /context|too long|too many tokens|maximum.*tokens|prompt is too long/.test(low)) code = 'prompt_too_large';
  else if (status === 429) code = 'rate_limited';
  else if (status >= 500) code = 'server';
  else if (/image/.test(low)) code = 'image_rejected';
  return { code, status, message: msg };
}
const AI_ERROR_CODES = ['no_ai', 'no_key', 'no_model', 'bad_key', 'quota', 'rate_limited', 'server', 'unreachable', 'prompt_too_large', 'image_rejected', 'bad_request', 'refused', 'invalid_json', 'empty_completion', 'cancelled',
  /* only inside Claude: */ 'not_granted', 'sampling_disabled', 'session_expired', 'images_unavailable'];

/* ---- helpers ---- */
const blobB64 = (b) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(b); });
const AI_IMG_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const AI_IMG_MAX = 3750000;   // bytes per picture; 3.75 MB stays under every provider's limit once base64-encoded
async function aiRasterize(blob, maxSide = 1800) {
  const url = URL.createObjectURL(blob);
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const w0 = im.naturalWidth || 800, h0 = im.naturalHeight || 600, k = Math.min(1, maxSide / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('encode'))), 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}
async function aiPrepImages(blobs, max) {
  const out = [];
  for (const b0 of (blobs || []).slice(0, max)) {
    if (!b0) continue;
    let b = b0;
    if (!AI_IMG_TYPES.includes(b.type) || b.size > AI_IMG_MAX) { try { b = await aiRasterize(b); if (b.size > AI_IMG_MAX) b = await aiRasterize(b, 1000); } catch { continue; } }
    const b64 = await blobB64(b);
    out.push({ type: b.type, b64, dataURL: 'data:' + b.type + ';base64,' + b64 });
  }
  return out;
}
/* some local models write their reasoning between <think> tags before the answer: leave it out */
const aiVisible = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>\s*/g, '').replace(/<think>[\s\S]*$/, '');
/* reads JSON out of an answer, even with code fences, words around it or trailing commas; undefined if none */
function aiParseJSON(text) {
  let t = aiVisible(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(t); } catch {}
  const start = t.search(/[[{]/); if (start < 0) return undefined;
  const open = t[start], close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) { end = i; break; }
  }
  if (end < 0) return undefined;
  const part = t.slice(start, end + 1);
  for (const s of [part, part.replace(/,\s*([}\]])/g, '$1')]) { try { return JSON.parse(s); } catch {} }
  return undefined;
}
function aiMessages(input) {
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  const out = [];
  for (const m of input || []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = String(m.content == null ? '' : m.content);
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + content; else out.push({ role: m.role, content });
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: '(start)' });
  return out;
}
/* in the desktop app, requests go through the app itself (Tauri's http plugin), so servers on this
   computer don't have to allow web pages; in a browser it's the normal fetch */
const aiFetch = (url, init) => (Desk && Desk.http && typeof Desk.http.fetch === 'function' ? Desk.http.fetch(url, init) : fetch(url, init));
async function aiReadStream(res, onData) {
  if (!res.body || !res.body.getReader) { for (const line of (await res.text()).split('\n')) if (line.startsWith('data:')) { const d = line.slice(5).trim(); if (d && d !== '[DONE]') onData(d); } return; }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  const flush = (line) => { line = line.replace(/\r$/, ''); if (!line.startsWith('data:')) return; const d = line.slice(5).trim(); if (d && d !== '[DONE]') onData(d); };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) { flush(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  buf += dec.decode(); if (buf) flush(buf);
}

/* ---- the connector: the AI chosen in AI settings ---- */
const AIConn = {
  models: {},   // provider id → model ids loaded in this session
  /* a provider plus the student's settings for it, ready to use; s = settings, id = provider id */
  profile(id, s) {
    const P = AI_PROVIDERS[id]; if (!P) return null;
    const pr = ((s || AISettings.load()).profiles || {})[id] || {};
    return {
      id, P, key: String(pr.key || '').trim(),
      base: String(pr.base || P.base || '').trim().replace(/\/+$/, ''),
      model: String(pr.model != null && pr.model !== '' ? pr.model : P.model || '').trim(),
      quick: String(pr.quick || '').trim(),
      vision: pr.vision || 'auto',
    };
  },
  current() { const s = AISettings.load(); return s.active ? this.profile(s.active, s) : null; },
  usable(p) { return !!(p && p.base && p.model && (p.P.key !== true || p.key)); },
  ready() { return Platform.host !== 'claude' && this.usable(this.current()); },
  sees(p) { return !!p && (p.vision === 'yes' || (p.vision !== 'no' && p.P.vision(p.model))); },
  img(p) { p = p || this.current(); return this.sees(p) ? { maxCount: p.P.local ? 4 : 8, maxInputBytes: AI_IMG_MAX, mediaTypes: AI_IMG_TYPES.slice() } : null; },
  name(p) { p = p || this.current(); return p ? (p.id === 'custom' ? (p.model || 'the AI') : p.P.short) : 'the AI'; },

  /* one request → { text, truncated }. Streams; calls onText while it does. */
  async send(p, c, opts) {
    const proto = AI_PROTOCOLS[p.P.protocol];
    const { url, headers, body } = proto.build(p, c);
    const st = { text: '', stop: null };
    let res;
    try { res = await aiFetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal }); }
    catch (e) { if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', text: '' }; throw { code: 'unreachable', message: String((e && e.message) || e || '') }; }
    if (!res.ok) {
      let data = null; try { data = JSON.parse(await res.text()); } catch {}
      const err = aiHttpError(res.status, data);
      const ra = +(res.headers && res.headers.get && res.headers.get('retry-after')); if (ra) err.retryAfter = ra;
      throw err;
    }
    try {
      if (/json/.test((res.headers.get('content-type') || '')) && !/event-stream/.test(res.headers.get('content-type') || '')) proto.full(await res.json(), st);
      else await aiReadStream(res, (d) => {
        let j; try { j = JSON.parse(d); } catch { return; }
        proto.event(j, st);
        if (opts.onText) opts.onText({ text: aiVisible(st.text) });
      });
    } catch (e) {
      if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', text: aiVisible(st.text) };
      if (e && e.code) throw e;
      throw { code: 'unreachable', message: String((e && e.message) || e || '') };
    }
    if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', text: aiVisible(st.text) };
    if (st.stop === 'refusal') throw { code: 'refused' };
    const text = aiVisible(st.text).trim();
    if (!text && st.stop !== 'length') throw { code: 'empty_completion' };
    return { text, truncated: st.stop === 'length' };
  },
  /* send with one careful retry: busy servers get a second try, and a request the server rejects is sent
     once more without optional extras (JSON mode, effort, fallbacks, a large output limit) */
  async sendRetry(p, c, opts) {
    try { return await this.send(p, c, opts); }
    catch (e) {
      if (!e || e.code === 'cancelled') throw e;
      if (e.code === 'rate_limited' || e.code === 'server') { await sleep(Math.min(8, e.retryAfter || 1.5) * 1000); return this.send(p, c, opts); }
      if (e.code === 'bad_request' && !c.safe) return this.send(p, { ...c, safe: true }, opts);
      throw e;
    }
  },
  /* AI.text / AI.json for the connector; prof = settings to use instead of the saved ones (the Test button) */
  async run(input, opts = {}, json, prof) {
    const p = prof || this.current();
    if (!p) throw { code: 'no_ai' };
    if (p.P.key === true && !p.key) throw { code: 'no_key' };
    if (!p.model) throw { code: 'no_model' };
    if (!p.base) throw { code: 'unreachable', message: 'no server address' };
    const task = (opts.task && AI_TASKS[opts.task]) || null;
    const msgs = aiMessages(input);
    const lim = this.img(p);
    const imgs = opts.images && opts.images.length && lim ? await aiPrepImages(opts.images, lim.maxCount) : [];
    const c = { model: (opts.modelTier === 'quick' && p.quick) || p.model, quick: opts.modelTier === 'quick', max: opts.effort === 'max', json: !!json, safe: false,
      system: aiSystemPrompt(task, json), msgs, imgs, imgAt: msgs.findIndex((m) => m.role === 'user') };
    const res = await this.sendRetry(p, c, opts);
    if (!json) return res;
    const good = (v) => v !== undefined && v !== null && typeof v === 'object' && (!task || !task.check || task.check(v));
    let val = aiParseJSON(res.text);
    if (good(val)) return val;
    if (res.truncated) throw { code: 'prompt_too_large', message: 'the answer was cut off' };
    // one more try: show the model its answer and ask for the right shape
    const again = await this.sendRetry(p, { ...c, msgs: msgs.concat([{ role: 'assistant', content: res.text.slice(0, 8000) || '(empty)' },
      { role: 'user', content: 'That answer was not valid JSON in the shape the request asked for. Answer again with only the JSON.' + (task && task.output ? ' Shape: ' + task.output : '') }]) }, { signal: opts.signal });
    val = aiParseJSON(again.text);
    if (good(val)) return val;
    throw { code: 'invalid_json' };
  },
  /* the models a server offers (for the list in AI settings) */
  async listModels(p) {
    const proto = AI_PROTOCOLS[p.P.protocol];
    const { url, headers } = proto.models(p);
    let res;
    try { res = await aiFetch(url, { method: 'GET', headers }); } catch (e) { throw { code: 'unreachable', message: String((e && e.message) || e || '') }; }
    let data = null; try { data = await res.json(); } catch {}
    if (!res.ok) throw aiHttpError(res.status, data);
    let ids = [...new Set(proto.listIds(data || {}))];
    if (p.P.filter) { const f = ids.filter(p.P.filter); if (f.length) ids = f; }
    ids.sort((a, b) => a.localeCompare(b));
    this.models[p.id] = ids;
    return ids;
  },
  pickModel(p, ids) {
    for (const re of p.P.pick || []) { const m = ids.filter((id) => re.test(id)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]; if (m) return m; }
    return ids[0] || '';
  },
  /* a tiny request to check that the settings work → { text, ms } */
  async test(p) {
    const t0 = performance.now();
    const r = await this.run('Reply with just the word OK.', { task: 'ai.test', modelTier: 'default' }, false, p);
    return { text: r.text, ms: Math.round(performance.now() - t0) };
  },
};

/* ---- AI: what the features use ---- */
const withoutTask = (opts) => { if (!opts) return opts; const { task, ...rest } = opts; return rest; };
const AI = {
  /* 'claude' (inside Claude), 'connector' (AI settings) or null */
  get source() { return Platform.host === 'claude' ? (caps.sample ? 'claude' : null) : (AIConn.ready() ? 'connector' : null); },
  get ok() { return !!this.source; },
  get name() { const s = this.source; return s === 'claude' || Platform.host === 'claude' ? 'Claude' : s === 'connector' ? AIConn.name() : 'the AI'; },
  get label() {
    if (Platform.host === 'claude') return caps.sample ? 'Claude (built in)' : 'Claude (not allowed yet)';
    const p = AIConn.current();
    return AIConn.usable(p) ? (p.id === 'custom' ? p.model : p.P.short + ' · ' + p.model) : 'not connected';
  },
  get img() { const s = this.source; return s === 'claude' ? caps.img || null : s === 'connector' ? AIConn.img() : null; },
  get noPics() {
    return this.source === 'connector' ? 'The AI model you chose can’t read pictures. Choose one that can in AI settings.' : 'Pictures can’t be sent to Claude here.';
  },
  text(input, opts) {
    const s = this.source;
    if (s === 'claude') return caps.sample(input, withoutTask(opts));
    if (s === 'connector') return AIConn.run(input, opts, false);
    return Promise.reject({ code: Platform.host === 'claude' ? 'sampling_disabled' : 'no_ai' });
  },
  json(input, opts) {
    const s = this.source;
    if (s === 'claude') return caps.sample.json(input, withoutTask(opts));
    if (s === 'connector') return AIConn.run(input, opts, true);
    return Promise.reject({ code: Platform.host === 'claude' ? 'sampling_disabled' : 'no_ai' });
  },
};

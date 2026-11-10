# AI in Cortex Scribe

How Cortex Scribe uses AI, which AIs it can use, and how to add a new AI service or a new AI feature.
Written for people **and** for AI coding assistants that work on this code.

## The short version

- Every feature asks for AI through one object, `AI` (`src/11c_ai.js`). Nothing else talks to an AI service.
- Every request names its **task**: what the request is for and what the answer must look like (`src/11d_ai_tasks.js`, table below).
- **Inside Claude**, the answers come from Claude itself (free for the student, nothing to set up).
- **In the desktop app and the browser version**, the student chooses the AI in **AI settings** (bottom left): Claude with an API key, ChatGPT, Gemini (free tier), OpenRouter (many models), Ollama or LM Studio (free, on the student's own computer), or any server that speaks the OpenAI chat API.

## How a request travels

```
feature (e.g. 24_sources_fc.js)
  └─ AI.json(prompt, { task: 'factcheck', images, signal })        src/11c_ai.js
       ├─ inside Claude  → caps.sample.json(...)                   Claude's own AI
       └─ otherwise      → AIConn.run(...)                          the AI chosen in AI settings
            ├─ system prompt: general rules + the task's `does` and `output` (aiSystemPrompt)
            ├─ pictures: converted and attached to the first message (aiPrepImages)
            ├─ protocol: AI_PROTOCOLS.anthropic or AI_PROTOCOLS.openai builds the request
            ├─ streaming answer, read event by event (aiReadStream), onText() while it arrives
            ├─ one retry: busy server → wait and try again; rejected request → again without extras
            └─ JSON jobs: read the JSON (aiParseJSON), check it (task.check), ask once more if wrong
```

## The `AI` object

| Member | What it is |
|---|---|
| `AI.ok` | true when an AI can be used now |
| `AI.name` | what to call the AI in messages: "Claude", "Gemini", "Ollama" or "the AI" |
| `AI.label` | text for the sidebar button, e.g. "Gemini · gemini-2.5-flash" |
| `AI.img` | picture limits `{ maxCount, maxInputBytes, mediaTypes }`, or `null` if the model can't see pictures |
| `AI.noPics` | a sentence explaining why pictures can't be sent |
| `AI.text(input, opts)` | → `{ text, truncated }` |
| `AI.json(input, opts)` | → the parsed JSON value |

`input` is a string or a conversation `[{ role: 'user' | 'assistant', content }]`. `opts`:

| Option | Meaning |
|---|---|
| `task` | **required**: an id from the table below |
| `images` | `[Blob]`, attached to the first user message before its text |
| `modelTier` | `'quick'` (short, simple jobs) or `'default'` |
| `signal` | AbortSignal; stopping throws `{ code: 'cancelled', text }` with the answer so far |
| `onText` | called with `{ text }` (everything so far) while the answer streams in |
| `cache` | only used inside Claude |

**Errors** are thrown as `{ code, message? }` and turned into sentences by `aiErrorText()` in `src/22_ai.js`:
`no_ai`, `no_key`, `no_model`, `bad_key`, `quota`, `rate_limited`, `server`, `unreachable`, `prompt_too_large`, `image_rejected`, `bad_request`, `refused`, `invalid_json`, `empty_completion`, `cancelled`, and inside Claude also `not_granted`, `sampling_disabled`, `session_expired`, `images_unavailable`.

## AI services (providers)

Defined in `AI_PROVIDERS` in `src/11c_ai.js`.

| Id | Service | Protocol | Key | Notes |
|---|---|---|---|---|
| `anthropic` | Claude (Anthropic API) | anthropic | yes | Suggested model `claude-opus-5-5`. Sends `anthropic-dangerous-direct-browser-access` so it works from a web page, and turns on server-side refusal fallbacks for the newest models. Quick jobs use `effort: low`; **Max effort** in the 3D studio sends `effort: max`. |
| `openai` | ChatGPT (OpenAI API) | openai | yes | JSON mode on. With **Max effort** (3D), reasoning models (o-series, GPT-5) get `reasoning_effort: high`. |
| `gemini` | Gemini (Google AI Studio) | openai | yes | Free tier. Uses Google's OpenAI-compatible endpoint. With **Max effort** (3D), Gemini 2.5 and newer get `reasoning_effort: high`. |
| `openrouter` | OpenRouter | openai | yes | Hundreds of models; `:free` models cost nothing. |
| `ollama` | Ollama, on this computer | openai | no | Free and private. JSON mode on. The browser version needs `OLLAMA_ORIGINS=*`. |
| `lmstudio` | LM Studio, on this computer | openai | no | Free and private. The browser version needs “Enable CORS”. |
| `custom` | any OpenAI-compatible server | openai | optional | Groq, Mistral, DeepSeek, a school server … |

**Add a service:** add an entry to `AI_PROVIDERS` with `label`, `short`, `protocol`, `base`, `key`, `keyUrl`, `model` or `pick`, `vision(model)` and a `note`. If it speaks neither protocol, add one to `AI_PROTOCOLS` with `build`, `event`, `full`, `models` and `listIds` (see the comment above `AI_PROTOCOLS`). Then add a case to test 20.

**Settings** are stored under `inkling:ai` in the browser's or app's local storage: `{ v: 1, active, profiles: { <provider id>: { key, model, quick, base, vision } } }`. They are never in backups or in Claude's database. `vision` is `auto` (guess from the model name), `yes` or `no`.

**Desktop app:** requests go through Tauri's http plugin (`window.__TAURI__.http.fetch`), so servers on the computer don't have to allow web pages. The allowed addresses are in `src-tauri/capabilities/default.json`.

## Tasks: every AI job in Cortex Scribe

The source of truth is `AI_TASKS` in `src/11d_ai_tasks.js`; this table is generated from it with `node scripts/ai-docs.mjs` (test 20 checks that it is up to date). For JSON tasks, the shape in “Answer” is also sent to the model.

<!-- tasks:start (generated by scripts/ai-docs.mjs, don't edit by hand) -->
| Task id | Where in the app | What the model must do | Answer | Model | Pictures | Code |
|---|---|---|---|---|---|---|
| `ai.test` | AI settings → Test | Check that the connection works. | the word OK | default | no | `11c_ai.js AIConn.test` |
| `pad.read` | Handwriting pad (right panel) | Read the handwritten word or line in the picture and type it exactly as written. | only the text, or &lt;none> if nothing can be read | quick | required | `21_panels.js recognize` |
| `ink.read` | Draw → Writing → text, Tidy up → Handwriting | Transcribe each attached handwriting picture exactly as written, one text per picture, in the same order. | JSON: `{"texts": ["…", "…"]} with one entry per picture ("" for a drawing)` | default | required | `22_ai.js handwritingToText` |
| `tidy.page` | Tidy up (spelling, layout, translate) | Rewrite the HTML of a page as the rules in the request say (fix spelling, improve layout or translate), keeping every [[IMG:n]] placeholder and every data-k element. | only the HTML, allowed tags listed in the request | quick or default | no | `22_ai.js aiRewriteHTML` |
| `tidy.boxes` | Tidy up (spelling, translate) | Rewrite the HTML inside each box as the rules in the request say and return every box with its id. | JSON: `{"items": [{"id": "…", "html": "…"}]}` | default | no | `22_ai.js aiRewriteBoxes` |
| `magic.chart` | Magic box → Diagram | Turn the numbers in the content into chart data. | JSON: `{"title": "…", "cats": ["…"], "series": [{"name": "…", "vals": [0]}], "unit": "…", "prefix": "…"}, or {"cats": []} if there are no numbers` | default | optional | `23b_magic.js magicCreate` |
| `magic.mindmap` | Magic box → Mind map | Make a mind map of the content: one central topic with branches and short children. | JSON: `{"center": "…", "branches": [{"label": "…", "children": [{"label": "…", "children": ["…"]}]}]}` | default | optional | `23b_magic.js magicCreate` |
| `magic.table` | Magic box → Table | Organise the content as a table with clear columns. | JSON: `{"headers": ["…"], "rows": [["…"]]}` | default | optional | `23b_magic.js magicCreate` |
| `magic.sticky` | Magic box → Sticky notes | Split the content into a few key ideas, each short enough for a sticky note. | JSON: `{"notes": ["…"]}` | default | optional | `23b_magic.js magicCreate` |
| `magic.text` | Magic box → Summary / Explain / Translate | Summarise, explain or translate the content as the request says. | Markdown, starting with a “## ” heading for summaries and explanations | default | optional | `23b_magic.js magicCreate` |
| `factcheck` | Fact check tab | Check the factual statements in the student’s notes against the sources (or general knowledge) and give a verdict for each. | JSON: `{"summary": "…", "claims": [{"quote": "…", "verdict": "correct\|partly\|incorrect\|unsupported", "why": "…", "fix": "…", "source": "…", "evidence": "…"}]}` | default | optional | `24_sources_fc.js runFactCheck` |
| `chat` | Chat tab | Answer the student’s questions about their own notes and sources, short and clear. | Markdown (short paragraphs, bullet points, **bold** key terms), streamed | default | optional | `25_chat_learn.js sendChat` |
| `page.edit` | Chat tab with “Can edit the page” on | Change the student’s open page as they ask (fix, rewrite, shorten, translate, fill in, add or remove parts) and say in one or two sentences what was changed; or just answer a question. | JSON: `{"reply": "…", "edits": [{"op": "set", "id": "b2", "text": "…"}, {"op": "add", "after": "b2", "kind": "p\|h1\|h2\|h3\|li\|ol", "text": "…"}, {"op": "delete", "id": "b3"}]}` | default | no | `50_ai_edit.js sendAiEdit` |
| `learn.summary` | Learn tab → Summary | Write a study summary of the notes: overview, key points and key terms. | JSON: `{"title": "…", "lang": "…", "overview": "…", "keyPoints": ["…"], "terms": [{"term": "…", "meaning": "…"}]}` | default | optional | `25_chat_learn.js runLearn` |
| `learn.cards` | Learn tab → Flashcards | Make flashcards that test the important facts in the notes. | JSON: `{"title": "…", "cards": [{"front": "…", "back": "…"}]}` | default | optional | `25_chat_learn.js runLearn` |
| `learn.quiz` | Learn tab → Quiz | Write multiple-choice questions about the notes, each with 4 options and the index of the correct one. | JSON: `{"title": "…", "questions": [{"question": "…", "options": ["…", "…", "…", "…"], "answer": 0, "explain": "…"}]}` | default | optional | `25_chat_learn.js runLearn` |
| `learn.map` | Learn tab → Mind map | Make a mind map of the notes: one central topic, branches and short details. | JSON: `{"center": "…", "branches": [{"label": "…", "children": ["…"]}]}` | default | optional | `25_chat_learn.js runLearn` |
| `sketch.svg` | Handwriting pad → Drawing → picture, Magic box → Picture | Turn the attached rough sketch into a clean SVG illustration of the same subject and composition. | only one standalone &lt;svg> element, rules in the request | default | required | `28b_3d.js sketchToSVG` |
| `sketch.detail` | Handwriting pad → Add more detail | Add detail to the SVG illustration in the request, keeping subject, composition and colours. | only one standalone &lt;svg> element | default | no | `28b_3d.js padToImage` |
| `model3d.create` | 3D studio, Make it a 3D model, Magic box → 3D | Build a simple 3D model from basic parts (boxes, spheres, extruded outlines …) as described in the request. | JSON: `{"name": "…", "parts": [{"type": "box", …}]} with the part fields listed in the request` | default | optional | `28b_3d.js gen3D` |
| `model3d.edit` | 3D window → Cmd, 3D studio → Add more detail | Change the 3D model in the request as asked and return the whole updated model. | JSON: `{"name": "…", "parts": [ … ]}` | default | no | `28b_3d.js aiChangeScene` |
| `magic.custom` | Magic box → your own buttons and “just this once” rules | Do with the content inside the Magic box exactly what the student’s own rule says (for example: turn it into flashcards, list the key dates, write three exam questions). | Markdown text: the result only | default | optional | `23b_magic.js magicCreate` |
| `model3d.photo` | 3D studio → From a photo | Look at the photo and build a simple 3D model of its main object from basic parts, matching its shape, proportions and colours. | JSON: `{"name": "…", "parts": [{"type": "box", …}]} with the part fields listed in the request` | default | required | `28b_3d.js gen3D` |
| `model3d.dissect` | 3D window → Dissect | Sort the numbered parts of a 3D model into the real pieces the object would come apart into (for an engine: block, pistons, crankshaft …) and give each piece a short name. | JSON: `{"pieces": [{"name": "…", "parts": [0, 3, 4]}]}: every part number in exactly one piece` | default | no | `38_3dparts.js dissectWin` |
| `model3d.internals` | 3D window → Create internal components | Design the internal components of the object (for an engine: pistons, crankshaft, valves …) as extra named parts that fit inside its outer shape. | JSON: `{"parts": [{"type": "…", "name": "…", …}]} with the part fields listed in the request` | default | no | `38_3dparts.js internalsWin` |
<!-- tasks:end -->

**Add an AI feature:**
1. Add a task to `AI_TASKS` with `name`, `feature`, `code`, `does`, `input`, `output`, `tier`, `images`, and for JSON jobs `json: true` and a loose `check`.
2. Call `AI.text` or `AI.json` with `{ task: '<id>' }`. Write the prompt so any model can follow it: say what to do, give the exact answer format (“Reply with only JSON: {…}”), and validate the answer in the feature.
3. Run `node scripts/ai-docs.mjs`, then `python3 tests/test20.py`.

## Testing

- `tests/test20.py` stands in for the OpenAI, Anthropic and Ollama servers (Playwright routes) and checks AI settings, streaming chat, JSON jobs with the repair step, pictures, a wrong key, a local server and the task list.
- Tests 2, 3, 4, 18 and others run the same features inside a simulated Claude (`mock3d.js`).
- The desktop path (http plugin) was checked in the real app on Linux against a local server that sends no CORS headers.

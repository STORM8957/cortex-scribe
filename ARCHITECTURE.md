# Cortex Scribe: architecture and roadmap

Cortex Scribe (called Inkling until November 2026) is a study notebook by Kawi (STORM8957). It combines typed pages, handwriting, an endless drawing board, AI fact checking against your own sources, learning with scores, and live 3D windows inside notes.

**The name:** only what users see says Cortex Scribe (title, sidebar, intro, messages, the desktop window title). Everything stored keeps the old name so no notes are lost: the storage keys (`inkling:data:…`, `inkling:pref:…`), the backup marker `"app": "Inkling"` (import accepts `"Inkling"` and `"Cortex Scribe"`), the build file `inkling.html`, the desktop app's folder `Documents/Inkling` and its Tauri product name and identifier. New backups are saved as `cortex-scribe-backup-YYYY-MM-DD.json`. The logo (red, made from the blue original) is in `docs/design/logo_red.png`; the app embeds it in `46_brand.js`.

**Status (November 2026):** it runs as a Claude artifact at https://claude.ai/artifact/AY4ibHNpV7EB3Kyptp6xsR and, from the same code, as a local-first desktop app (Tauri, see section 2b) and as a file opened in a browser. Outside Claude it works with the AI the student chooses (section 2c, `docs/AI.md`). The goal is a full, open-source, local-first app that works with any AI and connects its 3D windows to Blender, Unity and engineering software.

**For a new chat with Claude:** share the artifact link (Claude can read the published code with its Artifact tool) or upload `cortex-scribe-source.zip` (earlier `inkling-source.zip`). Ask Claude to read this file first, then continue with the roadmap below.

---

## 1. How the code is organised

The app ships as **one self-contained HTML file**, built by joining these modules in the order listed in `src/ORDER.txt` (`sh build.sh`, or `node scripts/build.mjs`, which also works on Windows):

| Module | What it does |
|---|---|
| `00_head.html`, `01_css2.html`, `02_body.html` | Page head, all styles (dark red/near-black theme plus light theme), static HTML skeleton |
| `01b_css_sx.html` | Styles of the logo, the intro, the section list, the compact sidebar footer and the section screens (`sx-*` classes, extra colours `--c-blue`, `--c-violet`, `--c-teal`, `--c-amber` for both themes) |
| `10_util.js` | Helpers (`h()` element builder, `svg()` icons, `ICONS`, toast, modal, menus with sub-menus (`sub:` items, also inside sub-menus: `subs` keeps one open sub-menu per level), `prefs`, `dropFiles(el, onFiles, accept)` for anything a file can be dragged onto), library loader |
| `11_store.js` | **Platform:** which host we run in (`Desk` = the desktop app), personal storage (`Store.get/set/del`, `Store.maxDoc`, `Saver` debounced writes: 0.8 s pause, at most 3 s wait), runtime capabilities (`caps`, `useCap`) |
| `11b_platform.js` | **Platform:** `Platform` (`host`: claude/desktop/browser, `desktop`, `aiWhere`, `shareWhere` texts, `homeLink`, `openPadWindow(code)`), `Files`, `Shared`, `Live`, `Me`, `Downloads`, `Capture` (a shared tab or screen, and `Capture.mic()` for sound), `PadLink` (section 2d); desktop extras: local add-on libraries, save before closing, web links open in the normal browser (see section 2) |
| `11c_ai.js` | **Platform: the AI connector.** `AI` (what features use), `AIConn` (the AI chosen in AI settings), `AI_PROVIDERS` (Claude API, OpenAI, Gemini, OpenRouter, Ollama, LM Studio, OpenAI-compatible), `AI_PROTOCOLS` (Anthropic Messages, OpenAI Chat Completions), `AISettings` (section 2c) |
| `11d_ai_tasks.js` | `AI_TASKS`: every AI job in the app with what it does and the answer shape; every request names one (section 2c) |
| `12_tree.js` | Notebooks, folders and pages tree, sidebar: subfolders at any depth (+ → New subfolder, the … menu and right-click on a row, “Put in a new folder”), dragging pages and folders onto a folder (into it) or onto the top or bottom edge of a row (before or after it; `treeMove`, `wireTreeDrag`) |
| `13_sanitize.js` | HTML sanitizer for all rich text |
| `14_doc.js` | Page document model, load/save, undo snapshots, `addObj` (automatic numbered names) |
| `15_view.js` | `View`: A4 pages (reflow), endless page, infinite board; zoom and pan; surfaces, plus `PinSurface`, a screen-fixed layer for pinned objects (`view.pinSurf`). A4 and endless pages get a zoom box at the bottom right (−, %, +, fit to width: `wirePageZoom`), Ctrl + scroll and two-finger pinch; `zoomPageAt` keeps the point under the mouse or fingers in place. Finger and pen drags are applied once per screen frame (the moves in between are gathered) |
| `16_objects.js` | All object types (`OBJ`), selection, move/resize/rotate, connectors, groups, lock, right-click selection and menus, keyboard |
| `17_ink.js` | Pen and highlighter strokes, eraser, shape recognition |
| `18_chart.js` | 8 chart types with Excel-like options |
| `19_mindmap.js` | Mind maps (layouts, styles, keyboard) |
| `20_ribbon.js` | Word-like ribbon (Home, Insert, Draw, Magic box, Fact check, View) |
| `21_panels.js` | Right panels, Format panel, outline, handwriting pad. Text from the pad gets the size and font picked in the ribbon right before with nothing selected (`typingFmt` in `20_ribbon.js`), and lands after the word written before it |
| `22_ai.js` | AI context building, error messages (`aiErrorText`), tidy up, handwriting to text |
| `22b_ai_settings.js` | The AI settings window and the “AI: …” button in the sidebar (`aiSettingsModal`, `renderAIState`) |
| `23b_magic.js` | Magic box (multi-switch actions on a dragged area), **your own buttons** (a name and a rule for the AI, saved in `magic.custom`; right-click a chip to change or delete it) and the **just this once** rule (the box in the Magic tab and in the switches panel: runs only that rule on the next area or selection) |
| `24_sources_fc.js` | Sources (PDF, Word, Excel, images, YouTube/web text) and fact check with score |
| `25_chat_learn.js` | Chat about notes and sources; Learn (quiz with score, flashcards, summary, mind map) |
| `27_dock.js` | Bottom tool dock |
| `28b_3d.js` | 3D models, shared Three.js renderer, 3D views (the floor grid grows and moves with the model: `floorFor`), 3D windows in notes, 3D studio with two tabs (**Preview**: the model, extra view windows and close-ups, what to do with it; **Assets**: the model list and folders, + New model), pad sketch to picture |
| `30_3dmedia.js` | 3D window right-click menu: screenshots, recording (video plus own GIF encoder), display modes, engine pause, camera-angle windows |
| `32_screenwin.js` | Screen windows: a shared tab, app window or screen, or a video/picture file, with the same right-click recording features as 3D windows |
| `33_winkit.js` | Shared by 3D and screen windows: zoom and pan inside a window, notes with arrows (with video time ranges), the recordings library (one folder per window), the Recording and Show sub-menus |
| `34_blocks.js` | Blocks (saved copies of objects, windows, pages or selected text): folders you make, “Recently used” and “Recently added” (4 each), and inside every folder a section per kind (Notes, Papers with buttons for new blank sheets, Text boxes, Texts, Windows, Pages, Other; `BLOCK_CATS`, `blockCat`); the save dialog (name, folder or a new one), the Paste button and its chooser (recent blocks, block folders by kind), instant screenshot/video/copy windows, “new window” mode for screenshots and videos, right-click menus for selected text and empty page areas |
| `35_paper.js` | Movable A4/A3 paper pages (portrait/upright or landscape/sideways, blank/lined/vertical lines/squared/dotted, own colours): true proportions, scale as a whole when resized, and carry what lies on them when moved; turn upright/sideways, add an empty sheet or a copy below or to the right (`quickPaper(id, mode, dir)`) |
| `40_history.js` | **Recently deleted** (deleted pages, folders and notebooks stay 30 days: restore, delete forever, empty) and **page history** (versions of a page: when opened and changed, every 10 minutes while working, before Tidy up / changing the page type / going back, or “Save a version now”; go back to one or open it as a copy) |
| `41_audio.js` | **Sound recording during class** (Insert → Record sound): what you write, draw or add while it records remembers the moment (`data-at`, `at`); the player bar (play, ±10 s, speed, “Fade what came later”) and clicking text, a box or a drawing plays from that moment |
| `42_lasso.js` | The **lasso** tool (L): draw a loop to choose drawings and boxes; drag a selection of drawings from inside its frame; colour and thickness of chosen drawings |
| `43_tags.js` | **Jump tags**: words (`span.jtag`) or boxes, pictures and windows (`o.tag`) get a tag; clicking one jumps to the other places with the same tag in the notebook, with a menu when there are several. Replaces the old Link button (old links still work) |
| `44_calc.js` | **Calculators**: the scientific one in the side panel (Calculator tab: its own parser `calcEval`, degrees or radians, history, put the result on the page) and the small calculator object (`calc`) from Insert |
| `45_tabkey.js` | **Tab like in Word**: indents paragraphs and list items, tab stops in a line (`span.tab`), next table cell (a new row after the last); Shift+Tab goes back |
| `46_brand.js` | **Name and logo**: the logo as a data URL (`LOGO`, `LOGO_ICON` for the tab icon), `APP_NAME`, the sidebar brand, and the **intro** (`playIntro(force)`): the mark draws in from the pen nib, the name letter by letter, the tagline. Once per session (`sessionStorage` `cs:introShown`), a click or key skips it; not in pad mode, not for automated tests (`navigator.webdriver`), not when View → Intro animation is off (pref `intro`); with “reduce motion” it only shows and fades |
| `47_sections.js` | **Sections** (UI preview of the study loop, designs in `docs/design/`): the section list in the sidebar (`SECTIONS`, `openSection(k, arg)`, `closeSection()`, `showNotebooks()`), shown in `#secView` in place of the page (the page stays loaded; `.in-sec` on `#main` and `.app` hides the page, ribbon, panel and rail; opening a page closes the section). **Home** (opens when no page is open and notebooks exist): greeting, quick note to the Inbox, today, tasks, study projects, logbook, recent pages; on phones quick actions and a tab bar. **Subjects & grades**: subject cards, a subject page with grade chart, grades, topics, feedback and classmates. **Task projects** with members: overall bar coloured per person, one bar per person, a board (To do, Doing, Done) with ticking, assigning, moving, a filter per person and new tasks. **Study projects**: plan until the test, readiness per person. Calendar and Coding logbook as previews. Real: recent pages and Inbox notes; the rest is example data (`SUBJ`, `PROJ`, `PEOPLE`), marked “Preview”, and changes last until the window closes. Also makes the sidebar footer compact (two columns, full names as tooltips) |
| `48_wordsync.js` | **Word link core** (no DOM; also loaded by the bridge and the Word add-in): the model (paragraphs `{ k, t, lock?, a?, r? }` with alignment and formatting runs, tables with cell colours, Word's page, header and footer; see section 2e), `hunks` (what changed, by paragraph), `merge3` (three-way merge: both sides' changes kept, a clash goes to the side that is typing) and `makeClient` (one side of a link: pushes its changes, takes in the other side's without losing its own). See section 2e |
| `49_wordlink.js` | **Word link, the app side**: the connection (`WL`, through `WordBridge`), reading and writing a page by paragraph (`wlPageModel`, `wlApply`, `wlSetText` changes only the part of a paragraph that differs, so tags and font sizes stay; `wlRuns` / `wlSetRuns` read and set bold, italic, underline, struck through, text colour and highlight word by word; `wlAlign`, cell colours; the header and footer (`wlHFItems`, `wlHFHtml`) and Word's page (`wlSetupItem`, `wlTakeSetup`)), locked boxes for Word pictures and tables (`p.wlock`), the Home card (`wordCardHtml`), the chip on a linked page, Open it here, Unlink, the setup help |
| `50_ai_edit.js` | **AI editor**: with “Can edit the page” on (Chat tab, pref `chatEdit`, on by default), a message goes to the connected AI as task `page.edit` with the open page as parts with ids (paragraphs/headings/list items `b1…`, table cells `b4.r0.c1`, note/text boxes, sticky notes and shapes `o1…`, mind map ideas `m1.0…`, locked Word parts shown but marked). The answer `{ reply, edits: [set / add / delete] }` is applied at once: `set` changes only the words that differ (`wlTextOps`, formatting on other words stays), `add` puts a paragraph after a part (or a note box after a box), `delete` removes a paragraph. Before that: Undo (Ctrl+Z) and page history (“Before the AI edit”); the chat message has its own Undo (`aiEditUndo`, until the page is closed). On a page linked with Word, the changes go to Word like typing |
| `47_sections.js` (switch) | `PREVIEWS_DEFAULT` and the pref `previews` (View → Coming sections): the coming sections (Subjects & grades, Calendar, Task and Study projects, Coding logbook) and the example cards on Home are hidden when off; Home then shows the Word link card, the Inbox and recent pages, and a Word link button. Off in the demo version for friends (version 35), on again afterwards. The sidebar also has **Word link** (`secOpen === 'word'`, `renderWordSection` in 49_wordlink.js) |
| `51_pagesetup.js` | **Page setup on A4 pages**: size (A4, A3, A5, Letter, Legal, or Word's own), all pages upright or sideways, one page turned (the turn button next to it), margins (Standard, Normal, Narrow, Moderate, Wide), the **header and footer** (double-click in the top or bottom margin, or Page setup; the ribbon's bold, colours and alignment work there) and **page numbers** (`span.pgf`: page / number of pages). View → Page setup and the Format panel. `pageDims(i)`, `pageMg()`, `pageTop`/`pageAt` (pages of different sizes one below the other), `sheetLayout`, `pageSetupChanged` (text moves between pages, pages that only emptied go away, a wide page zooms to fit for itself) |
| `52_pdf.js` | **PDF export** (the PDF button in the top bar, View → PDF, “Download as PDF” in a page's menu in the list): each A4 sheet becomes a PDF page of its own size (page setup), an endless page is cut into A4-shaped pages, a board becomes one page with everything on it; always on white paper (light colours; a page colour you chose stays). The page is copied (no selection, handles or page tools; canvases, videos and pictures from elsewhere become pictures inside), drawn by the browser through an SVG `foreignObject` (a `data:` address: a `blob:` one counts as foreign in a file opened in the browser) at 2×, or with html2canvas (`LIBS.h2c`, from a CDN) where the browser refuses (Safari). `pdfFromJpegs` writes the PDF itself (one JPEG per page, no PDF library). The text in the PDF is a picture (not selectable); web fonts fall back to similar fonts in the drawing |
| `39_style.js` | Colour styles: ready-made styles and your own colours for note boxes, see-through text boxes, sheets and the page (`stylePop`, `applyStyleTo`, `setPageStyle`, `paintPage`), and “Use for new …” |
| `36_pin_lang.js` | “Stay in place on screen” (pin/unpin) and the language picker (scroll or search, English, native and German names) used by Auto-translate and Auto-correct in the Magic box and Tidy up |
| `37_pad.js` | Handwriting pad extras: wider panel (drag its left edge) and taller pad (drag the bar under it), pad settings (⚙), “Insert drawing” without AI (picture with a white or see-through background, or pen lines), ↑ / ↓ to choose the line or box the pad writes into, and the pad on another screen (pad mode, pad link dialog with QR code, “Be the pad” offer); section 2d |
| `38_3dparts.js` | 3D pieces: **Dissect** (the AI sorts a model's parts into the pieces it comes apart into), **Create internal components** (the AI designs parts inside), X-ray, arranging pieces (exploded view, row, grid, back together), 3D windows for every piece or chosen pieces, the Pieces menu |
| `29_search.js` | Notes search (sidebar), find on page (Ctrl+K), object names |
| `31_backup.js` | Export everything and import a backup |
| `26_rest.js` | Page links, live sharing, presence and cursors, share dialogs, opening and closing pages, boot |
| `99_end.html` | Closing tags |

**External libraries:** loaded only when needed: three.js r128, pdf.js 3.11.174, mammoth 1.6.0, SheetJS 0.18.5, qrcode-generator 1.4.4 (QR code for the pad link). The Claude version loads them from cdnjs/jsDelivr (`LIBS` in `10_util.js`). The desktop app ships the same versions in `dist/lib/` (copied from `node_modules` by `scripts/build.mjs`) and tries those first (`LOCAL_LIBS` in `11b_platform.js`), so it works offline.

---

## 2. Platform layer (the part to rewrite for the stand-alone app)

Both hosts use the same objects. `11_store.js` sets `Desk` (`window.__TAURI__`, only present in the desktop app); each object then picks the Claude, desktop or plain-browser way.

**Rule:** feature code never calls `caps.sample`, `caps.assets`, `caps.db`, `caps.room`, `caps.user` or `caps.downloads` directly. Everything goes through these objects. The current check (`grep caps\. ` outside `11_store.js` and `11b_platform.js`) finds no direct calls apart from the `caps.canWrite` flag (set by `Store`).

| Object | Interface | Inside Claude | Desktop app (Phase 1, done) | Later |
|---|---|---|---|---|
| `Store` | `get(key)`, `set(key, data)`, `del(key)`, `watch(key, onData)` (changes from other tabs or devices; null in the desktop app), `mode` (`db`/`desktop`/`local`), `folder`, `maxDoc`, `init()` | Claude per-user database, falls back to localStorage | One JSON file per key in `Documents/Inkling/data/` | Optional sync |
| `AI` | `ok`, `name`, `label`, `img` (image limits), `noPics`, `text(input, opts)`, `json(input, opts)`; `opts.task` names the job | Claude sampling (`opts.images`, `signal`, `modelTier`, `onText`) | The AI chosen in AI settings (section 2c); the same in the browser version | More providers as needed |
| `Files` | `upload(blob)`, `put(blob)` returns a src, `url(src)`, `blob(src)` | Claude assets (`/_blob/<id>`), else IndexedDB (`idb:<key>`) | `put` → `Documents/Inkling/media/<name>` (`inkf:<name>`); `upload` returns null, so pictures on pages stay `data:` URLs inside the page | Pictures as files too (needs a src that can be drawn without waiting) |
| `Shared` | `ok`, `get(path)`, `set(path, data)`, `del(path)`, `watch(path, onData(data, pending), onErr)` | Claude shared db documents `shared/<code>`, `sharedink/<code>` | Not available (`ok` false; `Platform.shareWhere` explains) | Phase 4: Yjs (CRDT) |
| `Live` | `ok`, `join(room)` returns `{ presence, onPresence, … }` | Claude rooms (cursors, who is here) | Not available | Yjs awareness |
| `Me` | `id`, `profiles(ids)` | Claude user names | None | Local profile or account |
| `Downloads` | `save(filename, blob)` | Claude downloads capability | Native “Save as” dialog (`save_as`); cancel throws `{ code: 'declined' }` | |
| `PadLink` | `remote`, `open(code, side, onMsg)` returns `{ kind, send(msg), close(), useRelay() }` | Shared db documents `padm/<code>` (notebook → pad) and `padp/<code>` (pad → notebook), so a phone or another computer can be the pad | Other tabs or windows on this computer (BroadcastChannel, localStorage as a fallback), and a phone or tablet on the same Wi-Fi through the pad relay (`PadRelay`, below); `remote` false | Phase 4: the sync server |
| `PadRelay` | `here`, `usable`, `port` (pref `padPort`, 3457), `url()`, `ensure()`, `info()` → `{ ips, port }` | Not used (the shared database does it) | `scripts/pad-relay.mjs` on this computer: the desktop app starts it (`pad_link_start`), the browser version uses it when `npm run pad` runs; a phone that opened the QR code's address is served by it (`window.CS_PAD_RELAY`) | |
| `Capture` | `ok`, `allowed()`, `screen()` returns a MediaStream | Browser screen sharing (may be blocked inside Claude’s page) | The system web view’s screen sharing (untested on real machines) | Native capture |

**Media "src" strings:** `/_blob/<id>` (Claude assets), `inkf:<name>` (desktop media folder, `name` = id plus extension), `idb:<key>` (this browser), `data:` URL (inline), or `https:` (images only). Pictures on pages and in rich text are drawn straight from their src (`resolveSrc`), so they must be `data:`, `https:` or `/_blob/`; window media (shots, recordings, GIFs, files, the library) go through `Files.url`, which also reads `inkf:` and `idb:`.

---

## 2b. Desktop app (Tauri 2)

**Why Tauri:** a small app (a few MB) that uses the computer’s own web view (WebView2 on Windows, WebKit on macOS and Linux) and a small Rust program for the files. Electron would bundle a whole Chromium (100+ MB).

| File | What it does |
|---|---|
| `package.json` | `npm run app` (start in development), `npm run app:build` (make the installer), `npm run web` (build `dist/`); pins the add-on library versions |
| `scripts/build.mjs` | Joins `src/` into `inkling.html` (like `build.sh`); with `--desktop` also writes `dist/index.html` and `dist/lib/*` |
| `src-tauri/tauri.conf.json` | Window, `withGlobalTauri` (the page gets `window.__TAURI__`), `dragDropEnabled: false` (so dropping files onto pages works as in a browser), no CSP yet |
| `src-tauri/capabilities/default.json` | The page may use events, open web links (`core:default`, `opener:default`) and send requests to the chosen AI server (`http:default`, any address, because the student picks it) |
| `src-tauri/src/lib.rs` | The native commands below, plus “save before closing” |
| `src-tauri/icons/` | App icons, made from `app-icon.png` with `npx tauri icon app-icon.png -o src-tauri/icons` |

**Native commands** (called only from `11_store.js` and `11b_platform.js`):

| Command | Arguments | Result |
|---|---|---|
| `store_info` | | `{ folder }`, creates `data/` and `media/` |
| `store_get` | `{ key }` | the JSON text, or null |
| `store_set` | `{ key, data }` (JSON text) | written to a temporary file, then swapped in |
| `store_del` | `{ key }` | |
| `file_put` | raw bytes, header `x-name` | saved in `media/` |
| `file_get` | `{ name }` | the bytes (ArrayBuffer) |
| `save_as` | raw bytes, header `x-filename` (URL-encoded) | shows the save dialog, writes the file; false if cancelled |
| `close_now` | | closes the window |
| `word_link_start` | `{ port }` | starts the Word link's bridge (`node scripts/word-bridge.mjs`, no window, output in `Documents/Inkling/word-link.log`) if nothing listens on the port yet; stopped when the main window closes. Returns `{ state: running|started|missing|no-node|failed, detail }`. Only in builds from the source folder (the script's path is where the app was built); an installed app says to run `npm run word` |
| `word_find` | `{ query }` | the Word documents (`.docx`) in Documents, Desktop, Downloads and the OneDrive folders whose name contains `query`, newest first, at most 60: `[{ name, path, folder, modified }]` (5 folders deep, links not followed, `~$` files left out) |
| `word_open` | `{ path }` | opens a `.docx` file that exists in the program that opens Word files (Word), through the opener plugin |
| `pad_link_start` | `{ port }` | starts the pad relay **inside the app** (`src-tauri/src/padrelay.rs`, std threads and the `tungstenite` WebSocket library without encryption, so no `ring`): an http server on all network addresses that serves the app's own `index.html` (marked with `window.CS_PAD_RELAY`) and passes `/padlink` messages between the screens of one pad code, like `scripts/pad-relay.mjs`. Nothing else to install, also in the installed app. Returns `{ state: running|started|failed, detail }`. `cargo build --example pad_relay` runs it on its own (test32 with `CS_PAD_RUST=1`) |
| `open_pad_window` | `{ code }` | opens (or brings forward) a second window `pad-<code>` with `index.html#pad=<code>`: the drawing pad. An `async` command: on Windows a window made in a synchronous command stays blank (WebView2 deadlock) |

Names are checked (letters, digits, `_`, `-`, `.`, not starting with a dot), so nothing can be read or written outside the Inkling folder.

**Folder on disk:** `Documents/Inkling/` (if the system has no Documents folder, the app’s data folder): `data/<key>.json` for every Store key (`tree`, `note_<id>`, `ink_<id>`, …) and `media/<name>`.

**Closing:** only the main window asks the page to save first; pad windows just close. The first click on the main window’s close button sends `inkling-close` to the page, which writes everything still waiting (`Saver.drain`) and calls `close_now`. If the page doesn’t answer within 8 seconds, or the close button is clicked again, the window closes anyway.

**AI requests** go through Tauri's http plugin (`window.__TAURI__.http.fetch`, used by `aiFetch` in `11c_ai.js`), so AI servers on the same computer (Ollama, LM Studio) answer without allowing web pages (CORS). Checked in the real app against a local server that sends no CORS headers. On Windows the plugin uses Windows' own encryption (`native-tls`, see `src-tauri/Cargo.toml`), because its default (rustls with the `ring` library) needs the clang compiler on ARM laptops; macOS and Linux keep the default.

**Moving notes over:** Backup and move → Import a backup reads format 1 as before. On the desktop, pictures used on pages or in blocks stay inside the pages; recordings and other media become files in `media/`.

---

**Installers for testers (GitHub):** `.github/workflows/release.yml` builds the app on GitHub's computers (Windows x64 and ARM64 as NSIS installers that install for the current user without admin rights, Mac universal `.dmg` signed ad hoc, Linux AppImage and `.deb`) with `tauri-apps/tauri-action`, and puts them on a Release named after the version in `tauri.conf.json` (now 0.35.0, product name “Cortex Scribe”; the identifier `org.inkling.notebook` and `Documents/Inkling` stay). It runs when a tag `v…` is pushed, or by hand. The installed app has everything except the Word link (it needs the bridge and `word:setup` from the source folder; the card says so). Windows shows SmartScreen (“More info → Run anyway”) until the app is signed with a paid certificate.

## 2c. AI (Phase 2)

Full details, the list of AI services and the table of all AI jobs are in **`docs/AI.md`**. In short:

- Features call `AI.text(input, { task, images, modelTier, signal, onText })` or `AI.json(...)`. Nothing else talks to an AI service.
- **Inside Claude** the answers come from `caps.sample`, as before. **In the desktop app and the browser version** they come from `AIConn`, the AI the student chooses in **AI settings** (sidebar, bottom left).
- **Providers** (`AI_PROVIDERS`): `anthropic` (Claude API, suggested model `claude-opus-5-5`), `openai`, `gemini`, `openrouter`, `ollama`, `lmstudio`, `custom`. Each speaks one of two **protocols** (`AI_PROTOCOLS`): Anthropic Messages or OpenAI Chat Completions. Answers are always streamed. `opts.effort: 'max'` (3D Max effort) asks for the most careful answer: `output_config.effort: 'max'` for Claude 5 models, `reasoning_effort: 'high'` for OpenAI and Gemini reasoning models; a server that rejects it gets the request again without it.
- **Tasks** (`AI_TASKS`): every request names its job. The connector puts the job's `does` and, for JSON, its `output` shape in the system prompt, reads JSON even when a model wraps it in code fences or text, checks it with the task's `check`, and asks the model once more if the shape is wrong. Busy servers get one retry; a rejected request is sent once more without optional extras.
- **Pictures** are sent only if the model can read them (`vision`: guessed from the model name, or set in AI settings). Other formats (SVG) are converted to JPEG, and big pictures are made smaller.
- **Settings** are stored in local storage under `inkling:ai` (`{ v: 1, active, profiles: { <provider>: { key, model, quick, base, vision } } }`): only on this computer, never in backups or in Claude's database.
- **Errors** are `{ code }`; `aiErrorText()` in `22_ai.js` explains each in plain words, naming the AI (`AI.name`).

---

## 2d. The drawing pad on another screen

“Other screen” above the handwriting pad (or ⚙ → Pad on another screen) starts a **pad link** with a 6-letter code. Another screen then becomes the pad (**pad mode**: the whole screen is a drawing area, with colours, settings, ↑ / ↓ and pen keys on the side, and a ⚙ menu at the top left). It is the same Inkling page in a different mode; nothing new to install.

- **When it can't connect:** a screen inside Claude without the shared database (not signed in) says so in pad mode and on the phone's start screen, which also has **Be the drawing pad**; after 15 s without a connection the pad says what to check. Pad mode has a minimum height, so it shows even where the host sizes the page to its content.
- **A phone or tablet without Claude (desktop app and browser version):** the **pad relay** `scripts/pad-relay.mjs` (`npm run pad`; the desktop app starts it with `pad_link_start` when the pad dialog opens) is a small http server on port 3457 on all of the computer's network addresses. It serves the built Cortex Scribe (`inkling.html`, marked with `window.CS_PAD_RELAY`) and a WebSocket `/padlink` that passes `{ type: 'msg', env }` between the screens that joined the same pad code (`join`); it sends `info` with the computer's addresses (home network first, virtual adapters last). The dialog shows a QR code for `http://<address>:3457/#pad=<code>`; the phone opens it and is the pad straight away, and the notebook's `PadLink` sends through the relay as well as to other windows. The code is the secret; only the app, the browser version and pages served by the relay may connect. No certificate is needed. Phone and computer must be on the same Wi-Fi; Windows asks once whether Node.js may use the network (allow private networks); school or café Wi-Fi that keeps devices apart needs a phone hotspot. Tested with `tests/test32.py` (a phone-sized browser on the same machine), not yet with a real phone.
- **Ways in:** a new tab (browser version) or window (desktop app, `open_pad_window`) with `#pad=<code>`. Inside Claude, the QR code / link (`Platform.homeLink + '#pad=' + code`) opens Inkling, but Claude doesn't pass the `#pad=` part into the page (seen on a real phone), so **while a pad link is open, Inkling opens as the drawing pad** on every other screen or tab of the same account, before the notes load (`padBootCheck` / `padJumpIn`); the notes are one tap away (**My notes**). Not in the notebook's own tab after a reload (sessionStorage `inkling:padNotebook`). A screen that was already open gets the offer “Use this screen as the drawing pad?” instead (Store key `padlink`, watched with `Store.watch`). A tab opened from Claude's page can't load claude.ai (`ERR_BLOCKED_BY_RESPONSE`), so “On this computer” copies the link for the student to paste into a new tab. **Drawing pad** in the sidebar (`padHubModal`) offers the same, plus a field for the code or a pasted link, and a way to start a pad link.
- **Messages** (through `PadLink`, details at the top of `37_pad.js`): the pad sends `hello`, `ink` (strokes plus what to do: `text` read handwriting, `picture` AI picture, `insert` as drawn, `3d`; for `text` also `font` and `size`, checked against `FONTS` / `SIZES`), `key` (space, enter, back), `move` (↑ / ↓) and `bye`; the notebook answers with `state` (page name, where it writes, whether AI works, and `done` + a message when a drawing was handled). Both send `style` (`text` and/or `img`, a small JPEG data URL) so **Your style** is the same on both screens; the notebook sends the picture only when it changed.
- **Pad side column:** Colour, Settings, ↑ / ↓, Pen keys, **Text on the page** (font and size of what the pad types, prefs `padFont` / `padTextSize`; `insertTextAtSaved(text, fmt)` wraps it in a span) and **Your style** (text, picture: choose or drag onto the box).
- **Pad mode** has ⚙ (full screen, tools on the left, writing lines, clear, leave) and **My notes** (back to the page that was open). On phones and small windows (`.compact`, `PM_COMPACT` media query) it is a drawing area, a dock of the main keys (under it when upright, beside it when sideways), Write / Draw in the top bar, and **More**, a sheet with colours, pen, settings, text and style. Pad keys, here and in the panel, are tiles (`.pkey`: icon on top, label underneath); Space and New line are the big ones (`.pkey.big`).
- **The notebook does the work:** reading handwriting and making pictures use the notebook's AI, so the phone needs no AI set up. The pad only draws and sends strokes (simplified with `rdp`).
- **Where it writes:** on pages, the line with the text cursor (↑ / ↓ move it line by line, ↓ below the last line makes a new one); on boards, the selected box or one being edited (↑ / ↓ go from box to box, top to bottom).

---

**Design pictures:** `docs/design/home_*.png` are ideas for a home page with room for the planned sections (Calendar, Task projects, Study projects, Coding logbook); `docs/design/SUBJECTS.md` with `subj_*.png` is the design for subjects and grades, and `docs/design/PROJECTS.md` with `proj_*.png` the design for projects, the calendar, Learn and the coach, and how they connect. Not built yet.

## 2e. Word link (experiment, November 2026)

An A4 page and a Word document stay the same while you write in either. No AI is involved.

- **Pieces:** the **bridge** `scripts/word-bridge.mjs` (`npm run word`) runs on the computer: an https server on `localhost:3456` (127.0.0.1 and ::1 only) that serves the Word add-in's files, and a WebSocket at `/link`. The **Word add-in** `word-addin/` (manifest, `taskpane.html/js`, icons) puts a Cortex Scribe button on Word's Home tab and opens a panel that reads and writes the document with Office.js (WordApi 1.3). The **app** connects through `WordBridge` (platform layer, `11b_platform.js`) and `49_wordlink.js`. All three use `48_wordsync.js` (the bridge and the panel load the same file).
- **Model:** a document is a list of paragraphs `{ k: p|h1|h2|h3|li|ol, t, lock?, a?, r? }` and tables `{ k: 'table', rows: [[cell text…]…], sh? }`; line breaks inside a paragraph or cell become spaces. **Formatting** crosses word by word: `r` = runs over the words of `t` (`WordSync.words`: a word with the spaces after it), `[[count, fmt]…]` with fmt = `b;i;u;s;c=#rrggbb;h=#rrggbb` (bold, italic, underline, struck through, text colour, highlight). Black / the page's ink is no colour. `a` = alignment (`c`, `r`, `j`). `sh` = table cell colours. Around the text: `{ k: 'setup', ps: { w, h, o, m, hd, fd } }` (Word's page in points: size, orientation, margins, header/footer distance) first, the header's lines `{ k: 'hd' }` and the footer's `{ k: 'ft' }` (one formatting per line; `{PAGE}` / `{NUMPAGES}` are the page number fields; empty lines left out); `norm` keeps that order. On the page these are the A4 page setup and header/footer of `51_pagesetup.js`; the page keeps Word's own setup item (`doc.word.setup`) and sends it back unchanged until something is changed here, so rounding never travels. A newly linked page gets white paper (`pcol`) so Word's colours look the same. **The panel** reads each paragraph's font (one call); only paragraphs with mixed formatting are read word by word (`getTextRanges([' '], true)`), and it writes formatting only where it changed. Header and footer: the first section's Primary header and footer; page number fields are read from the paragraph's OOXML (only when its text is new) and written with `insertField` (WordApi 1.5) or as OOXML (`fldSimple`). Page setup: read and written with `section.pageSetup` where Word has WordApiDesktop 1.3; otherwise read from the OOXML's `w:pgSz` / `w:pgMar` (every 8 s), and a change made in Cortex Scribe can't reach Word: Word's page comes back and the app says to change it in Word (Layout). **Tables** are real tables on the page (`table.wtable`, the cells typable, kept by the sanitizer): typing in a cell on either side changes that cell (the panel sets `getCell(r, c).value` only for cells that differ); rows and tables are added or removed only in Word. When both sides change the same table, the cells are merged one by one; if Word changed the rows meanwhile, Word's rows win and the other side's typing is carried over to the rows that are still the same. **Pictures**, and tables with a picture inside, become locked items: a box on the page (`p.wlock` with `data-wlock`, `data-wt`, kept by the sanitizer), never changed or deleted from the app; the panel never writes into a paragraph with a picture. If Word's table count doesn't match its table paragraphs (unusual nesting), tables fall back to locked boxes.
- **Several documents:** every Word window with the panel open is linked on its own (the bridge keeps them by key), and the Home card lists them all. If the same document is open in two Word windows, the newer window takes over and the older one says so and stops (no reconnecting, so they never fight); its “Use this window” button takes it back.
- **Sync:** the bridge keeps the master copy per document (key = the document's path or name) with a version and a short history. A side pushes its whole paragraph list with the version it started from; the bridge merges it (`merge3`, the pushing side wins a clash), counts up and sends the result to both. A side that typed meanwhile merges again on its side (`makeClient`). Messages: `hello` (role `word` with name, url, doc; role `app` with code, key, page), `link`, `push`, `doc`, `status`, `error`.
- **Never losing text:** the page keeps `doc.word.base` (the last state both sides agreed on), so changes made on either side while the link was off are merged when it comes back. When Word reconnects, the bridge merges what Word has with what the app changed meanwhile. A page that was just linked takes Word's document as it is (its empty start never counts as “everything deleted”).
- **Who may connect:** only this computer; the panel (origin `https://localhost:3456`), the desktop app (`tauri://localhost`, `http(s)://tauri.localhost`), and the browser version (a file, origin `null`) with the 6-digit code the bridge prints (saved in `~/.cortex-scribe/word-code.txt`; the app keeps it as pref `wordCode`). Anything else is refused at the door, and the bridge writes down who it refused (its window, or `Documents/Inkling/word-link.log` when the desktop app started it).
- **Finding it:** **Word link** in the sidebar opens the Word link screen: the card (connect, the documents open in Word), **Open a Word document** (desktop app: search the Word files on the computer with `word_find`, **Open and link** opens it in Word with `word_open`, and the page links by itself as soon as Word's panel says hello: `WL.pending`, matched by path or file name) and what comes across. The manifest's button uses `Office.AutoShowTaskpaneWithDocument`, and the panel sets that document setting once the document is linked, so the Cortex Scribe panel opens by itself next time the document is opened (Word stores it in the document when it is saved; after changing the manifest, Word has to be restarted).
- **Setup:** `npm run word:setup` (`scripts/word-setup.mjs`) makes a certificate for localhost with Microsoft's `office-addin-dev-certs` and registers the add-in for Word (Windows: `HKCU\Software\Microsoft\Office\16.0\WEF\Developer`; Mac: Word's `wef` folder; Word on the web: Upload My Add-in). `npm run word:remove` takes the button away. Settings: `CS_WORD_PORT`, `CS_WORD_CERT`, `CS_WORD_KEY`, `CS_WORD_CODE`; the app's port is the pref `wordPort`.
- **`npm run app` runs `tauri dev --no-dev-server`:** the page comes from the app itself, at the same address as the installed app (`http://tauri.localhost` on Windows). Tauri's built-in web server (`http://localhost:1430`) gave the page another address, which the bridge refused at first (seen on Kawi's laptop); the bridge also accepts that address now.
- **The desktop app starts the link by itself** (`WordBridge.ensure` → `word_link_start`) when it opens, if the link was used before, and when Connect is pressed; it needs no code. Open Cortex Scribe before Word (or press Retry in Word's panel), because the panel's files come from the bridge.
- **Not in the Claude version** (a page inside Claude can't reach programs on the computer): the Home card says where it works.
- **Tested with a stand-in Word** (`tests/mock_office.js`, test28 and test31) that follows Office.js's rules (load and sync before reading, changes at sync, new paragraphs take the style of their neighbour, replacing a picture paragraph deletes the picture, mixed formatting reads as null, replaced text takes the first letter's formatting, header/footer with fields, page setup with and without WordApiDesktop 1.3). **Tried with the real Word on Kawi's PC (November 2026):** setup, the button, the panel and linking a real dossier worked; tables then came across as locked boxes, which led to typable tables. The desktop app's auto-start is tested with the stand-in desktop app only.

## 3. Data model

**Tree (`tree` key):** `{ nodes: { id: { id, type: 'folder'|'note', name, parent, order, kind: 'a4'|'endless'|'board', shared?, owner?, inbox?, updated, deleted?, trashed?, trashRoot? } } }`. A top-level folder is a notebook. Deleting puts nodes in **Recently deleted**: `deleted: true` plus `trashed` (when) and `trashRoot` (the id of what was deleted, so a folder comes back with what was in it); their pages stay stored until they are removed for good after 30 days.

**Page document (`note_<id>`):** `{ v: 2, kind, bg, pcol?, margin, ps?, pwh?, po?, pt?, pmg?, hd?, ft?, hfd?, flows: [html per A4 sheet or one], fu: [timestamps], objs: { id: object }, mu, title, word?, session }`. `bg` is `blank`, `lined`, `vlined` (vertical lines), `grid` or `dots`. `pcol` = `{ bg, line, text }` is the page colour (paper, lines, text); the page then works like a small theme of its own (`.pgc`: boxes on it take the page colours unless they have their own). **Page setup of A4 pages** (`51_pagesetup.js`, all optional; without them a page is A4 upright with the usual margins): `ps` = `A3`, `A5`, `Letter`, `Legal` or `custom` with `pwh` = [width, height] upright in px (96 per inch); `po: 'l'` = all pages sideways; `pt` = [true, …] pages turned the other way than the rest; `pmg` = [top, right, bottom, left] margins in px; `hd` / `ft` = header and footer html (the same on every page; `span.pgf` with `data-f` `page` or `pages`); `hfd` = [header, footer] distance from the edge in px. `word` = the Word link (section 2e): `{ key, name, url, base, at, font?, setup? }`.

**Drawings (`ink_<id>`):** `{ ink: { id: { id, c: colour, s: width, k: 'pen'|'hl', sh: sheet, p: [x, y, x, y, …], g?: groupId, at?, del?, u } }, session, u }`.

**Sound moments:** while a sound recording runs, text blocks get `data-at="<recordingId>@<ms>"`, and objects and drawings `at: { r: recordingId, t: ms }` (when they were made, in milliseconds from the start of the recording).

**Objects:**
- **Pinned objects** have `pin: { k }` (the zoom when pinned); their `x`/`y` are then screen pixels in the work area and they are drawn on `view.pinSurf`, so they stay put while scrolling, panning and zooming. Unpinning converts them back to page coordinates.
- **Every object** has `id`, `t` (type), `x`, `y`, `w`, `h`, `r` (rotation), `z`, `sh` (A4 sheet), `lay` (front or back of text), `u` (updated), `name` (automatic: "Note box", "Note box 2", …), and optionally `g` (group), `lock`, `sc` (scale when created while zoomed), `ah` (auto height) and `del`.
- **Tags:** words in text can be `<span class="jtag" data-tag="a" data-tid="…">`; any object can have `tag`. A tab stop in text is `<span class="tab">\t</span>`.
- **Colours:** a note box has `bg`, `bc` (border) and `tc`; a text box (see-through, like in Word; drawn by dragging with the `tbox` tool) has `tc` and optionally `bg` (fill), `fo` (how solid the fill is, 0–1), `bc` and `bw` (outline) and `rad` (round corners).
- **Types:** `note`, `text`, `sticky` (rich `html`), `shape` (`k`, fill, stroke, `sw`), `image` (`src`, `alt`), `chart`, `mm` (mind map `tree`), `frame` (`title`), `card` (page link `target`), `conn` (connector: `a` and `b` are `{id, side}` or a point; `cs` curve/elbow/straight; `ar`; `dash`; `label`; `sw`), `group` (`sty` box/circle/none; members point to it with `g`), `paper` (movable A4/A3 sheet: `size` 'A4'|'A3', `land`, `pbg` background (`blank`, `lined`, `vlined`, `grid`, `dots`), colours `pc` paper, `lc` lines, `tc` text, rich `html`; laid out at the real page size at 96 dpi, 794×1123 for A4, and scaled by `sc` = `w` / page width), `m3d` (3D window, below), `calc` (the small calculator: no saved fields of its own), and `scr` (screen window: `file`, `fileType`, `srcLabel`, plus the same display and media fields as 3D windows; the live shared stream itself is never saved).
- **Both window types** also have `notes [{ id, text, x, y, ax, ay, from, to, bg }]` (note box position as fractions of the window body, may be outside 0–1 so notes can sit outside the window; arrow tip as fractions 0–1 of the content; `w`/`h` note size and `fs` text size in window pixels; `from`/`to` in seconds of the video, `null` means always), `recDur` (ms), `recId` (library entry), `extra` (library entries added to this window’s folder) and `newWin` (screenshots and videos open in a new window). Window notes are drawn in the page’s top layer (`.layer.others`), not inside the window, so they stay in front of everything.
- **3D window (`m3d`):** `scene { parts }`, `links [{ name, scene, pos, piece }]` (linked models; `piece: true` for the pieces Dissect made, whose parts keep their places so `pos [0, 0, 0]` is assembled), `model` (library id), `cam { th, ph, dist, tgt }`, `camOf` (camera window of another), `disp` live/img/video, `vmode` video/gif, `loop`, `engineOff`, `spin`, `spinSpeed` (radians per second, normal 0.25), `xray` (outside parts see-through), and the media `shot`, `rec`, `gif` and `src` (snapshot).
- **3D parts** may have `name` and `internal: true` (made by Create internal components). Up to 160 parts; “2× more detail” (pref `m3dDetail2`) lets the AI use up to 120.
- **Several windows at once:** Ctrl + right-click adds a window to the selection (`ctrlPick`); right-clicking one of two or more chosen 3D or screen windows shows one menu for all (`multiWinItems` / `mergeMenus` in `30_3dmedia.js`: items matched by label, ticks set all the same way).
- **3D scene parts:** box, sphere, cylinder, cone, torus, plane, extrude (2D outline), lathe; each with `pos`, `rot`, `scale`, `color`, `metal`, `rough`, `opacity`.
- **More detail:** see `OBJ` in `16_objects.js` and `normScene` in `28b_3d.js` for every field.

**Recordings library (`media`):** `{ items: [{ id, kind: 'video'|'shot'|'file'|'audio', src, gif, dur, w, h, fileType, name, created, win, winName, winType, page, pages?, sound? }] }`. Each window’s folder is the items with its `win` id plus its `extra` list. `audio` items are class sound recordings (`pages`: the pages they were used on; their id is the one in the sound moments). A window recording made with “Record sound too” has `sound: true`; the window then has `recMic` (record with the microphone), `recSound` (its recording has sound) and `mute`.

**Blocks:** `blocks` = `{ items: [{ id, kind: 'objects'|'page'|'text', sub: 'window'|'sheet'|'mixed', cat, folder?, used?, name, info, created }], folders: [{ id, name, created }] }`. `cat` is the section (`note`, `paper`, `tbox`, `text`, `window`, `page`, `other`); blocks from before sections get theirs from `kind`, `sub` and `info` (`blockCat`). `folder` is a folder id (none = not in a folder); `used` is when it was last pasted (for “Recently used”); `block_<id>` = the content (`{ objs, ink, w, h }` with positions relative to the block’s top-left, `{ kind, main, ink }` for a page, or `{ html, text }`). The Paste button’s choice is the `pasteArm` preference: `{ type: 'block', id }`, `{ type: 'win', win, mode: 'shot'|'video'|'copy' }`, `{ type: 'paper', id, mode: 'copy'|'blank', dir: 'right'|'below' }` or `{ type: 'newpaper', size, land }`. Copying, duplicating, pasting or saving a sheet always takes everything lying on it (`expandWithSheets`, `gatherCopy` in `35_paper.js`), and copies of sheets go to a free spot beside the original. Sheet blocks have `sub: 'sheet'`.

**Dropping files:** pictures can be dragged onto the page (where they land), onto any other part of the app (they go onto the open page; `16_objects.js`), onto **Your style** in the Handwriting panel and on the pad, onto Sources (any file) and onto a screen window (a video or picture it then shows). Nothing dropped makes the browser leave Inkling.

**Languages:** the Magic box settings (`magic` preference) hold `lang` (Auto-translate target) and `corrLang` (Auto-correct language, `auto` = detect). Tidy up uses the same two settings.

**Colour styles** (browser `prefs`): `noteStyle`, `tboxStyle`, `paperStyle`, `pageStyle` (the colours for new note boxes, text boxes, sheets and pages; null = normal) and `blockFolder` (the folder chosen last when saving a block).

**Own Magic box buttons:** the `magic` preference also holds `custom: [{ id, name, rule }]`; such a button is switched on like the built-in ones (`magic.on['c:<id>']`) and its rule goes to the AI with task `magic.custom`; the answer is placed as a note box.

**Touch:** a 3D or screen window's top bar, a chosen object, the selection frame and its handles have `touch-action: none`, so a finger moves them instead of scrolling the page (tap an object first to choose it; a box being typed in scrolls normally). Pages have `touch-action: pan-x pan-y`, so pinching zooms the page, not the whole app.

**AI settings** (local storage `inkling:ai`, not part of Store or backups): see section 2c.

**Word link on a page:** `doc.word = { key, name, url, base, at }` in the page document (kept by `normalizeMain`/`serializeMain`, so it is in backups too) and `node.word = key` in the notebook list. Prefs: `wordUsed`, `wordCode`, `wordPort`.

**Section and brand settings** (browser `prefs`): `inboxPreview` (quick notes from Home, newest first, at most 30), `myName` (the greeting on Home), `intro` (false = no intro animation).

**Pad settings** (browser `prefs`): `panelW` (panel width in pixels, null = normal), `padH` (pad height), `padInsertAs` (`picture`|`ink`), `padBg` (`white`|`clear`, also used for “Drawing → picture”), `padGuide` (writing lines on the pad and in pad mode, off by default), and for pad mode `padLeft` (tools on the left); `homeLink` (the Claude link to this Inkling, if it isn't the usual one). Store key `padlink` = `{ code, t, started, page, session, dev }` (the latest pad link, for the offer on other devices: `t` is renewed every 30 s while the link is open and older offers count as closed; `dev` is the starting device's `padDev` preference, so a device never jumps into pad mode for its own link; removed when the link stops or the tab closes). Shared documents `padm/<code>` and `padp/<code>` = `{ u, msgs: [{ k, n, m }] }` (the last 12 messages).

**3D models** (`models_<nb>`, one list per notebook): `{ items: [{ id, name, scene { parts }, links [{ id, pos }], page, pieces [{ name, idx }], desc, created, u }] }`. `page` is the page it was made on: the 3D studio lists the models of the open page (made there, or shown in a 3D window there) and puts the rest in an **Other pages** folder, by page. `pieces` (from Dissect in the 3D studio, or from Dissect in a 3D window of an unchanged model) groups the parts by number; each model's pieces, or else its parts, show as a folder under it, and one piece or part can be shown alone and put on the page. `desc` is the description of the object for the AI (it starts as what the model was made from; edit it under **Describe the object for the AI** in Preview, then **Change the model to match**); every change, Dissect and Create internal components keeps to it. A 3D window takes the model's description and can have its own (`desc` on the window object; right-click → **Describe the object for the AI…**). Prefs: `m3dDetail2` (2× more detail), `m3dMax` (Max effort: the most exact copy, up to 160 parts, highest effort), `m3dTab` (the 3D studio tab). Extra view windows in Preview (another angle, or a close-up of one piece or part, also from the zoom button next to it in Assets) are kept only while the app is open (`m3dViews`).

**Other keys:** `chat_<nb>`, `studio_<nb>`, `scores_<nb>`, `srcs_<nb>`, `srct_<sourceId>`, `models_<nb>` per notebook; `fc_<pageId>` for fact check history; `ver_<pageId>` = `{ items: [{ id, t, why, words, things, lines, sig }] }` (page history, newest first, at most 25) and `verd_<versionId>` = `{ main, ink }`; browser `prefs` for settings (also `audFade`, `audSpeed` for the sound player, `calcDeg`, `calcHist` for the calculator). Page history is not part of backups.

**Important:** data read from Claude's database is frozen. Always deep-copy it (`deep()`), which the platform layer already does.

---

## 4. Export format (`cortex-scribe-backup-YYYY-MM-DD.json`, earlier `inkling-backup-…`, format 1)

```json
{ "app": "Inkling", "format": 1, "exported": "ISO date",
  "tree": { "<id>": node },
  "notes": { "<pageId>": { "main": pageDocument, "ink": { … }, "fc": factCheckHistory } },
  "notebooks": { "<nbId>": { "chat", "studio", "scores", "srcs", "srctexts": { "<srcId>": … }, "models" } },
  "media": { "<src>": "data:…base64" },
  "library": { "items": [ … ] },
  "blocks": { "items": [ … ], "folders": [ … ], "data": { "<blockId>": … } },
  "prefs": { … } }
```

`"app"` stays `"Inkling"` so older versions can still import new backups; import accepts `"Inkling"` and `"Cortex Scribe"`. Import adds everything as copies with new ids and re-stores the media, so nothing is overwritten. The stand-alone app should read this format to bring notes over from the Claude version.

---

## 5. Testing

The Playwright tests run the built file in Chromium with a simulated Claude:
- `mock3d.js`: a fake runtime and fake AI answers.
- `fake_three.js`: a stand-in 3D engine for offline testing.
- `mock_desk.js`: a stand-in for the desktop app’s native side (the commands in section 2b), keeping “files” in localStorage.
- `test2` through `test12`: AI features, frozen database, 3D windows, media and camera windows, groups and lock, search and names, export/import round trip. `test13` to `test18`: screen windows, recordings library, blocks, A4/A3 sheets, Paste button, languages.
- `test19`: the desktop app: saving as files, reopening, saving when the window closes, importing a backup exported from the Claude version (picture and recording), exporting with the save dialog, web links, local libraries.
- `test20`: the AI connector in the browser version, with stand-in OpenAI, Anthropic and Ollama servers: AI settings (key, model list, Test, Save), streaming chat, JSON jobs with the repair step, fact check, pictures from the handwriting pad, a wrong key, a local server, a server that isn't running, that every AI request names a known task, and that `docs/AI.md` is up to date. Also checks that inside Claude nothing changes.
- `mock_shared.js`: a stand-in Claude whose shared database lives in localStorage, so several tabs act like several devices on one account.
- `test21`: the pad extras: panel width and pad height (drag, double-click, remembered), pad settings (writing line off by default), “Insert drawing” as a picture (white and see-through corners checked) and as pen lines, “Drawing → picture” with and without background, ↑ / ↓ on pages and boards, the pad in a second tab (typing, keys, ↑, inserting, AI picture, the ⚙ menu, leaving pad mode), the desktop pad window, font and size of typed text from the pad, **Your style** kept in step both ways (text, picture chosen or dropped on the pad), dropping pictures (style, anywhere onto the page, a screen window), and inside Claude the QR code and link, the offer appearing by itself on a device that was already open, a `#pad=` link, and **Drawing pad** in the sidebar with a pasted link.
- `test22`: 3D: 2× more detail, a model from a photo (chosen and dropped), Dissect (twice, with inside parts), Create internal components and X-ray, arranging pieces, 3D windows for every piece and for chosen ones (in free spots), spin speed, Ctrl + right-click on two windows and one menu for both, a sub-menu inside a sub-menu staying open under the mouse, Max effort (prompt, and effort `max` sent to the Claude API), parts and pieces folders in the 3D studio (a part shown alone and put on the page, Dissect in the studio), models listed per page with the Other pages folder, the Preview and Assets tabs (a new model shows in Preview), extra view windows (another angle, close-ups from + View and from the Assets list, closing one), and the drawing pad on a phone, upright and sideways.
- `test23`: page zoom on endless and A4 pages (buttons, two-finger pinch, Ctrl + scroll), dragging a chosen box and a 3D window's top bar with a finger, the 3D description (studio and window, kept by changes and Dissect), an own Magic box button (made, switched on, its rule given to the AI, result on the page, deleted) and the just-this-once rule.
- `test24`: colour styles for note boxes (also several at once, back to normal, “Use for new note boxes”), a see-through text box drawn by dragging (Frosted, how see-through), the Format panel and right-click “Colours…”, the page colour with vertical lines (saved, and “Use for new pages”), a chalkboard sheet with vertical lines turned sideways and a sheet added below, saving blocks into folders (a new folder, the last one, none), the section each lands in (an older block too), the Blocks window (folders, Recently used / added, sections, moving, search, a new and a deleted folder, a new sheet from Papers), the Paste button's recent blocks and folders, and Export / Import keeping the block folders and the page colour.
- `test26`: text from the handwriting pad in the size and font picked right before (and the next word after it, in the same size), subfolders (+ menu, right-click, an empty folder, dragging into a folder and above a page, a folder can't go into its own subfolder, “Put in a new folder”), and a phone that isn't signed in to Claude (“Be the drawing pad”, the message, the pad's size).
- `test25`: page history (save a version, go back, “Before you went back”), Recently deleted (delete, restore), a sound recording during class with Chromium's stand-in microphone (text, a box and a drawing remember the moment, clicking them plays from there, fading what came later, the library), a 3D window recording with sound, the lasso (two of three drawings chosen, recoloured and moved together), jump tags (on one page, a box, the chooser, from another page), both calculators, and Tab (paragraph, tab stop, list item).
- `test27`: Cortex Scribe: the intro (plays, gone after about 3 s, not again in the same session, a click skips it, off for tests), title, logo and tab icon, the section list and compact footer, Home (opens over the page, recent pages, Inbox quick notes), Subjects & grades (subject page, chart, classmates), a task project (team, overall bar 4 → 5 of 12 when a task is ticked, assigning, filter per person, a new task, moving to Doing), study projects, calendar and logbook previews, Notebooks back to the page, View → Intro animation, the light theme, and Home on a phone (quick actions, tab bar at the bottom, no sideways scrolling, Be the pad).
- `test28` and `tests/wordsync_unit.mjs`: the Word link. The merge core (22 cases, among them formatting, cell colours, page setup and header/footer order, and 10 random sessions with both sides typing, all ending identical), then the real bridge with a test certificate, the Word panel on a stand-in Word and the app: the bridge refusing other pages, a file page posing as Word and a wrong code; Home card (Connect, code, Open it here); page → Word (typing, a new paragraph, a new list item); Word → page (text with a bold word made here kept after it reached Word, a heading, a deleted paragraph); tables (a cell typed here reaches Word, Word's cell and a new row come here); pictures (also inside a table) kept as boxes and never changed in Word; a note box staying here; both typing at once; both sides changed while the bridge was stopped, merged when it comes back; saved with the page and linked again; unlinking; the desktop app (stand-in) starting the link by itself and saying why when it can't; the card inside Claude.
- `test29`: the AI editor with a stand-in AI: the page sent as parts (heading, table cells, locked part, box, mind map); a fixed paragraph keeping its bold word, a new and a deleted paragraph, a table cell, a note box and a new one after it, a mind map idea; locked parts and unknown ids left alone; page history “Before the AI edit”; Undo puts everything back; a question only gets an answer; with the switch off the normal chat answers.
- `test31`: the Word link with formatting and the page: Word's text colours, highlight, bold/italic, alignment, cell colours, page size (A4 sideways), margins, header and footer with a page number field come to the page; bold + colour + alignment, a header typed here, page numbers (as fields in Word) and a new size (A5 upright) go to Word; Word's green word, justified paragraph, cell colour and Letter size come back; an older Word (no WordApiDesktop 1.3, no WordApi 1.5) sends its page from the OOXML, gets page numbers as OOXML fields and keeps its own size (the app says so).
- `test32`: the phone pad without Claude: the browser version says how to start the pad relay and finds it with Try again; the relay serves the app and refuses other websites; the desktop app (stand-in) starts it and shows the QR code with the computer's address; a phone-sized browser opens it and is the pad at once, both sides connected; its drawing lands on the page.
- `test33`: page setup on A4 pages: A5 (text moves on), back to A4 (emptied pages go away), all sideways (fits on the screen, a box stays on its page), the turn button turns one page, narrow margins, the header by double-click with bold from the ribbon on every page, “Page 1 of 3” page numbers, the Format panel, saved and opened again, an endless page untouched.
- `test34`: the demo version: the coming sections hidden (and back with View → Coming sections), the Word link in the sidebar and its screen, the navy blue theme, the 5 basic colours (pen, pad, text colour with More colours), PDF export of an A5 sideways page (every sheet a page of the right size, checked with a PDF reader), an endless page (cut into A4-shaped pages) and a board (one page) from the top bar, the View tab and the list. test31 also covers the Word file search: listed, searched, opened in Word, linked by itself when Word's panel says hello, the panel opening by itself next time.
- `test30`: right-click on every kind of object (note box, text box, sticky note, shape, mind map with its + and fold buttons, calculator with its keys, chart, page link, picture, a frame and its title on a board) opens Cortex Scribe's menu, never the browser's; plain page text keeps the browser's menu (spelling); the mind map's + button isn't covered by the selection's connect dots.
- `test4` uses the real three.js from `node_modules` when present (after `npm install`), so it runs without internet.

The desktop app itself (`npm run app`) was also started for real on Linux: it creates `Documents/Inkling`, saves notebooks and pages as files there and shows them again after a restart.

Run them all with `sh tests/run_all.sh` after `sh build.sh` (setup: `pip install -r requirements.txt`, then `python3 -m playwright install chromium`), or one at a time with `python3 tests/testN.py`.

---

## 6. Roadmap

**Pinned order of work (November 2026):** reliability and sync, then the study loop, then imports, then simplicity, with real student users throughout. See `docs/ROADMAP.md`.

**Phase 0: ready for the switch (done)**
- [x] Platform layer: all Claude-specific calls in one place
- [x] Export everything and import a backup
- [x] This document

**Phase 1: stand-alone, local-first app**
- [x] App shell: Tauri 2 (section 2b); later Capacitor or Tauri mobile for phones and tablets
- [x] `Store` and `Files` on local files, working fully offline (add-on libraries shipped with the app)
- [x] Import of Claude-version backups (format 1)
- [ ] Try it on real Windows and macOS machines (only built and run on Linux so far)
- [ ] Pictures on pages as separate files instead of inside the page file
- [ ] Proper project setup: ES modules, Vite, automatic tests in CI

**Phase 2: any AI**
- [x] AI connector with providers: Claude API, OpenAI, Gemini, OpenRouter, Ollama, LM Studio, any OpenAI-compatible server (section 2c)
- [x] Bring your own API key; AI settings window with model list and Test; picture support per model
- [x] A task list (`AI_TASKS`, `docs/AI.md`) that tells any model what each request is for and what to answer
- [ ] Try it with real keys and real local models, and tune prompts for smaller models
- [ ] Optional: pick a different model per task in AI settings

**Phase 3: open source**
- [ ] Licence decision: MIT (maximum freedom) or AGPL (improvements stay open)
- [ ] Public repository, README, contributing guide, issue templates

**Phase 4: real collaboration**
- [ ] Yjs (CRDT) for pages, boards and drawings (two people typing in one paragraph)
- [ ] Optional sync server or peer-to-peer

**Phase 5: 3D and engineering**
- [x] Dissect, internal components, X-ray, exploded view and other arrangements, 3D windows per piece, a model from a photo, 2× detail, spin speed (`38_3dparts.js`)
- [ ] Move single pieces by dragging them in the 3D view (now: Format panel arrows)
- [ ] Import and export of glTF/GLB (Blender, Unity, web) and STL (3D printing)
- [ ] Notes pinned to parts of a model, measuring, sketching over a model
- [ ] Blender add-on with live sync
- [ ] Unity (glTF import), FreeCAD (Python API), STEP files via opencascade.js

**Word link (priority 3, `docs/ROADMAP.md`)**
- [x] Experiment: live link of text, headings and lists between Word and an A4 page, pictures and tables as locked boxes, merging after the link was off (section 2e)
- [x] Tried with the real Word on Windows: setup, button, panel and linking work
- [x] Tables with typable cells; the desktop app starts the link by itself
- [ ] Use it for real homework for a while and fix what comes up
- [ ] Bold, italic and colours across; line breaks inside a paragraph; open and save .docx without Word
- [ ] Word mode (Word-style ribbon) and the exact view

**The study loop (pinned priority 2, designs in `docs/design/`)**
- [x] Name, logo and intro; a section list in the sidebar
- [x] UI preview with example data: Home, Subjects & grades (with classmates), task projects with members and progress per person, study projects, calendar and logbook previews (`47_sections.js`)
- [ ] Real data: subjects from notebooks, grades you enter, projects and tasks you create (stored like pages, in the backup)
- [ ] Classmates and project members for real (needs accounts and sync, Phase 4); who sees what, chosen per person
- [ ] Calendar with timetable, tests and deadlines; the coach connecting it with Learn

**Phase 6: polish**
- [x] Handwriting pad: resizable panel and pad, Insert drawing, choose the line, pad on another screen with QR code (section 2d)
- [x] Phone or tablet pad outside Claude on the same Wi-Fi (the pad relay, section 2d); between different networks still needs the sync server of Phase 4
- [x] Page setup on A4 pages: sizes, sideways, one turned page, margins, header and footer, page numbers; the same with Word through the Word link
- [x] PDF export (pictures of the pages; selectable text later)
- [ ] Printing
- [ ] Mobile layout, accessibility review, performance with very large notebooks

---

## 7. Known limitations

**Desktop app and browser version:**
- No live sharing yet (Phase 4).
- The pad on another screen works on the same computer (a new tab or window) and, through the pad relay, from a phone or tablet on the same Wi-Fi. A device on another network needs the Claude version until there is a sync server (Phase 4).
- AI with real services hasn't been tried yet: only with stand-in servers (test 20) and a stand-in Ollama in the real desktop app. Smaller local models may give weaker answers than Claude, especially for fact checks and 3D models.
- Ollama only reads as much text as its context length allows; long notebooks need a larger setting in Ollama.
- In the browser version, the API key is kept in the browser's storage for files opened from this computer, and some services or local servers must allow web pages (see AI settings). The desktop app avoids that.
- Pictures on pages are stored inside the page’s file, so pages with many big pictures make big files.
- Screen sharing, video recording and 3D depend on the system’s web view and haven’t been tried on real Windows or macOS machines yet.
- No security policy (CSP) for the page yet; all rich text still goes through the sanitizer.
- `npm audit` warns about: `tar`/`canvas` (only used while installing, from pdf.js's optional Node add-on, never in the app); pdf.js 3.11.174 (malicious PDFs could run code, but only with `isEvalSupported`, which `24_sources_fc.js` turns off, the official fix); mammoth 1.6.0 (reads local files only in Node, not in a browser); SheetJS 0.18.5 (crafted spreadsheets; newer versions are no longer on npm or the allowed CDNs). Don't run `npm audit fix --force`: it jumps to pdf.js 6, which loads differently and would break PDF import. Updating pdf.js and SheetJS properly is a to-do.

**Claude version:**

- Two people editing the same text at once: the last change wins.
- The pad link and QR code point to the link in `INKLING_ONLINE_LINK` (`11b_platform.js`), because the page can't see its own claude.ai address. A copy of the artifact has a different link: “Wrong link? Change it” in the pad dialog fixes that. If Claude doesn't pass the `#pad=` part on, the other device gets the “Be the pad” offer instead (same account), or the code can be typed. Not yet tried on a real phone.
- Pages are limited to about 250 KB each, which is why big media lives in Files.
- Screen sharing may be blocked inside Claude’s page. The screen window then explains this, and a video or picture file still works.
- Recordings can be up to 5 minutes. Videos over 20 MB don’t fit Claude’s file storage and are kept in the browser only (the app says so). Long recordings make a sped-up GIF.
- 3D needs WebGL. Recordings are WebM; some Safari versions only make the GIF.
- Pages saved only in the browser keep pictures and recordings on that computer only.

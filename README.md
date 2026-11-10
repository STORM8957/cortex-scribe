# Cortex Scribe: study notebook

*Called Inkling until November 2026. Stored names keep the old name, so nothing is lost: the notes folder `Documents/Inkling`, the build file `inkling.html` and the backup marker.*

Start with **ARCHITECTURE.md**. If you work with Claude Code, it reads **CLAUDE.md** automatically.

Cortex Scribe runs in three ways from the same code:
- **Inside Claude**, as an artifact (`inkling.html`).
- **As a desktop app** on your own computer (Tauri). Your notes are saved as files in `Documents/Inkling`, and everything works without internet.
- **As a file in your browser**: double-click `inkling.html`. Notes are saved in that browser.

## Install it (for testers)

Download the installer for your computer from the **Releases** page of the GitHub repository (Assets): `…x64-setup.exe` for most Windows PCs, `…arm64-setup.exe` for Windows laptops with a Snapdragon chip, `.dmg` for a Mac. Double-click it; nothing else is needed. Windows may say “Windows protected your PC”: click **More info → Run anyway**. On a Mac, right-click the app → **Open** the first time. Or use the online version in a browser: https://claude.ai/artifact/AY4ibHNpV7EB3Kyptp6xsR

## Use AI outside Claude
Click **AI: not connected** at the bottom left and pick an AI:
- **Gemini (Google)**: has a free tier. Get a key at https://aistudio.google.com/apikey, paste it, press **Test**, then **Save**.
- **Claude (Anthropic)**, **ChatGPT (OpenAI)** or **OpenRouter**: paste an API key from their website (you pay per use).
- **Ollama** or **LM Studio**: free and private, the AI runs on your own computer (needs installing).

Your key stays on your computer. Details for developers: `docs/AI.md`.

## Draw on another screen
**Download as PDF:** the **PDF** button at the top (next to Share), View → **PDF**, or **Download as PDF** in a page's menu in the list. A4 pages keep their size and header and footer; an endless page is cut into A4 pages; a board becomes one page. The text in the PDF is a picture of the page (it can't be selected).

**Colours:** the colour rows show 5 basic colours (red, pink, blue, green, black); **More colours** or the rainbow button has all the others. View → Colours: black, white or navy blue.

**A4 pages** have a **Page setup** (View tab, or the Format panel): the size (A4, A3, A5, Letter, Legal), upright or sideways, the margins, a header and footer, and page numbers. Double-click in the top or bottom margin to write the header or footer, like in Word. The turn button next to a page turns only that page (for a wide table or chart).

Above the handwriting pad (pen icon on the right):
- **Settings** (⚙): what **Insert drawing** makes (a picture or pen lines), a white or see-through background, the pad size.
- Drag the **left edge of the panel** to make it wider, and the **bar under the pad** to make the pad taller.
- **↑ / ↓** choose the line (or the box on a board) that the pad writes into.
- **Other screen** turns a whole tab, window, phone or laptop into the drawing pad. On a phone or another computer this works in the online version (inside Claude): scan the QR code or open the link, signed in to the same Claude account, and press **Be the pad** when Cortex Scribe asks. Or press **Drawing pad** in the menu on the left and type the code.
- **A phone or tablet with the desktop app** (or the browser version): put the phone on the same Wi-Fi as the computer and scan the QR code under **Other screen**. The desktop app starts the pad link by itself (with the browser version, run `npm run pad` in this folder and leave it open). Windows asks once whether Node.js may use the network: allow it for private networks. School or café Wi-Fi sometimes keeps devices apart; then use your phone's hotspot.

## Link a Word document (experiment)

An A4 page and a Word document stay the same while you write in either: text, headings, lists and table cells go both ways. Pictures stay exactly as they are in Word (they show as boxes here), and your drawings, boxes and notes never change the Word file. It works in the desktop app and the browser version, not inside Claude. **Try it on a copy of a document first**: it has only been tested with a stand-in Word so far.

**Word link** in the menu on the left has everything in one place. In the desktop app you can search your Word files there: **Open and link** opens the document in Word and links it with a page by itself (the first time, press Cortex Scribe on Word's Home tab; after that the panel opens with the document).

1. Once, in this folder: `npm install`, then `npm run word:setup`. Windows asks once whether to trust a certificate for “localhost”: choose Yes. Close Word completely and open it again.
2. Each time: the **desktop app** (`npm run app`) starts the link by itself; open Cortex Scribe before Word. With the browser version instead, run `npm run word` and leave that window open (it asks once for the code shown there).
3. In Word: Home tab → **Cortex Scribe**. In Cortex Scribe: Home → Word link → **Open it here**.

What comes across: text, headings, lists, tables (with their cell colours), bold, italic, underline, struck-through text, text colours, highlights, alignment, the page size, orientation and margins, and the header and footer with page numbers. Pictures stay as they are in Word. A newer Word (Microsoft 365) also takes a page size or orientation changed in Cortex Scribe; an older one keeps its own (change it in Word: Layout).

To take the button out of Word again: `npm run word:remove`. How it works: ARCHITECTURE.md section 2e.

## Run the desktop app

### One-time setup

**Windows**
1. Install **Node.js** (the "LTS" version) from https://nodejs.org
2. Install **Rust** from https://rustup.rs (download `rustup-init.exe` and accept the defaults). If it asks for the "Visual Studio C++ Build Tools", let it install them and tick **Desktop development with C++**.
3. WebView2 is already part of Windows 10 and 11, so there's nothing to do for it.

**macOS**
1. Open Terminal and run `xcode-select --install` (Apple's developer tools).
2. Install **Node.js** (LTS) from https://nodejs.org
3. Install **Rust**: in Terminal run `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` and accept the defaults. Then close and reopen Terminal.

### Start it
Open a terminal in this folder (on Windows: right-click the folder → "Open in Terminal") and run:
```sh
npm install
npm run app
```
The first start takes a few minutes because Rust builds the app. Later starts are quick.

Building needs about **3 GB of free disk space** (the `src-tauri/target` folder). If it stops with “not enough space on the disk” (os error 112), free some space, delete `src-tauri/target` (or run `cargo clean` inside `src-tauri`) and start again. Old copies of the Cortex Scribe folder each have their own `target` folder, so delete those first.

Normal Windows PCs (x64) and Windows on ARM (Snapdragon laptops) both work with the setup above: the app uses Windows' own encryption, so no extra compiler (clang) is needed. An installer is made for the kind of computer it was built on, so build it on each computer. (Windows on ARM can also run the x64 installer.)

### Make an installer
```sh
npm run app:build
```
The installer is then in `src-tauri/target/release/bundle/` (`.msi` / `.exe` on Windows, `.dmg` / `.app` on macOS).

### Move your notes over
1. In the Claude version: **Backup and move → Export everything**. This saves an `inkling-backup-….json` file.
2. In the desktop app: **Backup and move → Import a backup**, and pick that file.

Your notes are then in `Documents/Inkling` (`data/` for pages, `media/` for recordings). Hover over "Saved" at the top to see the exact folder.

## Work on the code
```sh
git init && git add -A && git commit -m "Cortex Scribe"
sh build.sh                      # builds inkling.html from src/ (or: npm run build)
pip install -r requirements.txt  # for the tests
python3 -m playwright install chromium
npm install                      # local copies of three.js and co., used by test4 and the app
npm run docs:ai                  # after changing src/11d_ai_tasks.js: updates the task table in docs/AI.md
sh tests/run_all.sh              # runs all browser tests
```
Open `inkling.html` in a browser to use it without installing anything (notes are then saved in that browser).

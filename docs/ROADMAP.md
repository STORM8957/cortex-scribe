# Cortex Scribe: priorities (pinned, November 2026)

Agreed with Kawi as the order of work from here on. New features come after these unless he decides otherwise.

1. **Reliability first:** real phone and tablet tests, never losing data, sync between your devices.
2. **The study loop:** subjects, projects, calendar and the coach (designs in `docs/design/PROJECTS.md` and `docs/design/SUBJECTS.md`).
3. **Imports from OneNote, Goodnotes and Word,** so others can switch.
4. **Keep it simple:** good defaults, with advanced things hidden until you need them.
5. **Real users:** get 5–10 classmates to use it for one semester and fix what annoys them. That will teach us more than any new feature.

> You're building something with a real chance of being different. Whether it becomes the best will depend less on new features than on whether it's reliable and simple enough for real students to use every day.

## Where the other apps are (November 2026)

- **Notability:** Learn (summaries, quizzes, flashcards) and Note Replay (handwriting linked to audio).
- **Goodnotes:** handwriting with AI spellcheck and maths help, plus Study Sets (flashcards and quizzes from notes).
- **RemNote:** notes plus spaced repetition and an AI tutor.
- **OneNote:** Copilot, but no built-in quizzes.
- **3D and notes:** only as separate Blender add-ons and web tools.
- **Nobody found doing all of these together:** the study loop (notes → Learn → plan → test → grade → feedback), AI fact checking against your own sources, live 3D, and any AI.

## Planned connections (later), by value

- **Obsidian:** Markdown both ways.
- **Word link (Kawi's idea, November 2026):** an A4 page linked to a Word document. Text, headings, lists, tables and pictures stay the same in both; the notes features (drawings, boxes, 3D, tags, recordings) live only in Cortex Scribe, attached to paragraphs, and never change the Word file. No AI needed: it's plain code.
  0. **Built (November 2026), as an experiment:** the live link for text, headings and lists, typable tables, pictures as locked boxes, a Word link card on Home and merging after the link was off (ARCHITECTURE.md 2e); tried with Kawi's real Word. Then: formatting (bold, italic, underline, strikethrough), text colours, highlights, alignment, cell colours, Word's page size, orientation and margins, and the header and footer with page numbers (A4 pages got a Page setup for this); tested with the stand-in Word, next on the real one.
  1. Open and save .docx (also the Word import of priority 3). Word locks a file while it's open, so here you take turns: save in one, the other reloads.
  2. Live link: a small Word add-in (Office.js, runs inside Word for Windows, Mac and the web) that talks to the desktop app. It sends Word's changes per paragraph and applies ours, so both update while you type.
  - Word features Cortex Scribe doesn't understand (footnotes, tracked changes, comments, fields other than page numbers, equations) are kept untouched, never deleted. Page breaks may fall differently than in Word.
  3. Word mode: one click swaps our ribbon for a Word-style ribbon (Home, Insert, Layout, References, Review; our own icons, not copies of Microsoft's). Buttons act on the page, or are carried out by the real Word through the add-in (table of contents, tracked changes and other things only Word can do) and the result comes back. One click back to the notes ribbon.
  4. Exact view (optional): the document as Word lays it out (Word gives the add-in a PDF), refreshed after changes, to draw on and check before printing; typing stays on the normal page.
  - Not possible: the real Word ribbon or real Word editing inside our window (Microsoft allows that only to partner companies with a contract), and mirroring the Word window while sending clicks to it (laggy and fragile).
  - Typing in the same paragraph in both at the same moment needs a rule (last change wins at first, Yjs later). Desktop app only: the Claude version can't reach Word. Must be tried on a real Word (not possible in Claude's cloud).
- **OneNote:** import, which matters most for switching.
- **Blender and Unity:** .glb export first; a live link later, through the desktop app.
- **Unique idea:** quizzes on the 3D model itself ("click the mitochondrion").

## Assessment (November 2026)

| | Score | Why |
|---|---|---|
| Concept | 8/10 | Different: the study loop, AI checked against your own sources, any AI, local-first. Risk: too broad. |
| Making money | 4/10 today | Students pay little, and OneNote and Obsidian are free. Better with paid sync, AI credits or school licences. |
| Going big | 2–3/10 for "big"; 4–5/10 for a solid niche | Most apps never get big; no iPad app or sync yet; one developer. Real users and reliability raise it most. |

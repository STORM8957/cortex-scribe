/* ================= AI TASKS: every job Cortex Scribe gives an AI =================
   This list is the contract between the app and any AI model. Each feature passes its task id with every
   request (AI.text(prompt, { task: 'factcheck', … })). The connector (11c_ai.js) then:
     - tells the model what the request is for (`does`) and, for JSON jobs, the exact shape (`output`),
     - checks the answer with `check` and asks the model once more if the shape is wrong.
   Inside Claude the same ids are carried but not needed.

   Fields
     name     short name               feature  where in the app the student starts it
     code     where the request is built (file and function)
     does     what the model must do, in one or two sentences (sent to the model)
     input    what the request contains
     output   the answer: plain text, Markdown, HTML, SVG, or a JSON shape (sent to the model for JSON jobs)
     json     true if the answer is JSON (requested with AI.json)
     tier     'quick' or 'default' (which model in AI settings answers)
     images   'no', 'optional' (sent when the model can read pictures) or 'required' (the job needs them)
     check    (answer) → true if the JSON has the right shape. Keep checks loose; the feature validates details.

   To add an AI feature: add a task here, pass its id, and add it to docs/AI.md.
   Test 20 fails when a request in src/ has no task id or uses an unknown one. */
const AI_TASKS = {
  'ai.test': {
    name: 'Connection test', feature: 'AI settings → Test', code: '11c_ai.js AIConn.test',
    does: 'Check that the connection works.', input: 'one short instruction', output: 'the word OK', tier: 'default', images: 'no',
  },
  'pad.read': {
    name: 'Read the handwriting pad', feature: 'Handwriting pad (right panel)', code: '21_panels.js recognize',
    does: 'Read the handwritten word or line in the picture and type it exactly as written.',
    input: 'one picture of handwriting (dark strokes on white)', output: 'only the text, or <none> if nothing can be read', tier: 'quick', images: 'required',
  },
  'ink.read': {
    name: 'Handwriting on the page to text', feature: 'Draw → Writing → text, Tidy up → Handwriting', code: '22_ai.js handwritingToText',
    does: 'Transcribe each attached handwriting picture exactly as written, one text per picture, in the same order.',
    input: 'up to 8 pictures of handwriting', output: '{"texts": ["…", "…"]} with one entry per picture ("" for a drawing)', json: true, tier: 'default', images: 'required',
    check: (d) => Array.isArray(d.texts),
  },
  'tidy.page': {
    name: 'Tidy up page text', feature: 'Tidy up (spelling, layout, translate)', code: '22_ai.js aiRewriteHTML',
    does: 'Rewrite the HTML of a page as the rules in the request say (fix spelling, improve layout or translate), keeping every [[IMG:n]] placeholder and every data-k element.',
    input: 'rules and the page as HTML', output: 'only the HTML, allowed tags listed in the request', tier: 'quick or default', images: 'no',
  },
  'tidy.boxes': {
    name: 'Tidy up boxes', feature: 'Tidy up (spelling, translate)', code: '22_ai.js aiRewriteBoxes',
    does: 'Rewrite the HTML inside each box as the rules in the request say and return every box with its id.',
    input: 'rules and a JSON list of boxes', output: '{"items": [{"id": "…", "html": "…"}]}', json: true, tier: 'default', images: 'no',
    check: (d) => Array.isArray(d.items),
  },
  'magic.chart': {
    name: 'Magic box: diagram', feature: 'Magic box → Diagram', code: '23b_magic.js magicCreate',
    does: 'Turn the numbers in the content into chart data.',
    input: 'the text inside the box (and pictures)', output: '{"title": "…", "cats": ["…"], "series": [{"name": "…", "vals": [0]}], "unit": "…", "prefix": "…"}, or {"cats": []} if there are no numbers', json: true, tier: 'default', images: 'optional',
    check: (d) => Array.isArray(d.cats),
  },
  'magic.mindmap': {
    name: 'Magic box: mind map', feature: 'Magic box → Mind map', code: '23b_magic.js magicCreate',
    does: 'Make a mind map of the content: one central topic with branches and short children.',
    input: 'the text inside the box (and pictures)', output: '{"center": "…", "branches": [{"label": "…", "children": [{"label": "…", "children": ["…"]}]}]}', json: true, tier: 'default', images: 'optional',
    check: (d) => !!d.center,
  },
  'magic.table': {
    name: 'Magic box: table', feature: 'Magic box → Table', code: '23b_magic.js magicCreate',
    does: 'Organise the content as a table with clear columns.',
    input: 'the text inside the box (and pictures)', output: '{"headers": ["…"], "rows": [["…"]]}', json: true, tier: 'default', images: 'optional',
    check: (d) => Array.isArray(d.rows),
  },
  'magic.sticky': {
    name: 'Magic box: sticky notes', feature: 'Magic box → Sticky notes', code: '23b_magic.js magicCreate',
    does: 'Split the content into a few key ideas, each short enough for a sticky note.',
    input: 'the text inside the box (and pictures)', output: '{"notes": ["…"]}', json: true, tier: 'default', images: 'optional',
    check: (d) => Array.isArray(d.notes),
  },
  'magic.text': {
    name: 'Magic box: summary, explanation or translation', feature: 'Magic box → Summary / Explain / Translate', code: '23b_magic.js magicCreate',
    does: 'Summarise, explain or translate the content as the request says.',
    input: 'the text inside the box (and pictures)', output: 'Markdown, starting with a “## ” heading for summaries and explanations', tier: 'default', images: 'optional',
  },
  'factcheck': {
    name: 'Fact check', feature: 'Fact check tab', code: '24_sources_fc.js runFactCheck',
    does: 'Check the factual statements in the student’s notes against the sources (or general knowledge) and give a verdict for each.',
    input: 'the notes, the sources and their pictures', output: '{"summary": "…", "claims": [{"quote": "…", "verdict": "correct|partly|incorrect|unsupported", "why": "…", "fix": "…", "source": "…", "evidence": "…"}]}', json: true, tier: 'default', images: 'optional',
    check: (d) => Array.isArray(d.claims),
  },
  'chat': {
    name: 'Chat about notes', feature: 'Chat tab', code: '25_chat_learn.js sendChat',
    does: 'Answer the student’s questions about their own notes and sources, short and clear.',
    input: 'the notes and sources in the first message, then the conversation', output: 'Markdown (short paragraphs, bullet points, **bold** key terms), streamed', tier: 'default', images: 'optional',
  },
  'page.edit': {
    name: 'Edit the page', feature: 'Chat tab with “Can edit the page” on', code: '50_ai_edit.js sendAiEdit',
    does: 'Change the student’s open page as they ask (fix, rewrite, shorten, translate, fill in, add or remove parts) and say in one or two sentences what was changed; or just answer a question.',
    input: 'the page as parts with ids (paragraphs b1…, table cells b4.r0.c1, boxes o1…, mind map ideas m1.0…), what is selected, the recent conversation, the request, and the sources when switched on',
    output: '{"reply": "…", "edits": [{"op": "set", "id": "b2", "text": "…"}, {"op": "add", "after": "b2", "kind": "p|h1|h2|h3|li|ol", "text": "…"}, {"op": "delete", "id": "b3"}]}', json: true, tier: 'default', images: 'no',
    check: (d) => !!d && typeof d.reply === 'string' && Array.isArray(d.edits),
  },
  'learn.summary': {
    name: 'Learn: summary', feature: 'Learn tab → Summary', code: '25_chat_learn.js runLearn',
    does: 'Write a study summary of the notes: overview, key points and key terms.',
    input: 'the notes (and pictures)', output: '{"title": "…", "lang": "…", "overview": "…", "keyPoints": ["…"], "terms": [{"term": "…", "meaning": "…"}]}', json: true, tier: 'default', images: 'optional',
    check: (d) => KINDS.summary.check(d),
  },
  'learn.cards': {
    name: 'Learn: flashcards', feature: 'Learn tab → Flashcards', code: '25_chat_learn.js runLearn',
    does: 'Make flashcards that test the important facts in the notes.',
    input: 'the notes (and pictures)', output: '{"title": "…", "cards": [{"front": "…", "back": "…"}]}', json: true, tier: 'default', images: 'optional',
    check: (d) => KINDS.cards.check(d),
  },
  'learn.quiz': {
    name: 'Learn: quiz', feature: 'Learn tab → Quiz', code: '25_chat_learn.js runLearn',
    does: 'Write multiple-choice questions about the notes, each with 4 options and the index of the correct one.',
    input: 'the notes (and pictures)', output: '{"title": "…", "questions": [{"question": "…", "options": ["…", "…", "…", "…"], "answer": 0, "explain": "…"}]}', json: true, tier: 'default', images: 'optional',
    check: (d) => KINDS.quiz.check(d),
  },
  'learn.map': {
    name: 'Learn: mind map', feature: 'Learn tab → Mind map', code: '25_chat_learn.js runLearn',
    does: 'Make a mind map of the notes: one central topic, branches and short details.',
    input: 'the notes (and pictures)', output: '{"center": "…", "branches": [{"label": "…", "children": ["…"]}]}', json: true, tier: 'default', images: 'optional',
    check: (d) => KINDS.map.check(d),
  },
  'sketch.svg': {
    name: 'Drawing to picture', feature: 'Handwriting pad → Drawing → picture, Magic box → Picture', code: '28b_3d.js sketchToSVG',
    does: 'Turn the attached rough sketch into a clean SVG illustration of the same subject and composition.',
    input: 'a picture of the sketch (and maybe a style picture)', output: 'only one standalone <svg> element, rules in the request', tier: 'default', images: 'required',
  },
  'sketch.detail': {
    name: 'Picture: add more detail', feature: 'Handwriting pad → Add more detail', code: '28b_3d.js padToImage',
    does: 'Add detail to the SVG illustration in the request, keeping subject, composition and colours.',
    input: 'the SVG code', output: 'only one standalone <svg> element', tier: 'default', images: 'no',
  },
  'model3d.create': {
    name: 'Make a 3D model', feature: '3D studio, Make it a 3D model, Magic box → 3D', code: '28b_3d.js gen3D',
    does: 'Build a simple 3D model from basic parts (boxes, spheres, extruded outlines …) as described in the request.',
    input: 'a description, sketch strokes as points and maybe pictures', output: '{"name": "…", "parts": [{"type": "box", …}]} with the part fields listed in the request', json: true, tier: 'default', images: 'optional',
    check: (d) => Array.isArray(d.parts),
  },
  'model3d.edit': {
    name: 'Change a 3D model', feature: '3D window → Cmd, 3D studio → Add more detail', code: '28b_3d.js aiChangeScene',
    does: 'Change the 3D model in the request as asked and return the whole updated model.',
    input: 'the model as JSON and the change', output: '{"name": "…", "parts": [ … ]}', json: true, tier: 'default', images: 'no',
    check: (d) => Array.isArray(d.parts),
  },
  'magic.custom': {
    name: 'Magic box: your own button', feature: 'Magic box → your own buttons and “just this once” rules', code: '23b_magic.js magicCreate',
    does: 'Do with the content inside the Magic box exactly what the student’s own rule says (for example: turn it into flashcards, list the key dates, write three exam questions).',
    input: 'the content inside the box (text, maybe pictures) and the student’s rule', output: 'Markdown text: the result only', json: false, tier: 'default', images: 'optional',
  },
  'model3d.photo': {
    name: 'A 3D model from a photo', feature: '3D studio → From a photo', code: '28b_3d.js gen3D',
    does: 'Look at the photo and build a simple 3D model of its main object from basic parts, matching its shape, proportions and colours.',
    input: 'a photo', output: '{"name": "…", "parts": [{"type": "box", …}]} with the part fields listed in the request', json: true, tier: 'default', images: 'required',
    check: (d) => Array.isArray(d.parts),
  },
  'model3d.dissect': {
    name: 'Take a 3D model apart', feature: '3D window → Dissect', code: '38_3dparts.js dissectWin',
    does: 'Sort the numbered parts of a 3D model into the real pieces the object would come apart into (for an engine: block, pistons, crankshaft …) and give each piece a short name.',
    input: 'the model as a list of numbered parts', output: '{"pieces": [{"name": "…", "parts": [0, 3, 4]}]}: every part number in exactly one piece', json: true, tier: 'default', images: 'no',
    check: (d) => Array.isArray(d.pieces) && d.pieces.length > 0 && d.pieces.every((p) => p && Array.isArray(p.parts)),
  },
  'model3d.internals': {
    name: 'Design the inside of a 3D model', feature: '3D window → Create internal components', code: '38_3dparts.js internalsWin',
    does: 'Design the internal components of the object (for an engine: pistons, crankshaft, valves …) as extra named parts that fit inside its outer shape.',
    input: 'the model as JSON and the space inside it', output: '{"parts": [{"type": "…", "name": "…", …}]} with the part fields listed in the request', json: true, tier: 'default', images: 'no',
    check: (d) => Array.isArray(d.parts) && d.parts.length > 0,
  },
};

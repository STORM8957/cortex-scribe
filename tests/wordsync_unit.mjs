// Unit checks for the Word link core (src/48_wordsync.js): the three-way merge and two clients syncing through a
// stand-in bridge with random delays. Run: node tests/wordsync_unit.mjs (prints "WORDSYNC OK" or the failures).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WordSync = new Function(readFileSync(join(root, 'src/48_wordsync.js'), 'utf8') + '\nreturn WordSync;')();
const P = (...ts) => ts.map((t) => (typeof t === 'string' ? { k: 'p', t } : t));
const txt = (d) => d.map((p) => (p.k === 'p' ? '' : p.k + ':') + p.t).join(' | ');
const fails = [];
const check = (name, got, want) => { if (got !== want) fails.push(name + '\n   got:  ' + got + '\n   want: ' + want); else console.log('ok  ', name, '→', got); };

// merges
let r = WordSync.merge3(P('A', 'B', 'C'), P('A', 'B1', 'C'), P('A', 'B', 'X', 'C'));
check('one side edits, the other adds after it', txt(r.doc) + ' / ' + r.conflicts, 'A | B1 | X | C / 0');
r = WordSync.merge3(P('A', 'B', 'C'), P('A', 'B1', 'C'), P('A', 'B2', 'C'), 'mine');
check('both edit the same paragraph: mine wins', txt(r.doc) + ' / ' + r.conflicts, 'A | B1 | C / 1');
r = WordSync.merge3(P('A', 'B', 'C'), P('A', 'B1', 'C'), P('A', 'B2', 'C'), 'theirs');
check('both edit the same paragraph: theirs wins', txt(r.doc), 'A | B2 | C');
r = WordSync.merge3(P('A', 'B', 'C'), P('A', 'C'), P('A', 'B', 'C', 'D'));
check('delete on one side, add at the end on the other', txt(r.doc), 'A | C | D');
r = WordSync.merge3(P('A'), P('A', 'M'), P('A', 'T'));
check('both add at the same place: both kept', txt(r.doc) + ' / ' + r.conflicts, 'A | M | T / 0');
r = WordSync.merge3(P('A'), P('A', 'S'), P('A', 'S'));
check('both add the same paragraph: once', txt(r.doc), 'A | S');
r = WordSync.merge3(P('A', 'B', 'C', 'D'), P('A1', 'B', 'C', 'D'), P('A', 'B', 'C', 'D1'));
check('edits at both ends', txt(r.doc), 'A1 | B | C | D1');
r = WordSync.merge3(P('A', 'B'), P('A', { k: 'h1', t: 'B' }), P('A', 'B', { k: 'li', t: 'x' }));
check('a heading and a new list item', txt(r.doc), 'A | h1:B | li:x');
const TB = (...rows) => ({ k: 'table', rows });
r = WordSync.merge3(P('A', TB(['x', ''], ['y', ''])), P('A', TB(['x', 'meine Antwort'], ['y', ''])), P('A', TB(['x', ''], ['y', 'aus Word'])));
check('a table: different cells on both sides, both kept', JSON.stringify(r.doc[1].rows) + ' / ' + r.conflicts, '[["x","meine Antwort"],["y","aus Word"]] / 0');
r = WordSync.merge3(P(TB(['a'])), P(TB(['mine'])), P(TB(['theirs'])), 'mine');
check('a table: the same cell on both sides, mine wins', JSON.stringify(r.doc[0].rows) + ' / ' + r.conflicts, '[["mine"]] / 1');
r = WordSync.merge3(P(TB(['Frage 1', ''], ['Frage 2', ''])), P(TB(['Frage 1', 'Antwort'], ['Frage 2', ''])), P(TB(['Neu', ''], ['Frage 1', ''], ['Frage 2', ''])));
check('Word adds a row above while a cell is typed here: Word’s rows, and the answer stays in its row', JSON.stringify(r.doc[0].rows) + ' / ' + r.conflicts, '[["Neu",""],["Frage 1","Antwort"],["Frage 2",""]] / 0');
r = WordSync.merge3(P('A', { k: 'p', t: 'T', lock: 'table' }, 'C'), P('A', 'C'), P('A', { k: 'p', t: 'T', lock: 'table' }, 'C2'));
check('a locked table removed on one side', txt(r.doc), 'A | C2');
check('norm cleans line breaks and nbsp', JSON.stringify(WordSync.norm([{ k: 'zz', t: 'a b\nc\u000bd' }])), '[{"k":"p","t":"a b c d"}]');

// formatting, alignment, cell colours, the page setup, header and footer
const W = (t, r, a) => Object.assign({ k: 'p', t }, r ? { r } : {}, a ? { a } : {});
let n = WordSync.norm([{ k: 'ft', t: 'Seite {PAGE}' }, W('Hallo  schöne Welt', [[1, 'b'], [1, 'c=#FF0000;i'], [9, 'zz']]), { k: 'hd', t: 'Kopf' }, { k: 'setup', ps: { w: 595.3, h: 841.9, o: 'p' } }, { k: 'hd', t: '  ' }]);
check('norm: setup, header, text, footer in that order; runs cleaned; empty header lines left out', n.map((x) => x.k + (x.r ? JSON.stringify(x.r) : '')).join(' '), 'setup hd p[[1,"b"],[1,"i;c=#ff0000"]] ft');
check('words: the spaces belong to the word before', JSON.stringify(WordSync.words('  Hallo  Welt ')), '["  ","Hallo  ","Welt "]');
check('a paragraph that is only plain has no runs', JSON.stringify(WordSync.norm([W('a b', [[2, '']])])[0].r), undefined);
r = WordSync.merge3([W('A'), W('B')], [W('A', [[1, 'b']]), W('B')], [W('A'), W('B2')]);
check('bold on one side, typing in another paragraph on the other: both kept', r.doc.map((x) => x.t + (x.r ? '*' : '')).join(' | ') + ' / ' + r.conflicts, 'A* | B2 / 0');
r = WordSync.merge3([W('A')], [W('A', null, 'c')], [W('A', [[1, 'c=#00b050']])], 'mine');
check('alignment here and colour in Word on the same paragraph: the typing side wins', JSON.stringify(r.doc[0]) + ' / ' + r.conflicts, '{"k":"p","t":"A","a":"c"} / 1');
const TS = (rows, sh) => ({ k: 'table', rows, sh });
r = WordSync.merge3([TS([['a', 'b']])], [TS([['a1', 'b']])], [TS([['a', 'b']], [['', '#ffc000']])]);
check('a cell typed here and a cell coloured in Word: both kept', JSON.stringify(r.doc[0].rows) + ' ' + JSON.stringify(r.doc[0].sh) + ' / ' + r.conflicts, '[["a1","b"]] [["","#ffc000"]] / 0');
r = WordSync.merge3([TS([['a', 'b']], [['#d9e2f3', '']])], [TS([['a', 'b'], ['c', 'd']], [['#d9e2f3', ''], ['', '']])], [TS([['a', 'b2']], [['#d9e2f3', '']])]);
check('a row added in Word keeps the colours', JSON.stringify(r.doc[0].rows) + ' ' + JSON.stringify(r.doc[0].sh), '[["a","b2"],["c","d"]] [["#d9e2f3",""],["",""]]');
const ST = (w, h, o) => ({ k: 'setup', t: '', ps: { w, h, o } });
r = WordSync.merge3([ST(595.3, 841.9, 'p'), W('A')], [ST(841.9, 595.3, 'l'), W('A')], [ST(595.3, 841.9, 'p'), W('A'), W('B')]);
check('turned sideways on one side, a new paragraph on the other', r.doc.map((x) => x.k === 'setup' ? x.ps.o : x.t).join(' | ') + ' / ' + r.conflicts, 'l | A | B / 0');
r = WordSync.merge3([{ k: 'hd', t: 'Kopf' }, W('A'), { k: 'ft', t: '{PAGE}' }], [{ k: 'hd', t: 'Kopf 2026' }, W('A'), { k: 'ft', t: '{PAGE}' }], [{ k: 'hd', t: 'Kopf' }, W('A'), W('Z'), { k: 'ft', t: '{PAGE}' }]);
check('the header changed here, a paragraph added at the end in Word: the footer stays last', txt(r.doc), 'hd:Kopf 2026 | A | Z | ft:{PAGE}');

// two clients and a stand-in bridge, with random delays and both sides typing
function rng(seed) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }
async function simulate(seed) {
  const rand = rng(seed);
  const bridge = { ver: 1, doc: P('Titel', 'Erster Absatz', 'Zweiter Absatz'), hist: new Map(), clients: [] };
  bridge.hist.set(1, bridge.doc);
  // like a real connection: random delays, but each side gets the bridge's messages in order
  const deliver = (c, msg) => { c.q = (c.q || Promise.resolve()).then(() => new Promise((res) => setTimeout(() => { c.client.receive(msg); res(); }, Math.floor(rand() * 30)))); };
  const onPush = (msg) => {
    const base = bridge.hist.get(msg.base) || bridge.doc;
    const r = WordSync.merge3(base, msg.doc, bridge.doc, 'mine');
    bridge.ver++; bridge.doc = r.doc; bridge.hist.set(bridge.ver, r.doc);
    for (const c of bridge.clients) deliver(c, { type: 'doc', ver: bridge.ver, doc: r.doc, by: msg.by });
  };
  const side = (name) => {
    const s = { name, doc: P('Titel', 'Erster Absatz', 'Zweiter Absatz') };
    s.client = WordSync.makeClient({ base: s.doc, read: async () => s.doc, write: async (t) => { s.doc = t; }, send: (m) => { s.out = (s.out || Promise.resolve()).then(() => new Promise((res) => setTimeout(() => { onPush(m); res(); }, Math.floor(rand() * 30)))); } });
    bridge.clients.push(s); return s;
  };
  const a = side('app'), w = side('word');
  for (const c of bridge.clients) c.client.receive({ type: 'doc', ver: 1, doc: bridge.doc });
  const edits = [];
  for (let step = 0; step < 40; step++) {
    const s = rand() < 0.5 ? a : w, d = s.doc.slice(), i = Math.floor(rand() * (d.length + 1)), op = rand();
    if (op < 0.45 && d.length) { const j = Math.min(i, d.length - 1); d[j] = { ...d[j], t: d[j].t + ' ' + s.name + step }; edits.push(s.name + step); }
    else if (op < 0.8) { d.splice(i, 0, { k: rand() < 0.2 ? 'h2' : 'p', t: 'neu ' + s.name + step }); edits.push(s.name + step); }
    else if (d.length > 1) d.splice(Math.min(i, d.length - 1), 1);
    s.doc = d; s.client.changed(Math.floor(rand() * 40));
    await new Promise((res) => setTimeout(res, Math.floor(rand() * 25)));
  }
  for (let k = 0; k < 60 && !(WordSync.same(a.doc, w.doc) && WordSync.same(a.doc, bridge.doc)); k++) {
    a.client.changed(0); w.client.changed(0);
    await new Promise((res) => setTimeout(res, 60));
  }
  return { same: WordSync.same(a.doc, w.doc) && WordSync.same(a.doc, bridge.doc), paras: a.doc.length };
}
// a page that was just linked (no history) takes Word's document and doesn't push its empty start
{
  let pushed = null, page = P('');
  const c = WordSync.makeClient({ base: null, waitForDoc: true, read: async () => page, write: async (t) => { page = t; }, send: (m) => { pushed = m; } });
  c.changed(0); await new Promise((r) => setTimeout(r, 30));
  const before = pushed;
  await c.receive({ type: 'doc', ver: 3, doc: P('Titel', 'Text aus Word') });
  c.changed(0); await new Promise((r) => setTimeout(r, 30));
  check('a new link takes Word’s text and pushes nothing', txt(page) + ' / ' + (before ? 'pushed before' : 'waited') + ' / ' + (pushed ? 'pushed after' : 'nothing to push'), 'Titel | Text aus Word / waited / nothing to push');
}
const sims = [];
for (const seed of [1, 7, 42, 99, 2026, 5, 13, 77, 123, 999]) sims.push(await simulate(seed));
check('10 random sessions with both sides typing end up the same everywhere', String(sims.every((s) => s.same)) + ' (' + sims.map((s) => s.paras).join(',') + ' paragraphs)', 'true (' + sims.map((s) => s.paras).join(',') + ' paragraphs)');
console.log(fails.length ? 'WORDSYNC FAILED\n' + fails.join('\n') : 'WORDSYNC OK');
process.exitCode = fails.length ? 1 : 0;

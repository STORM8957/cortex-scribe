# The AI editor (50_ai_edit.js): with “Can edit the page” on, the chat sends the page as parts with ids and applies the
# AI's edits: a fixed paragraph (formatting elsewhere in it kept), a new paragraph, a deleted one, a table cell, a note
# box, a mind map idea, a new note box after a box; unknown ids and locked parts are left alone; the page history gets
# “Before the AI edit”; the message's Undo puts everything back; a question only gets an answer; with the switch off
# the normal chat answers. Uses a stand-in AI inside Claude.
import os, pathlib, json
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio
from playwright.async_api import async_playwright

MOCK = r"""
(() => {
  window.__prompts = [];
  const id = (p, re) => { const m = p.match(re); return m ? m[1] : null; };
  const sample = async (input) => ({ text: 'Das ist die normale Chat-Antwort.', truncated: false });
  sample.json = async (input) => {
    const p = typeof input === 'string' ? input : JSON.stringify(input);
    window.__prompts.push(p);
    if (/Was bedeutet/.test(p.split('The student asks:').pop())) return { reply: 'Mitose ist die Kernteilung.', edits: [] };
    const fix = id(p, /\[(b\d+)\] p: Die Zele/), end = id(p, /\[(b\d+)\] p: Ende\./), cell = id(p, /\[(b\d+\.r0\.c1)\] /), note = id(p, /\[(o\d+)\] note box: Notiz/), idea = id(p, /\[(m\d+\.\d+)\] idea: Idee/), lock = id(p, /\[(b\d+)\] \(locked/);
    return { reply: 'Ich habe den Tippfehler korrigiert und die Tabelle ergänzt.', edits: [
      { op: 'set', id: fix, text: 'Die Zelle teilt sich wichtig in zwei Zellen.' },
      { op: 'add', after: fix, kind: 'p', text: 'Neuer Satz von der KI.' },
      { op: 'delete', id: end },
      { op: 'set', id: cell, text: 'Dauer' },
      { op: 'set', id: note, text: 'Notiz von der KI' },
      { op: 'add', after: note, text: 'Zweite Notiz' },
      { op: 'set', id: idea, text: 'Neue Idee' },
      { op: 'set', id: lock, text: 'darf nicht passieren' },
      { op: 'set', id: 'b999', text: 'unbekannt' },
      { op: 'explode', id: fix },
    ] };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 5e6, mediaTypes: ['image/png', 'image/jpeg'] } });
  window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
  // a notebook with one A4 page: heading, a paragraph with a typo (and bold), a list, a table, a locked Word picture, a note box and a mind map
  if (!localStorage.getItem('inkling:data:tree')) {
    const t = Date.now();
    localStorage.setItem('inkling:data:tree', JSON.stringify({ v: 2, nodes: {
      fnb1: { id: 'fnb1', type: 'folder', name: 'Bio', parent: null, order: 1, created: t, updated: t },
      npg1: { id: 'npg1', type: 'note', name: 'Zellteilung', parent: 'fnb1', kind: 'a4', order: 2, created: t, updated: t } } }));
    localStorage.setItem('inkling:data:note_npg1', JSON.stringify({ v: 2, kind: 'a4', bg: 'blank', margin: false, mu: t, fu: [t],
      flows: ['<h1>Zellteilung</h1><p>Die Zele teilt sich <b>wichtig</b>.</p><ul><li>Prophase</li></ul><table><tbody><tr><td>Phase</td><td></td></tr></tbody></table><p class="wlock" data-wlock="picture" data-wt="Bild" contenteditable="false">Picture in Word: Bild</p><p>Ende.</p>'],
      objs: {
        on1: { id: 'on1', t: 'note', x: 120, y: 760, w: 260, h: 60, ah: true, html: '<p>Notiz</p>', name: 'Note box 1', z: 1, u: t },
        om1: { id: 'om1', t: 'mm', x: 420, y: 760, w: 300, h: 160, name: 'Mind map 1', z: 2, u: t, tree: { id: 'mr', text: 'Thema', ch: [{ id: 'mc', text: 'Idee', ch: [] }] } } } }));
    localStorage.setItem('inkling:pref:last', JSON.stringify('npg1'));
  }
})();
"""
FLOW = "[...document.querySelectorAll('.flow')].map(f => f.innerText).join('\\n')"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(MOCK)
        await pg.goto(APP); await pg.wait_for_timeout(1200)
        opened = await pg.evaluate("document.getElementById('crumbs').innerText.includes('Zellteilung')")
        await pg.click('#rail button[data-ptab="chat"]'); await pg.wait_for_timeout(300)
        switch = await pg.evaluate("[!!document.getElementById('chatEdit'), document.getElementById('chatEdit').checked, document.getElementById('chatIn').placeholder]")
        print('page open:', opened, '| switch (there, on, hint):', switch)

        # first some typing of your own (so the page history has a version from when it was opened)
        await pg.click('.flow li'); await pg.keyboard.press('End'); await pg.keyboard.type(' und Metaphase'); await pg.wait_for_timeout(1500)

        # 1. tell the AI what to change
        await pg.fill('#chatIn', 'Korrigiere den Tippfehler und fülle die Tabelle aus'); await pg.click('#chatSend')
        await pg.wait_for_selector('.ai-edit-line', timeout=8000)
        prompt = await pg.evaluate("window.__prompts[window.__prompts.length - 1]")
        shown = ['[b1] h1: Zellteilung' in prompt, 'table:' in prompt and '.r0.c1]' in prompt, '(locked' in prompt, 'note box: Notiz' in prompt, 'idea: Idee' in prompt, 'The student asks: Korrigiere' in prompt]
        print('the AI gets the page as parts (heading, table cells, locked, box, mind map, the request):', shown)
        await pg.wait_for_timeout(1500)   # saving waits a moment after a change
        text = await pg.evaluate(FLOW)
        para = await pg.evaluate("[...document.querySelectorAll('.flow p')].find(p => p.textContent.startsWith('Die Zelle')).innerHTML")
        cell = await pg.evaluate("document.querySelector('.flow table').rows[0].cells[1].textContent")
        locked = await pg.evaluate("document.querySelector('.flow p.wlock').textContent")
        data = await pg.evaluate("JSON.parse(localStorage.getItem('inkling:data:note_npg1'))")
        notes = sorted(o.get('html', '') for o in data['objs'].values() if o.get('t') == 'note' and not o.get('del'))
        idea = [c['text'] for o in data['objs'].values() if o.get('t') == 'mm' for c in o['tree']['ch']]
        line = await pg.inner_text('.ai-edit-line')
        reply = await pg.evaluate("[...document.querySelectorAll('#msgs .msg.assistant')].pop().innerText")
        print('fixed paragraph:', 'Die Zelle teilt sich wichtig in zwei Zellen.' in text, '| bold kept:', '<b>wichtig</b>' in para, para[:90])
        print('new paragraph after it:', text.index('Neuer Satz von der KI.') > text.index('Die Zelle teilt sich') if 'Neuer Satz von der KI.' in text else False, '| deleted:', 'Ende.' not in text, '| table cell:', cell, '| locked untouched:', locked)
        print('note box:', notes, '| mind map idea:', idea, '| unknown id ignored:', 'unbekannt' not in text)
        print('chat:', reply.split('\n')[0], '|', line.replace('\n', ' '))
        await pg.wait_for_timeout(600)
        vers = await pg.evaluate("(JSON.parse(localStorage.getItem('inkling:data:ver_npg1') || '{}').items || []).map(v => v.why)")
        print('page history:', vers)

        # 2. Undo puts it all back
        await pg.click('.ai-edit-line button:has-text("Undo")'); await pg.wait_for_timeout(1500)
        text2 = await pg.evaluate(FLOW)
        data2 = await pg.evaluate("JSON.parse(localStorage.getItem('inkling:data:note_npg1'))")
        notes2 = sorted(o.get('html', '') for o in data2['objs'].values() if o.get('t') == 'note' and not o.get('del'))
        idea2 = [c['text'] for o in data2['objs'].values() if o.get('t') == 'mm' for c in o['tree']['ch']]
        cell2 = await pg.evaluate("document.querySelector('.flow table').rows[0].cells[1].textContent")
        undone = 'Die Zele teilt sich' in text2 and 'und Metaphase' in text2 and 'Ende.' in text2 and 'Neuer Satz' not in text2 and notes2 == ['<p>Notiz</p>'] and idea2 == ['Idee'] and cell2 == ''
        print('undo: page back as before:', undone, '| line says:', (await pg.inner_text('.ai-edit-line')).strip())

        # 3. a question only gets an answer; with the switch off the normal chat answers
        await pg.fill('#chatIn', 'Was bedeutet Mitose?'); await pg.click('#chatSend'); await pg.wait_for_timeout(1200)
        q = await pg.evaluate("[...document.querySelectorAll('#msgs .msg.assistant')].pop().innerText")
        same = (await pg.evaluate(FLOW)) == text2
        await pg.click('#chatEdit'); await pg.fill('#chatIn', 'Erkläre das'); await pg.click('#chatSend'); await pg.wait_for_timeout(1500)
        normal = await pg.evaluate("[...document.querySelectorAll('#msgs .msg.assistant')].pop().innerText")
        print('question: answer', q.split('\n')[0], '| page unchanged:', same, '| switch off → normal chat:', normal.split('\n')[0])

        must = {'parts sent': all(shown), 'fixed': 'Die Zelle teilt sich wichtig in zwei Zellen.' in text and '<b>wichtig</b>' in para, 'added': 'Neuer Satz von der KI.' in text, 'deleted': 'Ende.' not in text,
                'cell': cell == 'Dauer', 'locked': locked == 'Picture in Word: Bild', 'boxes': notes == ['<p>Notiz von der KI</p>', '<p>Zweite Notiz</p>'], 'idea': idea == ['Neue Idee'],
                'history': 'Before the AI edit' in vers, 'undo': undone, 'question': 'Kernteilung' in q and same, 'switch off': 'normale Chat-Antwort' in normal, 'changed line': 'Changed' in line}
        errs += ['check failed: ' + k for k, v in must.items() if not v]
        await b.close()
        print('ERRORS', errs)

asyncio.run(main())

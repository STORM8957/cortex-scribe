# Right-click on every kind of object opens Cortex Scribe's menu, never the browser's: in the middle of the object and on
# its inner buttons (calculator keys, the mind map's + and fold buttons), on A4 pages and on a board (also a frame's
# title). Plain page text keeps the browser's menu (spelling suggestions, copy, paste).
import os, pathlib, json
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio
from playwright.async_api import async_playwright

PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
SEED = r"""
(() => {
  window.claude = { use: async () => null };
  if (localStorage.getItem('inkling:data:tree')) return;
  const t = Date.now(), O = (id, o, z) => Object.assign({ id, x: 0, y: 0, w: 200, h: 80, z, u: t, name: id }, o);
  localStorage.setItem('inkling:data:tree', JSON.stringify({ v: 2, nodes: {
    fnb: { id: 'fnb', type: 'folder', name: 'Bio', parent: null, order: 1, created: t, updated: t },
    npa: { id: 'npa', type: 'note', name: 'Blatt', parent: 'fnb', kind: 'a4', order: 2, created: t, updated: t },
    npb: { id: 'npb', type: 'note', name: 'Brett', parent: 'fnb', kind: 'board', order: 3, created: t, updated: t } } }));
  localStorage.setItem('inkling:data:note_npa', JSON.stringify({ v: 2, kind: 'a4', bg: 'blank', margin: false, mu: t, fu: [t], flows: ['<p>Ein ganz normaler Satz auf der Seite.</p>'], objs: {
    onote: O('onote', { t: 'note', x: 60, y: 120, w: 220, h: 70, ah: true, html: '<p>Notiz</p>' }, 1),
    otext: O('otext', { t: 'text', x: 320, y: 120, w: 220, h: 60, html: '<p>Textfeld</p>' }, 2),
    ostick: O('ostick', { t: 'sticky', x: 560, y: 120, w: 160, h: 120, col: 'yellow', html: '<p>Zettel</p>' }, 3),
    oshape: O('oshape', { t: 'shape', k: 'rect', x: 60, y: 300, w: 200, h: 100, html: '' }, 4),
    omm: O('omm', { t: 'mm', x: 300, y: 300, w: 380, h: 200, tree: { id: 'r', text: 'Thema', ch: [{ id: 'c1', text: 'Idee', ch: [{ id: 'c2', text: 'Unteridee', ch: [] }] }] } }, 5),
    ocalc: O('ocalc', { t: 'calc', x: 60, y: 560, w: 230, h: 320 }, 6),
    ochart: O('ochart', { t: 'chart', x: 330, y: 560, w: 380, h: 260, chart: {}, data: { cats: ['A', 'B'], series: [{ name: 'S', vals: [3, 5] }] } }, 7),
    ocard: O('ocard', { t: 'card', x: 60, y: 920, w: 280, h: 64, ah: true, target: 'npb' }, 8),
    oimg: O('oimg', { t: 'image', x: 380, y: 900, w: 120, h: 120, src: '__PNG__' }, 9) } }));
  localStorage.setItem('inkling:data:note_npb', JSON.stringify({ v: 2, kind: 'board', bg: 'dots', margin: false, mu: t, fu: [], flows: [], objs: {
    oframe: O('oframe', { t: 'frame', x: 100, y: 100, w: 500, h: 320, name: 'Folie 1' }, 1),
    ocalc2: O('ocalc2', { t: 'calc', x: 700, y: 100, w: 230, h: 320 }, 2) } }));
  localStorage.setItem('inkling:pref:last', JSON.stringify('npa'));
})();
""".replace('__PNG__', PNG)
# records, for every right-click, whether Cortex Scribe took it (the browser's menu doesn't open then)
WATCH = "window.__ctx = []; window.addEventListener('contextmenu', (e) => window.__ctx.push(e.defaultPrevented));"

async def right_click(pg, sel, where='center', prep=None):
    if prep:      # e.g. click an idea first, so the mind map shows its + button
        await pg.keyboard.press('Escape'); await pg.mouse.click(5, 5); await pg.wait_for_timeout(100)
        await pg.click(prep); await pg.wait_for_timeout(250)
    el = await pg.query_selector(sel)
    if not el: return ('missing', False)
    await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(150)
    b = await el.bounding_box()
    x, y = (b['x'] + b['width'] / 2, b['y'] + b['height'] / 2) if where == 'center' else (b['x'] + 8, b['y'] + 6)
    if not prep: await pg.keyboard.press('Escape'); await pg.mouse.click(5, 5); await pg.wait_for_timeout(100)
    n = await pg.evaluate("window.__ctx.length")
    await pg.mouse.click(x, y, button='right'); await pg.wait_for_timeout(350)
    taken = await pg.evaluate("window.__ctx.length > %d && window.__ctx[window.__ctx.length - 1]" % n)
    menu = await pg.evaluate("(() => { const m = document.querySelector('.menu'); return m ? [...m.querySelectorAll('button')].slice(0, 3).map(b => b.innerText.trim().split('\\n')[0]) : null; })()")
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)
    return (menu, taken)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1440, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(SEED); await pg.add_init_script(WATCH)
        await pg.goto(APP); await pg.wait_for_timeout(1500)
        results = {}
        for name, sel, where, *prep in [
            ('note box', '.obj[data-id="onote"]', 'center'), ('text box', '.obj[data-id="otext"]', 'center'), ('sticky note', '.obj[data-id="ostick"]', 'center'),
            ('shape', '.obj[data-id="oshape"]', 'center'), ('mind map', '.obj[data-id="omm"]', 'center'), ('mind map + button', '.obj[data-id="omm"] .mm-add', 'center', '.obj[data-id="omm"] .mm-node:has-text("Unteridee")'),
            ('mind map fold button', '.obj[data-id="omm"] .mm-tog', 'center'), ('calculator', '.obj[data-id="ocalc"] .chead', 'center'),
            ('calculator key', '.obj[data-id="ocalc"] .ck', 'center'), ('calculator display', '.obj[data-id="ocalc"] .cdisp', 'center'),
            ('chart', '.obj[data-id="ochart"]', 'center'), ('page link', '.obj[data-id="ocard"]', 'center'), ('picture', '.obj[data-id="oimg"]', 'center')]:
            results[name] = await right_click(pg, sel, where, prep[0] if prep else None)
        text = await right_click(pg, '.flow p', 'center')
        # the mind map's + button is clickable (the selection's connect dots used to cover it)
        await pg.keyboard.press('Escape'); await pg.mouse.click(5, 5); await pg.click('.obj[data-id="omm"] .mm-node:has-text("Unteridee")'); await pg.wait_for_timeout(250)
        plus = await (await pg.query_selector('.obj[data-id="omm"] .mm-add')).bounding_box()
        on_top = await pg.evaluate("(p) => !!document.elementFromPoint(p[0], p[1]).closest('.mm-add')", [plus['x'] + plus['width'] / 2, plus['y'] + plus['height'] / 2])
        before = await pg.evaluate("document.querySelectorAll('.obj[data-id=\"omm\"] .mm-node').length")
        await pg.mouse.click(plus['x'] + plus['width'] / 2, plus['y'] + plus['height'] / 2); await pg.wait_for_timeout(400)
        after = await pg.evaluate("document.querySelectorAll('.obj[data-id=\"omm\"] .mm-node').length")
        print('mind map + button on top:', on_top, '| a click adds an idea:', after == before + 1)
        if not (on_top and after == before + 1): errs.append('the mind map + button is covered')
        await pg.keyboard.press('Escape')
        await pg.click('#tree .t-row:has-text("Brett")'); await pg.wait_for_timeout(1200)
        for name, sel, where in [('board: frame title', '.obj[data-id="oframe"] .ftitle', 'center'), ('board: calculator key', '.obj[data-id="ocalc2"] .ck', 'center'), ('board: frame', '.obj[data-id="oframe"]', 'corner')]:
            results[name] = await right_click(pg, sel, where)
        bad = []
        for name, (menu, taken) in results.items():
            ok = bool(menu) and taken
            print(('ok  ' if ok else 'BAD ') + name + ':', 'menu' if menu else 'no menu', menu[:2] if menu else '', '| browser menu kept away:', taken)
            if not ok: bad.append(name)
        print('plain page text keeps the browser menu (spelling):', text[1] is False, text)
        errs += ['right-click shows the browser menu on: ' + n for n in bad]
        if text[1] is not False: errs.append('plain text lost the browser menu')
        await b.close()
        print('ERRORS', errs)

asyncio.run(main())

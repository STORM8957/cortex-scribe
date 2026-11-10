# Page setup on A4 pages (src/51_pagesetup.js): View → Page setup sets the size (A5), turns all pages sideways and
# back, the margins; the turn button turns one page only; text moves between pages and pages that only emptied go away;
# a box stays on its page; the header (double-click in the top margin, bold from the ribbon) and page numbers
# (“Page 1 of 3”) show on every page; Ctrl+Z undoes a page setup change; it is all saved with the page and comes back when it is opened again; the page
# history keeps it; the Format panel shows it; an endless page has no header.
import os, pathlib, json, asyncio
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
from playwright.async_api import async_playwright

SEED = r"""
(() => {
  window.claude = { use: async () => null };
  if (localStorage.getItem('inkling:data:tree')) return;
  const t = Date.now();
  localStorage.setItem('inkling:data:tree', JSON.stringify({ v: 2, nodes: {
    fnb: { id: 'fnb', type: 'folder', name: 'Bio', parent: null, order: 1, created: t, updated: t },
    npa: { id: 'npa', type: 'note', name: 'Blatt', parent: 'fnb', kind: 'a4', order: 2, created: t, updated: t },
    npe: { id: 'npe', type: 'note', name: 'Endlos', parent: 'fnb', kind: 'endless', order: 3, created: t, updated: t } } }));
  const long = Array.from({ length: 40 }, (_, i) => '<p>Satz Nummer ' + (i + 1) + ' mit etwas mehr Text, damit die Zeile voll wird und umbricht.</p>').join('');
  localStorage.setItem('inkling:data:note_npa', JSON.stringify({ v: 2, kind: 'a4', bg: 'blank', margin: false, mu: t, fu: [t], flows: [long], objs: {
    ob: { id: 'ob', t: 'note', x: 500, y: 1000, w: 220, h: 70, ah: true, html: '<p>Notiz</p>', z: 1, u: t, name: 'Note box 1' } } }));
  localStorage.setItem('inkling:data:note_npe', JSON.stringify({ v: 2, kind: 'endless', bg: 'blank', margin: true, mu: t, fu: [t], flows: ['<p>Endlos</p>'], objs: {} }));
  localStorage.setItem('inkling:pref:last', JSON.stringify('npa'));
})();
"""
SHEETS = "JSON.stringify([...document.querySelectorAll('.sheet.a4')].map(s => [s.offsetWidth, s.offsetHeight]))"
DATA = "JSON.parse(localStorage.getItem('inkling:data:note_npa'))"

async def menu(pg, *path):
    await pg.click('.rtab:has-text("View")'); await pg.wait_for_timeout(200)
    await pg.click('button.tb:has-text("Page setup")'); await pg.wait_for_timeout(250)
    for t in path:
        await pg.locator('.menu button', has_text=t).last.click(); await pg.wait_for_timeout(300)
    await pg.wait_for_timeout(1200)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1440, 'height': 1000})
        await ctx.add_init_script(SEED)
        pg = await ctx.new_page()
        errs, must = [], {}
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(APP); await pg.wait_for_timeout(1500)
        start = json.loads(await pg.evaluate(SHEETS))
        await menu(pg, 'Size', 'A5')
        a5 = json.loads(await pg.evaluate(SHEETS)); d = await pg.evaluate(DATA)
        print('A5:', a5[:2], len(a5), 'pages | saved:', d.get('ps'))
        must['A5 pages, text moved on'] = all(x == [559, 794] for x in a5) and len(a5) > len(start) and d.get('ps') == 'A5'
        await menu(pg, 'Size', 'A4 (')
        a4 = json.loads(await pg.evaluate(SHEETS))
        print('back to A4:', len(a4), 'pages (emptied ones gone)')
        must['emptied pages go away'] = len(a4) < len(a5)
        await menu(pg, 'Turn', 'Sideways')
        land = json.loads(await pg.evaluate(SHEETS)); d = await pg.evaluate(DATA)
        fits = await pg.evaluate("document.querySelector('.sheet.a4').getBoundingClientRect().width <= document.getElementById('scroller').clientWidth")
        box = d['objs']['ob']
        print('sideways:', land[:1], len(land), 'pages | fits on the screen:', fits, '| the box stays on its page:', box['y'] + box['h'] <= 794, box.get('sh', 0))
        must['all pages sideways'] = all(x == [1123, 794] for x in land) and d.get('po') == 'l' and fits and box['y'] + box['h'] <= 794
        await menu(pg, 'Turn', 'Upright')
        await pg.click('.sheet.a4[data-sheet="1"] .pg-turn'); await pg.wait_for_timeout(1300)
        one = json.loads(await pg.evaluate(SHEETS)); d = await pg.evaluate(DATA)
        print('one page turned:', one, d.get('pt'))
        must['the turn button turns one page'] = one[0] == [794, 1123] and one[1] == [1123, 794] and all(x == [794, 1123] for x in one[2:]) and (d.get('pt') or [None, None])[1] is True
        await menu(pg, 'Margins', 'Narrow')
        pad = await pg.evaluate("document.querySelector('.sheet.a4 .flow').style.padding"); d = await pg.evaluate(DATA)
        print('narrow margins:', pad, d.get('pmg'))
        must['margins'] = pad == '48px' and d.get('pmg') == [48, 48, 48, 48]
        await pg.evaluate("document.activeElement && document.activeElement.blur()")
        await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(1300)
        undone = await pg.evaluate("document.querySelector('.sheet.a4 .flow').style.padding"); d = await pg.evaluate(DATA)
        print('Ctrl+Z puts the margins back:', undone, d.get('pmg'))
        must['undo page setup'] = undone == '76px 80px 76px 88px' and d.get('pmg') is None
        await menu(pg, 'Margins', 'Narrow')
        # the header: double-click in the top margin, type, bold from the ribbon
        await pg.click('.rtab:has-text("Home")'); await pg.wait_for_timeout(200)
        await pg.evaluate("document.querySelector('.sheet.a4').scrollIntoView({ block: 'center' })"); await pg.wait_for_timeout(300)
        s0 = await (await pg.query_selector('.sheet.a4[data-sheet="0"]')).bounding_box()
        await pg.mouse.dblclick(s0['x'] + 300, s0['y'] + 20); await pg.wait_for_timeout(300)
        editing = await pg.evaluate("!!document.querySelector('.pg-hf.hd.editing')")
        await pg.keyboard.type('Biologie Dossier')
        await pg.keyboard.down('Shift'); await pg.keyboard.press('Home'); await pg.keyboard.up('Shift')
        await pg.click('#rbody button[aria-label="Bold (Ctrl+B)"]'); await pg.wait_for_timeout(200)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1200)
        d = await pg.evaluate(DATA)
        heads = await pg.evaluate("[...document.querySelectorAll('.pg-hf.hd')].map(e => e.innerText.trim())")
        print('header by double-click:', editing, '| saved:', d.get('hd'), '| on every page:', heads)
        must['header on every page'] = editing and heads and all(x == 'Biologie Dossier' for x in heads) and 'Biologie Dossier' in (d.get('hd') or '') and ('<b>' in d['hd'] or 'bold' in d['hd'])
        await menu(pg, 'Page numbers', 'Page 1 of 3')
        feet = await pg.evaluate("[...document.querySelectorAll('.pg-hf.ft')].map(e => e.innerText.trim())")
        n = len(feet)
        print('page numbers:', feet)
        must['page numbers'] = feet == ['Page %d of %d' % (i + 1, n) for i in range(n)]
        # the Format panel shows the setup
        await pg.click('#rail button[data-ptab="format"]'); await pg.wait_for_timeout(400)
        fmt = await pg.evaluate("[...document.querySelectorAll('#ptab-format .frow')].map(r => r.innerText).join(' / ')")
        print('Format panel:', fmt)
        must['format panel'] = 'Setup' in fmt and 'header/footer' in fmt
        # saved: another page, then this one again (loaded from storage; a second tab of a file can miss the first tab's storage in the test browser)
        await pg.click('#tree .t-row:has-text("Endlos")'); await pg.wait_for_timeout(900)
        await pg.click('#tree .t-row:has-text("Blatt")')
        for _ in range(80):
            if await pg.evaluate("document.querySelectorAll('.sheet.a4').length === %d && !!(document.querySelector('.pg-hf.hd') || {}).innerText" % len(one)): break
            await pg.wait_for_timeout(100)
        again = json.loads(await pg.evaluate(SHEETS)); feet2 = await pg.evaluate("[...document.querySelectorAll('.pg-hf.ft')].map(e => e.innerText.trim())")
        head2 = await pg.evaluate("(document.querySelector('.pg-hf.hd') || {}).innerText")
        print('opened again:', again, '| header:', head2, '| footer:', feet2[:2])
        must['saved with the page'] = again == one and head2.strip() == 'Biologie Dossier' and feet2[0] == 'Page 1 of %d' % n
        # an endless page has no header or page setup
        await pg.click('#tree .t-row:has-text("Endlos")'); await pg.wait_for_timeout(1000)
        endless = await pg.evaluate("[document.querySelectorAll('.pg-hf').length, !!document.querySelector('.page-tools .pg-turn')]")
        await pg.click('.rtab:has-text("View")'); await pg.wait_for_timeout(200)
        no_btn = not await pg.is_visible('button.tb:has-text("Page setup")')
        print('endless page: no header, no turn button, no Page setup:', endless, no_btn)
        must['endless page untouched'] = endless == [0, False] and no_btn
        await b.close()
        errs += ['check failed: ' + k for k, v in must.items() if not v]
        print('ERRORS', errs)

asyncio.run(main())

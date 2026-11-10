# Text from the handwriting pad gets the size and font picked in the ribbon right before (with nothing selected);
# subfolders in the notebook list (+ → New subfolder, the … menu and right-click, “Put in a new folder”, dragging pages
# and folders into folders and between rows, a folder can't go inside itself); and on a phone: “Be the drawing pad”
# on the start screen, and clear messages when the screen isn't signed in to Claude (no shared database).
import os, pathlib
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio
from playwright.async_api import async_playwright

MOCK = r"""
(() => {
  const sample = async () => ({ text: 'Mitose', truncated: false });
  sample.json = async () => ({ text: 'Mitose' });
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 5e6, mediaTypes: ['image/png', 'image/jpeg'] } });
  window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
})();
"""
TREE = """() => { const t = JSON.parse(localStorage.getItem('inkling:data:tree') || '{}').nodes || {}; const name = (id) => (t[id] || {}).name || null;
  return Object.values(t).filter((n) => !n.deleted).map((n) => [n.name, name(n.parent)]).sort(); }"""
ROWS = "[...document.querySelectorAll('#tree .t-row')].map(r=>r.querySelector('.t-name span') ? r.querySelector('.t-name span').innerText : '')"

async def new_page(pg, parent, kind_index, name):
    row = pg.locator('#tree .t-row', has_text=parent).first; await row.hover()
    await row.locator('button[aria-label^="Add to"]').click(); await pg.click('.menu button:has-text("New page")'); await pg.wait_for_timeout(200)
    await (await pg.query_selector_all('.kind'))[kind_index].click(); await pg.fill('.modal input.field', name); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(700)

async def drag(pg, src, dst, where):
    s = await pg.locator('#tree .t-row', has_text=src).first.bounding_box(); d = await pg.locator('#tree .t-row', has_text=dst).first.bounding_box()
    y = d['y'] + d['height'] * {'top': 0.12, 'mid': 0.5, 'bottom': 0.88}[where]
    await pg.mouse.move(s['x'] + 60, s['y'] + s['height'] / 2); await pg.mouse.down()
    await pg.mouse.move(d['x'] + 70, y, steps=8); await pg.wait_for_timeout(100); await pg.mouse.up(); await pg.wait_for_timeout(400)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(MOCK)
        await pg.goto(APP); await pg.wait_for_timeout(1000)

        # 1. the size picked right before writing on the pad
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Bio'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await (await pg.query_selector_all('.kind'))[1].click(); await pg.fill('.modal input.field', 'Zellen'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(700)
        await pg.click('.flow'); await pg.keyboard.type('Hallo ')
        font = await pg.evaluate("document.getElementById('rFont').options[2].value")
        await pg.select_option('#rSize', '32'); await pg.select_option('#rFont', index=2)
        if not await pg.is_visible('#pad'): await pg.click('#rail button[data-ptab="pen"]')
        pad = await (await pg.query_selector('#pad')).bounding_box()
        await pg.mouse.move(pad['x'] + 40, pad['y'] + 60); await pg.mouse.down(); await pg.mouse.move(pad['x'] + 120, pad['y'] + 90, steps=6); await pg.mouse.up()
        await pg.click('#kType'); await pg.wait_for_timeout(2500)
        html = await pg.evaluate("document.querySelector('.flow').innerHTML")
        sp = await pg.evaluate("(()=>{const s=[...document.querySelectorAll('.flow span')].find(x=>x.innerText.includes('Mitose')); return s ? [s.style.fontSize, s.style.fontFamily] : null})()")
        await pg.mouse.move(pad['x'] + 40, pad['y'] + 60); await pg.mouse.down(); await pg.mouse.move(pad['x'] + 120, pad['y'] + 90, steps=6); await pg.mouse.up()
        await pg.click('#kType'); await pg.wait_for_timeout(2500)
        both = await pg.evaluate("[document.querySelector('.flow p').innerText, ...[...document.querySelectorAll('.flow span')].filter(x=>x.innerText.includes('Mitose')).map(x=>[x.style.fontSize, (x.innerText.match(/Mitose/g)||[]).length])]")
        print('pad text after picking 32 px and a font:', html[:40], '| size, font:', sp, '| the font picked:', bool(sp) and sp[1].strip('"\'') in font, '| the next word goes into the same size:', both)

        # 2. subfolders
        row = pg.locator('#tree .t-row', has_text='Bio').first; await row.hover(); await row.locator('button[aria-label^="Add to"]').click()
        plus = await pg.evaluate("[...document.querySelectorAll('.menu button')].map(b=>b.innerText.trim())")
        await pg.click('.menu button:has-text("New subfolder")'); await pg.fill('.modal input.field', 'Kapitel 1'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(300)
        await pg.click('#tree .t-row:has-text("Kapitel 1")', button='right'); await pg.wait_for_timeout(200)
        ctx = await pg.evaluate("[...document.querySelectorAll('.menu button')].map(b=>b.innerText.trim())")
        await pg.click('.menu button:has-text("New subfolder")'); await pg.fill('.modal input.field', 'Teil A'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(300)
        await new_page(pg, 'Bio', 1, 'Mitose'); await new_page(pg, 'Bio', 1, 'Meiose')
        empty = await pg.evaluate("[...document.querySelectorAll('#tree .t-empty .t-name')].map(b=>b.innerText.trim())")
        await drag(pg, 'Mitose', 'Kapitel 1', 'mid'); await pg.wait_for_timeout(1000)
        t1 = await pg.evaluate(TREE)
        await drag(pg, 'Meiose', 'Mitose', 'top'); await pg.wait_for_timeout(1000)
        t2 = await pg.evaluate(TREE); order = await pg.evaluate(ROWS)
        await drag(pg, 'Kapitel 1', 'Teil A', 'mid'); await pg.wait_for_timeout(600)
        selfmove = await pg.inner_text('#toast')
        row = pg.locator('#tree .t-row', has_text='Zellen').first; await row.hover(); await row.locator('button[aria-label^="More for"]').click()
        await pg.click('.menu button:has-text("Put in a new folder")'); await pg.fill('.modal input.field', 'Grundlagen'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(1000)
        t3 = await pg.evaluate(TREE)
        print('+ menu:', plus, '| right-click a folder:', ctx[:3], '| empty folder offers:', empty)
        print('drag Mitose into Kapitel 1:', ['Mitose', 'Kapitel 1'] in t1, '| Meiose dropped above Mitose:', ['Meiose', 'Kapitel 1'] in t2, [r for r in order if r in ('Meiose', 'Mitose')], '| folder into its own subfolder:', selfmove)
        print('Zellen put in a new folder:', ['Zellen', 'Grundlagen'] in t3 and ['Grundlagen', 'Bio'] in t3, '| tree:', t3)

        # 3. a phone that isn't signed in to Claude
        ph = await b.new_context(**p.devices['iPhone 13']); q = await ph.new_page(); q.on('pageerror', lambda e: errs.append('phone: ' + str(e)))
        await q.add_init_script(MOCK); await q.goto(APP); await q.wait_for_timeout(1200)
        start = (await q.inner_text('#empty')).replace('\n', ' | ')
        await q.click('#emptyPadBtn'); await q.wait_for_timeout(300); await q.fill('#padHubCode', 'k7m2qx'); await q.click('#padHubGo'); await q.wait_for_timeout(800)
        cv = await q.evaluate("(()=>{const c=document.querySelector('.pm-canvas').getBoundingClientRect(); return [Math.round(c.width), Math.round(c.height)]})()")
        st = await q.inner_text('.pm-status'); warn = await q.evaluate("document.querySelector('.pm-status').classList.contains('warn')")
        print('phone start screen offers the pad:', 'Be the drawing pad' in start, '| says it isn’t signed in:', 'isn’t signed in to Claude' in start, '| pad canvas', cv, '| message:', st[:70], '| shown as a warning:', warn)
        await ph.close()
        print('ERRORS', errs[:5])
        await b.close()
asyncio.run(main())

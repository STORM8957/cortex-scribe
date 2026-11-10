import os, pathlib, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio, json
from playwright.async_api import async_playwright
async def saved_paper_name(pg):
    # the page is saved shortly after the last change; wait for it instead of assuming it is there
    for _ in range(40):
        n = await pg.evaluate("(()=>{for(const k of Object.keys(localStorage)) if(k.includes('data:note_')){const p=Object.values(JSON.parse(localStorage[k]).objs||{}).find(o=>o.t==='paper'); if(p) return p.name}})()")
        if n: return n
        await pg.wait_for_timeout(100)
    return None
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':900})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open('mock3d.js').read())
        await pg.goto(APP); await pg.wait_for_timeout(900)
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'K'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await (await pg.query_selector_all('.kind'))[2].click(); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(600)
        await pg.click('#rail button[aria-pressed="true"]'); await pg.wait_for_timeout(200)
        for _ in range(2): await pg.mouse.move(700, 450); await pg.keyboard.down('Control'); await pg.mouse.wheel(0, 120); await pg.keyboard.up('Control')
        await pg.click('#zoomScale input') if await pg.query_selector('#zoomScale input') else None
        await pg.click('.rtabs button:has-text("Insert")'); await pg.wait_for_timeout(150)
        print('insert tab:', await pg.evaluate("[...document.querySelectorAll('#ribbon button .dl, #ribbon button span')].map(s=>s.innerText).filter(t=>/page|Screen/.test(t))"))
        await pg.click('#ribbon button[aria-label="Movable A4 page"]'); await pg.click('.menu button:has-text("A4 portrait")'); await pg.wait_for_timeout(400)
        pp = await pg.query_selector('.obj-paper'); pb = await pp.bounding_box()
        print('A4 sheet on screen:', round(pb['width']), 'x', round(pb['height']), '| ratio', round(pb['height']/pb['width'], 3), '| tag:', await pg.inner_text('.obj-paper .paper-tag'))
        await pg.mouse.click(pb['x']+pb['width']/2, pb['y']+pb['height']*0.2); await pg.wait_for_timeout(150)
        await pg.mouse.click(pb['x']+pb['width']/2, pb['y']+pb['height']*0.2); await pg.wait_for_timeout(200)
        await pg.keyboard.type('Kapitel 1: Die Zelle'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        print('typed on the sheet:', await pg.inner_text('.obj-paper .otext'))
        await pg.click('#dock [data-tool="pen"]'); await pg.mouse.move(pb['x']+60, pb['y']+pb['height']*0.6); await pg.mouse.down(); await pg.mouse.move(pb['x']+160, pb['y']+pb['height']*0.65, steps=6); await pg.mouse.up()
        await pg.click('#dock [data-tool="select"]')
        await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('Randnotiz'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
        nt = [x for x in await pg.query_selector_all('.obj-note') if 'Randnotiz' in await x.inner_text()][0]; nb = await nt.bounding_box()
        await pg.mouse.move(nb['x']+20, nb['y']+10); await pg.mouse.down(); await pg.mouse.move(pb['x']+pb['width']*0.5, pb['y']+pb['height']*0.8, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(200)
        await pg.mouse.click(1250, 780)
        before = await pg.evaluate("[document.querySelector('svg path[data-id]').getBoundingClientRect().x, [...document.querySelectorAll('.obj-note')].find(n=>n.innerText.includes('Randnotiz')).getBoundingClientRect().x]")
        await pg.mouse.move(pb['x']+pb['width']-20, pb['y']+pb['height']*0.45); await pg.mouse.down(); await pg.mouse.move(pb['x']+pb['width']+130, pb['y']+pb['height']*0.45+40, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(300)
        after = await pg.evaluate("[document.querySelector('svg path[data-id]').getBoundingClientRect().x, [...document.querySelectorAll('.obj-note')].find(n=>n.innerText.includes('Randnotiz')).getBoundingClientRect().x]")
        pb2 = await pp.bounding_box()
        print('moved the sheet by', round(pb2['x']-pb['x']), '| drawing moved', round(after[0]-before[0]), '| note moved', round(after[1]-before[1]))
        h0 = await pg.evaluate("document.querySelector('.obj-paper .otext').getBoundingClientRect().height")
        hd = await (await pg.query_selector('.hnd[data-h="r-se"]')).bounding_box()
        await pg.mouse.move(hd['x']+5, hd['y']+5); await pg.mouse.down(); await pg.mouse.move(hd['x']+150, hd['y']+40, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(300)
        pb3 = await pp.bounding_box(); h1 = await pg.evaluate("document.querySelector('.obj-paper .otext').getBoundingClientRect().height")
        print('resized:', round(pb2['width']), '->', round(pb3['width']), '| ratio', round(pb3['height']/pb3['width'], 3), '| text scaled with it:', round(h1/h0, 2), 'x')
        await pg.mouse.click(pb3['x']+pb3['width']-30, pb3['y']+pb3['height']*0.5, button='right'); await pg.wait_for_timeout(200)
        print('right-click:', await pg.evaluate("[...document.querySelectorAll('.menu:not(.sub) > button,.menu:not(.sub) > .mlabel')].slice(0,7).map(b=>b.innerText.trim())"))
        await pg.click('.menu button:has-text("A3 landscape")'); await pg.wait_for_timeout(300)
        pb4 = await pp.bounding_box()
        print('A3 landscape:', round(pb4['width']), 'x', round(pb4['height']), '| ratio', round(pb4['height']/pb4['width'], 3), '| tag:', await pg.inner_text('.obj-paper .paper-tag'), '| name:', await saved_paper_name(pg))
        await pg.mouse.click(min(pb4['x']+pb4['width']-30, 1380), pb4['y']+pb4['height']*0.5, button='right'); await pg.wait_for_timeout(200)
        await pg.hover('.menu:not(.sub) button:has-text("Background")'); await pg.wait_for_timeout(350); await pg.click('.menu.sub button:has-text("Lined")'); await pg.wait_for_timeout(200)
        print('background:', await pg.get_attribute('.obj-paper', 'data-bg'))
        await pg.mouse.click(1250, 780)
        await pg.click('#ribbon button[aria-label="Movable A3 page"]'); await pg.click('.menu button:has-text("A3 portrait")'); await pg.wait_for_timeout(400)
        print('sheets:', await pg.evaluate("[...document.querySelectorAll('.obj-paper .paper-tag')].map(t=>t.innerText)"))
        await pg.mouse.click(1250, 780); await pg.click('#zoomFit') if await pg.query_selector('#zoomFit') else None
        await pg.wait_for_timeout(300); await pg.screenshot(path='t17.png')
        print('ERRORS', errs[:5])
        await b.close()
asyncio.run(main())

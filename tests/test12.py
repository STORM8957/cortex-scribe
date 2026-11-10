import os, pathlib, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':900}, accept_downloads=True)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/three.min.js', lambda route: route.fulfill(path='fake_three.js', content_type='application/javascript'))
        await pg.add_init_script(open('mock3d.js').read())
        await pg.goto(APP); await pg.wait_for_timeout(900)
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Physik'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await (await pg.query_selector_all('.kind'))[1].click(); await pg.fill('.modal input.field', 'Kraft'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(500)
        await pg.click('.flow'); await pg.keyboard.type('F = m mal a')
        await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('Newton'); await pg.keyboard.press('Escape')
        await pg.click('#dock [data-tool="pen"]'); await pg.mouse.move(500,600); await pg.mouse.down(); await pg.mouse.move(650,640, steps=6); await pg.mouse.up()
        await pg.click('#dock [data-tool="select"]')
        await pg.click('.t-row.top .t-acts button'); await pg.click('.menu button:has-text("New page")'); await pg.wait_for_timeout(200)
        await (await pg.query_selector_all('.kind'))[2].click(); await pg.fill('.modal input.field', 'Modell'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(600)
        await pg.click('#dock button[aria-label="3D studio"]'); await pg.wait_for_timeout(400)
        await pg.fill('#ptab-m3d textarea', 'a star'); await pg.click('#ptab-m3d button:has-text("Create from text")'); await pg.wait_for_timeout(600)
        await pg.click('#ptab-m3d button:has-text("Put on the page")'); await pg.wait_for_timeout(700)
        await pg.click('#rail button[data-ptab="m3d"]'); await pg.wait_for_timeout(200)
        bb = await (await pg.query_selector('.obj-m3d')).bounding_box()
        await pg.mouse.click(bb['x']+bb['width']/2, bb['y']+bb['height']/2+15, button='right'); await pg.wait_for_timeout(200)
        await pg.click('.menu button:has-text("Take a screenshot")'); await pg.wait_for_timeout(1200)
        await pg.click('#toast button'); await pg.wait_for_timeout(1500)
        # export
        await pg.click('#backupBtn'); await pg.wait_for_timeout(200)
        async with pg.expect_download() as dl:
            await pg.click('.modal button:has-text("Export everything")')
        d = await dl.value; path = os.path.join(tempfile.gettempdir(), d.suggested_filename); await d.save_as(path)
        data = json.load(open(path))
        names = sorted(n['name'] for n in data['tree'].values() if not n.get('deleted'))
        print('exported file:', d.suggested_filename, '| nodes:', names, '| pages:', len(data['notes']), '| media:', [k[:4] for k in data['media']], [v[:15] for v in data['media'].values()])
        kraft = [v for k,v in data['notes'].items() if data['tree'][k]['name']=='Kraft'][0]
        print('page text kept:', 'F = m mal a' in json.dumps(kraft['main']), '| strokes:', len([s for s in kraft['ink'].values() if not s.get('del')]), '| toast:', await pg.inner_text('#toast'))
        # import
        await pg.click('#backupBtn'); await pg.wait_for_timeout(200)
        async with pg.expect_file_chooser() as fc:
            await pg.click('.modal button:has-text("Import a backup")')
        await (await fc.value).set_files(path); await pg.wait_for_timeout(400)
        await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(2500)
        print('after import, notebooks:', await pg.evaluate("[...document.querySelectorAll('#tree .t-row.top .t-name')].map(n=>n.innerText)"), '|', await pg.inner_text('#toast'))
        print('imported pages visible:', await pg.evaluate("[...document.querySelectorAll('#tree .t-name')].map(n=>n.innerText)"))
        await (await pg.query_selector_all('#tree .t-name:has-text("Kraft")'))[1].click(); await pg.wait_for_timeout(900)
        print('imported page:', await pg.evaluate("document.querySelector('.flow').innerText"), '| boxes:', await pg.evaluate("[...document.querySelectorAll('.obj-note')].map(n=>n.innerText)"), '| strokes:', await pg.evaluate("document.querySelectorAll('svg path[data-id]').length"))
        await (await pg.query_selector_all('#tree .t-name:has-text("Modell")'))[1].click(); await pg.wait_for_timeout(1500)
        print('imported 3D window shows screenshot:', await pg.evaluate("(()=>{const i=document.querySelector('.obj-m3d img.w3-media'); return i && !i.hidden && i.naturalWidth > 0})()"))
        print('ERRORS', errs[:5])
        await b.close()
asyncio.run(main())

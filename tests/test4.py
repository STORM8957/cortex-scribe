import os, pathlib, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio, json
from playwright.async_api import async_playwright
MOCK = open('test2.py').read().split('MOCK = r"""')[1].split('"""')[0]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':1440,'height':900})
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE: '+m.text) if m.type=='error' and 'ERR_NAME' not in m.text else None)
        # use the copy of three.js from "npm install" when there is one, so the test also runs without internet
        local_three = pathlib.Path(HERE).parent / 'node_modules/three/build/three.min.js'
        if local_three.exists(): await pg.route('**/three.min.js', lambda route: route.fulfill(path=str(local_three), content_type='application/javascript'))
        await pg.add_init_script(MOCK)
        await pg.goto(APP); await pg.wait_for_timeout(1200)
        print('theme', await pg.evaluate("document.documentElement.dataset.theme"), 'accent', await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent')"), 'paper', await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--paper')"))
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Kunst'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await (await pg.query_selector_all('.kind'))[2].click(); await pg.fill('.modal input.field', 'Board'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(600)
        print('dock visible', await pg.evaluate("!document.getElementById('dock').hidden"), 'dock buttons', await pg.evaluate("document.querySelectorAll('#dock .tb').length"))
        # pen from dock, second click opens colours
        await pg.click('#dock [data-tool="pen"]'); await pg.click('#dock [data-tool="pen"]'); await pg.wait_for_timeout(200)
        print('pen pop', await pg.evaluate("!!document.querySelector('.pop[aria-label=Pen]')"))
        await pg.click('.pop .sw[aria-label="Colour #E5383B"]'); await pg.keyboard.press('Escape')
        # draw a star-ish closed shape on the board
        import math
        cx, cy = 600, 450
        pts=[]
        for i in range(11):
            a = -math.pi/2 + i*math.pi/5; r = 90 if i%2==0 else 38
            pts.append((cx+r*math.cos(a), cy+r*math.sin(a)))
        await pg.mouse.move(*pts[0]); await pg.mouse.down()
        for (x,y) in pts[1:]: await pg.mouse.move(x,y, steps=4)
        await pg.mouse.up(); await pg.wait_for_timeout(200)
        print('ink color', await pg.evaluate("(document.querySelector('svg.inksvg path')||{style:{}}).style.stroke"))
        # magic pop with switches
        await pg.click('#dock .magic-go'); await pg.wait_for_timeout(200)
        sw = await pg.evaluate("[...document.querySelectorAll('.pop .sw-row')].map(r=>r.innerText.trim()+':'+r.querySelector('.switch').getAttribute('aria-checked'))")
        print('switches', sw[:5])
        await pg.click('.pop .switch[aria-label="Make diagram"]'); await pg.click('.pop .switch[aria-label="Make diagram"]')
        await pg.click('.pop .switch[aria-label="3D model"]')
        await pg.click('.pop .btn.magic'); await pg.wait_for_timeout(150)
        await pg.mouse.move(470, 330); await pg.mouse.down(); await pg.mouse.move(740, 570, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(1500)
        print('after magic: shapes', await pg.evaluate("document.querySelectorAll('.obj-shape').length"), 'm3d objs', await pg.evaluate("document.querySelectorAll('.obj-m3d').length"), 'toast', await pg.inner_text('#toast'))
        # pad: draw mode, draw, picture + 3D
        if await pg.get_attribute('#rail button[data-ptab="pen"]', 'aria-pressed') != 'true': await pg.click('#rail button[data-ptab="pen"]')
        await pg.wait_for_timeout(200)
        await pg.click('#padTools .chip:has-text("Draw a picture")')
        box = await (await pg.query_selector('#pad')).bounding_box()
        await pg.mouse.move(box['x']+60, box['y']+60); await pg.mouse.down(); await pg.mouse.move(box['x']+200, box['y']+180, steps=8); await pg.mouse.move(box['x']+80, box['y']+200, steps=6); await pg.mouse.up()
        await pg.wait_for_timeout(1500)
        print('pad strokes kept (no auto-type in draw mode):', await pg.evaluate("document.getElementById('padLast').textContent"))
        await pg.click('#kImg'); await pg.wait_for_timeout(800)
        imgs = await pg.evaluate("[...document.querySelectorAll('.obj-image img')].map(i=>i.src.slice(0,40))")
        print('images', imgs, 'padLast', await pg.inner_text('#padLast'))
        svgsrc = await pg.evaluate("(() => { const i=document.querySelector('.obj-image img'); if(!i) return ''; return atob(i.src.split(',')[1]); })()")
        print('svg cleaned (no script/onclick):', 'script' not in svgsrc and 'onclick' not in svgsrc, len(svgsrc))
        await pg.mouse.move(box['x']+60, box['y']+60); await pg.mouse.down(); await pg.mouse.move(box['x']+200, box['y']+60, steps=5); await pg.mouse.move(box['x']+130, box['y']+190, steps=5); await pg.mouse.move(box['x']+60, box['y']+60, steps=5); await pg.mouse.up()
        await pg.click('#k3d'); await pg.wait_for_timeout(1500)
        print('3D panel:', (await pg.inner_text('#ptab-m3d'))[:200].replace('\n',' | '))
        print('models saved:', await pg.evaluate("Object.keys(localStorage).filter(k=>k.includes('models_'))"))
        await pg.screenshot(path='t4.png')
        print('ERRORS:', errs[:10])
        await b.close()
asyncio.run(main())

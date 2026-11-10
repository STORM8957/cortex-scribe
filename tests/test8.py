import os, pathlib, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio, json, math
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':900})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open('mock3d.js').read())
        await pg.goto(APP); await pg.wait_for_timeout(900)
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'K'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await (await pg.query_selector_all('.kind'))[2].click(); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(600)
        await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('test'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        note = await pg.query_selector('.obj-note'); b0 = await note.bounding_box()
        hs = await (await pg.query_selector('.hnd[data-h="r-s"]')).bounding_box()
        await pg.mouse.move(hs['x']+6, hs['y']+6); await pg.mouse.down(); await pg.mouse.move(hs['x']+6, hs['y']+126, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
        b1 = await note.bounding_box(); print('height resize:', round(b0['height']), '->', round(b1['height']))
        rot = await (await pg.query_selector('.hnd.rot')).bounding_box(); ct = await (await pg.query_selector('.hnd.c[data-h="c-t"]')).bounding_box()
        overlap = not (rot['x'] > ct['x']+ct['width'] or rot['x']+rot['width'] < ct['x'] or rot['y'] > ct['y']+ct['height'] or rot['y']+rot['height'] < ct['y'])
        print('rotate handle overlaps connect dot:', overlap)
        await pg.click('.hnd.c[data-h="c-r"]'); await pg.keyboard.type('zwei'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.mouse.click(b1['x']+20, b1['y']+10); await pg.wait_for_timeout(150)
        rot = await (await pg.query_selector('.hnd.rot')).bounding_box()
        cx, cy = b1['x']+b1['width']/2, b1['y']+b1['height']/2
        await pg.mouse.move(rot['x']+7, rot['y']+7); await pg.mouse.down()
        for i in range(1,9):
            a = math.atan2(rot['y']+7-cy, rot['x']+7-cx) + i*math.radians(5)
            R = math.hypot(rot['x']+7-cx, rot['y']+7-cy)
            await pg.mouse.move(cx+R*math.cos(a), cy+R*math.sin(a))
        await pg.mouse.up(); await pg.wait_for_timeout(1300)
        d = await pg.evaluate("(()=>{for(const k of Object.keys(localStorage)) if(k.includes('data:note_')){return JSON.parse(localStorage[k]).objs}})()")
        n1 = [o for o in d.values() if o.get('t')=='note' and 'test' in (o.get('html') or '')][0]
        path = await pg.evaluate("document.querySelector('.connsvg g path:not(.hit)').getAttribute('d')")
        sx, sy = [float(v) for v in path[1:].split('C')[0].split()]
        r = math.radians(n1['r']); hw, hh = n1['w']/2, n1['h']/2; ocx, ocy = n1['x']+hw, n1['y']+hh
        ex, ey = ocx + (hw+2)*math.cos(r), ocy + (hw+2)*math.sin(r)
        print('rotated by', n1['r'], 'deg | line start on rotated edge: off by', round(math.hypot(sx-ex, sy-ey),1), 'px | ah', n1.get('ah'))
        # zoom out and add a note + pen stroke
        await pg.mouse.click(1100, 300)
        for _ in range(4): await pg.mouse.move(700, 500); await pg.keyboard.down('Control'); await pg.mouse.wheel(0, 120); await pg.keyboard.up('Control')
        await pg.wait_for_timeout(200)
        z = await pg.inner_text('#zoomLabel'); print('zoom', z, '| checkbox:', await pg.evaluate("document.querySelector('.zoomscale input').checked"))
        await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('scaled'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        nb = await (await pg.query_selector('.obj-note:last-of-type')).bounding_box()
        sn = [n for n in await pg.query_selector_all('.obj-note') if 'scaled' in await n.inner_text()][0]
        print('new note on screen width:', round((await sn.bounding_box())['width']), 'px (normal is 300)')
        await pg.click('#dock [data-tool="pen"]'); await pg.mouse.move(400, 700); await pg.mouse.down(); await pg.mouse.move(600, 720, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(1300)
        st = await pg.evaluate("(()=>{for(const k of Object.keys(localStorage)) if(k.includes('data:ink_')){const v=Object.values(JSON.parse(localStorage[k]).ink); return v.length? v[v.length-1].s : null}})()")
        print('pen width saved (world):', st, '(normal 3)')
        await pg.click('.zoomscale'); await pg.wait_for_timeout(100)
        await pg.click('#dock [data-tool="select"]')
        await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('plain'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        pn = [n for n in await pg.query_selector_all('.obj-note') if 'plain' in await n.inner_text()][0]
        print('with checkbox off, note on screen width:', round((await pn.bounding_box())['width']), 'px')
        await pg.screenshot(path='t9.png')
        print('ERRORS', errs)
        await b.close()
asyncio.run(main())

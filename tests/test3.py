import os, pathlib, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio, json
from playwright.async_api import async_playwright
async def run(width, scheme):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':width,'height':800}, color_scheme=scheme)
        pg = await ctx.new_page()
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE: '+m.text) if m.type=='error' and 'ERR_NAME' not in m.text and '_blob' not in m.text and 'ERR_FILE' not in m.text else None)
        await pg.add_init_script(open('mockprod.js').read())
        await pg.goto(APP); await pg.wait_for_timeout(1500)
        print(width, scheme, 'loading present:', await pg.evaluate("!!document.getElementById('loading')"), 'empty visible:', await pg.evaluate("!document.getElementById('empty').hidden"))
        if width < 900:
            await pg.click('#openSide'); await pg.wait_for_timeout(300)
        await pg.click('.t-row.top .t-name'); await pg.wait_for_timeout(200)
        await pg.click('.t-name:has-text("Zellen")'); await pg.wait_for_timeout(1200)
        info = await pg.evaluate("""() => ({ sheets: document.querySelectorAll('.sheet').length, ribbon: !document.getElementById('ribbon').hidden, flow: (document.querySelector('.flow')||{}).innerText, sheetRect: (()=>{const s=document.querySelector('.sheet'); if(!s) return null; const r=s.getBoundingClientRect(); return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]})(), workRect: (()=>{const r=document.getElementById('work').getBoundingClientRect(); return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]})(), mode: document.getElementById('status').textContent })""")
        print(json.dumps(info))
        await pg.screenshot(path=f'p_{width}_{scheme}.png')
        print('ERRORS', errs[:8])
        await b.close()
async def main():
    await run(1280, 'dark'); await run(760, 'light')
asyncio.run(main())

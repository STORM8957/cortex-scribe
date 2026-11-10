import os, pathlib, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio
from playwright.async_api import async_playwright
FAKE = """
navigator.mediaDevices.getDisplayMedia = async () => {
  if (window.__blockCapture) { const e = new Error('Access to the feature "display-capture" is disallowed by permission policy.'); e.name = 'NotAllowedError'; throw e; }
  const c = document.createElement('canvas'); c.width = 640; c.height = 360; const x = c.getContext('2d'); let f = 0;
  setInterval(() => { f++; x.fillStyle = 'hsl(' + (f * 7 % 360) + ',70%,45%)'; x.fillRect(0, 0, 640, 360); x.fillStyle = '#fff'; x.font = '48px sans-serif'; x.fillText('Shared tab ' + f, 120, 200); }, 33);
  return c.captureStream(30);
};
"""

async def sub(pg, top, item):
    await pg.hover('.menu:not(.sub) button:has-text("%s")' % top); await pg.wait_for_timeout(350)
    await pg.click('.menu.sub button:has-text("%s")' % item)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1440,'height':900})
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open('mock3d.js').read() + FAKE)
        await pg.goto(APP); await pg.wait_for_timeout(900)
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'K'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await (await pg.query_selector_all('.kind'))[2].click(); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(600)
        await pg.click('.rtabs button:has-text("Insert")'); await pg.wait_for_timeout(150)
        await pg.click('#ribbon button[aria-label^="Screen window"]'); await pg.wait_for_timeout(400)
        print('window header:', await pg.evaluate("[...document.querySelectorAll('.obj-scr .w3-head button, .obj-scr .w3-name')].map(b=>b.innerText.trim())"), '| empty message:', await pg.evaluate("!document.querySelector('.obj-scr .scr-empty').hidden"))
        await pg.click('.obj-scr .scr-empty button:has-text("Choose a tab or window")'); await pg.wait_for_timeout(800)
        print('live view:', await pg.evaluate("(()=>{const v=document.querySelector('.obj-scr video'); return {shown: !v.hidden, w: v.videoWidth, playing: !v.paused}})()"))
        bb = await (await pg.query_selector('.obj-scr')).bounding_box(); cx, cy = bb['x']+bb['width']/2, bb['y']+bb['height']/2+15
        async def rclick():
            await pg.mouse.click(cx, cy, button='right'); await pg.wait_for_timeout(200)
            return await pg.evaluate("[...document.querySelectorAll('.menu button,.menu .mlabel')].map(b=>b.innerText.trim())")
        print('menu:', (await rclick())[:12])
        await pg.click('.menu button:has-text("Take a screenshot")'); await pg.wait_for_timeout(1200)
        await pg.click('#toast button'); await pg.wait_for_timeout(500)
        st = await pg.evaluate("(()=>{const w=document.querySelector('.obj-scr'); const img=[...w.querySelectorAll('img.w3-media')].find(i=>!i.hidden); const live=w.querySelector('video'); return {shot: !!img && img.naturalWidth, livePaused: live.paused, liveHidden: live.hidden}})()")
        print('screenshot shown:', st)
        await rclick(); await sub(pg, 'Recording', 'Record (up to 5 minutes)'); await pg.wait_for_timeout(300)
        print('recording badge:', await pg.evaluate("!document.querySelector('.obj-scr .w3-rec').hidden"))
        await pg.wait_for_timeout(3000)
        await rclick(); await sub(pg, 'Recording', 'Stop recording'); await pg.wait_for_timeout(3000)
        print('toast:', (await pg.inner_text('#toast')).replace('\n', ' '))
        await pg.click('#toast button'); await pg.wait_for_timeout(700)
        print('video shown:', await pg.evaluate("(()=>{const v=[...document.querySelectorAll('.obj-scr video')].find(v=>!v.hidden && v.src.startsWith('blob')); return v ? {loop: v.loop, dur: v.duration} : null})()"))
        await rclick(); await sub(pg, 'Show in the window', 'GIF'); await pg.wait_for_timeout(800)
        print('GIF shown:', await pg.evaluate("(()=>{const i=[...document.querySelectorAll('.obj-scr img.w3-media')].find(i=>!i.hidden); return i ? [i.naturalWidth, i.naturalHeight] : null})()"))
        await rclick(); await sub(pg, 'What to show', 'Stop sharing'); await pg.wait_for_timeout(300)
        await rclick(); await sub(pg, 'Show in the window', 'Live view'); await pg.wait_for_timeout(300)
        print('after stop sharing, empty message back:', await pg.evaluate("!document.querySelector('.obj-scr .scr-empty').hidden"))
        async with pg.expect_file_chooser() as fc:
            await pg.click('.obj-scr .scr-empty button:has-text("Use a file")')
        await (await fc.value).set_files('pic.png'); await pg.wait_for_timeout(1200)
        print('file shown:', await pg.evaluate("(()=>{const i=[...document.querySelectorAll('.obj-scr img.w3-media')].find(i=>!i.hidden); return i ? i.naturalWidth : null})()"), '| name:', await pg.inner_text('.obj-scr .w3-name'))
        await pg.click('.obj-scr .w3-btn:has-text("Expand")'); await pg.wait_for_timeout(400)
        print('expanded:', await pg.evaluate("!!document.querySelector('.v3-full .scr-host img')")); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        print('closed:', not await pg.evaluate("!!document.querySelector('.v3-full')"))
        d = await pg.evaluate("(()=>{for(const k of Object.keys(localStorage)) if(k.includes('data:note_')){const o=Object.values(JSON.parse(localStorage[k]).objs).find(x=>x.t==='scr'); return o && [o.name, !!o.shot, !!o.rec, !!o.gif, o.fileType]}})()")
        print('saved [name, shot, video, gif, file]:', d)
        await pg.screenshot(path='t14.png')
        # blocked by Claude's page
        await pg.evaluate("window.__blockCapture = true")
        await pg.click('.obj-scr .w3-btn:has-text("Choose")'); await pg.wait_for_timeout(400)
        print('blocked message:', await pg.inner_text('#toast'))
        print('ERRORS', errs[:5])
        await b.close()
asyncio.run(main())

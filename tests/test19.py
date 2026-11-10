# Desktop app (Tauri) platform layer, with a stand-in for the native side (mock_desk.js):
# notes are saved as files, survive a reload, are written before the window closes, and a backup
# exported from the Claude version imports with its picture and recording.
import os, pathlib, tempfile, base64, re
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio, json
from playwright.async_api import async_playwright

async def claude_backup(b):
    """Make a notebook in the Claude version and export it, like a student moving over."""
    pg = await b.new_page(viewport={'width':1440,'height':900}, accept_downloads=True)
    await pg.route('**/three.min.js', lambda route: route.fulfill(path='fake_three.js', content_type='application/javascript'))
    await pg.add_init_script(open('mock3d.js').read())
    await pg.goto(APP); await pg.wait_for_timeout(900)
    await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Biologie'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
    await (await pg.query_selector_all('.kind'))[2].click(); await pg.fill('.modal input.field', 'Zelle'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(600)
    await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('Mitochondrien'); await pg.keyboard.press('Escape')
    await pg.set_input_files('#fileIn', 'pic.png'); await pg.wait_for_timeout(1200)
    await pg.click('#dock [data-tool="select"]')
    await pg.wait_for_timeout(1500)
    await pg.click('#backupBtn'); await pg.wait_for_timeout(200)
    async with pg.expect_download() as dl:
        await pg.click('.modal button:has-text("Export everything")')
    d = await dl.value; path = os.path.join(tempfile.gettempdir(), 'claude-' + d.suggested_filename); await d.save_as(path)
    await pg.close()
    data = json.load(open(path))
    # In Claude, pictures and recordings live in Claude's file storage (/_blob/…). Make the backup look like that.
    note = next(iter(data['notes'].values()))
    img = next(o for o in note['main']['objs'].values() if o['t'] == 'image')
    data['media']['/_blob/picA1'] = img['src']; img['src'] = '/_blob/picA1'
    webm = base64.b64encode(b'\x1aE\xdf\xa3' + b'0' * 3000).decode()
    data['media']['/_blob/vidB2'] = 'data:video/webm;base64,' + webm
    data['library'] = {'items': [{'id': 'm1', 'kind': 'video', 'src': '/_blob/vidB2', 'dur': 4000, 'w': 320, 'h': 240, 'name': 'Recording', 'created': 1, 'win': 'x', 'winName': 'Zelle 3D', 'winType': 'm3d', 'page': 'p'}]}
    json.dump(data, open(path, 'w'))
    return path

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        backup = await claude_backup(b)
        ctx = await b.new_context(viewport={'width':1440,'height':900})
        pg = await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open('mock_desk.js').read())
        await pg.goto(APP); await pg.wait_for_timeout(900)
        print('desktop mode:', await pg.evaluate("[document.querySelector('#status').innerText, document.querySelector('#status').title, document.querySelector('#storeNote').hidden]"))
        print('AI message:', await pg.evaluate("(document.querySelector('[data-aioff]:not([hidden])')||{}).textContent"))

        # 1. type something, then close the window straight away (before the normal save delay)
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Mathe'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await (await pg.query_selector_all('.kind'))[1].click(); await pg.fill('.modal input.field', 'Algebra'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(600)
        await pg.click('.flow'); await pg.keyboard.type('a hoch 2 plus b hoch 2')
        await pg.wait_for_timeout(100)
        await pg.evaluate("__desk.emit('inkling-close')"); await pg.wait_for_timeout(1500)
        saved = await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('deskfs:data/note_')).map(k=>localStorage[k]).join('')")
        print('closed after saving:', await pg.evaluate("__desk.closed"), '| text in the page file:', 'a hoch 2 plus b hoch 2' in saved)
        print('nothing kept in browser storage:', await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('inkling:data:')).length == 0"))

        # 2. reopen the app: the notes come back from the files
        await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.click('#tree .t-name:has-text("Algebra")'); await pg.wait_for_timeout(700)
        print('after reopening:', await pg.evaluate("document.querySelector('.flow').innerText"))

        # 3. import the Claude backup
        await pg.click('#backupBtn'); await pg.wait_for_timeout(200)
        async with pg.expect_file_chooser() as fc:
            await pg.click('.modal button:has-text("Import a backup")')
        await (await fc.value).set_files(backup); await pg.wait_for_timeout(400)
        await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(2500)
        await pg.click('#tree .t-name:has-text("Zelle")'); await pg.wait_for_timeout(1200)
        print('imported page boxes:', await pg.evaluate("[...document.querySelectorAll('.obj-note')].map(n=>n.innerText)"))
        print('imported picture shows:', await pg.evaluate("(()=>{const i=document.querySelector('.obj-image img'); return !!i && i.complete && i.naturalWidth > 0})()"))
        media = await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('deskfs:media/')).map(k=>k.slice(13))")
        lib = json.loads(await pg.evaluate("localStorage['deskfs:data/media']") or '{}')
        print('recording now a file:', [m.split('.')[-1] for m in media], '| library points to it:', [i['src'][:5] for i in lib.get('items', [])])

        # 4. export from the desktop app: native "Save as", pictures and recordings included
        await pg.click('#backupBtn'); await pg.wait_for_timeout(200)
        await pg.click('.modal button:has-text("Export everything")'); await pg.wait_for_timeout(2500)
        out = await pg.evaluate("__desk.saved")
        exp = json.loads(out['text'])
        print('exported:', re.sub(r'\d{4}-\d\d-\d\d', 'DATE', out['name']), '| pages:', len(exp['notes']), '| media kinds:', sorted(v[:10] for v in exp['media'].values()), '| toast:', await pg.inner_text('#toast'))

        # 5. web links open in the normal browser, not inside the app window
        await pg.evaluate("(()=>{const a=document.createElement('a'); a.href='https://example.com/zelle'; a.id='lnk'; a.textContent='link'; document.body.append(a)})()")
        await pg.click('#lnk'); await pg.wait_for_timeout(200)
        print('link opened outside:', await pg.evaluate("__desk.opened"), '| app still here:', pg.url.endswith('inkling.html'))
        # 6. add-on libraries come from the app's own lib/ folder first (works offline)
        reqs = []; pg.on('request', lambda r: reqs.append(r.url))
        await pg.route('**/lib/three.min.js', lambda route: route.fulfill(path='fake_three.js', content_type='application/javascript'))
        await pg.click('#dock button[aria-label="3D studio"]'); await pg.wait_for_timeout(800)
        three = [u for u in reqs if u.endswith('three.min.js')]
        print('3D engine asked for first:', [u.split('/')[-2] + '/' + u.split('/')[-1] for u in three][:1])
        print('ERRORS', errs[:5])
        await b.close()
asyncio.run(main())

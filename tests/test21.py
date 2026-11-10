# The handwriting pad extras (src/37_pad.js): a wider panel and a taller pad, pad settings, “Insert drawing”
# (picture with a white or see-through background, or pen lines), ↑ / ↓ to choose the line the pad writes into,
# and the pad on another screen: a second tab (browser version), a window (desktop app) and, inside Claude,
# another device through the shared database (QR code, link, “Be the pad” offer).
import os, pathlib, re, json, base64
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
ROOT = pathlib.Path(HERE).parent
APP = ROOT.joinpath('inkling.html').as_uri()
QR = ROOT / 'node_modules/qrcode-generator/qrcode.js'
import asyncio
from playwright.async_api import async_playwright

CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#ffffff"/><circle cx="200" cy="150" r="80" fill="#E5383B"/></svg>'
asked = []

def sse(text):
    return 'data: ' + json.dumps({'choices': [{'index': 0, 'delta': {'content': text}}]}) + '\n\ndata: ' + json.dumps({'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}]}) + '\n\ndata: [DONE]\n\n'

async def openai(route):
    req = route.request
    if req.method == 'OPTIONS': return await route.fulfill(status=204, headers=CORS)
    if req.url.endswith('/models'): return await route.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps({'data': [{'id': 'gpt-4o'}]}))
    body = req.post_data or ''
    asked.append(body)
    text = SVG if 'standalone SVG' in body else 'Hallo' if 'image_url' in body else 'ok'
    await route.fulfill(status=200, headers={**CORS, 'content-type': 'text/event-stream'}, body=sse(text))

async def qr_route(route):
    if QR.exists(): await route.fulfill(path=str(QR), content_type='application/javascript')
    else: await route.continue_()

async def draw(pg, sel, x0=40, y0=50, dx=120, dy=40):
    b = await (await pg.query_selector(sel)).bounding_box()
    await pg.mouse.move(b['x'] + x0, b['y'] + y0); await pg.mouse.down()
    await pg.mouse.move(b['x'] + x0 + dx, b['y'] + y0 + dy, steps=8); await pg.mouse.up()

async def drag(pg, sel, dx, dy):
    b = await (await pg.query_selector(sel)).bounding_box()
    x, y = b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
    await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + dx, y + dy, steps=10); await pg.mouse.up()

# reads a picture object's src and returns (kind, corner alpha or svg text)
PIC = """async (id) => {
  const el = document.querySelector('.obj-image[data-id="' + id + '"] img'); const src = el.getAttribute('src');
  if (src.startsWith('data:image/svg')) return ['svg', decodeURIComponent(escape(atob(src.split(',')[1])))];
  const im = new Image(); im.src = src; await im.decode();
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  return ['png', x.getImageData(1, 1, 1, 1).data[3], im.naturalWidth > 20];
}"""
IDS = "[...document.querySelectorAll('.obj-image')].map(e => e.dataset.id)"
# drops a small PNG file onto the element (as dragging a file from the computer does)
DROP = """async (sel) => {
  const c = document.createElement('canvas'); c.width = c.height = 40; const x = c.getContext('2d'); x.fillStyle = '#e33'; x.fillRect(0, 0, 40, 40);
  const b = await new Promise((r) => c.toBlob(r, 'image/png'));
  const dt = new DataTransfer(); dt.items.add(new File([b], 'drop.png', { type: 'image/png' }));
  const el = document.querySelector(sel); const r = el.getBoundingClientRect();
  for (const t of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
}"""
LINES = "[...document.querySelectorAll('.flow p')].map(p => p.innerText.trim())"

async def new_page_with_lines(pg):
    await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Bio'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
    await (await pg.query_selector_all('.kind'))[1].click(); await pg.fill('.modal input.field', 'Zellen'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(500)
    await pg.click('.flow'); await pg.keyboard.type('Erste Zeile'); await pg.keyboard.press('Enter'); await pg.keyboard.type('Zweite Zeile'); await pg.keyboard.press('Enter'); await pg.keyboard.type('Dritte Zeile')
    if not await pg.is_visible('#ptab-pen'): await pg.click('#rail button[data-ptab="pen"]')
    await pg.wait_for_timeout(400)

async def settings(pg, label):
    await pg.click('#padSetBtn'); await pg.click('.pop button:has-text("' + label + '")'); await pg.wait_for_timeout(150)
    await pg.keyboard.press('Escape')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        await ctx.add_init_script("if (!localStorage.getItem('inkling:ai')) localStorage.setItem('inkling:ai', JSON.stringify({v:1, active:'openai', profiles:{openai:{key:'sk-test', model:'gpt-4o'}}}))")
        await ctx.route(re.compile(r'^https://api\.openai\.com/.*'), openai)
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(APP); await pg.wait_for_timeout(900)
        await new_page_with_lines(pg)

        # 1. the panel gets wider when its left edge is dragged; double-click: normal width again
        w0 = (await (await pg.query_selector('#panel')).bounding_box())['width']
        await drag(pg, '.panel-grip', -150, 0); await pg.wait_for_timeout(350)
        w1 = (await (await pg.query_selector('#panel')).bounding_box())['width']
        pw = await pg.evaluate("localStorage.getItem('inkling:pref:panelW')")
        await pg.dblclick('.panel-grip'); await pg.wait_for_timeout(350)
        w2 = (await (await pg.query_selector('#panel')).bounding_box())['width']
        print('panel width: normal', round(w0), '| dragged', round(w1), '| saved', pw, '| double-click', round(w2))

        # 2. the pad gets taller when the bar under it is dragged; pad settings: square, normal
        h0 = (await (await pg.query_selector('#pad')).bounding_box())['height']
        await drag(pg, '.pad-grip', 0, 120); await pg.wait_for_timeout(200)
        h1 = (await (await pg.query_selector('#pad')).bounding_box())['height']
        await settings(pg, 'Square'); bx = await (await pg.query_selector('#pad')).bounding_box()
        sq = abs(bx['width'] - bx['height']) <= 1
        await settings(pg, 'Normal'); h3 = (await (await pg.query_selector('#pad')).bounding_box())['height']
        g0 = await pg.evaluate("document.querySelector('#ptab-pen .pad-wrap').classList.contains('guide')")
        await settings(pg, 'Show lines'); g1 = await pg.evaluate("document.querySelector('#ptab-pen .pad-wrap').classList.contains('guide')")
        await settings(pg, 'No lines'); g2 = await pg.evaluate("document.querySelector('#ptab-pen .pad-wrap').classList.contains('guide')")
        print('writing line on the pad: at first', g0, '| Show lines', g1, '| No lines', g2)
        print('pad height: normal', round(h0), '| dragged', round(h1), '| square', sq, '| normal again', round(h3), '| canvas pixels follow:', await pg.evaluate("document.getElementById('pad').height === Math.round(document.getElementById('pad').getBoundingClientRect().height * devicePixelRatio)"))

        # 3. where the pad writes, and ↑ / ↓
        t = [await pg.inner_text('.pad-target')]
        await pg.click('#padUp'); await pg.wait_for_timeout(250); t.append(await pg.inner_text('.pad-target'))
        await pg.click('#padUp'); await pg.wait_for_timeout(250); t.append(await pg.inner_text('.pad-target'))
        await pg.click('#padDown'); await pg.wait_for_timeout(250); t.append(await pg.inner_text('.pad-target'))
        print('writes into:', ' → '.join(x.replace('Writes into: ', '') for x in t))
        await draw(pg, '#pad'); await pg.click('#kType'); await pg.wait_for_timeout(900)
        print('pad wrote into line 2:', await pg.evaluate(LINES))

        # 4. Insert drawing as a picture (no AI): white, then see-through
        n_asked = len(asked)
        await draw(pg, '#pad'); await pg.click('#kInsert'); await pg.wait_for_timeout(400)
        white = await pg.evaluate(PIC, (await pg.evaluate(IDS))[-1])
        await settings(pg, 'See-through')
        await draw(pg, '#pad'); await pg.click('#kInsert'); await pg.wait_for_timeout(400)
        clear = await pg.evaluate(PIC, (await pg.evaluate(IDS))[-1])
        print('insert drawing: white corner alpha', white[1], '| see-through corner alpha', clear[1], '| pictures', len(await pg.evaluate(IDS)), '| no AI asked:', len(asked) == n_asked, '| pad cleared:', await pg.inner_text('#padLast'))
        # as pen lines
        await settings(pg, 'Pen lines you can edit')
        ink0 = await pg.evaluate("document.querySelectorAll('.inksvg path').length")
        await draw(pg, '#pad'); await draw(pg, '#pad', 60, 120, 40, -30); await pg.click('#kInsert'); await pg.wait_for_timeout(400)
        print('insert as pen lines: new lines on the page', await pg.evaluate("document.querySelectorAll('.inksvg path').length") - ink0)
        # Drawing → picture with a see-through background: the AI is told, and its white rectangle is taken out
        await draw(pg, '#pad'); await pg.click('#kImg'); await pg.wait_for_timeout(900)
        svg = await pg.evaluate(PIC, (await pg.evaluate(IDS))[-1])
        print('AI picture, see-through: told', 'Do not draw any background' in asked[-1], '| white rectangle removed', svg[0] == 'svg' and '<rect' not in svg[1] and '<circle' in svg[1])
        await settings(pg, 'Keep it white')
        await draw(pg, '#pad'); await pg.click('#kImg'); await pg.wait_for_timeout(900)
        svg = await pg.evaluate(PIC, (await pg.evaluate(IDS))[-1])
        print('AI picture, white: told', 'plain white background' in asked[-1], '| white rectangle kept', '<rect' in svg[1])
        await settings(pg, 'A picture')

        # 5. the pad in a second tab (browser version: BroadcastChannel / localStorage)
        await pg.click('#padSyncBtn'); await pg.wait_for_timeout(300)
        code = await pg.inner_text('#padCodeEl')
        print('pad dialog: code', bool(re.fullmatch(r'[a-z2-9]{6}', code)), '| phone note:', 'online version' in await pg.inner_text('.padsync'), '| offer saved:', json.loads(await pg.evaluate("localStorage.getItem('inkling:data:padlink')") or '{}').get('code') == code)
        async with ctx.expect_page() as np:
            await pg.click('#padOpenTab')
        pad = await np.value
        pad.on('pageerror', lambda e: errs.append('pad: ' + str(e)))
        await pad.set_viewport_size({'width': 1280, 'height': 800}); await pad.wait_for_timeout(3200)
        print('pad tab:', pad.url.endswith('#pad=' + code), '|', await pad.inner_text('.pm-conn'), '|', await pad.inner_text('.pm-target'), '| notebook hidden:', await pad.evaluate("document.querySelector('.app').hidden"))
        print('notebook:', await pg.inner_text('.pad-status'), '| button:', await pg.inner_text('#padSyncBtn'))
        await pg.click('.modal .btn.primary:has-text("Done")')
        # write on the pad → typed in the notebook
        await draw(pad, '.pm-canvas', 80, 120, 200, 40); await pad.click('#pmType'); await pad.wait_for_timeout(1200)
        print('from the pad:', await pad.inner_text('.pm-status'), '| lines:', await pg.evaluate(LINES))
        # ↑ on the pad moves where the notebook writes
        before = await pad.inner_text('.pm-target')
        await pad.click('#pmUp'); await pad.wait_for_timeout(700)
        print('pad ↑:', before.replace('Writes into: ', ''), '→', (await pad.inner_text('.pm-target')).replace('Writes into: ', ''), '| notebook shows the same:', (await pg.inner_text('.pad-target')) == await pad.inner_text('.pm-target'))
        n = len(await pg.evaluate(LINES))
        await pad.click('#pmEnter'); await pad.wait_for_timeout(500)
        print('pad New line:', len(await pg.evaluate(LINES)) - n, 'line added')
        # text on the page: font and size chosen on the pad
        await pad.select_option('#pmFont', 'Caveat'); await pad.click('#pmText button:has-text("L")')
        await draw(pad, '.pm-canvas', 80, 120, 200, 40); await pad.click('#pmType'); await pad.wait_for_timeout(1200)
        sp = await pg.evaluate("(() => { const s = [...document.querySelectorAll('.flow span[style]')].pop(); return s ? [s.innerText, s.style.fontFamily, s.style.fontSize] : null })()")
        print('typed with the pad’s font and size:', sp)
        await pad.select_option('#pmFont', ''); await pad.select_option('#pmSize', '0')
        # your style: typed on the pad → in the notebook; a picture chosen on the pad → in the notebook; and back
        await pad.fill('#pmStyleText', 'Comic, kräftige Farben'); await pad.wait_for_timeout(1000)
        st1 = await pg.input_value('#padStyle')
        await pad.set_input_files('#pmStyleFile', 'pic.png'); await pad.wait_for_timeout(1200)
        st2 = await pg.evaluate("!document.getElementById('padStyleThumb').hidden && document.getElementById('padStyleThumb').src.startsWith('data:image')")
        await pg.click('#padStyleDel'); await pad.wait_for_timeout(800)
        st3 = await pad.query_selector('#pmStyle .pm-style-img') is None
        await pg.fill('#padStyle', 'Pastell'); await pad.wait_for_timeout(1200)
        print('style: pad text → notebook', st1 == 'Comic, kräftige Farben', '| pad picture → notebook', st2, '| removed in the notebook → gone on the pad', st3, '| notebook text → pad', await pad.input_value('#pmStyleText') == 'Pastell')
        await pad.evaluate(DROP, '#pmStyle'); await pad.wait_for_timeout(1200)
        print('style picture dropped on the pad → notebook:', await pg.evaluate("!document.getElementById('padStyleThumb').hidden"), '| shown on the pad:', await pad.query_selector('#pmStyle .pm-style-img') is not None)
        await pg.click('#padStyleDel'); await pg.fill('#padStyle', ''); await pad.wait_for_timeout(600)
        # drawing mode: Insert drawing as pen lines, and Drawing → picture
        await pad.click('.pm-box button:has-text("Draw a picture")'); await pad.click('.pm-box button:has-text("Pen lines")')
        ink0 = await pg.evaluate("document.querySelectorAll('.inksvg path').length")
        await draw(pad, '.pm-canvas', 100, 100, 160, 120); await pad.wait_for_timeout(1300)
        auto_sent = await pg.evaluate("document.querySelectorAll('.inksvg path').length") - ink0
        await pad.click('#pmInsert'); await pad.wait_for_timeout(700)
        print('pad Insert drawing (pen lines):', await pg.evaluate("document.querySelectorAll('.inksvg path').length") - ink0, 'line | nothing sent before the button:', auto_sent == 0, '|', await pad.inner_text('.pm-status'))
        pics = len(await pg.evaluate(IDS))
        await draw(pad, '.pm-canvas', 100, 100, 160, 120); await pad.click('#pmPic'); await pad.wait_for_timeout(1300)
        print('pad Drawing → picture:', len(await pg.evaluate(IDS)) - pics, 'picture |', await pad.inner_text('.pm-status'))
        await pad.click('.pm-box button:has-text("Write text")'); await pad.click('.pm-box button:has-text("Picture")')
        # the cog: options, then leave the pad → the notebook opens on that tab
        await pad.click('#pmCog'); await pad.wait_for_timeout(150)
        print('cog menu:', [x.strip() for x in await pad.evaluate("[...document.querySelectorAll('.menu button')].map(b => b.innerText)")])
        await pad.click('.menu button:has-text("Tools on the left")'); await pad.wait_for_timeout(100)
        left = await pad.evaluate("document.querySelector('.padmode').classList.contains('left')")
        await pad.click('#pmCog'); await pad.click('.menu button:has-text("Leave the pad")'); await pad.wait_for_timeout(900)
        print('left-handed:', left, '| after leaving: notebook shown', not await pad.evaluate("document.querySelector('.app').hidden"), '| tree:', await pad.evaluate("[...document.querySelectorAll('#tree .t-name')].map(e => e.innerText)"), '| no pad:', await pad.evaluate("!document.querySelector('.padmode')"))
        await pg.wait_for_timeout(500)
        print('notebook after the pad left:', await pg.inner_text('#padSyncBtn'))
        await pg.click('#padSyncBtn'); await pg.click('.modal button:has-text("Stop the pad link")'); await pg.wait_for_timeout(300)
        print('stopped: button', await pg.inner_text('#padSyncBtn'), '| offer removed:', await pg.evaluate("localStorage.getItem('inkling:data:padlink')") is None)
        # on a board ↑ / ↓ go from box to box
        await pg.click('.t-row.top .t-acts button'); await pg.click('.menu button:has-text("New page")'); await pg.wait_for_timeout(200)
        await (await pg.query_selector_all('.kind'))[2].click(); await pg.fill('.modal input.field', 'Brett'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(700)
        print('board, nothing chosen:', await pg.inner_text('.pad-target'))
        for i, (x, y) in enumerate([(600, 300), (600, 600)]):
            await pg.mouse.click(x, y); await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('Box %d' % (i + 1)); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
        await pg.mouse.click(300, 760); await pg.wait_for_timeout(200)
        bt = []
        for k in ['#padDown', '#padDown', '#padUp']:
            await pg.click(k); await pg.wait_for_timeout(250); bt.append((await pg.inner_text('.pad-target')).replace('Writes into: ', ''))
        print('board arrows:', ' → '.join(bt), )
        await draw(pg, '#pad'); await pg.click('#kType'); await pg.wait_for_timeout(900)
        print('pad wrote into the chosen box:', await pg.evaluate("[...document.querySelectorAll('.obj .otext')].map(e => e.innerText.trim())"))
        # the panel width is remembered after a reload
        await drag(pg, '.panel-grip', -100, 0); await pg.reload(); await pg.wait_for_timeout(1000)
        print('panel width after reload:', round((await (await pg.query_selector('#panel')).bounding_box())['width']))
        await ctx.close()

        # 6b. dropping pictures: the style picture, anywhere on the app (onto the page), the page itself, a screen window
        dctx2 = await b.new_context(viewport={'width': 1440, 'height': 900})
        dp2 = await dctx2.new_page(); dp2.on('pageerror', lambda e: errs.append('drop: ' + str(e)))
        await dp2.goto(APP); await dp2.wait_for_timeout(900)
        await new_page_with_lines(dp2)
        await dp2.evaluate(DROP, '#ptab-pen .style-img'); await dp2.wait_for_timeout(600)
        style_ok = await dp2.evaluate("!document.getElementById('padStyleThumb').hidden")
        n0 = len(await dp2.evaluate(IDS))
        await dp2.evaluate(DROP, '#ribbon'); await dp2.wait_for_timeout(900)
        n1 = len(await dp2.evaluate(IDS))
        await dp2.evaluate(DROP, '.sheet'); await dp2.wait_for_timeout(900)
        n2 = len(await dp2.evaluate(IDS))
        print('drop: style picture', style_ok, '| onto the toolbar → page', n1 - n0, '| onto the page', n2 - n1, '| style button says drop:', 'drop' in await dp2.inner_text('#padStyleBtn'))
        await dp2.click('.rtabs button:has-text("Insert")'); await dp2.wait_for_timeout(150)
        await dp2.click('#ribbon button[aria-label^="Screen window"]'); await dp2.wait_for_timeout(500)
        await dp2.evaluate(DROP, '.obj-scr'); await dp2.wait_for_timeout(1200)
        print('drop onto a screen window: shows the file', await dp2.evaluate("(() => { const w = document.querySelector('.obj-scr'); const i = [...w.querySelectorAll('img.w3-media')].find((i) => !i.hidden); return !!i && !!i.src })()"),
              '| named after it:', await dp2.inner_text('.obj-scr .w3-name'), '| no extra picture on the page:', len(await dp2.evaluate(IDS)) == n2)
        await dctx2.close()

        # 6. desktop app: a new window
        dctx = await b.new_context(viewport={'width': 1280, 'height': 800})
        dp = await dctx.new_page(); dp.on('pageerror', lambda e: errs.append('desk: ' + str(e)))
        await dp.add_init_script(open('mock_desk.js').read()); await dp.goto(APP); await dp.wait_for_timeout(900)
        await dp.click('#rail button[data-ptab="pen"]') if not await dp.is_visible('#ptab-pen') else None
        await dp.click('#padSyncBtn'); await dp.wait_for_timeout(200)
        await dp.click('#padOpenTab'); await dp.wait_for_timeout(200)
        print('desktop: button says', await dp.inner_text('#padOpenTab'), '| window asked for with the code:', await dp.evaluate("__desk.padWindow") == await dp.inner_text('#padCodeEl'))
        await dctx.close()

        # 7. inside Claude: another device through the shared database
        cctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        await cctx.add_init_script(open('mock_shared.js').read())
        await cctx.route('**/qrcode*.js', qr_route)
        nb = await cctx.new_page(); nb.on('pageerror', lambda e: errs.append('claude: ' + str(e)))
        await nb.goto(APP); await nb.wait_for_timeout(1000)
        await new_page_with_lines(nb)
        # the phone is already open before the pad link starts
        ph = await cctx.new_page(); ph.on('pageerror', lambda e: errs.append('phone: ' + str(e)))
        await ph.set_viewport_size({'width': 390, 'height': 844})
        await ph.goto(APP); await ph.wait_for_timeout(1600)
        no_offer_yet = await ph.query_selector('#padOffer') is None
        await nb.click('#padSyncBtn'); await nb.wait_for_timeout(800)
        code = await nb.inner_text('#padCodeEl')
        link = await nb.input_value('#padLinkIn')
        print('Claude: new-tab button copies the link instead:', await nb.inner_text('#padOpenTab'))
        print('Claude: link', link == 'https://claude.ai/artifact/AY4ibHNpV7EB3Kyptp6xsR#pad=' + code, '| QR code drawn:', await nb.evaluate("!!document.querySelector('.pad-qr svg') && document.querySelector('.pad-qr svg').innerHTML.length > 2000"),
              '| offer in the account:', await nb.evaluate("JSON.parse(localStorage.getItem('__mockdb:data/users/u1/padlink')||'{}').code") == code, '| steps:', len(await nb.query_selector_all('.pad-steps li')))
        await ph.wait_for_timeout(600)
        print('phone offer appears by itself:', no_offer_yet, '→', await ph.inner_text('#padOffer p') if await ph.query_selector('#padOffer') else None)
        await ph.click('#padOffer button:has-text("Be the pad")'); await ph.wait_for_timeout(2500)
        print('phone pad:', await ph.inner_text('.pm-conn'), '| through the shared database:', await ph.evaluate(f"!!localStorage.getItem('__mockdb:padp/{code}') && !!localStorage.getItem('__mockdb:padm/{code}')"))
        print('notebook:', await nb.inner_text('.pad-status'))
        await nb.click('.modal .btn.primary:has-text("Done")')
        await draw(ph, '.pm-canvas', 60, 80, 160, 30); await ph.click('#pmType'); await ph.wait_for_timeout(1500)
        print('phone wrote:', await ph.inner_text('.pm-status'), '| lines:', await nb.evaluate(LINES))
        # a phone that opens Inkling (without #pad=, as from Claude's QR link) right after the pad link started is the pad at once
        mp = await cctx.new_page(); mp.on('pageerror', lambda e: errs.append('mobile: ' + str(e)))
        await mp.add_init_script("localStorage.setItem('inkling:pref:padDev', JSON.stringify('phone2'))")   # its own device (the tabs here share one storage)
        await mp.add_init_script("Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })")
        await mp.set_viewport_size({'width': 390, 'height': 844})
        await mp.goto(APP); await mp.wait_for_timeout(2500)
        print('phone opened later: pad straight away', await mp.query_selector('.padmode') is not None, '|', await mp.inner_text('.pm-conn') if await mp.query_selector('.pm-conn') else None, '| no offer bar:', await mp.query_selector('#padOffer') is None)
        await mp.click('#pmLeave'); await mp.wait_for_timeout(900)
        print('My notes:', await mp.query_selector('.padmode') is None, '| page open:', await mp.evaluate("(document.getElementById('titleIn')||{}).value"))
        await mp.close()
        # a link opened with #pad=<code> is the pad straight away
        lk = await cctx.new_page(); lk.on('pageerror', lambda e: errs.append('link: ' + str(e)))
        await lk.goto(APP + '#pad=' + code); await lk.wait_for_timeout(2500)
        print('opened with the link:', await lk.inner_text('.pm-conn'))
        await lk.close()
        # “Drawing pad” in the sidebar: the offer, or a pasted link / typed code
        ty = await cctx.new_page(); ty.on('pageerror', lambda e: errs.append('typed: ' + str(e)))
        await ty.goto(APP); await ty.wait_for_timeout(1600)
        print('a computer opening Inkling while the link is open: pad first', await ty.query_selector('.padmode') is not None)
        await ty.click('#pmLeave'); await ty.wait_for_timeout(900)
        print('My notes on the computer:', await ty.query_selector('.padmode') is None, '| no “Be the pad?” right after leaving:', await ty.query_selector('#padOffer') is None)
        await ty.click('#padBtn'); await ty.wait_for_timeout(300)
        hub_offer = await ty.inner_text('#padHubOffer') if await ty.query_selector('#padHubOffer') else None
        await ty.fill('#padHubCode', link); await ty.click('#padHubGo'); await ty.wait_for_timeout(2500)
        print('sidebar Drawing pad: offer button', hub_offer, '| pasted link:', await ty.inner_text('.pm-conn'), '| the notebook’s offer is still there:', await nb.evaluate("JSON.parse(localStorage.getItem('__mockdb:data/users/u1/padlink')||'{}').code") == code)
        await nb.reload(); await nb.wait_for_timeout(1800)
        print('the notebook tab reloaded stays the notebook:', await nb.query_selector('.padmode') is None)
        print('ERRORS', errs[:5])
        await b.close()
asyncio.run(main())

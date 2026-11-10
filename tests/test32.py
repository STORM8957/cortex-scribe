# The phone pad without Claude (scripts/pad-relay.mjs): the desktop app (stand-in, mock_desk.js) starts the pad relay
# (pad_link_start) and shows a QR code with this computer's address; a phone opens that address, which serves
# Cortex Scribe and makes it the pad straight away; both sides see each other, and what the phone draws lands on the
# page (Insert drawing); the relay refuses other websites and a code that is too short; without the relay
# the dialog says how to start it (browser version) and Try again finds it. With CS_PAD_RUST=1 the same against the
# relay built into the desktop app (src-tauri/src/padrelay.rs).
import os, pathlib, subprocess, asyncio, json, time
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
ROOT = pathlib.Path(HERE).parent
APP = ROOT.joinpath('inkling.html').as_uri()
QR = ROOT / 'node_modules/qrcode-generator/qrcode.js'
from playwright.async_api import async_playwright

PORT = 3471
IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

RUST = ROOT / 'src-tauri' / 'target' / 'debug' / 'examples' / 'pad_relay'
def start_relay():
    env = dict(os.environ, CS_PAD_PORT=str(PORT), CS_PAD_QUIET='1', CS_PAD_IPS='127.0.0.1')
    # CS_PAD_RUST=1: the relay inside the desktop app (src-tauri/src/padrelay.rs; build it with
    # cargo build --example pad_relay in src-tauri) instead of scripts/pad-relay.mjs
    cmd = [str(RUST), str(ROOT / 'inkling.html')] if os.environ.get('CS_PAD_RUST') == '1' else ['node', str(ROOT / 'scripts' / 'pad-relay.mjs')]
    p = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    t0 = time.time()
    while time.time() - t0 < 10:
        if 'READY' in p.stdout.readline(): return p
    raise RuntimeError('pad relay did not start')

async def qr_route(route):
    if QR.exists(): await route.fulfill(path=str(QR), content_type='application/javascript')
    else: await route.continue_()

async def draw(pg, sel, x0=40, y0=50, dx=120, dy=40):
    b = await (await pg.query_selector(sel)).bounding_box()
    await pg.mouse.move(b['x'] + x0, b['y'] + y0); await pg.mouse.down()
    await pg.mouse.move(b['x'] + x0 + dx, b['y'] + y0 + dy, steps=8); await pg.mouse.up()

async def until(pg, js, secs=8):
    for _ in range(int(secs * 10)):
        if await pg.evaluate(js): return True
        await pg.wait_for_timeout(100)
    return False

async def new_page(pg):
    await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Bio'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
    await (await pg.query_selector_all('.kind'))[1].click(); await pg.fill('.modal input.field', 'Zellen'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(500)
    await pg.click('.flow'); await pg.keyboard.type('Erste Zeile')
    if not await pg.is_visible('#ptab-pen'): await pg.click('#rail button[data-ptab="pen"]')
    await pg.wait_for_timeout(400)

async def main():
    errs, must = [], {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 1. the browser version without the relay: the dialog says how to start it
        ctx0 = await b.new_context(viewport={'width': 1440, 'height': 900})
        await ctx0.route('**/qrcode*.js', qr_route)
        br = await ctx0.new_page(); br.on('pageerror', lambda e: errs.append('browser: ' + str(e)))
        await br.add_init_script("window.claude = undefined; localStorage.setItem('inkling:pref:padPort', '%d')" % PORT)
        await br.goto(APP); await br.wait_for_timeout(900)
        await new_page(br)
        await br.click('#padSyncBtn'); await br.wait_for_timeout(2500)
        why = await br.inner_text('#padLanWhy') if await br.query_selector('#padLanWhy') else None
        print('browser version, no relay yet:', why)
        must['says how to start it'] = bool(why) and 'npm run pad' in why
        relay = start_relay()
        try:
            await br.click('#padLanRetry'); await br.wait_for_timeout(1500)
            link = await br.input_value('#padLinkIn') if await br.query_selector('#padLinkIn') else None
            print('Try again finds the relay:', link)
            must['try again finds it'] = bool(link) and link.startswith('http://127.0.0.1:%d/#pad=' % PORT)
            await ctx0.close()

            # 2. the relay: other websites and short codes are refused, it serves the app
            ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
            await ctx.route('**/qrcode*.js', qr_route)
            ev = await ctx.new_page(); await ev.goto('http://127.0.0.1:%d/' % PORT)
            served = await ev.evaluate("!!window.CS_PAD_RELAY && !!document.getElementById('app')")
            await ev.goto('about:blank')
            other = await ev.evaluate("""(port) => new Promise((res) => { const w = new WebSocket('ws://127.0.0.1:' + port + '/padlink'); w.onopen = () => res('open'); w.onerror = () => res('refused'); setTimeout(() => res('timeout'), 1500); })""", PORT)
            await ev.close()
            print('relay serves the app:', served, '| a connection from another website:', other)
            must['relay serves the app'] = served
            must['relay refuses other websites'] = other == 'refused'

            # 3. the desktop app starts the relay and shows the QR code
            nb = await ctx.new_page(); nb.on('pageerror', lambda e: errs.append('desktop: ' + str(e)))
            await nb.add_init_script(open('mock_desk.js').read())
            await nb.add_init_script("localStorage.setItem('inkling:pref:padPort', '%d')" % PORT)
            await nb.goto(APP); await nb.wait_for_timeout(1000)
            await new_page(nb)
            await nb.click('#padSyncBtn'); await nb.wait_for_timeout(1500)
            code = await nb.inner_text('#padCodeEl')
            link = await nb.input_value('#padLinkIn') if await nb.query_selector('#padLinkIn') else ''
            qr = await nb.evaluate("!!document.querySelector('.pad-qr svg') && document.querySelector('.pad-qr svg').innerHTML.length > 2000")
            starts = await nb.evaluate("window.__desk.padStarts")
            steps = await nb.evaluate("[...document.querySelectorAll('.pad-steps li')].map(l => l.innerText)")
            print('desktop app: started the relay', starts, '| link', link, '| QR code:', qr, '| steps:', len(steps), steps[:1])
            must['desktop starts the relay and shows the QR code'] = starts == [PORT] and link == 'http://127.0.0.1:%d/#pad=%s' % (PORT, code) and qr

            # 4. the phone opens the link: the pad straight away, both sides connected
            ph_ctx = await b.new_context(viewport={'width': 390, 'height': 844}, user_agent=IPHONE, has_touch=True)
            ph = await ph_ctx.new_page(); ph.on('pageerror', lambda e: errs.append('phone: ' + str(e)))
            await ph.goto(link); await ph.wait_for_timeout(2500)
            is_pad = await ph.query_selector('.padmode') is not None
            conn = await until(ph, "(document.querySelector('.pm-conn') || {}).innerText && !/waiting|not connected/i.test(document.querySelector('.pm-conn').innerText)")
            nbs = await until(nb, "(document.querySelector('.pad-status') || {}).innerText && document.querySelector('.pad-status').innerText.includes('phone')")
            print('phone: the pad straight away:', is_pad, '|', await ph.inner_text('.pm-conn') if is_pad else None, '| notebook:', await nb.inner_text('.pad-status'))
            must['phone is the pad and both are connected'] = is_pad and conn and nbs
            await nb.click('.modal .btn.primary:has-text("Done")')

            # 5. what the phone draws lands on the page
            await ph.click('.pm-modeseg button:has-text("Draw")'); await ph.wait_for_timeout(300)
            pics0 = await nb.evaluate("document.querySelectorAll('.obj-image').length")
            await draw(ph, '.pm-canvas', 80, 120, 160, 120); await ph.wait_for_timeout(600)
            await ph.click('#pmInsert')
            got = await until(nb, "document.querySelectorAll('.obj-image').length > %d" % pics0)
            print('phone drawing → page:', got, '|', await ph.inner_text('.pm-status'))
            must['phone drawing lands on the page'] = got
            await ph_ctx.close(); await ctx.close()
        finally:
            relay.terminate()
        await b.close()
    errs += ['check failed: ' + k for k, v in must.items() if not v]
    print('ERRORS', errs)

asyncio.run(main())

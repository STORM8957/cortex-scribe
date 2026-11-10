# Zoom on A4 and endless pages (buttons, Ctrl + scroll, two-finger pinch), moving things with a finger (a chosen object and
# a window's top bar), the 3D object description the AI keeps to (3D studio and 3D windows), and your own Magic box
# buttons plus a rule for just this once. Inside Claude, with stand-in AI answers.
import os, pathlib, json, re
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
LOCAL_THREE = pathlib.Path(HERE).parent / 'node_modules/three/build/three.min.js'
import asyncio
from playwright.async_api import async_playwright

MOCK = r"""
(() => {
  window.__ai = [];
  const CAR = { name: 'Car', parts: [{ type: 'box', name: 'Body', pos: [0, 0.6, 0], size: [2, 0.6, 1] }, { type: 'box', name: 'Roof', pos: [0, 1.1, 0], size: [1, 0.4, 0.9] }, { type: 'cylinder', name: 'Wheel', pos: [0.7, 0.3, 0.55], rTop: 0.3, rBottom: 0.3, h: 0.2 }] };
  const rec = (s, kind) => window.__ai.push({ kind, s: s.slice(0, 6000) });
  const sample = async (input) => { const s = typeof input === 'string' ? input : JSON.stringify(input); rec(s, 'text'); await new Promise((r) => setTimeout(r, 30)); return { text: '## Karteikarten\n- Was ist eine Zelle? – Die kleinste Einheit', truncated: false }; };
  sample.json = async (input) => {
    const s = typeof input === 'string' ? input : JSON.stringify(input); rec(s, 'json'); await new Promise((r) => setTimeout(r, 30));
    if (s.includes('Sort them into the pieces')) return { pieces: [{ name: 'Body', parts: [0, 1] }, { name: 'Wheel', parts: [2] }] };
    return CAR;
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 5e6, mediaTypes: ['image/png', 'image/jpeg'] } });
  window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
})();
"""
DOC = """() => { for (const k of Object.keys(localStorage)) if (k.startsWith('inkling:data:note_')) { const d = JSON.parse(localStorage[k]); if (d.objs && Object.values(d.objs).some((o) => o.t === 'm3d')) return Object.values(d.objs).filter((o) => !o.del); } return []; }"""
OBJS = """() => { const out = []; for (const k of Object.keys(localStorage)) if (k.startsWith('inkling:data:note_')) { const d = JSON.parse(localStorage[k]); if (d.objs) out.push(...Object.values(d.objs).filter((o) => !o.del)); } return out; }"""
# a two-finger pinch on an element, made of real touch events
PINCH = """async ([sel, from, to]) => {
  const el = document.querySelector(sel), r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const T = (id, dx) => new Touch({ identifier: id, target: el, clientX: cx + dx, clientY: cy });
  const fire = (type, d) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [T(1, -d), T(2, d)], changedTouches: [T(1, -d), T(2, d)] }));
  fire('touchstart', from);
  for (let i = 1; i <= 6; i++) { fire('touchmove', from + (to - from) * i / 6); await new Promise((r) => requestAnimationFrame(r)); }
  fire('touchend', to);
  await new Promise((r) => setTimeout(r, 60));
}"""
# a finger drag (pointer events of type touch) from an element by dx, dy
TOUCHDRAG = """async ([sel, dx, dy]) => {
  const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.left + Math.min(40, r.width / 2), y = r.top + Math.min(14, r.height / 2);
  const P = (type, px, py, t) => (t || el).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: px, clientY: py }));
  P('pointerdown', x, y);
  for (let i = 1; i <= 8; i++) { P('pointermove', x + dx * i / 8, y + dy * i / 8, window); if (i % 2) await new Promise((r) => requestAnimationFrame(r)); }
  P('pointerup', x + dx, y + dy, window);
  await new Promise((r) => setTimeout(r, 50));
}"""

async def new_page(pg, nb, kind_index, name):
    if nb:
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', nb); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
    else:
        await pg.click('.t-row.top .t-acts button'); await pg.click('.menu button:has-text("New page")'); await pg.wait_for_timeout(200)
    await (await pg.query_selector_all('.kind'))[kind_index].click(); await pg.fill('.modal input.field', name); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(700)

async def select_note(pg):
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
    await pg.click('.obj-note >> nth=0'); await pg.wait_for_timeout(150)
    await pg.click('.rtabs button:has-text("Magic box")'); await pg.wait_for_timeout(150)   # the ribbon offers “Use on selection”

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        if LOCAL_THREE.exists(): await pg.route('**/three.min.js', lambda r: r.fulfill(path=str(LOCAL_THREE), content_type='application/javascript'))
        await pg.add_init_script(MOCK)
        await pg.goto(APP); await pg.wait_for_timeout(1000)

        # 1. zoom on an endless page and on an A4 page
        await new_page(pg, 'Bio', 1, 'Zellen')
        await pg.click('.flow'); await pg.keyboard.type('Die Zelle ist die kleinste Einheit des Lebens.')
        z = [await pg.inner_text('.page-zoom #zoomLabel')]
        await pg.click('.page-zoom button[aria-label="Zoom in"]'); await pg.wait_for_timeout(150); z.append(await pg.inner_text('#zoomLabel'))
        await pg.mouse.move(700, 400); await pg.keyboard.down('Control'); await pg.mouse.wheel(0, -300); await pg.keyboard.up('Control'); await pg.wait_for_timeout(200); z.append(await pg.inner_text('#zoomLabel'))
        await pg.evaluate(PINCH, ['#scroller', 60, 140]); await pg.wait_for_timeout(200); z.append(await pg.inner_text('#zoomLabel'))
        await pg.click('.page-zoom button[aria-label="Zoom out"]'); await pg.wait_for_timeout(150); z.append(await pg.inner_text('#zoomLabel'))
        css_zoom = await pg.evaluate("getComputedStyle(document.querySelector('.pages')).zoom")
        print('endless page zoom:', ' → '.join(z), '| the page itself is zoomed', css_zoom, '| browser pinch-zoom off on pages:', await pg.evaluate("getComputedStyle(document.getElementById('scroller')).touchAction"))
        await pg.click('.page-zoom button[aria-label="Fit to width"]'); await pg.wait_for_timeout(150)
        await new_page(pg, None, 0, 'Blatt')
        a = [await pg.inner_text('.page-zoom #zoomLabel')]
        await pg.click('.page-zoom button[aria-label="Zoom in"]'); await pg.wait_for_timeout(150); a.append(await pg.inner_text('#zoomLabel'))
        print('A4 page zoom:', ' → '.join(a), '| one zoom box:', await pg.evaluate("document.querySelectorAll('.page-zoom').length"))

        # 2. a finger moves a chosen box and a window by its top bar (instead of scrolling the page)
        await pg.click('.t-name:has-text("Zellen")'); await pg.wait_for_timeout(700)
        await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('Box'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1400)
        if not await pg.query_selector('.obj.is-sel'): await pg.click('.obj-note'); await pg.wait_for_timeout(200)
        box = [o for o in await pg.evaluate(OBJS) if o['t'] == 'note'][0]
        ta = await pg.evaluate("[getComputedStyle(document.querySelector('.obj.is-sel')).touchAction]")
        await pg.evaluate(TOUCHDRAG, ['.obj.is-sel', 120, 60]); await pg.wait_for_timeout(1200)
        box2 = [o for o in await pg.evaluate(OBJS) if o['t'] == 'note'][0]
        print('finger drag of a chosen box: moved', box2['x'] - box['x'], box2['y'] - box['y'], '| touch-action', ta)

        # 3. the 3D object description (3D studio)
        await pg.click('#rail button[data-ptab="m3d"]'); await pg.wait_for_timeout(500)
        await pg.fill('#ptab-m3d .m3d-new textarea', 'a small red car'); await pg.click('#ptab-m3d .m3d-new button:has-text("Create from text")'); await pg.wait_for_timeout(900)
        first = await pg.input_value('#m3dDesc')
        await pg.fill('#m3dDesc', 'Ein Fiat 500 von 1960, rund, mit Stoffdach und Chromstossstangen'); await pg.wait_for_timeout(700)
        await pg.click('#m3dDescApply'); await pg.wait_for_timeout(900)
        last = (await pg.evaluate('window.__ai'))[-1]['s']
        await pg.click('#m3dDissect'); await pg.wait_for_timeout(900)
        dis = (await pg.evaluate('window.__ai'))[-1]['s']
        print('3D description: starts as what it was made from', first == 'a small red car', '| change to match: told', 'Fiat 500 von 1960' in last and 'matches the description' in last, '| Dissect keeps to it', 'Fiat 500 von 1960' in dis)
        # ... and in a 3D window: right-click → Describe the object
        await pg.click('#ptab-m3d button:has-text("Put on the page as a 3D window")'); await pg.wait_for_timeout(900)
        await pg.click('#closePanel'); await pg.wait_for_timeout(300)
        w = (await pg.evaluate(DOC))
        win = [o for o in w if o['t'] == 'm3d'][0]
        nm = await pg.query_selector('.obj-m3d .w3-name'); bb = await nm.bounding_box()
        await pg.mouse.click(bb['x'] + 6, bb['y'] + 6, button='right'); await pg.wait_for_timeout(300)
        await pg.click('.menu button:has-text("Describe the object for the AI")'); await pg.wait_for_timeout(300)
        took = await pg.input_value('.modal textarea')
        await pg.fill('.modal textarea', 'Ein rotes Spielzeugauto aus Holz')
        await pg.click('.modal button:has-text("Save and change the model to match")'); await pg.wait_for_timeout(1300)
        cmd = (await pg.evaluate('window.__ai'))[-1]['s']
        win2 = [o for o in await pg.evaluate(DOC) if o['t'] == 'm3d'][0]
        print('3D window: took over the model’s description', 'Fiat 500' in took, '| saved', win2.get('desc'), '| Cmd keeps to it', 'Spielzeugauto aus Holz' in cmd, '| window top bar moves with a finger:', await pg.evaluate("getComputedStyle(document.querySelector('.w3-head')).touchAction"))
        x0 = win2['x']
        await pg.evaluate(TOUCHDRAG, ['.obj-m3d .w3-name', 90, 0]); await pg.wait_for_timeout(1200)
        print('finger drag of a 3D window by its top bar: moved', [o for o in await pg.evaluate(DOC) if o['t'] == 'm3d'][0]['x'] - x0)

        # 4. your own Magic box button, and a rule for just this once
        await pg.click('.rtabs button:has-text("Magic box")'); await pg.wait_for_timeout(200)
        for lab in ['Tidy drawings', 'Tidy layout']:
            chip = await pg.query_selector('#ribbon .chip[aria-pressed="true"]:has-text("' + lab + '")')
            if chip: await chip.click(); await pg.wait_for_timeout(100)
        await pg.click('#magicAddBtn'); await pg.wait_for_timeout(200)
        await pg.fill('#mbName', 'Karteikarten'); await pg.fill('#mbRule', 'Mach daraus 3 Karteikarten: Frage, dann Antwort.')
        await pg.click('.modal button:has-text("Add the button")'); await pg.wait_for_timeout(300)
        chips = await pg.evaluate("[...document.querySelectorAll('#ribbon .chip')].filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.innerText)")
        notes0 = len([o for o in await pg.evaluate(OBJS) if o['t'] == 'note'])
        await select_note(pg)
        await pg.click('#ribbon button:has-text("Use on selection")'); await pg.wait_for_timeout(1300)
        ai = (await pg.evaluate('window.__ai'))[-1]['s']
        notes1 = [o for o in await pg.evaluate(OBJS) if o['t'] == 'note']
        print('your button: switched on', chips, '| the AI was given the rule', 'Mach daraus 3 Karteikarten' in ai, '| result on the page', len(notes1) - notes0, 'box:', [o['html'][:40] for o in notes1][-1:])
        print('kept in settings (and backups):', [c['name'] for c in json.loads(await pg.evaluate("localStorage.getItem('inkling:pref:magic')") or '{}').get('custom', [])])
        # just this once
        n_before = len(await pg.evaluate('window.__ai'))
        await pg.fill('#magicAsk', 'Nenne drei Prüfungsfragen dazu')
        await pg.press('#magicAsk', 'Enter'); await pg.wait_for_timeout(200)
        await pg.keyboard.press('Escape')
        await select_note(pg)
        await pg.click('#ribbon button:has-text("Use on selection")'); await pg.wait_for_timeout(1300)
        calls = await pg.evaluate('window.__ai')
        once = calls[-1]['s']
        await select_note(pg)
        await pg.click('#ribbon button:has-text("Use on selection")'); await pg.wait_for_timeout(1300)
        after = (await pg.evaluate('window.__ai'))[-1]['s']
        print('just this once: used', 'drei Prüfungsfragen' in once, '| your button not run with it', all('Mach daraus 3 Karteikarten' not in c['s'] for c in calls[n_before:]), '| next time back to your buttons', 'Mach daraus 3 Karteikarten' in after and 'Prüfungsfragen' not in after)
        # change and delete the button (right-click on its chip)
        await pg.click('#ribbon .chip.own', button='right'); await pg.wait_for_timeout(200)
        await pg.click('.modal button:has-text("Delete")'); await pg.wait_for_timeout(300)
        print('button deleted:', await pg.evaluate("document.querySelectorAll('#ribbon .chip.own').length") == 0)
        print('task in docs/AI.md:', 'magic.custom' in open('../docs/AI.md').read())
        print('ERRORS', errs[:5])
        await b.close()
asyncio.run(main())

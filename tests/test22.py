# 3D pieces and more (38_3dparts.js, 28b_3d.js, 30_3dmedia.js): 2× more detail, a model from a photo (chosen and dropped),
# Dissect, Create internal components, X-ray, arranging pieces, 3D windows for every piece and for chosen pieces,
# spin speed, choosing several windows with Ctrl + right-click and changing them together, and the drawing pad on a
# phone (upright and sideways). Inside Claude, with stand-in AI answers.
import os, pathlib, json, re
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
LOCAL_THREE = pathlib.Path(HERE).parent / 'node_modules/three/build/three.min.js'
import asyncio
from playwright.async_api import async_playwright

MOCK = r"""
(() => {
  window.__ai = [];
  const P = (type, name, pos, extra) => Object.assign({ type, name, pos, color: '#cc3333' }, extra);
  const CAR = { name: 'Car', parts: [P('box', 'Body', [0, 0.6, 0], { size: [2, 0.6, 1] }), P('box', 'Roof', [0, 1.1, 0], { size: [1, 0.4, 0.9] }),
    P('cylinder', 'Wheel front', [0.7, 0.3, 0.55], { rTop: 0.3, rBottom: 0.3, h: 0.2, rot: [90, 0, 0] }), P('cylinder', 'Wheel back', [-0.7, 0.3, 0.55], { rTop: 0.3, rBottom: 0.3, h: 0.2, rot: [90, 0, 0] })] };
  const answer = (s, opts) => {
    window.__ai.push({ s: s.slice(0, 4000), images: (opts && opts.images || []).length, effort: opts && opts.effort });
    if (s.includes('Sort them into the pieces')) { const n = (s.match(/^\d+: /gm) || []).length; return { pieces: [{ name: 'Body shell', parts: [0, 1] }, { name: 'Wheels', parts: [2, 3] }].concat(n > 4 ? [{ name: 'Engine inside', parts: Array.from({ length: n - 4 }, (_, i) => i + 4) }] : []) }; }
    if (s.includes('Design the internal components')) return { parts: [P('cylinder', 'Piston', [0, 0.6, 0], { rTop: 0.1, rBottom: 0.1, h: 0.3 }), P('box', 'Crankshaft', [0, 0.45, 0], { size: [0.8, 0.08, 0.08] })] };
    if (s.includes('main object in the attached photo')) return { name: 'Mug', parts: [P('cylinder', 'Cup', [0, 0.5, 0], { rTop: 0.4, rBottom: 0.35, h: 1 }), P('torus', 'Handle', [0.45, 0.5, 0], { r: 0.25, tube: 0.06 })] };
    if (s.includes('Change it like this')) return CAR;
    if (s.includes('Build a 3D model of')) return CAR;
    return {};
  };
  const sample = async (input, opts) => { await new Promise((r) => setTimeout(r, 30)); return { text: 'ok', truncated: false }; };
  sample.json = async (input, opts) => { await new Promise((r) => setTimeout(r, 40)); return answer(typeof input === 'string' ? input : JSON.stringify(input), opts); };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 5e6, mediaTypes: ['image/png', 'image/jpeg'] } });
  window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
})();
"""
DOC = """() => { for (const k of Object.keys(localStorage)) if (k.startsWith('inkling:data:note_')) { const d = JSON.parse(localStorage[k]); if (d.objs) return Object.values(d.objs).filter((o) => o.t === 'm3d' && !o.del); } return []; }"""
DROP = """async (sel) => {
  const c = document.createElement('canvas'); c.width = c.height = 40; const x = c.getContext('2d'); x.fillStyle = '#3a6'; x.fillRect(0, 0, 40, 40);
  const b = await new Promise((r) => c.toBlob(r, 'image/png'));
  const dt = new DataTransfer(); dt.items.add(new File([b], 'mug.png', { type: 'image/png' }));
  const el = document.querySelector(sel);
  for (const t of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
}"""

async def menu_path(pg, *labels):
    """clicks through an open menu: sub-menus by label, then the last item"""
    for lab in labels:
        await pg.click('.menu button:has-text("' + lab + '")'); await pg.wait_for_timeout(250)

async def assets(pg):
    closed = await pg.evaluate("document.querySelector('.app').classList.contains('panel-closed')")
    if closed or not await pg.is_visible('#ptab-m3d'): await pg.click('#rail button[data-ptab="m3d"]'); await pg.wait_for_timeout(400)
    await pg.click('#m3dTab-assets'); await pg.wait_for_timeout(300)

async def new_form(pg):
    await assets(pg)
    if not await pg.is_visible('.m3d-new'): await pg.click('#m3dNew'); await pg.wait_for_timeout(300)

async def right_click_head(pg, i, ctrl=False):
    hd = (await pg.query_selector_all('.obj-m3d .w3-name'))[i]
    b = await hd.bounding_box()
    if ctrl: await pg.keyboard.down('Control')
    await pg.mouse.click(b['x'] + 6, b['y'] + b['height'] / 2, button='right')
    if ctrl: await pg.keyboard.up('Control')
    await pg.wait_for_timeout(350)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        if LOCAL_THREE.exists(): await pg.route('**/three.min.js', lambda r: r.fulfill(path=str(LOCAL_THREE), content_type='application/javascript'))
        await pg.add_init_script(MOCK)
        await pg.goto(APP); await pg.wait_for_timeout(1000)
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Technik'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await (await pg.query_selector_all('.kind'))[2].click(); await pg.fill('.modal input.field', 'Motor'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(700)
        await pg.click('#rail button[data-ptab="m3d"]'); await pg.wait_for_timeout(600)

        # 1. 2× more detail: the AI is told to use twice the parts
        print('3D studio tabs:', await pg.evaluate("[...document.querySelectorAll('.m3d-tab')].map(t => t.innerText.replace(/\\s+/g, ' ').trim())"), '| empty page: the form in Preview', await pg.is_visible('#ptab-m3d .m3d-new'))
        await new_form(pg)
        await pg.check('#m3dDetail2')
        await pg.fill('.m3d-new textarea', 'a small red car'); await pg.click('.m3d-new button:has-text("Create from text")'); await pg.wait_for_timeout(900)
        last = (await pg.evaluate('window.__ai'))[-1]['s']
        print('2× detail: told', 'twice as detailed' in last, '| up to 120 parts', 'at most 120 parts' in last, '| remembered', await pg.evaluate("localStorage.getItem('inkling:pref:m3dDetail2')"))
        print('after making it: Preview tab', await pg.get_attribute('#m3dTab-preview', 'aria-selected'), '| shows', await pg.inner_text('#ptab-m3d .v3-name'))
        await new_form(pg); await pg.uncheck('#m3dDetail2')
        # 2. a model from a photo, chosen and dropped
        await pg.set_input_files('#m3dPhotoIn', 'pic.png'); await pg.wait_for_timeout(1200)
        a = (await pg.evaluate('window.__ai'))[-1]
        await new_form(pg); await pg.evaluate(DROP, '.m3d-new'); await pg.wait_for_timeout(1200)
        a2 = (await pg.evaluate('window.__ai'))[-1]
        await assets(pg)
        print('photo → model: asked with the photo', 'main object in the attached photo' in a['s'], a['images'] == 1, '| dropped photo too', 'attached photo' in a2['s'] and a2['images'] == 1,
              '| models:', await pg.evaluate("[...document.querySelectorAll('#ptab-m3d .ol-item span')].map(s => s.innerText)"))
        # 3. the car on the page as a 3D window, then Dissect (button in the window's top bar)
        await assets(pg); await pg.click('#ptab-m3d .ol-item:has-text("Car")'); await pg.wait_for_timeout(500)
        await pg.click('#ptab-m3d button:has-text("Put on the page as a 3D window")'); await pg.wait_for_timeout(900)
        await pg.click('.obj-m3d .w3-btn:has-text("Dissect")'); await pg.wait_for_timeout(1500)
        w = (await pg.evaluate(DOC))[0]
        pcs = [l for l in w.get('links', []) if l.get('piece')]
        print('dissect:', [(l['name'], len(l['scene']['parts'])) for l in pcs], '| main model empty', len(w['scene']['parts']) == 0, '| pulled apart (exploded)', any(any(abs(v) > 0.01 for v in l['pos']) for l in pcs))
        # 4. internal components: parts inside, X-ray on, pieces put back together first
        await right_click_head(pg, 0); await menu_path(pg, 'Pieces', 'Create internal components'); await pg.wait_for_timeout(1500)
        w = (await pg.evaluate(DOC))[0]
        inner = [x['name'] for x in w['scene']['parts'] if x.get('internal')]
        print('internal components:', inner, '| X-ray on', w.get('xray'), '| pieces back in the model', not any(l.get('piece') for l in w.get('links', [])), '| told the space inside', 'Its outer shape fills about' in (await pg.evaluate('window.__ai'))[-1]['s'])
        # 5. dissect again: the inside parts become a piece too
        await pg.click('.obj-m3d .w3-btn:has-text("Dissect")'); await pg.wait_for_timeout(1500)
        w = (await pg.evaluate(DOC))[0]
        print('dissect again:', [l['name'] for l in w['links'] if l.get('piece')], '| inside parts kept their mark', any(x.get('internal') for l in w['links'] for x in l['scene']['parts']))
        # 6. arrange: in a row (distinct places), back together (all at 0)
        await right_click_head(pg, 0); await menu_path(pg, 'Pieces', 'Arrange the pieces', 'In a row'); await pg.wait_for_timeout(800)
        xs = [l['pos'][0] for l in (await pg.evaluate(DOC))[0]['links']]
        await right_click_head(pg, 0); await menu_path(pg, 'Pieces', 'Arrange the pieces', 'Put back together'); await pg.wait_for_timeout(800)
        back = [l['pos'] for l in (await pg.evaluate(DOC))[0]['links']]
        print('arrange: in a row', len(set(xs)) == len(xs) and all(xs[i] < xs[i + 1] for i in range(len(xs) - 1)), '| back together', all(p == [0, 0, 0] for p in back))
        # 7. a 3D window for every piece, and for chosen pieces only
        n0 = len(await pg.query_selector_all('.obj-m3d'))
        await right_click_head(pg, 0); await menu_path(pg, 'Pieces', 'A 3D window for every piece'); await pg.wait_for_timeout(900)
        n1 = len(await pg.query_selector_all('.obj-m3d'))
        await pg.keyboard.press('Escape')
        await right_click_head(pg, 0); await menu_path(pg, 'Pieces', 'Choose pieces for 3D windows'); await pg.wait_for_timeout(300)
        boxes = await pg.query_selector_all('.modal .piece-list input')
        for bx in boxes[1:]: await bx.uncheck()
        await pg.click('.modal button:has-text("Make the windows")'); await pg.wait_for_timeout(900)
        n2 = len(await pg.query_selector_all('.obj-m3d'))
        names = [o['name'] for o in await pg.evaluate(DOC)]
        print('windows for pieces: all', n1 - n0, '| chosen', n2 - n1, '| named after the pieces:', names[1:])
        # 8. spin: slower by default, speed adjustable
        await pg.keyboard.press('Escape')
        await right_click_head(pg, 0); await menu_path(pg, 'Spin speed', 'Fast'); await pg.wait_for_timeout(1300)
        w = (await pg.evaluate(DOC))[0]
        print('spin speed: fast', w.get('spinSpeed'), '| spinning', w.get('spin'))
        # 9. Ctrl + right-click two windows, then one menu changes both
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)   # menu closed, nothing selected
        await pg.click('#closePanel'); await pg.click('.rtabs button:has-text("View")'); await pg.click('#ribbon button[aria-label="Fit everything"]'); await pg.wait_for_timeout(600)   # every window in sight
        await right_click_head(pg, 1, ctrl=True); await right_click_head(pg, 2, ctrl=True)
        toast = await pg.evaluate("[...document.querySelectorAll('.toast')].map(t => t.innerText).pop() || ''")
        await right_click_head(pg, 1)
        head = await pg.evaluate("(document.querySelector('.menu .mlabel') || {}).innerText")
        await menu_path(pg, 'Spin'); await pg.wait_for_timeout(1300)
        ws = await pg.evaluate(DOC)
        print('Ctrl + right-click:', '2 windows chosen' in toast, '| menu:', head, '| both spin now:', [bool(o.get('spin')) for o in ws[1:3]])
        chosen = [o['id'] for o in ws if o.get('spin')][-2:]
        before = [bool(o.get('xray')) for o in ws if o['id'] in chosen]
        await right_click_head(pg, 1); await menu_path(pg, 'Pieces', 'See inside'); await pg.wait_for_timeout(1300)
        after = [bool(o.get('xray')) for o in await pg.evaluate(DOC) if o['id'] in chosen]
        print('X-ray for both together: before', before, '→ after', after)
        print('task names in docs/AI.md:', all(t in open('../docs/AI.md').read() for t in ['model3d.dissect', 'model3d.internals', 'model3d.photo']))

        # 9b. a sub-menu inside a sub-menu stays open when the mouse moves into it (Pieces → Arrange the pieces)
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
        await right_click_head(pg, 0)
        await pg.hover('.menu button:has-text("Pieces")'); await pg.wait_for_timeout(450)
        await pg.hover('.menu.sub button:has-text("Arrange the pieces")'); await pg.wait_for_timeout(450)
        levels = await pg.evaluate("document.querySelectorAll('.menu').length")
        await pg.hover('.menu.sub >> nth=1 >> button:has-text("In a grid")'); await pg.wait_for_timeout(450)
        still = await pg.evaluate("document.querySelectorAll('.menu').length")
        await pg.click('.menu.sub >> nth=1 >> button:has-text("In a grid")'); await pg.wait_for_timeout(1300)
        print('menu inside a menu: open menus', levels, '| still open on the last item', still == 3, '| grid chosen:', len(set(tuple(l['pos']) for l in (await pg.evaluate(DOC))[0]['links'])) > 1)

        # 9c. Max effort: the AI is asked for the most exact copy, at the highest effort
        await new_form(pg)
        await pg.check('#m3dMax')
        await pg.fill('.m3d-new textarea', 'a V8 engine'); await pg.click('.m3d-new button:has-text("Create from text")'); await pg.wait_for_timeout(1000)
        a = (await pg.evaluate('window.__ai'))[-1]
        print('Max effort: told', 'Replicate the object as faithfully' in a['s'], '| up to 160 parts', 'at most 160 parts' in a['s'], '| effort', a['effort'])
        await new_form(pg); await pg.uncheck('#m3dMax')
        # 9d. each model's parts as a folder; Dissect in the 3D studio turns them into pieces
        await assets(pg)
        here = await pg.evaluate("[...document.querySelectorAll('#ptab-m3d .m3d-row .ol-item span')].map(s => s.innerText)")
        await pg.click('#ptab-m3d .m3d-row:has-text("Car") .m3d-tog'); await pg.wait_for_timeout(400)
        parts = await pg.evaluate("[...document.querySelectorAll('#ptab-m3d .m3d-kids .ol-item span')].map(s => s.innerText)")
        await pg.click('#ptab-m3d .m3d-kids .ol-item:has-text("Roof")'); await pg.wait_for_timeout(400)
        head = await pg.inner_text('#ptab-m3d .v3-name')
        w0 = len(await pg.query_selector_all('.obj-m3d'))
        await pg.click('#m3dPlaceSub'); await pg.wait_for_timeout(900)
        print('parts folder:', parts, '| shown alone:', head, '| put on the page:', len(await pg.query_selector_all('.obj-m3d')) - w0, 'window')
        await pg.click('#ptab-m3d button:has-text("The whole model")'); await pg.wait_for_timeout(300)
        await pg.click('#m3dDissect'); await pg.wait_for_timeout(1500)
        await assets(pg)
        pieces = await pg.evaluate("[...document.querySelectorAll('#ptab-m3d .m3d-row:has(.ol-item[aria-current]) + .m3d-kids .ol-item span')].map(s => s.innerText)")
        print('dissect in the studio: pieces folder', pieces)
        # 9e. another page shows only its own models; the others are in a folder
        await pg.click('.t-row.top .t-acts button'); await pg.click('.menu button:has-text("New page")'); await pg.wait_for_timeout(200)
        await (await pg.query_selector_all('.kind'))[2].click(); await pg.fill('.modal input.field', 'Getriebe'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(800)
        await assets(pg)
        here2 = await pg.evaluate("[...document.querySelectorAll('#ptab-m3d .m3d-row')].length")
        folder = await pg.inner_text('#m3dOther')
        await pg.click('#m3dOther'); await pg.wait_for_timeout(300)
        groups = await pg.evaluate("[...document.querySelectorAll('#ptab-m3d .m3d-page')].map(p => p.innerText)")
        await pg.click('#ptab-m3d .m3d-other .ol-item:has-text("Mug")'); await pg.wait_for_timeout(400)
        print('first page listed:', here, '| new page: own models', here2, '|', folder, '| groups', groups, '| opened from there:', await pg.inner_text('#ptab-m3d .v3-name'))
        await new_form(pg); await pg.fill('.m3d-new textarea', 'a gear'); await pg.click('.m3d-new button:has-text("Create from text")'); await pg.wait_for_timeout(900)
        await assets(pg)
        # 9g. more view windows: another angle, close-ups of parts (from + View and from the Assets list); the floor grows
        await pg.click('#ptab-m3d .m3d-row .ol-item:has-text("Car · 4 parts")'); await pg.wait_for_timeout(400)
        await pg.click('#m3dAddView'); await pg.click('.menu button:has-text("Another view of the whole model")'); await pg.wait_for_timeout(500)
        await pg.click('#m3dAddView'); await pg.hover('.menu button:has-text("Close-up of one part")'); await pg.wait_for_timeout(400)
        await pg.click('.menu.sub button:has-text("Wheel front")'); await pg.wait_for_timeout(500)
        await assets(pg); await pg.click('#ptab-m3d .m3d-row:has-text("Car · 4 parts") .m3d-tog'); await pg.wait_for_timeout(300)
        await pg.click('#ptab-m3d .m3d-kid:has-text("Roof") .m3d-zoom'); await pg.wait_for_timeout(600)
        views = await pg.evaluate("[...document.querySelectorAll('.m3d-view .v3-name')].map(n => n.innerText)")
        drawn = await pg.evaluate("[...document.querySelectorAll('.m3d-view canvas')].every(c => c.width > 0)")
        await pg.click('.m3d-view:has-text("View 2") button[aria-label=\"Close this view\"]'); await pg.wait_for_timeout(400)
        print('view windows:', views, '| drawn', drawn, '| after closing one:', await pg.evaluate("[...document.querySelectorAll('.m3d-view .v3-name')].map(n => n.innerText)"))
        await assets(pg)
        print('a model made here belongs here:', await pg.evaluate("[...document.querySelectorAll('#ptab-m3d > .m3d-row .ol-item span')].map(s => s.innerText)"))
        await pg.close()

        # 9f. Max effort with Claude's API key (browser version): effort "max" in the request
        sent = []
        async def anthropic(route):
            if route.request.method == 'OPTIONS': return await route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'})
            body = json.loads(route.request.post_data or '{}'); sent.append(body)
            model = json.dumps({'name': 'Gear', 'parts': [{'type': 'cylinder', 'name': 'Wheel', 'pos': [0, 0.5, 0], 'rTop': 1, 'rBottom': 1, 'h': 0.3}]})
            ev = lambda n, d: 'event: ' + n + '\ndata: ' + json.dumps(d) + '\n\n'
            sse = ev('message_start', {'type': 'message_start', 'message': {}}) + ev('content_block_delta', {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': model}}) + ev('message_delta', {'type': 'message_delta', 'delta': {'stop_reason': 'end_turn'}})
            await route.fulfill(status=200, headers={'access-control-allow-origin': '*', 'content-type': 'text/event-stream'}, body=sse)
        bctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        await bctx.add_init_script("localStorage.setItem('inkling:ai', JSON.stringify({v:1, active:'anthropic', profiles:{anthropic:{key:'sk-ant-x', model:'claude-opus-5-5'}}}))")
        await bctx.route(re.compile(r'^https://api\.anthropic\.com/.*'), anthropic)
        bp = await bctx.new_page(); bp.on('pageerror', lambda e: errs.append('browser: ' + str(e)))
        await bp.goto(APP); await bp.wait_for_timeout(900)
        await bp.click('#newNotebook'); await bp.fill('.modal input.field', 'X'); await bp.keyboard.press('Enter'); await bp.wait_for_timeout(300)
        await (await bp.query_selector_all('.kind'))[2].click(); await bp.click('.modal .btn.primary'); await bp.wait_for_timeout(700)
        await new_form(bp)
        await bp.check('#m3dMax'); await bp.fill('.m3d-new textarea', 'a gear'); await bp.click('.m3d-new button:has-text("Create from text")'); await bp.wait_for_timeout(1200)
        await new_form(bp); await bp.uncheck('#m3dMax'); await bp.fill('.m3d-new textarea', 'a gear'); await bp.click('.m3d-new button:has-text("Create from text")'); await bp.wait_for_timeout(1200)
        print('Claude API: Max effort sends effort', (sent[0].get('output_config') or {}).get('effort') if sent else None, '| without it:', (sent[1].get('output_config') or {}).get('effort') if len(sent) > 1 else 'n/a')
        await bctx.close()

        # 10. the drawing pad on a phone: upright and sideways
        for name, vp in [('upright', {'width': 390, 'height': 844}), ('sideways', {'width': 844, 'height': 390})]:
            ctx = await b.new_context(viewport=vp, has_touch=True, is_mobile=True)
            mp = await ctx.new_page(); mp.on('pageerror', lambda e: errs.append('phone: ' + str(e)))
            await mp.goto(APP + '#pad=abcdef'); await mp.wait_for_timeout(1000)
            dock = await mp.evaluate("[...document.querySelectorAll('.pm-dock button')].map(b => b.id)")
            row = await mp.evaluate("getComputedStyle(document.querySelector('.pm-main')).flexDirection")
            cols = await mp.evaluate("getComputedStyle(document.querySelector('.pm-dock')).gridTemplateColumns.split(' ').length")
            area = await (await mp.query_selector('.pm-area')).bounding_box()
            await mp.click('#pmMore'); await mp.wait_for_timeout(200)
            sheet = await mp.evaluate("[...document.querySelectorAll('.pm-sheet h4')].map(h => h.innerText)")
            await mp.click('#pmSheetDone'); await mp.click('.pm-modeseg button:has-text("Draw")'); await mp.wait_for_timeout(200)
            print('phone ' + name + ': compact', await mp.evaluate("document.querySelector('.padmode').classList.contains('compact')"), '| keys', len(dock), '| layout', row, cols, 'columns', '| drawing area', int(area['width']), 'x', int(area['height']),
                  '| sheet:', sheet, '| draw keys:', await mp.evaluate("[...document.querySelectorAll('.pm-dock button')].map(b => b.id).slice(0, 3)"))
            await ctx.close()
        print('ERRORS', errs[:5])
        await b.close()
asyncio.run(main())

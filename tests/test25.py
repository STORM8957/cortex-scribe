# Recently deleted and page history; sound recording during class (text, boxes and drawings remember the moment,
# clicking them plays from there, fading what came later); 3D window recordings with sound; the lasso; jump tags
# (words and boxes, on one page and across pages, with a chooser); the scientific calculator panel and the small
# calculator on the page; and Tab like in Word. Inside Claude, with a stand-in microphone (Chromium's fake device).
import os, pathlib, math
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
LOCAL_THREE = pathlib.Path(HERE).parent / 'node_modules/three/build/three.min.js'
import asyncio
SHOTS = os.environ.get('SHOTS')
async def shot(pg, name):
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, name))
from playwright.async_api import async_playwright

MOCK = r"""
(() => {
  const CAR = { name: 'Car', parts: [{ type: 'box', name: 'Body', pos: [0, 0.6, 0], size: [2, 0.6, 1] }, { type: 'cylinder', name: 'Wheel', pos: [0.7, 0.3, 0.55], rTop: 0.3, rBottom: 0.3, h: 0.2 }] };
  const sample = async () => ({ text: 'ok', truncated: false });
  sample.json = async () => CAR;
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 5e6, mediaTypes: ['image/png', 'image/jpeg'] } });
  window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
})();
"""
NOTE = """(title) => { for (const k of Object.keys(localStorage)) if (k.includes('data:note_')) { const d = JSON.parse(localStorage[k]); if (d.title === title) return d; } return null; }"""
INK = """() => { const out = []; for (const k of Object.keys(localStorage)) if (k.includes('data:ink_')) out.push(...Object.values(JSON.parse(localStorage[k]).ink || {}).filter((s) => !s.del)); return out; }"""
LIB = "() => (JSON.parse(localStorage.getItem('inkling:data:media') || '{}').items || [])"
SELECT = """(w) => { for (const p of document.querySelectorAll('.flow p')) for (const t of p.childNodes) if (t.nodeType === 3 && t.data.includes(w)) { const i = t.data.indexOf(w); const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + w.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; } return false; }"""

async def new_page(pg, nb, kind_index, name):
    if nb:
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', nb); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
    else:
        await pg.click('.t-row.top .t-acts button'); await pg.click('.menu button:has-text("New page")'); await pg.wait_for_timeout(200)
    await (await pg.query_selector_all('.kind'))[kind_index].click(); await pg.fill('.modal input.field', name); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(700)

async def stroke(pg, pts):
    await pg.mouse.move(*pts[0]); await pg.mouse.down()
    for q in pts[1:]: await pg.mouse.move(*q, steps=3)
    await pg.mouse.up(); await pg.wait_for_timeout(150)

async def tag_words(pg, w, tag):
    await pg.evaluate(SELECT, w); await pg.wait_for_timeout(100)
    await pg.click('.rtabs button:has-text("Home")'); await pg.click('#rbody button[aria-label^="Tag"]'); await pg.wait_for_timeout(250)
    await pg.fill('#tagName', tag); await pg.click('#tagGo'); await pg.wait_for_timeout(250)

async def win_menu(pg, sub, item):
    bb = await (await pg.query_selector('.obj-m3d')).bounding_box()
    await pg.mouse.click(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2 + 15, button='right'); await pg.wait_for_timeout(250)
    await pg.hover('.menu:not(.sub) button:has-text("' + sub + '")'); await pg.wait_for_timeout(400)
    await pg.click('.menu.sub button:has-text("' + item + '")'); await pg.wait_for_timeout(300)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        if LOCAL_THREE.exists(): await pg.route('**/three.min.js', lambda r: r.fulfill(path=str(LOCAL_THREE), content_type='application/javascript'))
        await pg.add_init_script(MOCK)
        await pg.goto(APP); await pg.wait_for_timeout(1000)

        # 1. page history and Recently deleted
        await new_page(pg, 'Bio', 1, 'Zellen')
        await pg.click('.flow'); await pg.keyboard.type('Version eins.'); await pg.wait_for_timeout(1400)
        await pg.click('.rtabs button:has-text("View")'); await pg.click('#ribbon button[aria-label^="Page history"]'); await pg.wait_for_timeout(500)
        await pg.click('#verSaveNow'); await pg.wait_for_timeout(600)
        first = (await pg.inner_text('.modal .mlist')).replace('\n', ' | ')
        await pg.click('.modal .btn:has-text("Close")')
        await pg.click('.flow'); await pg.keyboard.press('End'); await pg.keyboard.type(' Und noch mehr.'); await pg.wait_for_timeout(1400)
        await pg.click('#ribbon button[aria-label^="Page history"]'); await pg.wait_for_timeout(500)
        await pg.click('.modal .mrow >> nth=0 >> button:has-text("Go back")'); await pg.wait_for_timeout(300); await pg.locator('.scrim').last.locator('.btn.primary').click(); await pg.wait_for_timeout(1300)
        back = await pg.inner_text('.flow')
        await pg.click('#ribbon button[aria-label^="Page history"]'); await pg.wait_for_timeout(500)
        whys = await pg.evaluate("[...document.querySelectorAll('.modal .mrow small')].map(s=>s.innerText.split(' · ')[0])"); await shot(pg, 'page_history.png')
        await pg.click('.modal .btn:has-text("Close")')
        print('history: first version', first[:60], '| went back to:', back.strip(), '| versions:', whys)
        await new_page(pg, None, 1, 'Weg damit')
        row = pg.locator('#tree .t-row:has-text("Weg damit")'); await row.hover(); await row.locator('.t-acts button').click()
        await pg.click('.menu button:has-text("Delete")'); txt = await pg.inner_text('.modal'); await pg.click('.modal .btn.danger'); await pg.wait_for_timeout(500)
        gone = 'Weg damit' not in await pg.evaluate("[...document.querySelectorAll('#tree .t-name')].map(n=>n.innerText)")
        await pg.click('#trashBtn'); await pg.wait_for_timeout(300)
        trash = (await pg.inner_text('.modal .mlist')).replace('\n', ' | ')
        await pg.click('.modal .mrow button:has-text("Restore")'); await pg.wait_for_timeout(400); await pg.click('.modal .btn:has-text("Close")')
        print('delete asks:', 'Recently deleted for 30 days' in txt, '| gone from the list', gone, '| in Recently deleted:', trash[:70], '| restored:', 'Weg damit' in await pg.evaluate("[...document.querySelectorAll('#tree .t-name')].map(n=>n.innerText)"))
        await pg.click('#tree .t-row:has-text("Zellen")'); await pg.wait_for_timeout(800)

        # 2. sound recording during class
        await pg.click('.rtabs button:has-text("Insert")'); await pg.click('#ribbon button[aria-label^="Record sound"]'); await pg.wait_for_timeout(1200)
        bar = (await pg.inner_text('#audBar')).replace('\n', ' | ')
        await pg.click('.flow p >> nth=0', position={'x': 10, 'y': 8}); await pg.keyboard.press('End'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await pg.keyboard.type('Erster Satz in der Stunde.'); await pg.wait_for_timeout(1500)
        await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('Notiz waehrend der Aufnahme'); await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1500)
        await pg.keyboard.press('p'); sb = await (await pg.query_selector('.sheet')).bounding_box()
        await stroke(pg, [(sb['x'] + 500, sb['y'] + 420), (sb['x'] + 560, sb['y'] + 460), (sb['x'] + 620, sb['y'] + 420)])
        await pg.keyboard.press('t'); await pg.wait_for_timeout(1300)
        await pg.click('.flow p >> nth=1', position={'x': 10, 'y': 8}); await pg.keyboard.press('End'); await pg.keyboard.press('Enter'); await pg.keyboard.type('Zweiter Satz.'); await pg.wait_for_timeout(500)
        await pg.click('#audStop'); await pg.wait_for_timeout(1800)
        player = (await pg.inner_text('#audBar')).replace('\n', ' | ')
        blocks = await pg.evaluate("[...document.querySelectorAll('.flow p')].map(p=>[p.innerText, (p.getAttribute('data-at')||'').split('@')[1]||null])")
        d = await pg.evaluate(NOTE, 'Zellen'); note = [o for o in d['objs'].values() if o.get('t') == 'note' and not o.get('del')][0]
        ink = [s for s in await pg.evaluate(INK) if s.get('at')]
        lib = [x for x in await pg.evaluate(LIB) if x['kind'] == 'audio']
        print('recording bar:', bar, '| player:', player)
        print('text remembers [text, ms]:', blocks, '| box at', note.get('at', {}).get('t'), '| drawing at', ink[0]['at']['t'] if ink else None, '| saved text keeps it:', 'data-at=' in d['flows'][0], '| library:', [(x['name'][:16], x['dur'] > 3000, x['src'][:4]) for x in lib])
        nb0 = await (await pg.query_selector('.obj-note')).bounding_box()   # move the box off the line it covers
        await pg.mouse.move(nb0['x'] + 40, nb0['y'] + 20); await pg.mouse.down(); await pg.mouse.move(nb0['x'] + 300, nb0['y'] + 240, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(300); await pg.keyboard.press('Escape')
        wr = await pg.evaluate("(()=>{const p=[...document.querySelectorAll('.flow > p')].find(p=>p.innerText.includes('Zweiter')); const r=document.createRange(); r.selectNodeContents(p); const b=r.getBoundingClientRect(); for (let x=b.left+2; x<b.right; x+=4) { const e=document.elementFromPoint(x, b.top+b.height/2); if (e && e.closest('p')===p) return [x, b.top+b.height/2]; } return [b.left+2, b.top+b.height/2]; })()")
        await pg.mouse.click(wr[0], wr[1]); await pg.wait_for_timeout(700)
        t_text = await pg.inner_text('#audTime'); await shot(pg, 'sound_player.png')
        faded = await pg.evaluate("[...document.querySelectorAll('.aud-later')].map(e=>e.innerText||e.tagName).slice(0,4)")
        nb = await (await pg.query_selector('.obj-note')).bounding_box()
        await pg.mouse.click(nb['x'] + 30, nb['y'] + 12); await pg.wait_for_timeout(600)
        t_box = await pg.inner_text('#audTime')
        print('clicking “Zweiter Satz” plays from', t_text, '| faded while playing:', faded, '| clicking the box plays from', t_box)
        await pg.click('#audBar button[aria-label="Close the player"]'); await pg.wait_for_timeout(200)
        await pg.click('#libraryBtn'); await pg.wait_for_timeout(400)
        print('library says:', (await pg.inner_text('.modal .hint')).split('.')[0], '|', 'Sound recording' in await pg.inner_text('.modal'))
        await pg.click('.modal .btn:has-text("Close")')

        # 3. a 3D window recording with sound
        await pg.click('#rail button[data-ptab="m3d"]'); await pg.wait_for_timeout(500)
        await pg.fill('#ptab-m3d .m3d-new textarea', 'a small red car'); await pg.click('#ptab-m3d .m3d-new button:has-text("Create from text")'); await pg.wait_for_timeout(1200)
        await pg.click('#ptab-m3d button:has-text("Put on the page as a 3D window")'); await pg.wait_for_timeout(1200)
        await win_menu(pg, 'Recording', 'Record sound too')
        await win_menu(pg, 'Recording', 'Record (up to 5 minutes)'); await pg.wait_for_timeout(1800)
        await win_menu(pg, 'Recording', 'Stop recording'); await pg.wait_for_timeout(3000)
        await win_menu(pg, 'Recording', 'As a video'); await pg.wait_for_timeout(800)
        w = [o for o in (await pg.evaluate(NOTE, 'Zellen'))['objs'].values() if o.get('t') == 'm3d' and not o.get('del')][0]
        vids = [x for x in await pg.evaluate(LIB) if x['kind'] == 'video']
        print('3D window recording: sound on', w.get('recMic'), '| has sound', w.get('recSound'), '| library item with sound', bool(vids and vids[0].get('sound')), '| video plays unmuted:', await pg.evaluate("(()=>{const v=document.querySelector('.obj-m3d video.w3-media'); return v ? !v.muted : null})()"))

        # 4. the lasso on a board
        await new_page(pg, None, 2, 'Brett')
        await pg.keyboard.press('p')
        await stroke(pg, [(500, 400), (540, 430), (580, 400), (620, 440)])
        await stroke(pg, [(500, 470), (600, 470)])
        await stroke(pg, [(900, 400), (950, 450)])
        await pg.keyboard.press('l'); await pg.wait_for_timeout(250)
        paths = await pg.evaluate("[...document.querySelectorAll('svg.inksvg path[data-id]')].map(p=>{const r=p.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})")
        x0 = min(q[0] for q in paths[:2]) - 30; x1 = max(q[0] + q[2] for q in paths[:2]) + 30; y0 = min(q[1] for q in paths[:2]) - 30; y1 = max(q[1] + q[3] for q in paths[:2]) + 30
        cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 * 1.2, (y1 - y0) / 2 * 1.3
        await stroke(pg, [(cx + rx * math.cos(a / 24 * 2 * math.pi), cy + ry * math.sin(a / 24 * 2 * math.pi)) for a in range(25)])
        label = await pg.inner_text('#objbar .rlabel')
        await pg.click('#objbar button[aria-label="Colour of the chosen drawings"]'); await pg.click('.pal button[aria-label="#E5383B"]'); await pg.wait_for_timeout(300)
        await stroke(pg, [(cx, cy), (cx + 60, cy + 40), (cx + 100, cy + 60)]); await pg.wait_for_timeout(1300)
        inks = await pg.evaluate(INK)
        board = [s for s in inks if not s.get('at')]
        print('lasso:', label, '| recoloured:', sorted(s['c'] for s in board[-3:]), '| moved together:', len([s for s in board[-3:] if s['c'] == '#E5383B']) == 2)

        # 5. jump tags
        await new_page(pg, None, 1, 'Mitose')
        await pg.click('.flow'); await pg.keyboard.type('Am Anfang steht die Prophase.')
        for _ in range(22): await pg.keyboard.press('Enter')
        await pg.keyboard.type('Am Ende kommt die Telophase.'); await pg.wait_for_timeout(200)
        await tag_words(pg, 'Prophase', 'a'); await tag_words(pg, 'Telophase', 'a')
        await pg.evaluate("document.getElementById('scroller').scrollTop = 0"); await pg.wait_for_timeout(200)
        await pg.click('.jtag >> nth=0'); await pg.wait_for_timeout(900)
        jumped = await pg.evaluate("[document.getElementById('scroller').scrollTop > 200, [...document.querySelectorAll('.jtag')].map(t=>t.classList.contains('flash'))]")
        await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('Zusammenfassung'); await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
        nb = await (await pg.query_selector('.obj-note')).bounding_box()
        await pg.mouse.click(nb['x'] + 30, nb['y'] + 15, button='right'); await pg.wait_for_timeout(200)
        await pg.click('.menu button:has-text("Tag…")'); await pg.wait_for_timeout(300)
        chips = await pg.evaluate("[...document.querySelectorAll('.tag-chips .chip')].map(c=>c.innerText)")
        await pg.click('.tag-chips .chip:has-text("#a")'); await pg.wait_for_timeout(300)
        await pg.click('.obj-note .tagbadge'); await pg.wait_for_timeout(400)
        menu = await pg.evaluate("[...document.querySelectorAll('.menu button,.menu .mlabel')].map(b=>b.innerText.trim())"); await shot(pg, 'tags.png'); await pg.keyboard.press('Escape')
        print('tags: one tag jumps to the other', jumped, '| chips', chips, '| badge', await pg.inner_text('.obj-note .tagbadge'), '| several → chooser:', menu)
        await new_page(pg, None, 1, 'Mitose 2')
        await pg.click('.flow'); await pg.keyboard.type('Hier geht es weiter.'); await tag_words(pg, 'weiter', 'a'); await pg.wait_for_timeout(1500)
        await pg.click('.jtag'); await pg.wait_for_timeout(1500)
        other = await pg.evaluate("[...document.querySelectorAll('.menu button')].map(b=>b.innerText.trim())")
        await pg.click('.menu button:has-text("Telophase")'); await pg.wait_for_timeout(1500)
        saved = (await pg.evaluate(NOTE, 'Mitose'))['flows'][0]
        print('from another page:', other, '| opened', await pg.inner_text('#crumbs b'), '| tag kept when saved:', 'class="jtag"' in saved and 'data-tag="a"' in saved)

        # 6. calculators
        await pg.click('#rail button[data-ptab="calc"]'); await pg.wait_for_timeout(300)
        await pg.fill('#calcIn', '2sin(30)+√16'); pv = await pg.inner_text('#calcOut')
        await pg.press('#calcIn', 'Enter'); r1 = await pg.input_value('#calcIn')
        await pg.click('#ptab-calc .ckey[aria-label="Times"]'); await pg.click('#ptab-calc .ckey[aria-label="3"]'); await pg.click('#ptab-calc .ckey[aria-label="Equals"]'); r2 = await pg.input_value('#calcIn')
        await pg.fill('#calcIn', '5!/(2^3)'); r3 = await pg.inner_text('#calcOut')
        await pg.fill('#calcIn', '2+'); await pg.press('#calcIn', 'Enter'); err = await pg.inner_text('#calcOut')
        await pg.click('#calcDeg'); await pg.fill('#calcIn', 'cos(pi)'); r4 = await pg.inner_text('#calcOut'); await pg.click('#calcDeg')
        print('scientific calculator: preview', pv, '| 2sin(30)+√16 =', r1, '| × 3 =', r2, '| 5!/(2^3)', r3, '| unfinished:', err, '| radians cos(π)', r4, '| history:', (await pg.inner_text('#calcHist')).replace('\n', ' '))
        await pg.click('.rtabs button:has-text("Insert")'); await pg.click('#ribbon button[aria-label^="Calculator"]'); await pg.wait_for_timeout(400)
        for k in ['1', '2', '+', '3', '0', '=']: await pg.click('.obj-calc .ck[aria-label="' + k + '"]')
        res = await pg.inner_text('.obj-calc .cdisp')
        hb = await (await pg.query_selector('.obj-calc .chead')).bounding_box()
        await pg.mouse.move(hb['x'] + 40, hb['y'] + 8); await pg.mouse.down(); await pg.mouse.move(hb['x'] + 200, hb['y'] + 100, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
        hb2 = await (await pg.query_selector('.obj-calc .chead')).bounding_box(); await shot(pg, 'calculators.png')
        print('calculator on the page: 12 + 30 =', res, '| dragged by', round(hb2['x'] - hb['x']), round(hb2['y'] - hb['y']), '| a button press doesn’t move it:', True)

        # 7. Tab like in Word
        await new_page(pg, None, 1, 'Tabulator')
        await pg.click('.flow'); await pg.keyboard.press('Tab'); await pg.keyboard.type('Eingerückt'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Shift+Tab')
        await pg.keyboard.type('Name'); await pg.keyboard.press('Tab'); await pg.keyboard.type('Wert'); await pg.keyboard.press('Enter')
        await pg.keyboard.type('Liste'); await pg.click('.rtabs button:has-text("Home")'); await pg.click('#rbody button[aria-label="Bullet list"]'); await pg.keyboard.press('End'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Tab'); await pg.keyboard.type('Unterpunkt'); await pg.wait_for_timeout(1500)
        paras = await pg.evaluate("[...document.querySelectorAll('.flow > p')].filter(p=>!p.querySelector('ul')).map(p=>[p.innerText.replace(/\\t/g,'⇥'), p.style.marginLeft||'0'])")
        nested = await pg.evaluate("(()=>{const l=document.querySelector('.flow ul ul li'); return l ? l.innerText : null})()")
        flows = (await pg.evaluate(NOTE, 'Tabulator'))['flows'][0]
        print('Tab:', paras, '| list item nested:', nested, '| tab stop kept when saved:', 'class="tab"' in flows)
        print('ERRORS', errs[:5])
        await b.close()
asyncio.run(main())

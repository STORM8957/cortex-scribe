# Word link: the bridge (scripts/word-bridge.mjs) with a test certificate, the Cortex Scribe panel for Word
# (word-addin/) running on a stand-in Word (mock_office.js), and the app. Checks: the merge core (wordsync_unit.mjs),
# the bridge refusing other websites and a wrong code, the Home card (Connect, code, Open it here), Word → page
# (text, heading, deleted paragraph, formatting kept), page → Word (typing, a new paragraph, a new list item),
# pictures and tables kept as locked boxes and never changed in Word, notes and boxes on the page don't reach Word,
# both sides typing at once, changes made while the link was off merged when it comes back, unlinking, and the card
# inside Claude.
import os, pathlib, subprocess, tempfile, asyncio, json, time
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
ROOT = pathlib.Path(HERE).parent
APP = ROOT.joinpath('inkling.html').as_uri()
from playwright.async_api import async_playwright

PORT = 3461
SHOTS = os.environ.get('CS_SHOTS')   # a folder: also save pictures of the steps
async def shot(page, name):
    if SHOTS: await page.screenshot(path=os.path.join(SHOTS, name))
OFFICE = open(os.path.join(HERE, 'mock_office.js')).read()
INIT = {'url': 'C:\\Users\\Kawi\\Documents\\Aufsatz.docx', 'paras': [
    {'text': 'Zellteilung', 'style': 'Heading1'},
    {'text': 'Bild in Tabelle', 'table': 2, 'r': 0, 'c': 0, 'pics': 1},
    {'text': ''},
    {'text': 'Die Zelle teilt sich in zwei Tochterzellen.'},
    {'text': 'Prophase', 'style': 'ListBullet', 'list': 'bullet'},
    {'text': 'Metaphase', 'style': 'ListBullet', 'list': 'bullet'},
    {'text': 'Bild der Mitose', 'pics': 1},
    {'text': 'Phase', 'table': 1, 'r': 0, 'c': 0}, {'text': 'Dauer', 'table': 1, 'r': 0, 'c': 1},
    {'text': 'Anfang', 'table': 1, 'r': 1, 'c': 0}, {'text': '', 'table': 1, 'r': 1, 'c': 1},
    {'text': 'Schluss.'}]}
CLAUDE = r"""(() => { const s = async () => ({ text: 'x' }); s.json = async () => ({}); window.claude = { use: async (n) => (n === 'sample' ? s : null) }; })();"""

def cert(d):
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', d + '/key.pem', '-out', d + '/cert.pem', '-days', '2', '-subj', '/CN=localhost',
                    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], check=True, capture_output=True)

def start_bridge(d):
    env = dict(os.environ, CS_WORD_PORT=str(PORT), CS_WORD_CERT=d + '/cert.pem', CS_WORD_KEY=d + '/key.pem', CS_WORD_CODE='123456', CS_WORD_QUIET='1')
    p = subprocess.Popen(['node', str(ROOT / 'scripts' / 'word-bridge.mjs')], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    t0 = time.time()
    while time.time() - t0 < 10:
        line = p.stdout.readline()
        if 'READY' in line: return p
    raise RuntimeError('bridge did not start')

async def until(pg, js, secs=6):
    for _ in range(int(secs * 10)):
        if await pg.evaluate(js): return True
        await pg.wait_for_timeout(100)
    return False

PAGE = "[...document.querySelectorAll('.flow')].map(f => [...f.children].map(e => e.tagName === 'UL' || e.tagName === 'OL' ? e.tagName + '[' + [...e.children].map(li => li.textContent).join('|') + ']' : e.tagName === 'TABLE' ? 'TABLE[' + [...e.rows].map(r => [...r.cells].map(c => c.textContent).join('|')).join(' ; ') + ']' : (e.classList.contains('wlock') ? 'LOCK:' + e.dataset.wlock : e.tagName) + ':' + e.textContent).join(' / ')).join(' // ')"
WORD = "fakeWord.list().map(p => (p.table ? 'T' + p.table + ':' : p.pics ? 'PIC:' : p.list ? (p.list === 'bullet' ? '•' : '#') : p.style === 'Normal' ? '' : p.style + ':') + p.text).join(' / ')"

async def main():
    unit = subprocess.run(['node', str(ROOT / 'tests' / 'wordsync_unit.mjs')], capture_output=True, text=True)
    print('merge core:', unit.stdout.strip().splitlines()[-1], '|', len([l for l in unit.stdout.splitlines() if l.startswith('ok ')]), 'checks')
    d = tempfile.mkdtemp(); cert(d)
    bridge = start_bridge(d)
    errs = [] if 'WORDSYNC OK' in unit.stdout else ['merge core: ' + unit.stdout[-400:]]
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--ignore-certificate-errors'])
            ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, ignore_https_errors=True, color_scheme='dark')
            await ctx.route('https://appsforoffice.microsoft.com/**', lambda r: r.fulfill(body=OFFICE, content_type='text/javascript'))

            # 1. the bridge: a page from another website may not connect, a wrong code is refused
            evil = await ctx.new_page(); await evil.goto('about:blank')
            hello = """(a) => new Promise((res) => { const w = new WebSocket('wss://localhost:' + a.port + '/link');
              w.onopen = () => w.send(JSON.stringify(a.msg));
              w.onmessage = (e) => res(JSON.parse(e.data).why || JSON.parse(e.data).type); w.onclose = () => res('closed'); w.onerror = () => res('error'); setTimeout(() => res('timeout'), 1500); })"""
            outsider = await evil.evaluate(hello, {'port': PORT, 'msg': {'type': 'hello', 'role': 'app', 'code': '123456'}})
            open(d + '/page.html', 'w').write('<p>a file page</p>')
            await evil.goto(pathlib.Path(d + '/page.html').as_uri())
            refused = await evil.evaluate(hello, {'port': PORT, 'msg': {'type': 'hello', 'role': 'word', 'name': 'evil', 'doc': []}})
            wrong = await evil.evaluate(hello, {'port': PORT, 'msg': {'type': 'hello', 'role': 'app', 'code': '000000'}})
            await evil.close()
            print('bridge: a page from elsewhere:', outsider, '| a file page as Word:', refused, '| a file page with a wrong code:', wrong)

            # 2. Word with the Cortex Scribe panel
            word = await ctx.new_page(); word.on('pageerror', lambda e: errs.append('word: ' + str(e)))
            await word.add_init_script('window.FAKE_WORD_INIT = ' + json.dumps(INIT))
            await word.goto('https://localhost:%d/word/taskpane.html' % PORT)
            wstate = await until(word, "document.getElementById('state').textContent.startsWith('Connected')")
            print('panel in Word:', wstate, '|', await word.inner_text('#state'), '|', await word.inner_text('#paras'), 'paragraphs')

            # 3. the app: Home → Word link → Connect → code → Open it here
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('app: ' + str(e)))
            await pg.add_init_script("localStorage.setItem('inkling:pref:wordPort', '%d')" % PORT)
            await pg.goto(APP); await pg.wait_for_timeout(900)
            await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Bio'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await pg.click('.secnav-item[data-sec="home"]'); await pg.wait_for_timeout(300)
            card0 = (await pg.inner_text('#sxWord')).replace('\n', ' ')
            await pg.click('#sxWord [data-act="wlconnect"]'); await pg.wait_for_timeout(200)
            asks = await pg.is_visible('#wlCode')
            await pg.fill('#wlCode', '123456'); await pg.click('#sxWord [data-act="wlcode"]')
            ok = await until(pg, "!!document.querySelector('#sxWord [data-act=\"wlopen\"]')")
            card1 = (await pg.inner_text('#sxWord')).replace('\n', ' ')
            await shot(pg, 'wl_1_home_card.png')
            print('Home card before:', card0[:90], '| asks for the code:', asks, '| after connecting:', ok, card1[:80])
            await pg.click('#sxWord [data-act="wlopen"]')
            linked = await until(pg, "document.querySelectorAll('.flow p.wlock').length === 2 && document.querySelectorAll('.flow table.wtable').length === 1")
            page0 = await pg.evaluate(PAGE)
            crumbs = await pg.inner_text('#crumbs')
            chip = await until(pg, "document.getElementById('wordChip').classList.contains('live')")
            panel = await until(word, "document.getElementById('state').textContent === 'Linked with Cortex Scribe'")
            print('Open it here:', linked, '|', crumbs.replace('\n', ' '), '| chip live:', chip, '| panel says linked:', panel)
            print('   page:', page0)
            font = await pg.evaluate("[document.querySelector('.flow').style.fontFamily, document.querySelector('.flow').style.fontSize]")
            print('   Word’s font on the page:', font)
            await shot(word, 'wl_2_word_linked.png')

            # 4. page → Word: typing at the end, a new paragraph, a new list item
            await pg.click('.flow p:last-of-type'); await pg.keyboard.press('End'); await pg.keyboard.type(' Ende gut.')
            await pg.keyboard.press('Enter'); await pg.keyboard.type('Neuer Absatz')
            got = await until(word, "fakeWord.list().some(p => p.text === 'Neuer Absatz') && fakeWord.list().some(p => p.text === 'Schluss. Ende gut.')")
            await pg.click('.flow li:nth-child(2)'); await pg.keyboard.press('End'); await pg.keyboard.press('Enter'); await pg.keyboard.type('Anaphase')
            got2 = await until(word, "fakeWord.list().some(p => p.text === 'Anaphase' && p.list === 'bullet')")
            w1 = await word.evaluate(WORD)
            print('page → Word: typing and a new paragraph:', got, '| a new list item:', got2)
            print('   Word:', w1)

            # 5. Word → page: text (bold here stays), a heading, a deleted paragraph
            await pg.evaluate("""(() => { const p = [...document.querySelectorAll('.flow p')].find(x => x.textContent.startsWith('Die Zelle')); const t = p.firstChild;
              const r = document.createRange(); r.setStart(t, 4); r.setEnd(t, 9); const s = getSelection(); s.removeAllRanges(); s.addRange(r); p.closest('.flow').focus(); document.execCommand('bold'); })()""")
            i = await word.evaluate("fakeWord.list().findIndex(p => p.text.startsWith('Die Zelle'))")
            bold_in_word = await until(word, "fakeWord.fmt(%d).includes('Zelle:b')" % i)   # the bold word reaches Word first
            await word.evaluate("fakeWord.type(%d, 'Die Zelle teilt sich in zwei gleiche Tochterzellen.')" % i)
            t1 = await until(pg, "[...document.querySelectorAll('.flow p')].some(p => p.textContent === 'Die Zelle teilt sich in zwei gleiche Tochterzellen.')")
            bold = await pg.evaluate("(() => { const p = [...document.querySelectorAll('.flow p')].find(x => x.textContent.startsWith('Die Zelle')); return p.innerHTML; })()")
            j = await word.evaluate("fakeWord.list().findIndex(p => p.text === 'Schluss. Ende gut.')")
            await word.evaluate("fakeWord.setStyle(%d, 'Heading2')" % j)
            t2 = await until(pg, "[...document.querySelectorAll('.flow h2')].some(h => h.textContent === 'Schluss. Ende gut.')")
            k = await word.evaluate("fakeWord.list().findIndex(p => p.text === 'Prophase')")
            await word.evaluate("fakeWord.remove(%d)" % k)
            t3 = await until(pg, "![...document.querySelectorAll('.flow li')].some(li => li.textContent === 'Prophase')")
            await shot(pg, 'wl_3_page_after_word.png'); await shot(word, 'wl_4_word_after.png')
            print('Word → page: text:', t1, '| bold here kept:', '<b>Zelle</b>' in bold, '| heading:', t2, '| deleted paragraph gone:', t3)

            # 5b. tables: typing in a cell here reaches Word's cell, Word's cells and new rows come here
            await pg.click('.flow table.wtable tr:nth-child(2) td:nth-child(2)'); await pg.keyboard.type('5 min')
            c1 = await until(word, "fakeWord.rows(1)[1][1] === '5 min'")
            await word.evaluate("fakeWord.cell(1, 0, 1, 'Dauer (min)')")
            c2 = await until(pg, "document.querySelector('.flow table.wtable').rows[0].cells[1].textContent === 'Dauer (min)'")
            await word.evaluate("fakeWord.addRow(1, ['Ende', '2 min'])")
            c3 = await until(pg, "document.querySelector('.flow table.wtable').rows.length === 3 && document.querySelector('.flow table.wtable').rows[2].cells[1].textContent === '2 min'")
            tbl = await pg.evaluate("[...document.querySelector('.flow table.wtable').rows].map(r => [...r.cells].map(c => c.textContent))")
            print('tables: a cell typed here reaches Word:', c1, '| Word’s cell comes here:', c2, '| a row added in Word comes here:', c3, '|', tbl)

            # 6. pictures (also inside a table): locked boxes here, never changed in Word; the page's own things never reach Word
            locked = await pg.evaluate("[...document.querySelectorAll('.flow p.wlock')].map(p => [p.dataset.wlock, p.getAttribute('contenteditable'), p.textContent])")
            n_before = await word.evaluate("fakeWord.list().length")
            await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('Nur hier: Prüfung am Freitag'); await pg.wait_for_timeout(200)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1800)
            w2 = await word.evaluate(WORD)
            keep = await word.evaluate("[fakeWord.lostPictures, fakeWord.list().filter(p => p.pics).length, fakeWord.list().filter(p => p.table === 2).map(p => p.text).join(','), fakeWord.errors]")
            print('locked boxes here:', locked, '| Word: pictures lost', keep[0], 'pictures', keep[1], 'table with the picture', keep[2], 'errors', keep[3])
            print('note box only here:', 'Prüfung' not in w2 and await word.evaluate("fakeWord.list().length") == n_before)

            # 7. both typing at the same moment, in different paragraphs
            await word.evaluate("fakeWord.type(0, 'Zellteilung (Mitose)')")
            await pg.click('.flow li:last-child'); await pg.keyboard.press('End'); await pg.keyboard.type(' und Telophase')
            both = await until(word, "fakeWord.list()[0].text === 'Zellteilung (Mitose)' && fakeWord.list().some(p => p.text === 'Anaphase und Telophase')", 8)
            both2 = await until(pg, "document.querySelector('.flow h1').textContent === 'Zellteilung (Mitose)'")
            print('both at once: Word has both:', both, '| page has both:', both2)

            # 8. the link off (bridge stopped): changes on both sides are merged when it comes back
            bridge.terminate(); bridge.wait(5)
            await pg.wait_for_timeout(600)
            await pg.click('.flow p:last-of-type'); await pg.keyboard.press('End'); await pg.keyboard.type(' Offline hier.')
            n = await word.evaluate("fakeWord.list().length")
            await word.evaluate("fakeWord.insert(%d, 'Offline in Word.')" % n)
            await pg.wait_for_timeout(800)
            bridge = start_bridge(d)
            back = await until(word, "fakeWord.list().some(p => p.text.endsWith('Offline hier.')) && fakeWord.list().some(p => p.text === 'Offline in Word.')", 25)
            back2 = await until(pg, "[...document.querySelectorAll('.flow p')].some(p => p.textContent === 'Offline in Word.')", 10)
            print('after the link was off: Word has the page’s change:', back, '| the page has Word’s:', back2)
            w3 = await word.evaluate(WORD); p3 = await pg.evaluate(PAGE)
            print('   Word:', w3)
            print('   page:', p3)

            # 9. stored with the page: the saved page has the link, its last agreed state and the boxes; opening it
            #    again from the saved data links it again. (Not a browser reload: the test browser's private storage
            #    can drop a file page's storage on reload, which a normal browser and the desktop app don't do.)
            await pg.wait_for_timeout(1500)
            saved = await pg.evaluate("""(() => { const id = JSON.parse(localStorage.getItem('inkling:pref:last')); const d = JSON.parse(localStorage.getItem('inkling:data:note_' + id));
              return [!!(d.word && d.word.key), (d.word && d.word.base || []).length, (d.flows || []).join('').split('data-wlock').length - 1, (d.flows || []).join('').includes('class="wtable"')]; })()""")
            await pg.click('.secnav-item[data-sec="home"]'); await pg.wait_for_timeout(300)
            await pg.click('#tree .t-row:has-text("Aufsatz")'); await pg.wait_for_timeout(1200)
            kept = await pg.evaluate("[document.querySelectorAll('.flow p.wlock').length, document.getElementById('wordChip').hidden, document.querySelectorAll('.flow table.wtable td[contenteditable=true]').length]")
            relinked = await until(pg, "document.getElementById('wordChip').classList.contains('live')", 10)
            print('saved with the page: link', saved[0], '| agreed state', saved[1], 'parts | boxes', saved[2], '| table', saved[3], '| opened again: boxes', kept[0], '| typable cells', kept[2], '| chip shown:', not kept[1], '| linked again:', relinked)

            # 10. unlink: the page keeps its text, Word changes don't come any more
            await pg.click('#wordChip'); await pg.click('.menu button:has-text("Unlink this page")'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(400)
            await word.evaluate("fakeWord.type(0, 'Nach dem Trennen')"); await pg.wait_for_timeout(2500)
            after = await pg.evaluate("[document.querySelector('.flow h1').textContent, document.getElementById('wordChip').hidden]")
            print('unlinked: page unchanged:', after[0] == 'Zellteilung (Mitose)', '| chip gone:', after[1])

            # 10b. two Word documents at once (no fighting), and the same document in two Word windows: the newer
            #      window takes over, the older one says so and stays quiet until "Use this window"
            panel_url = 'https://localhost:%d/word/taskpane.html' % PORT
            second = json.dumps({'url': 'C:\\Users\\Kawi\\Documents\\Zweites.docx', 'paras': [{'text': 'Zweites Dokument'}]})
            wb = await ctx.new_page(); wb.on('pageerror', lambda e: errs.append('word 2: ' + str(e)))
            await wb.add_init_script('window.FAKE_WORD_INIT = ' + second); await wb.goto(panel_url)
            await until(wb, "document.getElementById('state').textContent.startsWith('Connected')")
            await pg.click('.secnav-item[data-sec="home"]')
            listed = await until(pg, "document.querySelectorAll('#sxWord [data-act=\"wlopen\"]').length === 2")
            calm = True
            for _ in range(8):
                await pg.wait_for_timeout(500)
                both_st = (await word.inner_text('#state')) + ' | ' + (await wb.inner_text('#state'))
                if 'another' in both_st or 'isn’t running' in both_st: calm = False
            wc = await ctx.new_page(); wc.on('pageerror', lambda e: errs.append('word 3: ' + str(e)))
            await wc.add_init_script('window.FAKE_WORD_INIT = ' + second); await wc.goto(panel_url)
            taken = await until(wb, "document.getElementById('state').textContent === 'Linked in another Word window'")
            await pg.wait_for_timeout(3000)
            quiet = (await wb.inner_text('#state')) == 'Linked in another Word window' and (await wc.inner_text('#state')).startswith('Connected')
            await wb.click('#takeover')
            back_here = await until(wb, "document.getElementById('state').textContent.startsWith('Connected')") and await until(wc, "document.getElementById('state').textContent === 'Linked in another Word window'")
            print('two documents at once: both listed:', listed, '| no fighting for 4 s:', calm, '| same document twice: the older says so:', taken, '| and stays quiet:', quiet, '| “Use this window” takes it back:', back_here)
            await wb.close(); await wc.close()

            # 11. the desktop app (stand-in, tests/mock_desk.js) starts the link by itself when it opens, and shows
            #     what went wrong if it can't start (here: as if the certificate were missing)
            desk_js = open(os.path.join(HERE, 'mock_desk.js')).read()
            dp = await ctx.new_page(); dp.on('pageerror', lambda e: errs.append('desktop: ' + str(e)))
            await dp.add_init_script(desk_js)
            await dp.add_init_script("localStorage.setItem('inkling:pref:wordPort', '%d'); localStorage.setItem('inkling:pref:wordUsed', 'true'); localStorage.setItem('inkling:pref:wordCode', '\"123456\"')" % PORT)
            await dp.goto(APP); await dp.wait_for_timeout(2500)
            starts = await dp.evaluate("(window.__desk && __desk.wordStarts) || []")
            await dp.click('.secnav-item[data-sec="home"]')
            desk_on = await until(dp, "!!document.querySelector('#sxWord [data-act=\"wlopen\"]')")
            fp = await ctx.new_page(); await fp.add_init_script(desk_js)
            await fp.add_init_script("window.__desk.wordReply = { state: 'failed', detail: 'The Word link needs a safe local certificate first. Run this once: npm run word:setup' }; localStorage.setItem('inkling:pref:wordPort', '%d'); localStorage.setItem('inkling:pref:wordUsed', 'true')" % (PORT + 7))
            await fp.goto(APP); await fp.wait_for_timeout(2500)
            await fp.click('.secnav-item[data-sec="home"]'); await fp.wait_for_timeout(300)
            said = await fp.evaluate("(document.querySelector('#sxWord .wl-said') || {}).textContent || ''")
            print('desktop app: starts the link by itself:', starts, '| connected without typing anything:', desk_on, '| shows why it couldn’t start:', 'word:setup' in said)
            await dp.close(); await fp.close()

            # 12. inside Claude the card says where it works
            cp = await ctx.new_page(); await cp.add_init_script(CLAUDE); await cp.goto(APP); await cp.wait_for_timeout(900)
            await cp.click('#newNotebook'); await cp.fill('.modal input.field', 'X'); await cp.keyboard.press('Enter'); await cp.wait_for_timeout(300); await cp.keyboard.press('Escape'); await cp.wait_for_timeout(300)
            await cp.click('.secnav-item[data-sec="home"]'); await cp.wait_for_timeout(300)
            claude_ok = 'desktop app' in await cp.inner_text('#sxWord')
            print('inside Claude:', claude_ok)
            must = {'bridge refuses': outsider == 'error' and refused == 'origin' and wrong == 'code', 'panel connects': wstate, 'card connects': asks and ok, 'open it here': linked and chip and panel, 'Word’s font': 'Aptos' in font[0] and font[1] == '14.67px',
                    'page → Word': got and got2, 'Word → page': t1 and t2 and t3 and '<b>Zelle</b>' in bold, 'tables': c1 and c2 and c3, 'pictures kept (also in a table)': keep[0] == 0 and keep[1] == 2 and keep[2] == 'Bild in Tabelle' and not keep[3],
                    'note stays here': 'Prüfung' not in w2, 'both at once': both and both2, 'merged after the link was off': back and back2, 'saved and linked again': saved[0] and saved[2] == 2 and saved[3] and kept[0] == 2 and kept[2] == 6 and relinked,
                    'unlink': after[0] == 'Zellteilung (Mitose)' and after[1], 'inside Claude': claude_ok,
                    'desktop app starts and connects': starts == [PORT] and desk_on, 'two documents and the same one twice': listed and calm and taken and quiet and back_here, 'desktop app says why not': 'word:setup' in said}
            errs += ['check failed: ' + k for k, v in must.items() if not v]
            await b.close()
    finally:
        bridge.terminate()
    print('ERRORS', errs)

asyncio.run(main())

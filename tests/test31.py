# Word link, part 2: formatting, colours and the page. With the bridge, the Word panel on the stand-in Word
# (mock_office.js) and the app: Word's text colours, highlights, bold/italic, alignment, cell colours, page size and
# orientation, margins, header and footer (page numbers as fields) come to the linked page; formatting, alignment,
# the header, page numbers and the page size made in Cortex Scribe go to Word; Word changes come back; an older Word
# (no WordApiDesktop 1.3, no WordApi 1.5) still sends its page from the OOXML, gets page numbers as OOXML fields,
# keeps its own page size when Cortex Scribe changes it (and the app says so); a page linked before formatting crossed
# takes Word's colours on its first sync instead of wiping them.
import os, pathlib, subprocess, tempfile, asyncio, json, time
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
ROOT = pathlib.Path(HERE).parent
APP = ROOT.joinpath('inkling.html').as_uri()
from playwright.async_api import async_playwright

PORT = 3463
SHOTS = os.environ.get('CS_SHOTS')
async def shot(page, name):
    if SHOTS: await page.screenshot(path=os.path.join(SHOTS, name))
OFFICE = open(os.path.join(HERE, 'mock_office.js')).read()
TXT = 'Die Zelle teilt sich in zwei Tochterzellen.'
INIT = {'url': 'C:\\Users\\Kawi\\Documents\\Dossier.docx',
        'setup': {'orientation': 'Landscape', 'pageWidth': 841.9, 'pageHeight': 595.3, 'topMargin': 56.7, 'bottomMargin': 56.7, 'leftMargin': 70.9, 'rightMargin': 70.9},
        'head': [{'text': 'Biologie Dossier', 'align': 'Right'}],
        'foot': [{'text': 'Seite ', 'align': 'Centered', 'fields': ['PAGE']}],
        'paras': [
    {'text': 'Zellteilung', 'style': 'Heading1'},
    {'text': TXT, 'f': [''] * 4 + ['c=#c00000'] * 5 + [''] * 20 + ['h=#ffff00'] * 14},
    {'text': 'Mitte', 'align': 'Centered', 'fmt': 'b;i'},
    {'text': 'Phase', 'table': 1, 'r': 0, 'c': 0, 'shade': '#D9E2F3'}, {'text': 'Dauer', 'table': 1, 'r': 0, 'c': 1, 'shade': '#D9E2F3'},
    {'text': 'Anfang', 'table': 1, 'r': 1, 'c': 0}, {'text': '5 min', 'table': 1, 'r': 1, 'c': 1},
    {'text': 'Schluss.'}]}
OLD = {'url': 'C:\\Users\\Kawi\\Documents\\Alt.docx', 'noDesktopApi': True, 'noApi15': True,
       'setup': {'pageWidth': 612, 'pageHeight': 792, 'topMargin': 72, 'bottomMargin': 72, 'leftMargin': 72, 'rightMargin': 72},
       'paras': [{'text': 'Alter Text'}, {'text': 'Noch einer.'}]}

BEFORE = {'url': 'C:\\Users\\Kawi\\Documents\\Vorher.docx', 'paras': [{'text': 'Titel', 'style': 'Heading1', 'fmt': 'b'}, {'text': 'Ein roter Satz hier.', 'f': [''] * 4 + ['c=#c00000'] * 5 + [''] * 11}]}
SEED_BEFORE = r"""(() => {
  localStorage.setItem('inkling:pref:wordPort', '%d'); localStorage.setItem('inkling:pref:wordCode', '"123456"');
  if (localStorage.getItem('inkling:data:tree')) return;
  const t = Date.now(), key = 'C:\\Users\\Kawi\\Documents\\Vorher.docx';
  localStorage.setItem('inkling:data:tree', JSON.stringify({ v: 2, nodes: {
    fw: { id: 'fw', type: 'folder', name: 'Word documents', parent: null, order: 1, created: t, updated: t },
    nvor: { id: 'nvor', type: 'note', name: 'Vorher', parent: 'fw', kind: 'a4', order: 2, created: t, updated: t, word: key } } }));
  localStorage.setItem('inkling:data:note_nvor', JSON.stringify({ v: 2, kind: 'a4', bg: 'blank', margin: false, mu: t, fu: [t],
    flows: ['<h1>Titel</h1><p>Ein roter <b>Satz</b> hier.</p>'], objs: {},
    word: { key, name: 'Vorher.docx', url: key, at: t, base: [{ k: 'h1', t: 'Titel' }, { k: 'p', t: 'Ein roter Satz hier.' }] } }));
  localStorage.setItem('inkling:pref:last', JSON.stringify('nvor'));
})();"""

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

async def until(pg, js, secs=8):
    for _ in range(int(secs * 10)):
        if await pg.evaluate(js): return True
        await pg.wait_for_timeout(100)
    return False

SHEETS = "JSON.stringify([...document.querySelectorAll('.sheet.a4')].map(s => [s.offsetWidth, s.offsetHeight]))"
PARA = "(t) => { const p = [...document.querySelectorAll('.flow p, .flow h1, .flow h2')].find(x => x.textContent.startsWith(t)); return p ? p.outerHTML : null; }"

async def menu(pg, *path):
    await pg.click('.rtab:has-text("View")'); await pg.wait_for_timeout(200)
    await pg.click('button.tb:has-text("Page setup")'); await pg.wait_for_timeout(250)
    for t in path:
        await pg.locator('.menu button', has_text=t).last.click(); await pg.wait_for_timeout(300)

async def main():
    d = tempfile.mkdtemp(); cert(d)
    bridge = start_bridge(d)
    errs, must = [], {}
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--ignore-certificate-errors'])
            ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, ignore_https_errors=True, color_scheme='light')
            await ctx.route('https://appsforoffice.microsoft.com/**', lambda r: r.fulfill(body=OFFICE, content_type='text/javascript'))
            word = await ctx.new_page(); word.on('pageerror', lambda e: errs.append('word: ' + str(e)))
            await word.add_init_script('window.FAKE_WORD_INIT = ' + json.dumps(INIT))
            await word.goto('https://localhost:%d/word/taskpane.html' % PORT)
            await until(word, "document.getElementById('state').textContent.startsWith('Connected')")

            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append('app: ' + str(e))); pg.on('console', lambda m: print('CONSOLE', m.text[:300]) if m.type == 'error' else None)
            await pg.add_init_script("localStorage.setItem('inkling:pref:wordPort', '%d'); localStorage.setItem('inkling:pref:theme', JSON.stringify('light'))" % PORT)
            await pg.goto(APP); await pg.wait_for_timeout(900)
            await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Bio'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await pg.click('.secnav-item[data-sec="home"]'); await pg.wait_for_timeout(300)
            await pg.click('#sxWord [data-act="wlconnect"]'); await pg.wait_for_timeout(200)
            await pg.fill('#wlCode', '123456'); await pg.click('#sxWord [data-act="wlcode"]')
            await until(pg, "!!document.querySelector('#sxWord [data-act=\"wlopen\"]')")
            await pg.click('#sxWord [data-act="wlopen"]')
            await until(pg, "document.querySelectorAll('.flow table.wtable').length === 1 && !!document.querySelector('.pg-hf.ft .pgf')")
            await pg.wait_for_timeout(800)

            # 1. Word → page: the page, the header and footer, colours, highlight, alignment, cell colours
            sheets = await pg.evaluate(SHEETS)
            pad = await pg.evaluate("document.querySelector('.sheet.a4 .flow').style.padding")
            hd = await pg.evaluate("[...document.querySelectorAll('.pg-hf.hd')].map(e => [e.innerText.trim(), e.querySelector('p') && e.querySelector('p').style.textAlign])")
            ft = await pg.evaluate("[...document.querySelectorAll('.pg-hf.ft')].map(e => e.innerText.trim())")
            p1 = await pg.evaluate(PARA, 'Die Zelle'); p2 = await pg.evaluate(PARA, 'Mitte'); h1 = await pg.evaluate(PARA, 'Zellteilung')
            cells = await pg.evaluate("[...document.querySelectorAll('.flow table.wtable td')].map(td => td.style.backgroundColor)")
            zoom = await pg.evaluate("(() => { const s = document.querySelector('.sheet.a4'), sc = document.getElementById('scroller'); return s.getBoundingClientRect().width <= sc.clientWidth; })()")
            print('page from Word (landscape A4):', sheets, '| margins:', pad, '| zoom to fit:', zoom)
            print('   header:', hd[:1], '| footer on each page:', ft)
            print('   red word:', 'color: rgb(192, 0, 0)' in p1, '| highlight:', 'background-color: rgb(255, 255, 0)' in p1, '| centred bold italic:', p2, '| heading colour:', 'rgb(47, 84, 150)' in h1)
            print('   cell colours:', cells)
            must['word page comes here'] = json.loads(sheets)[0] == [1123, 794] and '94.5px' in pad and zoom
            must['word header and footer'] = hd and hd[0] == ['Biologie Dossier', 'right'] and ft[0] == 'Seite 1'
            must['word colours'] = 'color: rgb(192, 0, 0)' in p1 and 'background-color: rgb(255, 255, 0)' in p1 and 'rgb(47, 84, 150)' in h1
            must['word alignment and bold'] = 'text-align: center' in p2 and '<b>' in p2 and '<i>' in p2
            must['word cell colours'] = cells[:2] == ['rgb(217, 226, 243)', 'rgb(217, 226, 243)'] and cells[2] == ''
            await shot(pg, 'wl_fmt_1_page.png'); await shot(word, 'wl_fmt_1_word.png')

            # 2. page → Word: bold + blue on a word, right alignment, a header change, page numbers, a new size
            await pg.evaluate("""(() => { const p = [...document.querySelectorAll('.flow p')].find(x => x.textContent.startsWith('Schluss')); const t = p.firstChild;
              const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 7); const s = getSelection(); s.removeAllRanges(); s.addRange(r); p.closest('.flow').focus();
              document.execCommand('styleWithCSS', false, true); document.execCommand('bold'); document.execCommand('foreColor', false, '#1C5BCB'); document.execCommand('justifyRight'); })()""")
            got = await until(word, "fakeWord.fmt(fakeWord.list().findIndex(p => p.text === 'Schluss.')).includes('Schluss.:b;c=#1c5bcb') && fakeWord.list().find(p => p.text === 'Schluss.').align === 'Right'")
            print('page → Word: bold blue word and right alignment:', got, await word.evaluate("fakeWord.fmt(fakeWord.list().findIndex(p => p.text === 'Schluss.'))"))
            must['bold colour alignment to Word'] = got
            s1 = await (await pg.query_selector('.sheet.a4[data-sheet="0"]')).bounding_box()
            await pg.mouse.dblclick(s1['x'] + 300, s1['y'] + 20); await pg.wait_for_timeout(300)
            editing = await pg.evaluate("!!document.querySelector('.pg-hf.hd.editing')")
            await pg.keyboard.press('End'); await pg.keyboard.type(' 2026'); await pg.keyboard.press('Escape')
            got = await until(word, "fakeWord.part('head').some(p => p.text === 'Biologie Dossier 2026')")
            print('header typed here reaches Word:', editing, got, await word.evaluate("fakeWord.part('head')"))
            must['header to Word'] = editing and got
            await menu(pg, 'Page numbers', 'Page 1 of 3')
            got = await until(word, "fakeWord.part('foot').some(p => p.fields.join() === 'PAGE,NUMPAGES' && p.text === 'Page 1 of 3')")
            foot_app = await pg.evaluate("document.querySelector('.pg-hf.ft').innerText.trim()")
            print('page numbers here → Word fields:', got, await word.evaluate("fakeWord.part('foot')"), '| page shows:', foot_app)
            must['page numbers to Word as fields'] = got and foot_app.startswith('Page 1 of')
            await menu(pg, 'Turn', 'Upright')
            await menu(pg, 'Size', 'A5')
            got = await until(word, "fakeWord.setup.orientation === 'Portrait' && Math.abs(fakeWord.setup.pageWidth - 419.3) < 1 && Math.abs(fakeWord.setup.pageHeight - 595.5) < 1")
            print('size and orientation → Word:', got, await word.evaluate("[fakeWord.setup.orientation, fakeWord.setup.pageWidth, fakeWord.setup.pageHeight]"), '| page:', await pg.evaluate(SHEETS))
            must['size to Word'] = got
            await shot(pg, 'wl_fmt_2_page.png'); await shot(word, 'wl_fmt_2_word.png')

            # 3. Word → page again: a green word, centred, a cell colour, Letter size, a new footer
            i = await word.evaluate("fakeWord.list().findIndex(p => p.text.startsWith('Die Zelle'))")
            await word.evaluate("fakeWord.format(%d, 0, 3, 'c=#00b050')" % i)
            await word.evaluate("fakeWord.align(%d, 'Justified')" % i)
            await word.evaluate("fakeWord.shade(1, 1, 1, '#FFC000')")
            await word.evaluate("fakeWord.setSetup({ pageWidth: 612, pageHeight: 792, orientation: 'Portrait' })")
            got = await until(pg, "(() => { const p = [...document.querySelectorAll('.flow p')].find(x => x.textContent.startsWith('Die Zelle')); return p && p.innerHTML.includes('rgb(0, 176, 80)') && p.style.textAlign === 'justify'; })()", 10)
            cell = await pg.evaluate("document.querySelectorAll('.flow table.wtable td')[3].style.backgroundColor")
            size = await until(pg, "document.querySelector('.sheet.a4').offsetWidth === 816 && document.querySelector('.sheet.a4').offsetHeight === 1056")
            p1 = await pg.evaluate(PARA, 'Die Zelle')
            print('Word → page: green word and justified:', got, '| red word still there:', 'rgb(192, 0, 0)' in p1, '| cell colour:', cell, '| Letter size:', size, await pg.evaluate(SHEETS))
            must['word changes come back'] = got and cell == 'rgb(255, 192, 0)' and size and 'rgb(192, 0, 0)' in p1

            # 4. an older Word: the page from the OOXML, page numbers as OOXML fields, its own page size stays
            old = await ctx.new_page(); old.on('pageerror', lambda e: errs.append('old word: ' + str(e)))
            await old.add_init_script('window.FAKE_WORD_INIT = ' + json.dumps(OLD))
            await old.goto('https://localhost:%d/word/taskpane.html' % PORT)
            await until(old, "document.getElementById('state').textContent.startsWith('Connected')")
            await pg.click('.secnav-item[data-sec="home"]'); await pg.wait_for_timeout(500)
            key = OLD['url']
            await until(pg, "!!document.querySelector('#sxWord [data-act=\"wlopen\"][data-arg=\"%s\"]')" % key.replace('\\', '\\\\'))
            await pg.click('#sxWord [data-act="wlopen"][data-arg="%s"]' % key.replace('\\', '\\\\'))
            got = await until(pg, "document.getElementById('crumbs').innerText.includes('Alt') && document.querySelector('.sheet.a4').offsetWidth === 816")
            print('older Word: its Letter page comes from the OOXML:', got, await pg.evaluate(SHEETS))
            must['older Word page'] = got
            await menu(pg, 'Page numbers', 'At the bottom, in the middle')
            got = await until(old, "fakeWord.part('foot').some(p => p.fields.join() === 'PAGE')")
            print('older Word: page numbers as OOXML fields:', got, await old.evaluate("fakeWord.part('foot')"), '| errors:', await old.evaluate('fakeWord.errors'))
            must['older Word page numbers'] = got
            await menu(pg, 'Size', 'A4 (')
            back = await until(pg, "document.querySelector('.sheet.a4').offsetWidth === 816", 10)
            said = await until(pg, "document.getElementById('toast').innerText.includes('Word kept its own page size')", 6)
            print('older Word keeps its size:', back, '| the app says so:', said, '| Word:', await old.evaluate("[fakeWord.setup.pageWidth, fakeWord.setup.pageHeight]"))
            must['older Word keeps its size'] = back and said
            await shot(pg, 'wl_fmt_3_old.png')
            errs += ['word errors: ' + str(e) for e in await word.evaluate('fakeWord.errors')]

            # 5. a page linked before formatting crossed (no doc.word.fv): Word's red word must stay red, in Word too
            ctx2 = await b.new_context(viewport={'width': 1440, 'height': 900}, ignore_https_errors=True)
            await ctx2.route('https://appsforoffice.microsoft.com/**', lambda r: r.fulfill(body=OFFICE, content_type='text/javascript'))
            vw = await ctx2.new_page(); vw.on('pageerror', lambda e: errs.append('word before: ' + str(e)))
            await vw.add_init_script('window.FAKE_WORD_INIT = ' + json.dumps(BEFORE))
            await vw.goto('https://localhost:%d/word/taskpane.html' % PORT)
            await until(vw, "document.getElementById('state').textContent.startsWith('Connected')")
            ap = await ctx2.new_page(); ap.on('pageerror', lambda e: errs.append('app before: ' + str(e)))
            await ap.add_init_script(SEED_BEFORE % PORT)
            await ap.goto(APP)
            got = await until(ap, "(() => { const p = [...document.querySelectorAll('.flow p')].find(x => x.textContent.startsWith('Ein roter')); return p && p.innerHTML.includes('rgb(192, 0, 0)'); })()", 12)
            await ap.wait_for_timeout(2500)
            still = await vw.evaluate("fakeWord.fmt(1)")
            fv = await ap.evaluate("(JSON.parse(localStorage.getItem('inkling:data:note_nvor')).word || {}).fv")
            print('a page linked before this update: Word’s red word comes here:', got, '| and stays red in Word:', still, '| marked as upgraded:', fv)
            must['old link keeps Word colours'] = got and 'roter:c=#c00000' in still and fv == 1
            await ctx2.close()

            # 6. the desktop app: Word link in the sidebar → search a Word file → Open and link → it opens in Word and the
            #    page links by itself when Word's panel says hello; the panel opens by itself next time
            ctx3 = await b.new_context(viewport={'width': 1440, 'height': 900}, ignore_https_errors=True)
            await ctx3.route('https://appsforoffice.microsoft.com/**', lambda r: r.fulfill(body=OFFICE, content_type='text/javascript'))
            dp = await ctx3.new_page(); dp.on('pageerror', lambda e: errs.append('desktop: ' + str(e)))
            await dp.add_init_script(open(os.path.join(HERE, 'mock_desk.js')).read())
            await dp.add_init_script("localStorage.setItem('inkling:pref:wordPort', '%d'); localStorage.setItem('inkling:pref:wordCode', '\"123456\"'); window.__deskFind = 1" % PORT)
            await dp.goto(APP); await dp.wait_for_timeout(1200)
            await dp.evaluate("window.__desk.wordFind = [{ name: 'Neu.docx', path: 'C:\\\\Users\\\\Kawi\\\\Documents\\\\Neu.docx', folder: 'Documents', modified: Date.now() }, { name: 'Alt.docx', path: 'C:\\\\Users\\\\Kawi\\\\Desktop\\\\Alt.docx', folder: 'Desktop', modified: Date.now() - 864e5 }]")
            await dp.click('.secnav-item[data-sec="word"]'); await dp.wait_for_timeout(800)
            listed = await dp.evaluate("[...document.querySelectorAll('#wlFound .wl-doc b')].map(b => b.innerText)")
            await dp.fill('#wlFind', 'neu'); await dp.wait_for_timeout(700)
            found = await dp.evaluate("[...document.querySelectorAll('#wlFound .wl-doc b')].map(b => b.innerText)")
            await dp.click('#wlFound button:has-text("Open and link")'); await dp.wait_for_timeout(500)
            opened = await dp.evaluate("window.__desk.wordOpened")
            nw = await ctx3.new_page(); nw.on('pageerror', lambda e: errs.append('word new: ' + str(e)))
            await nw.add_init_script('window.FAKE_WORD_INIT = ' + json.dumps({'url': 'C:\\Users\\Kawi\\Documents\\Neu.docx', 'paras': [{'text': 'Neuer Text aus Word'}]}))
            await nw.goto('https://localhost:%d/word/taskpane.html' % PORT)
            linked = await until(dp, "document.getElementById('crumbs').innerText.includes('Neu') && [...document.querySelectorAll('.flow p')].some(p => p.textContent === 'Neuer Text aus Word')", 12)
            auto = await until(nw, "fakeWord.settings['Office.AutoShowTaskpaneWithDocument'] === true", 6)
            print('desktop: Word files listed:', listed, '| search “neu”:', found, '| opened in Word:', opened, '| linked by itself:', linked, '| panel opens by itself next time:', auto)
            must['search, open and link a Word file'] = listed == ['Neu', 'Alt'] and found == ['Neu'] and opened == ['C:\\Users\\Kawi\\Documents\\Neu.docx'] and linked and auto
            await ctx3.close()
            await b.close()
    finally:
        bridge.terminate()
    errs += ['check failed: ' + k for k, v in must.items() if not v]
    print('ERRORS', errs)

asyncio.run(main())

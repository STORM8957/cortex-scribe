# The demo version for friends: the 5 basic colours (pen, highlighter, pad, text colour; “More colours” for the rest),
# the navy blue theme next to black and white, the coming sections hidden (and back with View → Coming sections),
# the Word link in the sidebar, and PDF export (top bar, View tab, the page's menu): A4 pages with their own size and
# header/footer, an endless page cut into pages, a board as one page; a real PDF a PDF reader opens.
import os, pathlib, json, asyncio, re, subprocess, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
from playwright.async_api import async_playwright

SEED = r"""
(() => {
  if (localStorage.getItem('inkling:pref:previews') == null) localStorage.setItem('inkling:pref:previews', 'false');   // the demo: coming sections hidden
  if (localStorage.getItem('inkling:data:tree')) return;
  const t = Date.now();
  localStorage.setItem('inkling:data:tree', JSON.stringify({ v: 2, nodes: {
    fnb: { id: 'fnb', type: 'folder', name: 'Bio', parent: null, order: 1, created: t, updated: t },
    npa: { id: 'npa', type: 'note', name: 'Blatt', parent: 'fnb', kind: 'a4', order: 2, created: t, updated: t },
    npe: { id: 'npe', type: 'note', name: 'Endlos', parent: 'fnb', kind: 'endless', order: 3, created: t, updated: t },
    npb: { id: 'npb', type: 'note', name: 'Brett', parent: 'fnb', kind: 'board', order: 4, created: t, updated: t } } }));
  const long = Array.from({ length: 30 }, (_, i) => '<p>Satz ' + (i + 1) + ' mit etwas mehr Text, damit die Zeile voll wird.</p>').join('');
  localStorage.setItem('inkling:data:note_npa', JSON.stringify({ v: 2, kind: 'a4', bg: 'blank', margin: false, ps: 'A5', po: 'l', mu: t, fu: [t], hd: '<p>Kopfzeile</p>', flows: ['<h1>Zellteilung</h1><p>Die <span style="color:#E5383B">Zelle</span> teilt sich.</p>' + long], objs: {} }));
  localStorage.setItem('inkling:data:note_npe', JSON.stringify({ v: 2, kind: 'endless', bg: 'lined', margin: true, mu: t, fu: [t], flows: ['<p>Endlos</p>' + long + long], objs: {} }));
  localStorage.setItem('inkling:data:note_npb', JSON.stringify({ v: 2, kind: 'board', bg: 'dots', margin: false, mu: t, fu: [], flows: [], objs: {
    s1: { id: 's1', t: 'sticky', x: 100, y: 100, w: 200, h: 160, col: 'pink', html: '<p>Idee</p>', z: 1, u: t, name: 'Sticky 1' },
    s2: { id: 's2', t: 'note', x: 700, y: 500, w: 260, h: 80, ah: true, html: '<p>Weit weg</p>', z: 2, u: t, name: 'Note box 1' } } }));
  localStorage.setItem('inkling:pref:last', JSON.stringify('npa'));
})();
"""
OUT = tempfile.mkdtemp()

async def pdf_of(pg, click):
    async with pg.expect_download(timeout=30000) as dl:
        await click()
    d = await dl.value
    path = os.path.join(OUT, d.suggested_filename); await d.save_as(path)
    data = open(path, 'rb').read()
    boxes = [tuple(float(x) for x in m) for m in re.findall(rb'/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]', data)]
    info = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout if subprocess.run(['which', 'pdfinfo'], capture_output=True).returncode == 0 else 'Pages: ' + str(len(boxes))
    pages = int((re.search(r'Pages:\s+(\d+)', info) or [0, 0])[1])
    return d.suggested_filename, boxes, pages

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        await ctx.add_init_script(SEED)
        pg = await ctx.new_page()
        errs, must = [], {}
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(APP); await pg.wait_for_timeout(1500)

        # 1. the coming sections are hidden; the Word link is in the sidebar
        nav = await pg.evaluate("[...document.querySelectorAll('#secNav .secnav-item')].map(b => b.innerText.replace(/\\s+/g, ' ').trim())")
        await pg.click('.secnav-item[data-sec="home"]'); await pg.wait_for_timeout(400)
        home = await pg.evaluate("[!!document.querySelector('.sx-note'), document.querySelectorAll('.sx-grid.home .sx-card').length, !!document.querySelector('#sxWord'), [...document.querySelectorAll('.sx-quick button')].map(b => b.innerText.trim()), document.querySelector('.sx-hello p').innerText]")
        print('sections:', nav, '| Home (preview note, cards, Word card, quick buttons, line):', home)
        must['coming sections hidden'] = nav == ['Home', 'Notebooks', 'Word link'] and not home[0] and home[1] == 3 and home[2] and 'Word link' in home[3] and 'open tasks' not in home[4]
        await pg.click('.secnav-item[data-sec="word"]'); await pg.wait_for_timeout(400)
        word = await pg.evaluate("[document.querySelector('.sx-wordsec h1').innerText, !!document.querySelector('#sxWord'), document.querySelector('#sxWordFind').innerText.slice(0, 60)]")
        print('Word link screen:', word)
        must['word screen'] = word[0] == 'Word link' and word[1]
        await pg.click('.secnav-item[data-sec="notes"]'); await pg.wait_for_timeout(800)
        await pg.click('.rtab:has-text("View")'); await pg.wait_for_timeout(200)
        await pg.click('label.rcheck:has-text("Coming sections")'); await pg.wait_for_timeout(300)
        nav2 = await pg.evaluate("document.querySelectorAll('#secNav .secnav-item').length")
        await pg.click('label.rcheck:has-text("Coming sections")'); await pg.wait_for_timeout(300)
        nav3 = await pg.evaluate("document.querySelectorAll('#secNav .secnav-item').length")
        print('View → Coming sections on / off:', nav2, nav3)
        must['coming sections switch'] = nav2 == 8 and nav3 == 3

        # 2. the navy blue theme
        opts = await pg.evaluate("[...document.querySelector('select[aria-label=\"Colours\"]').options].map(o => o.text)")
        await pg.select_option('select[aria-label="Colours"]', 'navy'); await pg.wait_for_timeout(300)
        navy = await pg.evaluate("[document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.sheet')).backgroundColor]")
        print('themes:', opts, '| navy:', navy)
        must['navy theme'] = opts[:3] == ['Black (with red)', 'White', 'Navy blue'] and navy[0] == 'navy' and navy[1] == 'rgb(10, 20, 40)'
        await pg.select_option('select[aria-label="Colours"]', 'dark'); await pg.wait_for_timeout(200)

        # 3. the 5 basic colours
        await pg.click('.rtab:has-text("Draw")'); await pg.wait_for_timeout(200)
        await pg.click('#rbody [data-tool="pen"]'); await pg.wait_for_timeout(200)
        pen = await pg.evaluate("[...document.querySelectorAll('#rbody .swatches .sw')].map(b => b.getAttribute('aria-label'))")
        if not await pg.is_visible('#ptab-pen'): await pg.click('#rail button[data-ptab="pen"]')
        await pg.wait_for_timeout(300)
        pad = await pg.evaluate("document.querySelectorAll('#padTools .pad-sw .sw').length")
        await pg.click('#rbody [data-tool="text"]'); await pg.wait_for_timeout(200)
        await pg.click('.rtab:has-text("Home")'); await pg.wait_for_timeout(200)
        await pg.click('.flow p'); await pg.click('#rbody button[aria-label="Text colour: choose colour"]'); await pg.wait_for_timeout(200)
        basic = await pg.evaluate("[...document.querySelectorAll('.pal button')].map(b => b.getAttribute('aria-label') || b.innerText.trim())")
        await pg.click('.pal button.more'); await pg.wait_for_timeout(200)
        more = await pg.evaluate("document.querySelectorAll('.pal button[aria-label^=\"#\"]').length")
        await pg.keyboard.press('Escape'); await pg.mouse.click(5, 5)
        print('pen colours:', pen, '| pad colours:', pad, '| text colour:', basic, '| more colours:', more)
        must['5 basic colours'] = len(pen) == 6 and pen[:4] == ['Colour #E5383B', 'Colour #FF5FA2', 'Colour #2563EB', 'Colour #16A34A'] and pad == 5 and basic[:5] == ['#E5383B', '#FF5FA2', '#2563EB', '#16A34A', '#000000'] and 'More colours' in basic and more >= 20

        # 4. PDF: an A5 sideways page (two pages), from the top bar
        await pg.click('.rtab:has-text("View")'); await pg.wait_for_timeout(200)
        name, boxes, pages = await pdf_of(pg, lambda: pg.click('#pdfBtn'))
        sheets = await pg.evaluate("document.querySelectorAll('.sheet.a4').length")
        print('PDF of the A4 page:', name, boxes, '| pages (PDF reader):', pages, '| sheets:', sheets, '| toast:', await pg.inner_text('#toast'))
        must['pdf of A4 pages'] = name == 'Blatt.pdf' and pages == sheets and boxes and all(bx == (595.5, 419.25) for bx in boxes)
        # an endless page from the View tab, cut into pages
        await pg.click('#tree .t-row:has-text("Endlos")'); await pg.wait_for_timeout(1000)
        await pg.click('.rtab:has-text("View")'); await pg.wait_for_timeout(200)
        name, boxes, pages = await pdf_of(pg, lambda: pg.click('#rbody button.tb:has-text("PDF")'))
        print('PDF of the endless page:', name, boxes[:2], '| pages:', pages)
        must['pdf of an endless page'] = name == 'Endlos.pdf' and pages >= 2 and boxes and abs(boxes[0][1] / boxes[0][0] - 1123 / 794) < 0.01
        # a board from its menu in the list
        await pg.click('#tree .t-row:has-text("Brett") .t-more', timeout=3000) if await pg.query_selector('#tree .t-row:has-text("Brett") .t-more') else await pg.click('#tree .t-row:has-text("Brett")', button='right')
        await pg.wait_for_timeout(200)
        name, boxes, pages = await pdf_of(pg, lambda: pg.click('.menu button:has-text("Download as PDF")'))
        print('PDF of the board (from the list):', name, boxes, '| pages:', pages)
        must['pdf of a board'] = name == 'Brett.pdf' and pages == 1 and boxes and boxes[0][0] > boxes[0][1]
        await b.close()
        errs += ['check failed: ' + k for k, v in must.items() if not v]
        print('ERRORS', errs)

asyncio.run(main())

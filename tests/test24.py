# Colour styles for note boxes, see-through text boxes (drawn like in Word), movable A4/A3 sheets and whole pages;
# sheets with vertical lines, turned upright/sideways and added below; and the Blocks system with folders,
# “Recently used” / “Recently added”, a section per kind (Notes, Papers, Text boxes, Texts …), new sheets from
# the Blocks window, the Paste button's folders, and block folders kept by Export / Import. Inside Claude.
import os, pathlib, json, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
SHOTS = os.environ.get('SHOTS')
import asyncio
from playwright.async_api import async_playwright

MOCK = r"""
(() => {
  const sample = async () => ({ text: 'ok', truncated: false });
  sample.json = async () => ({});
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 5e6, mediaTypes: ['image/png', 'image/jpeg'] } });
  window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
  // a block saved by an older Inkling (no section, no folder)
  if (!localStorage.getItem('inkling:data:blocks')) {
    localStorage.setItem('inkling:data:blocks', JSON.stringify({ items: [{ id: 'blold1', kind: 'objects', sub: 'mixed', name: 'Alte Notiz', info: 'Note box', created: 1700000000000 }] }));
    localStorage.setItem('inkling:data:block_blold1', JSON.stringify({ objs: [{ id: 'o1', t: 'note', x: 0, y: 0, w: 200, h: 60, html: '<p>Alt</p>' }], ink: [], w: 200, h: 60 }));
  }
})();
"""
OBJS = """(title) => { for (const k of Object.keys(localStorage)) if (k.includes('data:note_')) { const d = JSON.parse(localStorage[k]); if (d.title === title) return [Object.values(d.objs || {}).filter((o) => !o.del), d.pcol || null, d.bg]; } return [[], null, null]; }"""
BLOCKS = "() => { const d = JSON.parse(localStorage.getItem('inkling:data:blocks') || '{}'); const fs = d.folders || []; return { folders: fs.map((f) => f.name), items: (d.items || []).map((b) => [b.name, b.cat || null, (fs.find((f) => f.id === b.folder) || {}).name || null, !!b.used]) }; }"
async def objs(pg, title, t=None):
    await pg.wait_for_timeout(1300)
    l, pc, bg = await pg.evaluate(OBJS, title)
    return [o for o in l if not t or o['t'] == t]
async def page_meta(pg, title):
    await pg.wait_for_timeout(1300)
    l, pc, bg = await pg.evaluate(OBJS, title); return pc, bg

async def new_page(pg, nb, kind_index, name):
    if nb:
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', nb); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
    else:
        await pg.click('.t-row.top .t-acts button'); await pg.click('.menu button:has-text("New page")'); await pg.wait_for_timeout(200)
    await (await pg.query_selector_all('.kind'))[kind_index].click(); await pg.fill('.modal input.field', name); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(700)

async def pick(pg, sel):
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
    await pg.click(sel); await pg.wait_for_timeout(200)

async def shot(pg, name, el=None):
    if not SHOTS: return
    if el: await (await pg.query_selector(el)).screenshot(path=os.path.join(SHOTS, name))
    else: await pg.screenshot(path=os.path.join(SHOTS, name))

async def save_block(pg, x, y, folder=None, new_folder=None):
    await pg.mouse.click(x, y, button='right'); await pg.wait_for_timeout(250)
    await pg.click('.menu button:has-text("Save as a block")'); await pg.wait_for_timeout(250)
    where = await pg.inner_text('.modal .blk-where')
    if new_folder: await pg.select_option('#blFolder', '+'); await pg.fill('#blNewFolder', new_folder)
    elif folder is not None: await pg.select_option('#blFolder', label=folder)
    await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(400)
    return where

async def center(pg, sel):
    b = await (await pg.query_selector(sel)).bounding_box(); return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(MOCK)
        await pg.goto(APP); await pg.wait_for_timeout(1000)

        # 1. note box colours, and “Use for new note boxes”
        await new_page(pg, 'Bio', 1, 'Zellen')
        await pg.click('.flow'); await pg.keyboard.type('Die Zelle ist die kleinste Einheit des Lebens.')
        await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('Merke dir das'); await pg.wait_for_timeout(150)
        await pick(pg, '.obj-note >> nth=0')
        await pg.click('#objbar button[aria-label="Colours"]'); await pg.wait_for_timeout(250)
        tiles = await pg.evaluate("[...document.querySelectorAll('.stylepop .sp-tile')].map(t=>t.title)")
        await pg.click('.stylepop .sp-tile[title="Mint"]'); await pg.wait_for_timeout(250)
        await shot(pg, 'note_colours.png', '.pop')
        cs = await pg.evaluate("(()=>{const cs=getComputedStyle(document.querySelector('.obj-note')); return [cs.backgroundColor,cs.borderTopColor,cs.color]})()")
        pressed = await pg.evaluate("[...document.querySelectorAll('.stylepop .sp-tile[aria-pressed=true]')].map(t=>t.title)")
        await pg.click('#spNew'); await pg.wait_for_timeout(150); lab = await pg.inner_text('#spNew'); await pg.keyboard.press('Escape')
        await pg.click('#dock button[aria-label="Note box (N)"]'); await pg.keyboard.type('Zweite Notiz'); await pg.wait_for_timeout(150)
        notes = await objs(pg, 'Zellen', 'note'); n1 = [o for o in notes if 'Merke' in o.get('html', '')][0]
        print('note box colour styles:', tiles[:5], '… (' + str(len(tiles)) + ') | Mint:', [n1.get('bg'), n1.get('bc'), n1.get('tc')], cs, '| ticked:', pressed, '|', lab, '| new note boxes get it:', [o.get('bg') for o in notes])
        # several note boxes at once (Shift + click), and back to normal
        await pick(pg, '.obj-note >> nth=0'); await pg.click('.obj-note >> nth=1', modifiers=['Shift']); await pg.wait_for_timeout(200)
        await pg.click('#objbar button[aria-label="Colours for all of them"]'); await pg.click('.stylepop .sp-tile[title="Normal"]'); await pg.wait_for_timeout(200); await pg.keyboard.press('Escape')
        print('both back to normal:', [[o.get('bg'), o.get('bc'), o.get('tc')] for o in await objs(pg, 'Zellen', 'note')])
        await pick(pg, '.obj-note >> nth=0'); await pg.click('#objbar button[aria-label="Colours"]'); await pg.click('#spNew'); await pg.keyboard.press('Escape')   # new note boxes normal again

        # 2. a see-through text box, drawn like in Word, then frosted and more see-through
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
        await pg.click('.rtabs button:has-text("Insert")'); await pg.wait_for_timeout(150)
        await pg.click('#ribbon button[aria-label^="Text box"]'); await pg.wait_for_timeout(150)
        menu = await pg.evaluate("[...document.querySelectorAll('.menu button')].map(b=>b.innerText.trim())")
        await pg.click('.menu button:has-text("Draw a text box")'); await pg.wait_for_timeout(150)
        tool1 = await pg.get_attribute('#dock button[data-tool="tbox"]', 'aria-pressed')
        sb = await (await pg.query_selector('.sheet')).bounding_box()
        x0, y0 = sb['x'] + 420, sb['y'] + 300
        await pg.mouse.move(x0, y0); await pg.mouse.down(); await pg.mouse.move(x0 + 150, y0 + 50, steps=5); await pg.mouse.move(x0 + 300, y0 + 110, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(300)
        await pg.keyboard.type('Durchsichtig wie in Word'); await pg.wait_for_timeout(150)
        tb = await pg.evaluate("(()=>{const el=document.querySelector('.obj-text'); const r=el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(el).backgroundColor, el.innerText.trim(), document.querySelector('#dock button[data-tool=tbox]').getAttribute('aria-pressed')]})()")
        print('text box menu:', menu, '| tool on:', tool1, '| drawn [w, h, background, text, tool still on]:', tb)
        await pick(pg, '.obj-text')
        await pg.click('#objbar button[aria-label="Colours"]'); await pg.wait_for_timeout(200)
        tb_tiles = await pg.evaluate("[...document.querySelectorAll('.stylepop .sp-tile')].map(t=>t.title)")
        await pg.click('.stylepop .sp-tile[title="Frosted"]'); await pg.wait_for_timeout(200)
        frost = await pg.evaluate("getComputedStyle(document.querySelector('.obj-text')).backgroundColor")
        await pg.evaluate("(()=>{const r=document.querySelector('.stylepop .sp-range input'); r.value=80; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change'));})()"); await pg.wait_for_timeout(200)
        await shot(pg, 'tbox_colours.png', '.pop')
        fo2 = await pg.evaluate("getComputedStyle(document.querySelector('.obj-text')).backgroundColor")
        t1 = (await objs(pg, 'Zellen', 'text'))[0]
        await pg.keyboard.press('Escape')
        print('text box styles:', tb_tiles, '| Frosted:', frost, '| 80% see-through:', fo2, '| saved:', [t1.get('bg'), t1.get('fo'), round(t1['w']), round(t1['h']), t1.get('ah')], '| in the dock:', await pg.is_visible('#dock button[data-tool="tbox"]'))

        # the Format panel and the right-click menu offer the colours too
        await pick(pg, '.obj-note >> nth=0')
        await pg.click('#rail button[data-ptab="format"]'); await pg.wait_for_timeout(300)
        fmt_note = await pg.inner_text('#ptab-format')
        await pick(pg, '.obj-text'); await pg.wait_for_timeout(300); fmt_text = await pg.inner_text('#ptab-format')
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); fmt_page = await pg.inner_text('#ptab-format')
        nb0 = await (await pg.query_selector('.obj-note >> nth=0')).bounding_box()
        await pg.mouse.click(nb0['x'] + 30, nb0['y'] + 12, button='right'); await pg.wait_for_timeout(250)
        has_col = await pg.is_visible('.menu button:has-text("Colours…")')
        await pg.click('.menu button:has-text("Colours…")'); await pg.wait_for_timeout(200)
        pop_open = await pg.is_visible('.stylepop'); await pg.keyboard.press('Escape')
        print('Format panel: note', all(x in fmt_note for x in ['Colour styles', 'Border colour']), '| text box', all(x in fmt_text for x in ['See-through', 'Outline width', 'Round corners']), '| page', 'Colour' in fmt_page and 'Vertical lines' in fmt_page, '| right-click Colours…', has_col, pop_open)
        await pg.click('#rail button[data-ptab="format"]'); await pg.wait_for_timeout(200)

        # 3. the page colour, vertical lines, and “Use for new pages”
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
        await pg.click('.rtabs button:has-text("View")'); await pg.wait_for_timeout(150)
        await pg.click('#ribbon button[aria-label="Page colour"]'); await pg.wait_for_timeout(200)
        await pg.click('.stylepop .sp-tile[title="Cream"]'); await pg.wait_for_timeout(300)
        await pg.click('#spNew'); await pg.wait_for_timeout(100); await pg.keyboard.press('Escape')
        await pg.click('.rtabs button:has-text("View")'); await pg.wait_for_timeout(150)
        await pg.select_option('#ribbon select[aria-label="Paper"]', 'vlined'); await pg.wait_for_timeout(300)
        page = await pg.evaluate("(()=>{const s=document.querySelector('.sheet'); return [s.className, getComputedStyle(s).backgroundColor, getComputedStyle(document.querySelector('.flow')).color, getComputedStyle(document.querySelector('.obj-note')).backgroundColor]})()")
        await shot(pg, 'page_colour.png')
        print('page colour [class, page, text, note box]:', page, '| saved:', await page_meta(pg, 'Zellen'))
        await new_page(pg, None, 0, 'Blatt')
        print('a new A4 page gets it:', await pg.evaluate("(()=>{const s=document.querySelector('.sheet'); return [s.classList.contains('pgc'), getComputedStyle(s).backgroundColor]})()"))
        await pg.click('.rtabs button:has-text("View")'); await pg.click('#ribbon button[aria-label="Page colour"]'); await pg.click('.stylepop .sp-tile[title="Normal"]'); await pg.click('#spNew'); await pg.keyboard.press('Escape')   # new pages normal again

        # 4. sheets: colours, vertical lines, turning, a sheet below
        await new_page(pg, None, 2, 'Brett')
        await pg.click('.rtabs button:has-text("Insert")'); await pg.wait_for_timeout(150)
        await pg.click('#ribbon button[aria-label="Movable A4 page"]'); await pg.wait_for_timeout(150)
        a4menu = await pg.evaluate("[...document.querySelectorAll('.menu button')].map(b=>b.innerText.trim())")
        await pg.click('.menu button:has-text("A4 portrait (upright)")'); await pg.wait_for_timeout(400)
        await pg.click('#objbar button[aria-label="Colours"]'); await pg.wait_for_timeout(200)
        await pg.click('.stylepop .sp-tile[title="Chalkboard"]'); await pg.wait_for_timeout(200); await pg.keyboard.press('Escape')
        await pg.click('#objbar button[aria-label="Page size, orientation and background"]'); await pg.hover('.menu button:has-text("Background")'); await pg.wait_for_timeout(350)
        await pg.click('.menu.sub button:has-text("Vertical lines")'); await pg.wait_for_timeout(300)
        sheet = await pg.evaluate("(()=>{const el=document.querySelector('.obj-paper'); return [getComputedStyle(el).backgroundColor, getComputedStyle(el.querySelector('.otext')).color, el.style.backgroundImage.includes('svg')]})()")
        o = (await objs(pg, 'Brett', 'paper'))[0]; sheet = [o.get('pc'), o.get('lc'), o.get('tc'), o.get('pbg')] + sheet
        await pg.click('#objbar button[aria-label^="Turn it sideways"]'); await pg.wait_for_timeout(250)
        await pg.click('#objbar button[aria-label="Add a sheet below or to the right"]'); await pg.wait_for_timeout(150)
        addm = await pg.evaluate("[...document.querySelectorAll('.menu button')].map(b=>b.innerText.trim())")
        await pg.click('.menu button:has-text("Empty sheet below")'); await pg.wait_for_timeout(400)
        ps = sorted([[round(o['x']), round(o['y']), round(o['w']), round(o['h']), bool(o.get('land')), o.get('pc')] for o in await objs(pg, 'Brett', 'paper')], key=lambda r: r[1])
        print('A4 menu:', a4menu, '| chalkboard sheet [paper, lines, text, background, css bg, css text, lines drawn]:', sheet)
        print('add menu:', addm, '| sheets [x, y, w, h, sideways, colour]:', ps, '| below:', len(ps) == 2 and ps[1][0] == ps[0][0] and ps[1][1] >= ps[0][1] + ps[0][3])
        await shot(pg, 'sheets.png')

        # 5. blocks: save into folders, sections per kind
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
        cx, cy = [c for c in [await center(pg, '.obj-paper >> nth=0'), await center(pg, '.obj-paper >> nth=1')] if 200 < c[1] < 750][0]
        w1 = await save_block(pg, cx, cy, new_folder='Biologie')
        await pg.click('#tree .t-row:has-text("Zellen")'); await pg.wait_for_timeout(900)
        nb = await (await pg.query_selector('.obj-note >> nth=0')).bounding_box()
        w2 = await save_block(pg, nb['x'] + 30, nb['y'] + 12)   # the folder chosen last time
        tbx = await (await pg.query_selector('.obj-text')).bounding_box()
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
        w3 = await save_block(pg, tbx['x'] + 30, tbx['y'] + 12, folder='No folder')
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
        await pg.click('.flow p >> nth=0', position={'x': 20, 'y': 8}); await pg.keyboard.press('End'); await pg.keyboard.down('Shift')
        for _ in range(10): await pg.keyboard.press('ArrowLeft')
        await pg.keyboard.up('Shift')
        sr = await pg.evaluate("(()=>{const r=getSelection().getRangeAt(0).getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]})()")
        w4 = await save_block(pg, sr[0], sr[1], folder='Biologie')
        await pg.wait_for_timeout(500)
        print('saved into:', [w.strip() for w in [w1, w2, w3, w4]], '| blocks [name, section, folder, used]:', await pg.evaluate(BLOCKS))

        # 6. the Blocks window
        CHIPS = "[...document.querySelectorAll('.modal .blk-chip')].map(c=>c.innerText.replace(/\\s+/g,' ').trim())"
        CATS = "[...document.querySelectorAll('.modal .blk-cat')].map(c=>c.dataset.cat+':'+c.querySelectorAll('.mrow').length)"
        await pg.click('#blocksBtn'); await pg.wait_for_timeout(400)
        print('folders:', await pg.evaluate(CHIPS), '| sections:', await pg.evaluate(CATS),
              '| recently added:', await pg.evaluate("[...document.querySelectorAll('.modal [data-recent=added] .blk-tile b')].map(b=>b.innerText)"), '| recently used:', await pg.is_visible('.modal [data-recent=used]'))
        await pg.click('.modal .blk-cat[data-cat="note"] .mrow button:has-text("Paste")'); await pg.wait_for_timeout(500)
        await pg.click('#blocksBtn'); await pg.wait_for_timeout(400)
        print('after pasting the note block, recently used:', await pg.evaluate("[...document.querySelectorAll('.modal [data-recent=used] .blk-tile b')].map(b=>b.innerText)"))
        await shot(pg, 'blocks_all.png', '.modal')
        await pg.click('.modal .blk-chip:has-text("Biologie")'); await pg.wait_for_timeout(250)
        print('inside Biologie:', await pg.evaluate(CATS), '| new sheet buttons:', await pg.evaluate("[...document.querySelectorAll('.modal .blk-newpaper button')].map(b=>b.innerText.trim())"))
        await shot(pg, 'blocks_folder.png', '.modal')
        await pg.click('.modal .blk-chip:has-text("Not in a folder")'); await pg.wait_for_timeout(250)
        await pg.click('.modal .blk-cat[data-cat="tbox"] .mrow .blk-move'); await pg.wait_for_timeout(200)
        await pg.click('.menu button:has-text("Biologie")'); await pg.wait_for_timeout(300)
        print('moved the text box block:', await pg.evaluate(CHIPS))
        await pg.click('.modal .blk-chip:has-text("All blocks")'); await pg.fill('.modal .blk-search', 'Merke'); await pg.wait_for_timeout(200)
        print('search “Merke”:', await pg.evaluate(CATS))
        await pg.fill('.modal .blk-search', '')
        await pg.click('#blkNewFolder'); await pg.wait_for_timeout(200)
        await pg.locator('.scrim').last.locator('input.field').fill('Leer'); await pg.locator('.scrim').last.locator('.btn.primary').click(); await pg.wait_for_timeout(250)
        made = await pg.evaluate(CHIPS)
        await pg.click('.modal .blk-fhead button:has-text("Delete folder")'); await pg.wait_for_timeout(200)
        await pg.locator('.scrim').last.locator('.btn.danger').click(); await pg.wait_for_timeout(250)
        print('new folder:', made, '| after deleting it:', await pg.evaluate(CHIPS))
        n0 = len(await objs(pg, 'Zellen', 'paper'))
        await pg.click('.modal .blk-newpaper button:has-text("A4 sideways")'); await pg.wait_for_timeout(500)
        print('new sheet from the Blocks window:', n0, '->', [(o.get('size') or 'A4') + (' sideways' if o.get('land') else ' upright') for o in await objs(pg, 'Zellen', 'paper')])

        # 7. the Paste button: recent blocks and folders, sorted by kind
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
        await pg.click('#dock .dock-caret'); await pg.wait_for_timeout(300)
        pm = await pg.evaluate("[...document.querySelectorAll('.menu:not(.sub) button,.menu:not(.sub) .mlabel')].map(b=>b.innerText.trim())")
        await pg.hover('.menu:not(.sub) button:has-text("Biologie")'); await pg.wait_for_timeout(400)
        sub = await pg.evaluate("[...document.querySelectorAll('.menu.sub button,.menu.sub .mlabel')].map(b=>b.innerText.trim())")
        print('Paste menu:', [x for x in pm if x][-12:], '| Biologie:', sub)
        await pg.keyboard.press('Escape')

        # 8. Export keeps the block folders and the page colour; Import puts blocks back into the same folders
        await pg.click('#backupBtn'); await pg.wait_for_timeout(200)
        async with pg.expect_download() as dl:
            await pg.click('.modal button:has-text("Export everything")')
        d = await dl.value; path = os.path.join(tempfile.gettempdir(), 'inkling-test24.json'); await d.save_as(path)
        data = json.load(open(path))
        zel = [v for k, v in data['notes'].items() if data['tree'][k]['name'] == 'Zellen'][0]
        print('export: folders', [f['name'] for f in data['blocks'].get('folders', [])], '| blocks in folders', sum(1 for x in data['blocks']['items'] if x.get('folder')), '| page colour', zel['main'].get('pcol'))
        await pg.click('#backupBtn'); await pg.wait_for_timeout(200)
        async with pg.expect_file_chooser() as fc:
            await pg.click('.modal button:has-text("Import a backup")')
        await (await fc.value).set_files(path); await pg.wait_for_timeout(400)
        await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(2500)
        await pg.wait_for_timeout(600); bl = await pg.evaluate(BLOCKS)
        print('after import: folders', bl['folders'], '| blocks per folder', {f: sum(1 for x in bl['items'] if x[2] == f) for f in bl['folders']}, '| all blocks', len(bl['items']))
        print('ERRORS', errs[:5])
        await b.close()
asyncio.run(main())

# Cortex Scribe: the new name and red logo (sidebar, tab icon, title), the intro animation (plays once per session,
# skipped by a click, off for automated tests and with View → Intro animation), and the new sections: Home (recent pages,
# Inbox quick notes), Subjects & grades (subject page, grade chart, classmates), task projects (team, overall bar and
# one bar per person, ticking, assigning, filtering, adding tasks), study projects, the compact sidebar footer, and the
# phone layout of Home (quick actions, tab bar).
import os, pathlib
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio
from playwright.async_api import async_playwright

MOCK = r"""
(() => {
  const sample = async () => ({ text: 'Mitose', truncated: false });
  sample.json = async () => ({ text: 'Mitose' });
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 5e6, mediaTypes: ['image/png', 'image/jpeg'] } });
  window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
  localStorage.setItem('inkling:pref:previews', 'true');   // the coming sections are shown (they can be hidden for a demo)
})();
"""
NO_WEBDRIVER = "Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })"
OVERALL = "(document.querySelector('.sx-overall .lbl span') || {}).innerText"
VISIBLE = "(s) => { const e = document.querySelector(s); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }"

async def make_page(pg, nb, page):
    await pg.click('#newNotebook'); await pg.fill('.modal input.field', nb); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
    await (await pg.query_selector_all('.kind'))[1].click(); await pg.fill('.modal input.field', page); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(700)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs = []

        # 1. the intro: plays when the app opens, once per session, a click skips it
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800})
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(NO_WEBDRIVER); await pg.add_init_script(MOCK)
        await pg.goto(APP); await pg.wait_for_timeout(400)
        shown = await pg.evaluate("!!document.getElementById('intro')")
        parts = await pg.evaluate("[!!document.querySelector('#intro .intro-logo[src^=\"data:image\"]'), document.querySelector('#intro .intro-name').innerText.replace(/\\s+/g, ' ').trim(), document.querySelector('#intro .intro-tag').innerText.replace(/\\s+/g, ' ')]")
        await pg.wait_for_timeout(3300)
        gone = await pg.evaluate("!document.getElementById('intro')")
        await pg.reload(); await pg.wait_for_timeout(400)
        again = await pg.evaluate("!!document.getElementById('intro')")
        await ctx.close()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 800})
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(NO_WEBDRIVER); await pg.add_init_script(MOCK)
        await pg.goto(APP); await pg.wait_for_timeout(300)
        await pg.mouse.click(640, 400); await pg.wait_for_timeout(450)
        skipped = await pg.evaluate("!document.getElementById('intro')")
        await ctx.close()
        print('intro shown:', shown, parts, '| gone after 3.7 s:', gone, '| not again in the same session:', not again, '| a click skips it:', skipped)

        # 2. name and logo; no intro for automated tests
        pg = await b.new_page(viewport={'width': 1440, 'height': 900}); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(MOCK); await pg.goto(APP); await pg.wait_for_timeout(1000)
        brand = await pg.evaluate("[document.title, document.querySelector('#side .brand').innerText.replace(/\\s+/g, ' ').trim(), !!document.querySelector('#side .brand img.brand-logo[src^=\"data:image\"]'), (document.querySelector('link[rel=icon]') || {}).href.slice(0, 15)]")
        no_intro = await pg.evaluate("!document.getElementById('intro')")
        nav = await pg.evaluate("[...document.querySelectorAll('#secNav .secnav-item')].map(b => b.innerText.replace(/\\s+/g, ' ').trim())")
        foot = await pg.evaluate("[...document.querySelectorAll('#side .side-foot.compact .btn')].map(b => [b.id, b.innerText.trim(), b.title || ''])")
        welcome = await pg.evaluate(VISIBLE, '#empty') and not await pg.evaluate(VISIBLE, '#secView')
        print('title, brand, logo, icon:', brand, '| no intro for tests:', no_intro)
        print('sections:', nav, '| footer:', [f[1] for f in foot], '| full names as tooltips:', all(f[2] for f in foot[1:]), '| no notebooks: welcome stays:', welcome)

        # 3. Home: opens when no page is open, shows recent pages, quick notes go to the Inbox
        await make_page(pg, 'Bio', 'Mitose'); await pg.click('.flow'); await pg.keyboard.type('Die Zelle teilt sich.'); await pg.wait_for_timeout(500)
        row = pg.locator('#tree .t-row', has_text='Bio').first; await row.hover(); await row.locator('button[aria-label^="Add to"]').click(); await pg.click('.menu button:has-text("New page")'); await pg.wait_for_timeout(200)
        await (await pg.query_selector_all('.kind'))[2].click(); await pg.fill('.modal input.field', 'Brett'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(700)
        await pg.click('.secnav-item[data-sec="home"]'); await pg.wait_for_timeout(400)
        inside = await pg.evaluate("[...document.querySelectorAll('.sx-thumb')].map(t => { const a = t.getBoundingClientRect(), b = t.querySelector('.sx-pv').getBoundingClientRect(); return b.top >= a.top - 1 && b.bottom <= a.bottom + 1 && b.left >= a.left - 1 && b.right <= a.right + 1; })")
        print('page previews inside their cards (lined and board):', inside)
        st = await pg.evaluate("[document.getElementById('crumbs').innerText.trim(), document.getElementById('main').classList.contains('in-sec')]")
        hidden = [await pg.evaluate(VISIBLE, s) for s in ('#secView', '#work', '#ribbon', '#rail', '#panel')]
        recent = await pg.evaluate("[...document.querySelectorAll('.sx-thumb b')].map(b => b.innerText)")
        cards = await pg.evaluate("[...document.querySelectorAll('.sx-home .sx-card h3')].map(h => h.childNodes[1] ? h.childNodes[1].textContent.trim() : '')")
        await pg.fill('#sxCapture', 'Frau Meier wegen Laborbericht fragen'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        inbox = await pg.evaluate("[JSON.parse(localStorage.getItem('inkling:pref:inboxPreview') || '[]'), document.getElementById('sxInbox').innerText.trim()]")
        quick_hidden = not await pg.evaluate(VISIBLE, '.sx-quick') and not await pg.evaluate(VISIBLE, '.sx-tabbar')
        print('Home: crumbs, in-sec:', st, '| section shown, page/ribbon/rail/panel hidden:', hidden, '| cards:', cards)
        print('recent pages:', recent, '| Inbox saved and shown:', inbox[0], 'Laborbericht' in inbox[1], '| phone parts hidden on a computer:', quick_hidden)
        await pg.click('.sx-thumb:has-text("Mitose")'); await pg.wait_for_timeout(800)
        back = await pg.evaluate("[document.getElementById('secView').hidden, document.getElementById('crumbs').innerText.includes('Mitose'), (document.querySelector('.flow') || {}).innerText]")
        print('a recent page opens:', back)

        # 4. Subjects & grades
        await pg.click('.secnav-item[data-sec="subjects"]'); await pg.wait_for_timeout(300)
        subs = await pg.evaluate("[...document.querySelectorAll('.sx-sc .row b')].map(b => b.innerText)")
        mates = await pg.evaluate("[...document.querySelectorAll('.sx-mates .sx-mate b')].map(b => b.innerText)")
        await pg.click('.sx-sc[data-arg="bio"]'); await pg.wait_for_timeout(300)
        bio = await pg.evaluate("[document.querySelector('.sx-hello h1').innerText, document.querySelectorAll('.sx-chart circle').length, document.querySelectorAll('.sx-table tr').length - 1, document.querySelector('.sx-tabs [aria-selected=true]').innerText]")
        await pg.click('.sx-tabs button[data-arg="mates"]'); await pg.wait_for_timeout(200)
        race = await pg.evaluate("[...document.querySelectorAll('.sx-race .sx-mate')].map(m => m.innerText.replace(/\\s+/g, ' ').trim())")
        await pg.click('.sx-row .sx-btn:has-text("Add a classmate")'); await pg.wait_for_timeout(200)
        soon = await pg.inner_text('#toast')
        await pg.click('.sx-back'); await pg.wait_for_timeout(200)
        overview = await pg.evaluate("document.querySelector('.sx-hello h1').innerText")
        print('subjects:', subs, '| study group:', mates, '| Bio page: title, chart dots, grades, tab:', bio)
        print('who is ready:', race, '| not built yet says so:', 'preview' in soon, '| back:', overview)

        # 5. task project: team, overall bar and per-person bars, tick, assign, filter, add
        await pg.click('.secnav-item[data-sec="task"]'); await pg.wait_for_timeout(300)
        team = await pg.evaluate("[...document.querySelectorAll('.sx-team .sx-member')].map(m => m.innerText.split('\\n')[1])")
        o1 = await pg.evaluate(OVERALL); segs1 = await pg.evaluate("document.querySelectorAll('#sxOverall i').length")
        mine1 = await pg.evaluate("[...document.querySelectorAll('.sx-per .sx-mate')].map(m => m.innerText.replace(/\\s+/g, ' ').trim())")
        await pg.click('.sx-kcol[data-col="todo"] .sx-check >> nth=0'); await pg.wait_for_timeout(300)
        o2 = await pg.evaluate(OVERALL); feed = await pg.evaluate("document.querySelector('.sx-feed').innerText.replace(/\\s+/g, ' ')")
        await pg.click('.sx-kcol[data-col="todo"] .sx-assign >> nth=0'); await pg.wait_for_timeout(200)
        who = await pg.evaluate("[...document.querySelectorAll('.menu button')].map(b => b.innerText.trim())")
        await pg.click('.menu button:has-text("Mia")'); await pg.wait_for_timeout(300)
        first = await pg.evaluate("document.querySelector('.sx-kcol[data-col=\"todo\"] .sx-kc .sx-ava').title")
        await pg.click('.sx-filter button[data-arg="lena"]'); await pg.wait_for_timeout(200)
        lena = await pg.evaluate("[...document.querySelectorAll('.sx-kc .sx-assign .sx-ava')].map(a => a.title)")
        await pg.click('.sx-filter button[data-arg="all"]'); await pg.wait_for_timeout(200)
        await pg.click('.sx-top .sx-btn[data-act="addtask"]'); await pg.fill('.modal input.field', 'Handout drucken'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        o3 = await pg.evaluate(OVERALL); added = await pg.evaluate("[...document.querySelectorAll('.sx-kcol[data-col=\"todo\"] .sx-kc .r1 span')].map(s => s.innerText).includes('Handout drucken')")
        await pg.click('.sx-kcol[data-col="todo"] .sx-move >> nth=0'); await pg.wait_for_timeout(200)
        doing = await pg.evaluate("document.querySelectorAll('.sx-kcol[data-col=\"doing\"] .sx-kc').length")
        print('team:', team, '| overall:', o1, segs1, 'parts ->', o2, '->', o3, '| per person:', mine1)
        print('activity:', feed[:40], '| assign menu:', who, '| now:', first, '| filter Lena:', set(lena), '| added:', added, '| moved to Doing:', doing)

        # 6. study project and the other sections
        await pg.click('.secnav-item[data-sec="study"]'); await pg.wait_for_timeout(300)
        study = await pg.evaluate("[document.querySelector('.sx-pmain h1').innerText, document.querySelectorAll('.sx-day').length, [...document.querySelectorAll('.sx-pmain .sx-mate.small b')].map(b => b.innerText), document.querySelectorAll('.sx-conn > div').length]")
        await pg.click('.sx-pitem[data-arg="phys"]'); await pg.wait_for_timeout(200)
        phys = await pg.evaluate("document.querySelector('.sx-pmain h1').innerText")
        await pg.click('.secnav-item[data-sec="calendar"]'); await pg.wait_for_timeout(200)
        cal = await pg.evaluate("document.querySelectorAll('.sx-week .e').length")
        await pg.click('.secnav-item[data-sec="logbook"]'); await pg.wait_for_timeout(200)
        log = await pg.evaluate("document.querySelector('.sx-hello h1').innerText")
        await pg.click('.secnav-item[data-sec="notes"]'); await pg.wait_for_timeout(700)
        notes = await pg.evaluate("[document.getElementById('secView').hidden, document.getElementById('crumbs').innerText.includes('Mitose'), document.querySelector('.secnav-item[data-sec=notes]').getAttribute('aria-current')]")
        print('study project:', study, '| other one:', phys, '| calendar events:', cal, '| logbook:', log, '| Notebooks goes back to the page:', notes)

        # 7. the View switch for the intro, and the light theme
        await pg.click('.rtabs button:has-text("View")'); await pg.wait_for_timeout(200)
        sw = await pg.evaluate("[...document.querySelectorAll('#rbody label.rcheck')].map(l => l.innerText.trim()).includes('Intro animation')")
        await pg.evaluate("localStorage.setItem('inkling:pref:theme', '\"light\"')"); await pg.reload(); await pg.wait_for_timeout(1000)
        await pg.click('.secnav-item[data-sec="home"]'); await pg.wait_for_timeout(300)
        light = await pg.evaluate("[getComputedStyle(document.querySelector('.sx-card')).backgroundColor, getComputedStyle(document.querySelector('.sx-hello h1')).color]")
        print('View → Intro animation:', sw, '| light theme cards, text:', light)
        await pg.close()

        # 8. phone: Home with quick actions and the tab bar
        ctx = await b.new_context(**p.devices['iPhone 13'])
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(MOCK); await pg.goto(APP); await pg.wait_for_timeout(1000)
        await pg.click('#empty .btn.primary'); await pg.fill('.modal input.field', 'Bio'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await (await pg.query_selector_all('.kind'))[1].click(); await pg.fill('.modal input.field', 'Mitose'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(800)
        await pg.click('#openSide'); await pg.wait_for_timeout(300)
        await pg.click('.secnav-item[data-sec="home"]'); await pg.wait_for_timeout(400)
        drawer_closed = not await pg.evaluate("document.getElementById('app').classList.contains('side-open')")
        quick = await pg.evaluate("[...document.querySelectorAll('.sx-quick button')].map(b => b.innerText.trim())")
        bar = await pg.evaluate("(() => { const t = document.querySelector('.sx-tabbar'); const r = t.getBoundingClientRect(); return [getComputedStyle(t).display, Math.round(innerHeight - r.bottom), [...t.querySelectorAll('button')].map(b => b.innerText.trim())]; })()")
        rail = await pg.evaluate(VISIBLE, '#rail')
        wide = await pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('secView').scrollWidth <= document.getElementById('secView').clientWidth + 1")
        await pg.click('.sx-tabbar button[data-arg="task"]'); await pg.wait_for_timeout(300)
        task = await pg.evaluate("[document.getElementById('secView').dataset.sec, getComputedStyle(document.querySelector('.sx-kan')).gridTemplateColumns.split(' ').length]")
        await pg.click('#openSide'); await pg.wait_for_timeout(300); await pg.click('.secnav-item[data-sec="home"]'); await pg.wait_for_timeout(300)
        await pg.click('.sx-quick button[data-act="pad"]'); await pg.wait_for_timeout(300)
        pad = await pg.evaluate("!!document.querySelector('#padHubCode')")
        print('phone Home: drawer closes:', drawer_closed, '| quick actions:', quick, '| tab bar (display, gap to bottom, buttons):', bar, '| rail hidden:', not rail, '| no sideways scrolling:', wide)
        print('tab bar → tasks:', task, '| Be the pad opens the pad code:', pad)
        await ctx.close()

        await b.close()
        print('ERRORS', errs)

asyncio.run(main())

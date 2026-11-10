import os, pathlib, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
import asyncio, json
from playwright.async_api import async_playwright
MOCK = r"""
(() => {
  const answer = (input) => {
    const s = typeof input === 'string' ? input : input.map(m => m.content).join('\n');
    if (s.includes("standalone SVG")) return null;
    if (s.includes("fact checker")) return {summary:'Mostly right.', claims:[{quote:'Die Zelle ist die kleinste Einheit des Lebens', verdict:'correct', why:'Stimmt.', fix:'', source:'', evidence:''},{quote:'Mitochondrien sind Kraftwerke', verdict:'partly', why:'Ungenau.', fix:'Mitochondrien sind die Kraftwerke der Zelle', source:'', evidence:''}]};
    if (s.includes('chart data')) return {title:'Fruit', cats:['Apple','Banana'], series:[{name:'Share', vals:[18,82]}], unit:'%'};
    if (s.includes('mind map')) return {center:'Zelle', branches:[{label:'Teile', children:['Kern','Mitochondrien']},{label:'Funktion', children:['Energie']}]};
    if (s.includes('multiple-choice')) return {title:'Quiz', questions:[{question:'Q1?', options:['a','b','c','d'], answer:1, explain:'x'},{question:'Q2?', options:['a','b','c','d'], answer:0, explain:'y'}]};
    return {};
  };
  const sample = async (input, opts) => { await new Promise(r=>setTimeout(r,50)); const s = typeof input==='string'?input:''; if (s.includes('standalone SVG')) return { text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect x="20" y="20" width="360" height="260" rx="20" fill="#E5383B"/><circle cx="200" cy="150" r="70" fill="#fff" onclick="alert(1)"/><script>alert(2)</script></svg>', truncated:false }; return { text: '## Summary\n- one\n- **two**', truncated:false }; };
  sample.json = async (input, opts) => { await new Promise(r=>setTimeout(r,50)); return answer(input); };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 5e6, mediaTypes: ['image/png','image/jpeg'] } });
  window.claude = { use: async (n) => n === 'sample' ? sample : null };
})();
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width':1440,'height':900})
        errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        pg.on('console', lambda m: errs.append('CONSOLE '+m.type+': '+m.text) if m.type=='error' and 'ERR_NAME' not in m.text else None)
        await pg.add_init_script(MOCK)
        await pg.goto(APP); await pg.wait_for_timeout(1200)
        async def new_page(kind_idx, name, first=False):
            if first:
                await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Bio'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
            else:
                await pg.click('.t-row.top .t-acts button'); await pg.click('.menu button:has-text("New page")'); await pg.wait_for_timeout(200)
            await (await pg.query_selector_all('.kind'))[kind_idx].click()
            await pg.fill('.modal input.field', name); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(500)
        await new_page(1, 'Zellen', True)
        await pg.click('.flow'); await pg.keyboard.type('Die Zelle ist die kleinste Einheit des Lebens. 18% apple and the rest a banana.')
        await pg.keyboard.press('n')  # typing in flow, should type n not insert note
        await pg.click('.rtab:has-text("Insert")'); await pg.click('button[aria-label="Note box (N)"]'); await pg.keyboard.type('Mitochondrien sind Kraftwerke'); await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(200)
        # fact check
        await pg.click('.rtab:has-text("Fact check")'); await pg.click('button[aria-label="Check the whole note"]')
        await pg.wait_for_timeout(300)
        await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(800)
        print('acc chip:', await pg.inner_text('#accChip'), '| claims:', await pg.evaluate("document.querySelectorAll('.claim').length"))
        await pg.click('.claim .btn.primary:has-text("Apply fix")'); await pg.wait_for_timeout(200)
        print('note text after fix:', await pg.evaluate("document.querySelector('.obj-note .otext').textContent"))
        await pg.screenshot(path='t_fact.png')
        # magic diagram with AI
        await pg.click('.rtab:has-text("Magic box")'); await pg.click('.chip:has-text("Diagram")'); await pg.click('button.magic-go')
        bb = await (await pg.query_selector('.flow p')).bounding_box()
        await pg.mouse.move(bb['x']-4, bb['y']-4); await pg.mouse.down(); await pg.mouse.move(bb['x']+bb['width'], bb['y']+bb['height']+4, steps=4); await pg.mouse.up(); await pg.wait_for_timeout(500)
        await pg.click('.chip:has-text("Mind map")'); await pg.click('button.magic-go')
        await pg.mouse.move(bb['x']-4, bb['y']-4); await pg.mouse.down(); await pg.mouse.move(bb['x']+bb['width'], bb['y']+bb['height']+4, steps=4); await pg.mouse.up(); await pg.wait_for_timeout(500)
        print('charts', await pg.evaluate("document.querySelectorAll('.obj-chart').length"), 'mindmaps', await pg.evaluate("document.querySelectorAll('.obj-mm').length"))
        await pg.screenshot(path='t_endless.png')
        # learn quiz
        await pg.click('#rail button[data-ptab="learn"]'); await pg.click('[data-learn="quiz"]'); await pg.wait_for_timeout(500)
        for q in await pg.query_selector_all('.studio .q'):
            await (await q.query_selector_all('.ob'))[1].click()
        print('scoreboard:', (await pg.inner_text('#scoreboard')).replace('\n',' '))
        # A4 overflow
        await new_page(0, 'Lang')
        await pg.evaluate("""() => { const f = document.querySelector('.flow'); f.innerHTML = Array.from({length:70}, (_,i)=>'<p>Absatz '+(i+1)+' mit etwas Text, damit die Seite voll wird und weiterfliesst.</p>').join(''); f.dispatchEvent(new InputEvent('input', {bubbles:true})); }""")
        await pg.wait_for_timeout(300)
        print('a4 sheets:', await pg.evaluate("document.querySelectorAll('.sheet.a4').length"), 'last para on page:', await pg.evaluate("[...document.querySelectorAll('.sheet.a4')].map(s=>s.querySelector('.flow').children.length)"))
        await pg.screenshot(path='t_a4.png')
        # board
        await new_page(2, 'Board')
        await pg.mouse.dblclick(700, 400); await pg.keyboard.type('Idee A'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
        dots = await pg.query_selector_all('.hnd.c'); print('conn dots', len(dots))
        if dots: await dots[3].click(); await pg.keyboard.type('Idee B'); await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(150)
        await pg.mouse.click(300, 700)
        await pg.click('.rtab:has-text("Insert")'); await pg.click('button[aria-label="Mind map"]'); await pg.wait_for_timeout(200)
        root = await pg.query_selector('.mm-node.root'); await root.click(); await pg.wait_for_timeout(100)
        await pg.keyboard.press('Tab'); await pg.keyboard.type('Kind'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
        print('notes', await pg.evaluate("document.querySelectorAll('.obj-note').length"), 'conns', await pg.evaluate("document.querySelectorAll('.connsvg g').length"), 'mm nodes', await pg.evaluate("[...document.querySelectorAll('.mm-node')].map(n=>n.textContent)"))
        await pg.mouse.click(1000, 750)
        await pg.screenshot(path='t_board.png')
        await pg.wait_for_timeout(1200)
        keys = await pg.evaluate("Object.keys(localStorage).filter(k=>k.includes('data:')).map(k=>k.replace('inkling:data:','')+':'+localStorage[k].length)")
        print('saved:', keys)
        print('ERRORS:', json.dumps(errs, indent=1)[:3000])
        await b.close()
asyncio.run(main())

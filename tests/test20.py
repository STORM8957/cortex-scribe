# The AI connector (11c_ai.js) in the browser version: AI settings, OpenAI- and Anthropic-style servers,
# streaming chat, JSON jobs with repair, pictures, errors, a local server, and that every AI request in
# src/ names a task from AI_TASKS. The AI servers are stood in for with Playwright routes.
import os, pathlib, re, json, base64
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE)
APP = pathlib.Path(HERE).parent.joinpath('inkling.html').as_uri()
SRC = pathlib.Path(HERE).parent / 'src'
import asyncio
from playwright.async_api import async_playwright

CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
log = []           # every request the app sent: dict(method, url, headers, body)
state = {'fail': None, 'quiz_calls': 0}

def sse_openai(text, chunks=3):
    step = max(1, len(text) // chunks); out = ''
    for i in range(0, len(text), step):
        out += 'data: ' + json.dumps({'choices': [{'index': 0, 'delta': {'content': text[i:i + step]}}]}) + '\n\n'
    out += 'data: ' + json.dumps({'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}]}) + '\n\ndata: [DONE]\n\n'
    return out

def sse_anthropic(text):
    ev = lambda name, d: 'event: ' + name + '\ndata: ' + json.dumps(d) + '\n\n'
    out = ev('message_start', {'type': 'message_start', 'message': {'id': 'msg_1', 'role': 'assistant', 'content': []}})
    out += ev('content_block_start', {'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'thinking', 'thinking': ''}})
    out += ev('content_block_delta', {'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'thinking_delta', 'thinking': ''}})
    out += ev('content_block_start', {'type': 'content_block_start', 'index': 1, 'content_block': {'type': 'text', 'text': ''}})
    for part in [text[:len(text) // 2], text[len(text) // 2:]]:
        out += ev('content_block_delta', {'type': 'content_block_delta', 'index': 1, 'delta': {'type': 'text_delta', 'text': part}})
    out += ev('message_delta', {'type': 'message_delta', 'delta': {'stop_reason': 'end_turn'}})
    return out + ev('message_stop', {'type': 'message_stop'})

def answer_for(body):
    msgs = body.get('messages', [])
    system = body.get('system') if isinstance(body.get('system'), str) else next((m['content'] for m in msgs if m.get('role') == 'system'), '')
    def text_of(m):
        c = m.get('content')
        return c if isinstance(c, str) else ' '.join(x.get('text', '') for x in c if x.get('type') == 'text')
    allt = '\n'.join(text_of(m) for m in msgs if m.get('role') != 'system')
    has_img = any(isinstance(m.get('content'), list) and any(x.get('type') in ('image', 'image_url') for x in m['content']) for m in msgs)
    if 'Reply with just the word OK' in allt: return '<think>The student wants OK.</think>OK'
    if 'questions about their own notes' in system: return 'Die **Zelle** ist die kleinste Einheit des Lebens.'
    if 'multiple-choice' in allt:
        state['quiz_calls'] += 1
        if 'not valid JSON' not in allt: return 'Sure! Here is the quiz: {"title": "Quiz"}'
        return '```json\n{"title":"Zellen-Quiz","questions":[{"question":"Was ist die kleinste Einheit?","options":["Atom","Zelle","Organ","Gewebe"],"answer":1,"explain":"Die Zelle.",},],}\n```'
    if 'fact checker' in allt:
        return json.dumps({'summary': 'Stimmt.', 'claims': [{'quote': 'Die Zelle ist die kleinste Einheit des Lebens', 'verdict': 'correct', 'why': 'Ja.', 'fix': '', 'source': '', 'evidence': ''}]})
    if has_img: return 'Hallo'
    return 'ok'

async def handle(route):
    req = route.request
    if req.method == 'OPTIONS': return await route.fulfill(status=204, headers=CORS)
    body = None
    try: body = json.loads(req.post_data) if req.post_data else None
    except Exception: pass
    log.append({'method': req.method, 'url': req.url, 'headers': await req.all_headers(), 'body': body})
    url = req.url
    if state['fail'] == 401:
        return await route.fulfill(status=401, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps({'error': {'message': 'Incorrect API key provided', 'type': 'authentication_error'}}))
    if url.endswith('/models') or '/models?' in url:
        ids = (['claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5'] if 'anthropic' in url
               else ['gemma3:4b', 'llama3.2:3b'] if '11434' in url
               else ['gpt-4o', 'gpt-5', 'gpt-5-mini', 'whisper-1', 'text-embedding-3-small', 'tts-1'])
        return await route.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps({'data': [{'id': i} for i in ids]}))
    text = answer_for(body or {})
    sse = sse_anthropic(text) if 'anthropic' in url else sse_openai(text)
    await route.fulfill(status=200, headers={**CORS, 'content-type': 'text/event-stream'}, body=sse)

def static_task_check():
    """every AI.text / AI.json request in src/ names a task that exists in AI_TASKS"""
    tasks = set(re.findall(r"^  '([a-z0-9.]+)': \{", (SRC / '11d_ai_tasks.js').read_text(), re.M))
    kinds = re.findall(r"^  (\w+): \{\n    label:", (SRC / '25_chat_learn.js').read_text(), re.M)
    problems = []
    for f in sorted(SRC.glob('*.js')):
        if f.name.startswith('11'): continue
        lines = f.read_text().split('\n')
        for i, line in enumerate(lines):
            for m in re.finditer(r"AI\.(text|json)\(", line):
                if 'task' in line[m.start():]: continue
                var = re.search(r",\s*(\w+)\s*\)\s*;?\s*$", line[m.start():].split('//')[0]) or re.search(r",\s*(opts?)\)", line[m.start():])
                defined = var and any(re.search(r"\b" + var.group(1) + r"\b\s*=\s*\{[^}]*task:", l) for l in lines[max(0, i - 25):i])
                if not defined: problems.append(f.name + ':' + str(i + 1))
        for t in re.findall(r"task: '([a-z0-9.]+)'(?!\s*\+)", f.read_text()):   # 'learn.' + kind is checked below
            if t not in tasks: problems.append('unknown task ' + t + ' in ' + f.name)
    for k in kinds:
        if 'learn.' + k not in tasks: problems.append('no task learn.' + k)
    return len(tasks), problems

async def main():
    n_tasks, problems = static_task_check()
    print('tasks in AI_TASKS:', n_tasks, '| AI requests without a valid task:', problems)
    import subprocess
    doc = subprocess.run(['node', str(SRC.parent / 'scripts/ai-docs.mjs'), '--check'], capture_output=True, text=True)
    print('docs/AI.md:', (doc.stdout or doc.stderr).strip())
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route(re.compile(r'^https://api\.(openai|anthropic)\.com/.*|^http://localhost:11434/.*'), handle)
        await pg.goto(APP); await pg.wait_for_timeout(900)
        print('before:', await pg.inner_text('#aiBtn'), '| note in panel:', await pg.evaluate("(document.querySelector('[data-aioff]:not([hidden])')||{}).innerText"))

        # 1. connect ChatGPT: key → list loads by itself → a model is picked → Test → Save
        await pg.click('#aiBtn'); await pg.select_option('#aiProv', 'openai')
        await pg.fill('#aiKey', 'sk-test-123'); await pg.press('#aiKey', 'Tab'); await pg.wait_for_timeout(400)
        print('models offered:', await pg.evaluate("[...document.querySelectorAll('#aiModels option')].map(o=>o.value)"), '| picked:', await pg.input_value('#aiModel'))
        await pg.click('#aiTest'); await pg.wait_for_timeout(500)
        print('test:', re.sub(r'\d+\.\d s', 'N s', await pg.inner_text('#aiTestOut')))
        t = log[-1]
        print('request: auth', t['headers'].get('authorization'), '| model', t['body']['model'], '| stream', t['body']['stream'], '| system names Cortex Scribe:', 'Cortex Scribe' in t['body']['messages'][0]['content'])
        await pg.click('.modal .btn.primary:has-text("Save")'); await pg.wait_for_timeout(200)
        print('after save:', await pg.inner_text('#aiBtn'), '| panel note hidden:', await pg.evaluate("[...document.querySelectorAll('[data-aioff]')].every(p=>p.hidden)"))

        # 2. a page, then chat (streamed)
        await pg.click('#newNotebook'); await pg.fill('.modal input.field', 'Bio'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        await (await pg.query_selector_all('.kind'))[1].click(); await pg.fill('.modal input.field', 'Zellen'); await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(500)
        await pg.click('.flow'); await pg.keyboard.type('Die Zelle ist die kleinste Einheit des Lebens.')
        await pg.click('#rail button[data-ptab="chat"]'); await pg.fill('#chatIn', 'Was ist eine Zelle?'); await pg.click('#chatSend'); await pg.wait_for_timeout(700)
        c = log[-1]['body']
        print('chat answer:', await pg.evaluate("[...document.querySelectorAll('.msg.assistant')].pop().innerHTML"), '| notes sent:', 'kleinste Einheit' in json.dumps(c['messages']), '| turns:', [m['role'] for m in c['messages']])

        # 3. quiz: the first answer has the wrong shape → asked again → fenced JSON with trailing commas is read
        await pg.click('#rail button[data-ptab="learn"]'); await pg.click('[data-learn="quiz"]'); await pg.wait_for_timeout(900)
        q = [e['body'] for e in log if e['body'] and 'multiple-choice' in json.dumps(e['body'])]
        print('quiz requests:', len(q), '| JSON mode:', q[0].get('response_format'), '| second one asks again:', 'not valid JSON' in json.dumps(q[-1]['messages'][-1]),
              '| questions shown:', await pg.evaluate("document.querySelectorAll('.studio .q').length"))

        # 4. fact check without sources
        await pg.click('.rtab:has-text("Fact check")'); await pg.click('button[aria-label="Check the whole note"]'); await pg.wait_for_timeout(300)
        await pg.click('.modal .btn.primary'); await pg.wait_for_timeout(900)
        print('fact check:', await pg.inner_text('#accChip'), '| claims:', await pg.evaluate("document.querySelectorAll('.claim').length"))

        # 5. a wrong key: a clear message, no crash
        state['fail'] = 401
        await pg.click('#rail button[data-ptab="chat"]'); await pg.fill('#chatIn', 'Noch eine Frage'); await pg.click('#chatSend'); await pg.wait_for_timeout(600)
        print('wrong key:', await pg.evaluate("[...document.querySelectorAll('.msg.assistant')].pop().innerText"))
        state['fail'] = None

        # 6. Claude with an API key: Anthropic's format, pictures from the handwriting pad, quick jobs at low effort
        await pg.click('#aiBtn'); await pg.select_option('#aiProv', 'anthropic')
        print('Claude suggested model:', await pg.input_value('#aiModel'))
        await pg.fill('#aiKey', 'sk-ant-test'); await pg.press('#aiKey', 'Tab'); await pg.wait_for_timeout(400)
        await pg.click('#aiTest'); await pg.wait_for_timeout(500)
        a = log[-1]; h = a['headers']
        print('Claude test:', re.sub(r'\d+\.\d s', 'N s', await pg.inner_text('#aiTestOut')))
        print('Claude request:', a['url'].split('.com')[1], '| key header:', h.get('x-api-key'), '| version:', h.get('anthropic-version'), '| browser access:', h.get('anthropic-dangerous-direct-browser-access'),
              '| beta:', h.get('anthropic-beta'), '| fallbacks:', a['body'].get('fallbacks'), '| max_tokens:', a['body']['max_tokens'], '| system is text:', isinstance(a['body']['system'], str))
        await pg.click('.modal .btn.primary:has-text("Save")'); await pg.wait_for_timeout(200)
        print('button now:', await pg.inner_text('#aiBtn'))
        await pg.click('#rail button[data-ptab="pen"]'); await pg.click('.flow'); await pg.keyboard.press('End')
        pad = await (await pg.query_selector('#pad')).bounding_box()
        await pg.mouse.move(pad['x'] + 40, pad['y'] + 60); await pg.mouse.down(); await pg.mouse.move(pad['x'] + 160, pad['y'] + 90, steps=8); await pg.mouse.up()
        await pg.wait_for_timeout(2200)
        r = [e for e in log if e['body'] and 'anthropic' in e['url'] and any(isinstance(m['content'], list) for m in e['body']['messages'])]
        blk = r[-1]['body']['messages'][0]['content'] if r else []
        print('pad request: blocks', [x['type'] for x in blk], '| picture type', blk[0]['source']['media_type'] if blk else None, '| effort', r[-1]['body'].get('output_config') if r else None,
              '| typed:', 'Hallo' in await pg.evaluate("document.querySelector('.flow').innerText"))

        # 7. a model on this computer (Ollama): no key, the list comes from the local server, <think> is hidden
        await pg.click('#aiBtn'); await pg.select_option('#aiProv', 'ollama'); await pg.wait_for_timeout(500)
        print('Ollama: key field hidden:', await pg.evaluate("document.getElementById('aiKey').closest('.ai-row').hidden"), '| picked:', await pg.input_value('#aiModel'), '| note mentions OLLAMA_ORIGINS:', 'OLLAMA_ORIGINS' in await pg.inner_text('.ai-note'))
        await pg.click('#aiTest'); await pg.wait_for_timeout(500)
        print('Ollama test:', re.sub(r'\d+\.\d s', 'N s', await pg.inner_text('#aiTestOut')), '| no auth header:', 'authorization' not in log[-1]['headers'])
        await pg.click('.modal button:has-text("Cancel")')

        # 8. a model the app can't reach shows why
        await pg.click('#aiBtn'); await pg.select_option('#aiProv', 'lmstudio'); await pg.wait_for_timeout(1500)
        print('LM Studio not running:', await pg.inner_text('#aiListNote'))
        await pg.click('.modal button:has-text("Cancel")')
        # inside Claude nothing changes: Claude's own AI, nothing to set up
        cp = await b.new_page(viewport={'width': 1440, 'height': 900})
        await cp.add_init_script(open('mock3d.js').read()); await cp.goto(APP); await cp.wait_for_timeout(900)
        await cp.click('#aiBtn'); await cp.wait_for_timeout(200)
        print('inside Claude:', await cp.inner_text('#aiBtn'), '|', await cp.inner_text('.modal-body p'))
        await cp.close()
        print('key never in backups or Store:', await pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('inkling:data:') && localStorage[k].includes('sk-ant-test')).length == 0"))
        print('ERRORS', errs[:5])
        await b.close()
asyncio.run(main())

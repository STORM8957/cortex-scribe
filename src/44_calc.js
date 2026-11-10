/* ================= Calculators =================
   A scientific calculator in the side panel (Calculator tab): type or click, degrees or radians,
   a history of results, and “Put it on the page”. Insert → Calculator puts a small basic calculator
   on the page (object type 'calc') that you can drag around like a box.
   calcEval is a small parser of its own (no eval): + − × ÷ ^ ( ) ! %, sin cos tan and their
   inverses, sinh cosh tanh, ln log log2 √ ∛ abs exp round floor ceil, π e ans, 2π, 3(4+1), 1.5e3. */
const CALC_FN = {
  sin: (x, d) => Math.sin(d ? x * Math.PI / 180 : x), cos: (x, d) => Math.cos(d ? x * Math.PI / 180 : x), tan: (x, d) => (d && Math.abs((((x % 180) + 180) % 180) - 90) < 1e-9 ? NaN : Math.tan(d ? x * Math.PI / 180 : x)),
  asin: (x, d) => Math.asin(x) * (d ? 180 / Math.PI : 1), acos: (x, d) => Math.acos(x) * (d ? 180 / Math.PI : 1), atan: (x, d) => Math.atan(x) * (d ? 180 / Math.PI : 1),
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, ln: Math.log, log: Math.log10, log2: Math.log2, sqrt: Math.sqrt, cbrt: Math.cbrt,
  abs: Math.abs, exp: Math.exp, round: Math.round, floor: Math.floor, ceil: Math.ceil,
};
function fact(n) { if (n < 0 || !Number.isInteger(n)) throw new Error('n! needs a whole number 0 or more'); if (n > 170) return Infinity; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
function calcEval(src, deg, ans) {
  const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/∛/g, 'cbrt').replace(/,/g, '.').replace(/\s+/g, '').toLowerCase();
  let i = 0;
  const peek = () => s[i], fail = (m) => { throw new Error(m || 'Check the sum'); };
  const startsTerm = () => i < s.length && /[0-9.a-z(]/.test(s[i]);
  function expr() { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
  function term() {
    let v = unary();
    for (;;) {
      if (s[i] === '*' || s[i] === '/') { const o = s[i++]; const r = unary(); v = o === '*' ? v * r : v / r; }
      else if (startsTerm()) v *= unary();   // 2pi, 3(4+1), 2sin(30)
      else return v;
    }
  }
  function unary() { if (s[i] === '-') { i++; return -unary(); } if (s[i] === '+') { i++; return unary(); } return power(); }
  function power() { const b = postfix(); if (s[i] === '^') { i++; return Math.pow(b, unary()); } return b; }
  function postfix() { let v = atom(); for (;;) { if (s[i] === '!') { i++; v = fact(v); } else if (s[i] === '%') { i++; v = v / 100; } else return v; } }
  function atom() {
    const c = peek();
    if (c === '(') { i++; const v = expr(); if (s[i] === ')') i++; return v; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = /^[a-z]+\d?/.exec(s.slice(i));
    if (id) {
      const w = id[0];
      if (w === 'pi') { i += 2; return Math.PI; }
      if (w === 'e') { i += 1; return Math.E; }
      if (w === 'ans') { i += 3; return ans || 0; }
      const f = Object.keys(CALC_FN).sort((a, b) => b.length - a.length).find((k) => w.startsWith(k));
      if (f) { i += f.length; const a = s[i] === '(' ? atom() : postfix(); return CALC_FN[f](a, deg); }
      fail('Unknown word “' + w + '”');
    }
    fail(c ? 'Check “' + c + '”' : 'The sum isn’t finished');
  }
  if (!s) fail('Type a sum');
  const v = expr();
  if (i < s.length) fail('Check “' + s[i] + '”');
  return v;
}
function calcFmt(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 'Not a number';
  if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (Math.abs(v) < 1e-12) v = 0;
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e15 || a < 1e-7)) return v.toExponential(8).replace(/\.?0+e/, 'e');
  return String(parseFloat(v.toPrecision(12)));
}

/* ---------- the side panel: scientific ---------- */
const calcState = { expr: '', deg: prefs.get('calcDeg', true), ans: 0, hist: [] };
try { const hh = prefs.get('calcHist', []); if (Array.isArray(hh)) calcState.hist = hh.slice(0, 30); } catch {}
function renderCalcPanel() {
  const p = $('#ptab-calc'); if (!p) return;
  p.textContent = '';
  const inp = h('input', { class: 'field calc-in', id: 'calcIn', value: calcState.expr, placeholder: 'For example 2·sin(30) + √16', 'aria-label': 'Sum', autocomplete: 'off', spellcheck: 'false' });
  const out = h('div', { class: 'calc-out', id: 'calcOut', 'aria-live': 'polite' });
  const preview = () => { calcState.expr = inp.value; try { out.textContent = inp.value.trim() ? '= ' + calcFmt(calcEval(inp.value, calcState.deg, calcState.ans)) : ''; out.classList.remove('err'); } catch { out.textContent = ''; } };
  const equals = () => {
    let v; try { v = calcEval(inp.value, calcState.deg, calcState.ans); } catch (e) { out.textContent = e.message; out.classList.add('err'); return; }
    const r = calcFmt(v); calcState.ans = v;
    calcState.hist.unshift({ e: inp.value.trim(), r }); calcState.hist = calcState.hist.slice(0, 30); prefs.set('calcHist', calcState.hist);
    inp.value = r === 'Not a number' ? '' : r.replace('−', '-'); calcState.expr = inp.value; out.textContent = ''; renderHist();
  };
  const put = (t) => { const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a; inp.value = inp.value.slice(0, a) + t + inp.value.slice(b); inp.focus(); const c = a + t.length - (t.endsWith('()') ? 1 : 0); inp.setSelectionRange(c, c); preview(); };
  inp.addEventListener('input', preview);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); equals(); } else if (e.key === 'Escape') { inp.value = ''; preview(); } });
  const K = (label, act, cls, title) => nodown(h('button', { class: 'ckey' + (cls ? ' ' + cls : ''), title: title || label, 'aria-label': title || label, onclick: act }, label));
  const ins = (t, title) => K(t.replace(/\($/, ''), () => put(t), 'fn', title);
  const deg = h('button', { class: 'ckey mode', id: 'calcDeg', 'aria-pressed': String(calcState.deg), title: 'Angles in degrees or radians', onclick: () => { calcState.deg = !calcState.deg; prefs.set('calcDeg', calcState.deg); deg.textContent = calcState.deg ? 'DEG' : 'RAD'; deg.setAttribute('aria-pressed', String(calcState.deg)); preview(); } }, calcState.deg ? 'DEG' : 'RAD');
  const keys = h('div', { class: 'calc-keys sci' },
    deg, ins('sin(', 'Sine'), ins('cos(', 'Cosine'), ins('tan(', 'Tangent'), K('π', () => put('π'), 'fn', 'Pi'),
    K('x²', () => put('^2'), 'fn', 'Squared'), ins('asin(', 'Inverse sine (sin⁻¹)'), ins('acos(', 'Inverse cosine (cos⁻¹)'), ins('atan(', 'Inverse tangent (tan⁻¹)'), K('e', () => put('e'), 'fn', 'Euler’s number e'),
    K('xʸ', () => put('^'), 'fn', 'Power'), K('√', () => put('√('), 'fn', 'Square root'), K('∛', () => put('∛('), 'fn', 'Cube root'), ins('ln(', 'Natural logarithm'), ins('log(', 'Logarithm, base 10'),
    K('n!', () => put('!'), 'fn', 'Factorial'), K('(', () => put('('), 'fn'), K(')', () => put(')'), 'fn'), K('%', () => put('%'), 'fn', 'Percent'), K('1/x', () => { inp.value = '1/(' + (inp.value || '0') + ')'; preview(); }, 'fn', 'One divided by it'),
    K('7', () => put('7')), K('8', () => put('8')), K('9', () => put('9')), K('÷', () => put('÷'), 'op', 'Divide'), K('⌫', () => { const a = inp.selectionStart ?? inp.value.length; if (a > 0) { inp.value = inp.value.slice(0, a - 1) + inp.value.slice(a); inp.setSelectionRange(a - 1, a - 1); } preview(); }, 'op', 'Delete'),
    K('4', () => put('4')), K('5', () => put('5')), K('6', () => put('6')), K('×', () => put('×'), 'op', 'Times'), K('C', () => { inp.value = ''; preview(); }, 'op', 'Clear'),
    K('1', () => put('1')), K('2', () => put('2')), K('3', () => put('3')), K('−', () => put('−'), 'op', 'Minus'), K('ans', () => put('ans'), 'fn', 'The last result'),
    K('0', () => put('0')), K('.', () => put('.')), K('EXP', () => put('e'), 'fn', 'Times ten to the power (1.5e3 = 1500)'), K('+', () => put('+'), 'op', 'Plus'), K('=', equals, 'eq', 'Equals'));
  const histBox = h('div', { class: 'calc-hist', id: 'calcHist' });
  const renderHist = () => {
    histBox.textContent = '';
    if (!calcState.hist.length) { histBox.append(h('p', { class: 'hint' }, 'Your results show up here. Click one to use it again.')); return; }
    for (const it of calcState.hist) histBox.append(h('div', { class: 'calc-hrow' },
      h('button', { class: 'calc-hsum', title: 'Use the sum again', onclick: () => { inp.value = it.e; preview(); inp.focus(); } }, it.e), h('b', null, '= ' + it.r),
      h('button', { class: 'icon-btn', title: 'Put it on the page', 'aria-label': 'Put “' + it.e + ' = ' + it.r + '” on the page', onclick: () => calcToPage(it.e + ' = ' + it.r) }, svg('paste'))));
  };
  p.append(h('p', { class: 'hint' }, 'Type a sum or use the keys. Enter shows the result.'), inp, out, keys,
    h('div', { class: 'btnrow' }, h('button', { class: 'btn small', onclick: () => { const t = inp.value.trim(); if (!t) return; let r; try { r = calcFmt(calcEval(t, calcState.deg, calcState.ans)); } catch { return toast('Check the sum first.'); } calcToPage(t + ' = ' + r); } }, svg('paste'), 'Put it on the page'),
      h('button', { class: 'btn small', onclick: () => { if (!cur || cur.ro) return toast('Open a page you can edit first.'); insertCalc(); } }, svg('calc'), 'Small calculator on the page')),
    h('div', { class: 'sp-lab' }, 'History', h('button', { class: 'linkish', onclick: () => { calcState.hist = []; prefs.set('calcHist', []); renderHist(); } }, 'Clear')), histBox);
  renderHist(); preview();
}
function calcToPage(text) {
  if (!cur || !doc || cur.ro) return toast('Open a page you can edit first.');
  pasteTextBlock({ html: esc(text) });
  toast('Put “' + text + '” on the page.');
}

/* ---------- the small calculator on the page ---------- */
OBJ_ICON.calc = 'calc';
OBJ.calc = {
  label: 'Calculator', handles: 'all', conn: false, min: 150,
  create() {
    const disp = h('div', { class: 'cdisp', 'aria-live': 'polite' }, '0');
    const st = { cur: '0', acc: null, op: null, fresh: true };
    const show = () => { disp.textContent = st.cur.replace('-', '−'); };
    const digit = (d) => { if (st.fresh) { st.cur = d === '.' ? '0.' : d; st.fresh = false; } else if (!(d === '.' && st.cur.includes('.')) && st.cur.length < 14) st.cur = st.cur === '0' && d !== '.' ? d : st.cur + d; show(); };
    const run = (a, op, b) => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : op === '÷' ? a / b : b);
    const oper = (op) => { const v = parseFloat(st.cur); if (st.op && !st.fresh) { st.acc = run(st.acc, st.op, v); st.cur = calcFmt(st.acc).replace('−', '-'); } else st.acc = v; st.op = op; st.fresh = true; show(); };
    const eq = () => { if (st.op == null) return; const v = run(st.acc, st.op, parseFloat(st.cur)); st.cur = calcFmt(v).replace('−', '-'); st.acc = null; st.op = null; st.fresh = true; show(); };
    const B = (label, fn, cls) => { const b = h('button', { class: 'ck' + (cls ? ' ' + cls : ''), type: 'button', 'aria-label': label, onclick: (e) => { e.stopPropagation(); fn(); } }, label); b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('dblclick', (e) => e.stopPropagation()); return b; };
    const grid = h('div', { class: 'cgrid' },
      B('C', () => { st.cur = '0'; st.acc = null; st.op = null; st.fresh = true; show(); }, 'fn'), B('±', () => { st.cur = st.cur.startsWith('-') ? st.cur.slice(1) : st.cur === '0' ? '0' : '-' + st.cur; show(); }, 'fn'), B('%', () => { st.cur = calcFmt(parseFloat(st.cur) / 100).replace('−', '-'); show(); }, 'fn'), B('÷', () => oper('÷'), 'op'),
      B('7', () => digit('7')), B('8', () => digit('8')), B('9', () => digit('9')), B('×', () => oper('×'), 'op'),
      B('4', () => digit('4')), B('5', () => digit('5')), B('6', () => digit('6')), B('−', () => oper('−'), 'op'),
      B('1', () => digit('1')), B('2', () => digit('2')), B('3', () => digit('3')), B('+', () => oper('+'), 'op'),
      B('0', () => digit('0'), 'zero'), B('.', () => digit('.')), B('=', eq, 'eq'));
    return h('div', null, h('div', { class: 'chead', title: 'Drag here to move the calculator' }, svg('calc'), 'Calculator'), disp, grid);
  },
  update() {},
};
function insertCalc() {
  const o = insertObj({ t: 'calc', w: 230, h: 320 });
  if (o) toast('Calculator added. Drag its top bar to move it; drag a corner to make it bigger.');
}


/* ================= charts ================= */
const CHART_TYPES = [['column', 'Columns'], ['stacked', 'Stacked columns'], ['bar', 'Bars'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie'], ['donut', 'Doughnut'], ['radar', 'Radar']];
const PALETTES = {
  ink: ['#0F6B67', '#1C5BCB', '#D9480F', '#B7791F', '#6B4FD8', '#B83280', '#2F855A', '#5B6576'],
  ocean: ['#0B4F6C', '#01A7D9', '#20A04B', '#5FA8D3', '#1B998B', '#2E86AB', '#7FB7E6', '#3D5A80'],
  sunset: ['#E63946', '#F3722C', '#F8961E', '#E9B53E', '#90BE6D', '#43AA8B', '#577590', '#277DA1'],
  forest: ['#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#1B4332', '#B7E4C7', '#081C15'],
  pastel: ['#7FB2FF', '#FF8F8F', '#FFC285', '#8EE38A', '#A99CFF', '#E8E36A', '#6FE3F0', '#F7A1F2'],
  mono: ['#1E2740', '#3C4660', '#5B6576', '#7B8494', '#9AA3B2', '#BAC1CC', '#4F5A70', '#2F353E'],
};
const PALETTE_NAMES = { ink: 'Cortex', ocean: 'Ocean', sunset: 'Sunset', forest: 'Forest', pastel: 'Pastel', mono: 'Grey' };
const CHART_DEFAULT = { type: 'column', title: '', showTitle: true, legend: 'bottom', labels: 'none', palette: 'ink', xTitle: '', yTitle: '', grid: true, yMin: '', yMax: '', unit: '', prefix: '', dec: 0, smooth: false, hole: 55, sort: 'none', fs: 12, bg: 'none', start: -90, markers: true, colors: null };
function chartData(o) {
  const d = o.data || {};
  const cats = Array.isArray(d.cats) ? d.cats.map((c) => String(c == null ? '' : c)) : [];
  const series = (Array.isArray(d.series) ? d.series : []).map((s, i) => ({ name: String(s.name || 'Series ' + (i + 1)), vals: cats.map((_, j) => { const v = parseFloat(String((s.vals || [])[j] ?? '').replace(',', '.')); return isFinite(v) ? v : 0; }) }));
  return { cats, series };
}
function niceNum(x, round) {
  const e = Math.floor(Math.log10(Math.abs(x) || 1)), f = x / 10 ** e;
  let nf;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10; else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** e;
}
function niceScale(min, max, ticks) {
  if (min === max) { max = min + 1; if (min > 0) min = 0; }
  const range = niceNum(max - min, false), step = niceNum(range / (ticks - 1), true);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = []; for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v / step) * step);
  return { lo, hi, step, ticks: out };
}
function chartSVG(o) {
  const C = { ...CHART_DEFAULT, ...(o.chart || {}) };
  let { cats, series } = chartData(o);
  const W = Math.max(60, o.w || 420), H = Math.max(60, o.h || 280), fs = +C.fs || 12;
  const pal = (C.colors && C.colors.length ? C.colors : null) || PALETTES[C.palette] || PALETTES.ink;
  const col = (i) => pal[i % pal.length];
  const dec = clamp(+C.dec || 0, 0, 3);
  const fmt = (v) => (C.prefix || '') + Number(v).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (C.unit || '');
  const tw = (s, f) => String(s).length * (f || fs) * 0.56;
  const T = (x, y, s, a) => `<text x="${round1(x)}" y="${round1(y)}"${a || ''}>${esc(s)}</text>`;
  if (C.sort !== 'none' && series.length) {
    const idx = cats.map((_, i) => i).sort((a, b) => (C.sort === 'asc' ? 1 : -1) * (series[0].vals[a] - series[0].vals[b]));
    cats = idx.map((i) => cats[i]); series = series.map((s) => ({ ...s, vals: idx.map((i) => s.vals[i]) }));
  }
  let out = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(C.title || 'Chart')}" font-family="Atkinson Hyperlegible Next, system-ui, sans-serif" font-size="${fs}" fill="var(--ink)">`;
  if (!cats.length || !series.length) return out + T(W / 2, H / 2, 'Add some data to this chart', ' text-anchor="middle" fill="var(--muted)"') + '</svg>';
  let top = 8, bottom = H - 8, left = 8, right = W - 8;
  if (C.showTitle && C.title) { out += T(W / 2, top + fs * 1.25, C.title, ` text-anchor="middle" font-weight="700" font-size="${round1(fs * 1.3)}"`); top += fs * 2; }
  const isPie = C.type === 'pie' || C.type === 'donut';
  const items = isPie ? cats : series.map((s) => s.name);
  if (C.legend !== 'none' && (isPie || series.length > 1 || C.type === 'radar')) {
    const sw = fs * 0.85, gap = 14;
    if (C.legend === 'top' || C.legend === 'bottom') {
      const rows = []; let row = [], rw = 0;
      items.forEach((t, i) => { const w = sw + 6 + tw(t) + gap; if (rw + w > right - left && row.length) { rows.push(row); row = []; rw = 0; } row.push({ t, i, w }); rw += w; });
      if (row.length) rows.push(row);
      const lh = fs * 1.5, total = rows.length * lh;
      let y = C.legend === 'top' ? top + fs * 0.4 : bottom - total + fs * 0.4;
      for (const r of rows) {
        const rwid = r.reduce((a, c) => a + c.w, 0) - gap; let x = (W - rwid) / 2;
        for (const it of r) { out += `<rect x="${round1(x)}" y="${round1(y)}" width="${sw}" height="${sw}" rx="2" fill="${col(it.i)}"/>` + T(x + sw + 6, y + sw * 0.9, it.t, ' fill="var(--muted)"'); x += it.w; }
        y += lh;
      }
      if (C.legend === 'top') top += total + fs * 0.4; else bottom -= total + fs * 0.4;
    } else {
      const lw = Math.min((right - left) * 0.38, Math.max(...items.map((t) => tw(t))) + sw + 14);
      const x = C.legend === 'right' ? right - lw : left;
      let y = (top + bottom) / 2 - items.length * fs * 1.5 / 2;
      items.forEach((t, i) => { out += `<rect x="${round1(x)}" y="${round1(y)}" width="${sw}" height="${sw}" rx="2" fill="${col(i)}"/>` + T(x + sw + 6, y + sw * 0.9, t.length > 22 ? t.slice(0, 21) + '…' : t, ' fill="var(--muted)"'); y += fs * 1.5; });
      if (C.legend === 'right') right -= lw + 10; else left += lw + 10;
    }
  }
  if (isPie) {
    const vals = series[0].vals.map((v) => Math.max(0, v)), sum = vals.reduce((a, c) => a + c, 0) || 1;
    const cx = (left + right) / 2, cy = (top + bottom) / 2, r = Math.max(10, Math.min(right - left, bottom - top) / 2 - 4);
    const ri = C.type === 'donut' ? r * clamp(+C.hole || 55, 10, 90) / 100 : 0;
    let a = (+C.start || -90) * Math.PI / 180;
    vals.forEach((v, i) => {
      const da = v / sum * Math.PI * 2; if (da <= 0) return;
      const a2 = a + da, large = da > Math.PI ? 1 : 0;
      const p = (ang, rr) => round1(cx + Math.cos(ang) * rr) + ' ' + round1(cy + Math.sin(ang) * rr);
      let d;
      if (da >= Math.PI * 2 - 1e-6) d = ri ? `M${p(0, r)}A${r} ${r} 0 1 1 ${p(Math.PI, r)}A${r} ${r} 0 1 1 ${p(0, r)}M${p(0, ri)}A${ri} ${ri} 0 1 0 ${p(Math.PI, ri)}A${ri} ${ri} 0 1 0 ${p(0, ri)}Z` : `M${p(0, r)}A${r} ${r} 0 1 1 ${p(Math.PI, r)}A${r} ${r} 0 1 1 ${p(0, r)}Z`;
      else d = ri ? `M${p(a, r)}A${r} ${r} 0 ${large} 1 ${p(a2, r)}L${p(a2, ri)}A${ri} ${ri} 0 ${large} 0 ${p(a, ri)}Z` : `M${cx} ${cy}L${p(a, r)}A${r} ${r} 0 ${large} 1 ${p(a2, r)}Z`;
      out += `<path d="${d}" fill="${col(i)}" stroke="var(--sheet)" stroke-width="1.5"/>`;
      if (C.labels !== 'none') {
        const mid = a + da / 2, lr = ri ? (r + ri) / 2 : r * 0.64;
        const pct = Math.round(v / sum * 1000) / 10;
        const txt = C.labels === 'percent' ? pct + '%' : C.labels === 'category' ? cats[i] : C.labels === 'both' ? cats[i] + ' ' + pct + '%' : fmt(v);
        const lx = cx + Math.cos(mid) * lr, ly = cy + Math.sin(mid) * lr;
        out += `<text x="${round1(lx)}" y="${round1(ly + fs * 0.35)}" text-anchor="middle" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width="2.5" paint-order="stroke">${esc(txt)}</text>`;
      }
      a = a2;
    });
    if (ri && C.title && !C.showTitle) out += T(cx, cy + fs * 0.4, C.title, ' text-anchor="middle" font-weight="700"');
    return out + '</svg>';
  }
  if (C.type === 'radar') {
    const n = cats.length, cx = (left + right) / 2, cy = (top + bottom) / 2 + fs * 0.3, r = Math.max(10, Math.min(right - left, bottom - top) / 2 - fs * 2.2);
    const all = series.flatMap((s) => s.vals);
    const sc = niceScale(C.yMin !== '' ? +C.yMin : Math.min(0, ...all), C.yMax !== '' ? +C.yMax : Math.max(...all), 5);
    const rad = (v) => (v - sc.lo) / (sc.hi - sc.lo || 1) * r;
    const pt = (i, v) => { const a = -Math.PI / 2 + i / n * Math.PI * 2; return [round1(cx + Math.cos(a) * rad(v)), round1(cy + Math.sin(a) * rad(v))]; };
    for (const t of sc.ticks) out += `<polygon points="${cats.map((_, i) => pt(i, t).join(',')).join(' ')}" fill="none" stroke="var(--line)"/>`;
    cats.forEach((c, i) => { const [x, y] = pt(i, sc.hi); out += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)"/>`; const [lx, ly] = pt(i, sc.hi + (sc.hi - sc.lo) * 0.13); out += T(lx, ly + fs * 0.35, c, ' text-anchor="middle" fill="var(--muted)"'); });
    series.forEach((s, si) => { out += `<polygon points="${s.vals.map((v, i) => pt(i, v).join(',')).join(' ')}" fill="${col(si)}" fill-opacity=".2" stroke="${col(si)}" stroke-width="2"/>`; if (C.markers) s.vals.forEach((v, i) => { const [x, y] = pt(i, v); out += `<circle cx="${x}" cy="${y}" r="3" fill="${col(si)}"/>`; }); });
    return out + '</svg>';
  }
  const horiz = C.type === 'bar', stacked = C.type === 'stacked';
  let dmin = Infinity, dmax = -Infinity;
  if (stacked) cats.forEach((_, j) => { let pos = 0, neg = 0; for (const s of series) { if (s.vals[j] >= 0) pos += s.vals[j]; else neg += s.vals[j]; } dmax = Math.max(dmax, pos); dmin = Math.min(dmin, neg); });
  else for (const s of series) for (const v of s.vals) { dmin = Math.min(dmin, v); dmax = Math.max(dmax, v); }
  const sc = niceScale(C.yMin !== '' && isFinite(+C.yMin) ? +C.yMin : Math.min(0, dmin), C.yMax !== '' && isFinite(+C.yMax) ? +C.yMax : dmax, Math.max(3, Math.min(7, Math.round((horiz ? right - left : bottom - top) / (fs * 4)))));
  const valLabels = sc.ticks.map(fmt);
  if (C.yTitle) { if (horiz) bottom -= fs * 1.6; else left += fs * 1.6; }
  if (C.xTitle) { if (horiz) left += fs * 1.6; else bottom -= fs * 1.6; }
  const catLabW = Math.min((right - left) * 0.32, Math.max(...cats.map((c) => tw(c))) + 8);
  if (horiz) { left += catLabW; bottom -= fs * 1.6; }
  else {
    left += Math.max(...valLabels.map((l) => tw(l))) + 8;
    const band = (right - left) / cats.length;
    const rot = cats.some((c) => tw(c) > band - 4);
    C._xl = rot ? Math.min(fs * 6, Math.max(...cats.map((c) => tw(c))) * 0.6 + fs) : fs * 1.7;
    bottom -= C._xl;
    C._rot = rot;
  }
  const pw = right - left, ph = bottom - top;
  if (pw < 20 || ph < 20) return out + '</svg>';
  const V = (v) => horiz ? left + (v - sc.lo) / (sc.hi - sc.lo || 1) * pw : bottom - (v - sc.lo) / (sc.hi - sc.lo || 1) * ph;
  for (let i = 0; i < sc.ticks.length; i++) {
    const t = sc.ticks[i], p = round1(V(t));
    if (C.grid || t === 0) out += horiz ? `<line x1="${p}" y1="${top}" x2="${p}" y2="${bottom}" stroke="${t === 0 ? 'var(--muted)' : 'var(--line)'}"/>` : `<line x1="${left}" y1="${p}" x2="${right}" y2="${p}" stroke="${t === 0 ? 'var(--muted)' : 'var(--line)'}"/>`;
    out += horiz ? T(p, bottom + fs * 1.25, valLabels[i], ' text-anchor="middle" fill="var(--muted)"') : T(left - 6, p + fs * 0.35, valLabels[i], ' text-anchor="end" fill="var(--muted)"');
  }
  const band = (horiz ? ph : pw) / cats.length;
  cats.forEach((c, j) => {
    const m = (horiz ? top : left) + band * (j + 0.5);
    if (horiz) out += T(left - 6, m + fs * 0.35, tw(c) > catLabW ? c.slice(0, Math.max(3, Math.floor(catLabW / (fs * 0.56)) - 1)) + '…' : c, ' text-anchor="end" fill="var(--muted)"');
    else if (C._rot) out += `<text transform="translate(${round1(m)} ${round1(bottom + fs * 0.9)}) rotate(-35)" text-anchor="end" fill="var(--muted)">${esc(c)}</text>`;
    else out += T(m, bottom + fs * 1.3, c, ' text-anchor="middle" fill="var(--muted)"');
  });
  if (C.xTitle) out += horiz ? `<text transform="translate(${round1(left - catLabW - fs * 0.8)} ${round1((top + bottom) / 2)}) rotate(-90)" text-anchor="middle" font-weight="700">${esc(C.xTitle)}</text>` : T((left + right) / 2, bottom + C._xl + fs * 1.2, C.xTitle, ' text-anchor="middle" font-weight="700"');
  if (C.yTitle) out += horiz ? T((left + right) / 2, bottom + fs * 2.9, C.yTitle, ' text-anchor="middle" font-weight="700"') : `<text transform="translate(${round1(left - Math.max(...valLabels.map((l) => tw(l))) - 8 - fs * 0.6)} ${round1((top + bottom) / 2)}) rotate(-90)" text-anchor="middle" font-weight="700">${esc(C.yTitle)}</text>`;
  const zero = V(clamp(0, sc.lo, sc.hi));
  const catTot = cats.map((_, j) => series.reduce((a, s) => a + Math.abs(s.vals[j]), 0) || 1);
  const lab = (v, j) => C.labels === 'percent' ? Math.round(Math.abs(v) / catTot[j] * 1000) / 10 + '%' : C.labels === 'category' ? cats[j] : fmt(v);
  if (C.type === 'column' || C.type === 'bar' || stacked) {
    const n = stacked ? 1 : series.length, bw = band * 0.72 / n;
    const acc = cats.map(() => ({ pos: 0, neg: 0 }));
    series.forEach((s, si) => s.vals.forEach((v, j) => {
      let a0, a1;
      if (stacked) { const st = acc[j]; if (v >= 0) { a0 = st.pos; st.pos += v; a1 = st.pos; } else { a0 = st.neg; st.neg += v; a1 = st.neg; } }
      else { a0 = 0; a1 = v; }
      const p0 = V(clamp(a0, sc.lo, sc.hi)), p1 = V(clamp(a1, sc.lo, sc.hi));
      const off = (horiz ? top : left) + band * j + band * 0.14 + (stacked ? 0 : si * bw);
      if (horiz) out += `<rect x="${round1(Math.min(p0, p1))}" y="${round1(off)}" width="${round1(Math.abs(p1 - p0))}" height="${round1(bw)}" fill="${col(si)}" rx="2"/>`;
      else out += `<rect x="${round1(off)}" y="${round1(Math.min(p0, p1))}" width="${round1(bw)}" height="${round1(Math.abs(p1 - p0))}" fill="${col(si)}" rx="2"/>`;
      if (C.labels !== 'none' && v !== 0) {
        if (stacked) out += horiz ? T((p0 + p1) / 2, off + bw / 2 + fs * 0.35, lab(v, j), ' text-anchor="middle" fill="#fff" font-weight="700"') : T(off + bw / 2, (p0 + p1) / 2 + fs * 0.35, lab(v, j), ' text-anchor="middle" fill="#fff" font-weight="700"');
        else out += horiz ? T(p1 + (v >= 0 ? 4 : -4), off + bw / 2 + fs * 0.35, lab(v, j), v >= 0 ? '' : ' text-anchor="end"') : T(off + bw / 2, p1 + (v >= 0 ? -4 : fs + 2), lab(v, j), ' text-anchor="middle" font-weight="700"');
      }
    }));
  } else {
    series.forEach((s, si) => {
      const pts = s.vals.map((v, j) => [round1(left + band * (j + 0.5)), round1(V(clamp(v, sc.lo, sc.hi)))]);
      let d = 'M' + pts[0].join(' ');
      if (C.smooth && pts.length > 2) {
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
          d += `C${round1(p1[0] + (p2[0] - p0[0]) / 6)} ${round1(p1[1] + (p2[1] - p0[1]) / 6)} ${round1(p2[0] - (p3[0] - p1[0]) / 6)} ${round1(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]} ${p2[1]}`;
        }
      } else for (let i = 1; i < pts.length; i++) d += 'L' + pts[i].join(' ');
      if (C.type === 'area') out += `<path d="${d}L${pts[pts.length - 1][0]} ${round1(zero)}L${pts[0][0]} ${round1(zero)}Z" fill="${col(si)}" fill-opacity=".22"/>`;
      out += `<path d="${d}" fill="none" stroke="${col(si)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (C.markers) for (const p of pts) out += `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--sheet)" stroke="${col(si)}" stroke-width="2"/>`;
      if (C.labels !== 'none') s.vals.forEach((v, j) => { out += T(pts[j][0], pts[j][1] - 8, lab(v, j), ' text-anchor="middle" font-weight="700"'); });
    });
  }
  return out + '</svg>';
}
function newChartSpec(data, opts) {
  return { t: 'chart', w: 440, h: 300, chart: { ...CHART_DEFAULT, ...(opts || {}) }, data: data || { cats: ['A', 'B', 'C', 'D'], series: [{ name: 'Series 1', vals: [4, 7, 3, 6] }] } };
}

/* chart editor (inside the Format panel) */
function chartEditor(o) {
  const C = { ...CHART_DEFAULT, ...(o.chart || {}) };
  const wrap = h('div');
  const upd = (k, v) => { pushUndo(); o.chart = { ...CHART_DEFAULT, ...(o.chart || {}), [k]: v }; changed(o); view.renderAll(); saveDoc('main'); };
  const row = (label, ctl) => h('div', { class: 'frow' }, h('label', null, label), ctl);
  const select = (k, opts) => { const s = h('select', { 'aria-label': k }); for (const [v, l] of opts) s.append(h('option', { value: v, selected: String(C[k]) === String(v) ? true : null }, l)); s.addEventListener('change', () => upd(k, s.value)); return s; };
  const text = (k, ph) => { const i = h('input', { type: 'text', value: C[k] == null ? '' : String(C[k]), placeholder: ph || '' }); i.addEventListener('change', () => upd(k, i.value)); return i; };
  const num = (k, min, max, step) => { const i = h('input', { type: 'number', value: C[k], min, max, step: step || 1 }); i.addEventListener('change', () => upd(k, i.value === '' ? '' : +i.value)); return i; };
  const check = (k, label) => { const c = h('input', { type: 'checkbox', checked: C[k] ? true : null }); c.addEventListener('change', () => upd(k, c.checked)); return h('label', { class: 'opt' }, c, label); };
  const types = h('div', { class: 'btnrow' }, CHART_TYPES.map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': String(C.type === k), onclick: () => upd('type', k) }, l)));
  wrap.append(h('h3', null, 'Chart type'), types);
  wrap.append(h('h3', null, 'Data'), dataGrid(o));
  wrap.append(h('h3', null, 'Titles and labels'),
    row('Title', text('title', 'Chart title')), check('showTitle', 'Show the title'),
    row('Data labels', select('labels', [['none', 'None'], ['value', 'Values'], ['percent', 'Percent'], ['category', 'Category names'], ['both', 'Name and percent (pie)']])),
    row('Legend', select('legend', [['none', 'No legend'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']])),
    row('Axis (x)', text('xTitle', 'Horizontal axis title')), row('Axis (y)', text('yTitle', 'Vertical axis title')));
  wrap.append(h('h3', null, 'Numbers'),
    row('Before', text('prefix', 'e.g. CHF ')), row('After', text('unit', 'e.g. % or kg')), row('Decimals', num('dec', 0, 3)),
    row('Axis min', num('yMin', -1e9, 1e9, 'any')), row('Axis max', num('yMax', -1e9, 1e9, 'any')),
    row('Sort', select('sort', [['none', 'As entered'], ['desc', 'Largest first'], ['asc', 'Smallest first']])));
  wrap.append(h('h3', null, 'Look'),
    row('Colours', select('palette', Object.entries(PALETTE_NAMES))), row('Text size', num('fs', 8, 28)),
    row('Background', select('bg', [['none', 'See-through'], ['sheet', 'Card']])),
    check('grid', 'Gridlines'), check('smooth', 'Smooth lines'), check('markers', 'Point markers'),
    row('Doughnut hole', num('hole', 10, 90)), row('Pie start (°)', num('start', -360, 360)));
  return wrap;
}
function dataGrid(o) {
  const box = h('div');
  const draw = () => {
    box.textContent = '';
    const d = chartData(o);
    const apply = (fn) => { pushUndo(); const dd = { cats: d.cats.slice(), series: d.series.map((s) => ({ name: s.name, vals: s.vals.slice() })) }; fn(dd); o.data = dd; changed(o); view.renderAll(); saveDoc('main'); draw(); };
    const t = h('table');
    const hr = h('tr', null, h('th', { class: 'corner' }, 'Category'));
    d.series.forEach((s, si) => {
      const inp = h('input', { value: s.name, 'aria-label': 'Series name ' + (si + 1) });
      inp.addEventListener('change', () => apply((dd) => { dd.series[si].name = inp.value; }));
      hr.append(h('th', null, inp));
    });
    t.append(hr);
    d.cats.forEach((c, j) => {
      const tr = h('tr');
      const ci = h('input', { value: c, 'aria-label': 'Category ' + (j + 1) });
      ci.addEventListener('change', () => apply((dd) => { dd.cats[j] = ci.value; }));
      tr.append(h('td', null, ci));
      d.series.forEach((s, si) => {
        const vi = h('input', { value: s.vals[j], inputmode: 'decimal', 'aria-label': s.name + ', ' + c });
        vi.addEventListener('change', () => apply((dd) => { const v = parseFloat(vi.value.replace(',', '.')); dd.series[si].vals[j] = isFinite(v) ? v : 0; }));
        tr.append(h('td', null, vi));
      });
      t.append(tr);
    });
    box.append(h('div', { class: 'grid-edit' }, t),
      h('div', { class: 'btnrow' },
        h('button', { class: 'btn small', onclick: () => apply((dd) => { dd.cats.push('New'); dd.series.forEach((s) => s.vals.push(0)); }) }, svg('plus'), 'Row'),
        h('button', { class: 'btn small', onclick: () => apply((dd) => { if (dd.cats.length > 1) { dd.cats.pop(); dd.series.forEach((s) => s.vals.pop()); } }) }, svg('minus'), 'Row'),
        h('button', { class: 'btn small', onclick: () => apply((dd) => { dd.series.push({ name: 'Series ' + (dd.series.length + 1), vals: dd.cats.map(() => 0) }); }) }, svg('plus'), 'Series'),
        h('button', { class: 'btn small', onclick: () => apply((dd) => { if (dd.series.length > 1) dd.series.pop(); }) }, svg('minus'), 'Series')));
  };
  draw();
  return box;
}

/* ================= Word link: the shared core (no DOM) =================
   The same file runs in three places: the app (49_wordlink.js uses it), the bridge on the computer
   (scripts/word-bridge.mjs loads it) and the Word add-in (word-addin/taskpane.js gets it from the bridge).
   A document is a list of items { k, t, lock?, a?, r? }: k = 'p' | 'h1' | 'h2' | 'h3' | 'li' (bullet) | 'ol' (numbered),
   t = the text, lock = 'picture' | 'other' for things only Word can change (a box on the page that is never edited or
   deleted from Cortex Scribe; 'table' in pages linked before tables came across), a = the alignment ('c' centred,
   'r' right, 'j' justified; missing = left), r = the formatting as runs over the words of t: [[number of words, fmt], …]
   with fmt = 'b;i;u;s;c=#rrggbb;h=#rrggbb' (bold, italic, underline, struck through, text colour, highlight; missing =
   plain). A word is what words() gives: the spaces after it belong to it, and its formatting is that of its first letter.
   A table is one item { k: 'table', rows: [[cell text, …], …], sh?: [[cell colour, …], …] }: its cells can be typed into
   on both sides, but tables are only added or removed in Word. Then, around the text: { k: 'setup', ps: { w, h, o, m,
   hd, fd } } = Word's page (width, height in points, o = 'p' | 'l', margins [top, right, bottom, left], header and
   footer distance) first, the header's paragraphs { k: 'hd', t, a?, r? } before the text and the footer's { k: 'ft' }
   after it ({PAGE} and {NUMPAGES} in their text are the page number and the number of pages; empty ones are left out).
   merge3 merges changes from both sides by item (and by cell when both changed the same table);
   when both changed the same paragraph or cell, the side that is typing wins. makeClient is one side of a link: it pushes its changes to the bridge,
   which keeps the master copy, and takes in the other side's changes without losing its own. */
const WordSync = (() => {
  const KINDS = ['p', 'h1', 'h2', 'h3', 'li', 'ol', 'table', 'setup', 'hd', 'ft'], LOCKS = ['picture', 'table', 'other'];
  const clean = (t) => String(t == null ? '' : t).replace(/\u00a0/g, ' ').replace(/[\r\n\u000b\f\u2028\u2029]+/g, ' ').replace(/[\u0000-\u0008\u000e-\u001f\u007f\u200b]/g, '');
  /* formatting */
  const words = (t) => String(t || '').match(/^\s+|\S+\s*/g) || [];
  const FMT_ORDER = ['b', 'i', 'u', 's', 'c', 'h'];
  function fmt(f) {      // a clean, sorted fmt string ('' = plain)
    const out = {};
    for (const x of String(f || '').split(';')) {
      const m = /^(b|i|u|s)$/.exec(x) || /^(c|h)=(#[0-9a-fA-F]{6})$/.exec(x);
      if (m) out[m[1]] = m[2] ? m[1] + '=' + m[2].toLowerCase() : m[1];
    }
    return FMT_ORDER.filter((k) => out[k]).map((k) => out[k]).join(';');
  }
  const fmtGet = (f, k) => { for (const x of String(f || '').split(';')) if (x === k || x.startsWith(k + '=')) return x.length > 1 ? x.slice(2) : true; return null; };
  /* runs → one fmt per word, and back */
  function perWord(r, n) {
    const out = [];
    if (Array.isArray(r)) for (const x of r) { const c = Math.max(0, Math.min(5000, Math.floor(+(x && x[0]) || 0))), f = fmt(x && x[1]); for (let i = 0; i < c && out.length < n; i++) out.push(f); }
    while (out.length < n) out.push('');
    return out;
  }
  function runsOf(list) {      // one fmt per word → runs (undefined when all plain)
    const r = [];
    for (const f of list) { const l = r[r.length - 1]; if (l && l[1] === f) l[0]++; else r.push([1, f]); }
    while (r.length && !r[r.length - 1][1]) r.pop();      // plain words at the end need no run
    return r.length ? r : undefined;
  }
  function normRuns(r, t) {
    if (!Array.isArray(r) || !r.length) return undefined;
    const w = words(t);
    return runsOf(perWord(r, w.length).map((f, i) => (/\S/.test(w[i]) ? f : '')));   // words that are only spaces have no formatting
  }
  const COLOR = /^#[0-9a-f]{6}$/;
  const RANK = { setup: 0, hd: 1, ft: 3 };
  function norm(list) {
    const out = [];
    for (const p of (Array.isArray(list) ? list : []).slice(0, 5000)) {
      const o = { k: KINDS.includes(p && p.k) ? p.k : 'p', t: clean(p && p.t).slice(0, 20000) };
      if (o.k === 'setup') {
        const ps = p.ps || {}, n = (v, lo, hi) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10) / 10 : null);
        const m = Array.isArray(ps.m) && ps.m.length === 4 ? ps.m.map((v) => n(v, 0, 1000)) : null;
        if (!n(ps.w, 50, 3000) || !n(ps.h, 50, 3000)) continue;
        o.t = ''; o.ps = { w: n(ps.w, 50, 3000), h: n(ps.h, 50, 3000), o: ps.o === 'l' ? 'l' : 'p' };
        if (m && m.every((v) => v != null)) o.ps.m = m;
        if (n(ps.hd, 0, 500) != null) o.ps.hd = n(ps.hd, 0, 500);
        if (n(ps.fd, 0, 500) != null) o.ps.fd = n(ps.fd, 0, 500);
        if (out.some((x) => x.k === 'setup')) continue;    // only one
      } else if (o.k === 'table') {
        o.t = ''; o.rows = (Array.isArray(p.rows) ? p.rows : []).slice(0, 300).map((r) => (Array.isArray(r) ? r : []).slice(0, 40).map((c) => clean(c).slice(0, 4000)));
        if (Array.isArray(p.sh)) {
          const sh = o.rows.map((r, i) => r.map((_, j) => { const c = String((p.sh[i] || [])[j] || '').toLowerCase(); return COLOR.test(c) && c !== '#ffffff' ? c : ''; }));
          if (sh.some((r) => r.some(Boolean))) o.sh = sh;
        }
      } else {
        if ((o.k === 'hd' || o.k === 'ft') && !o.t.trim()) continue;   // empty header and footer lines don't count
        if (p && LOCKS.includes(p.lock) && o.k !== 'hd' && o.k !== 'ft') o.lock = p.lock;
        if (p && /^[crj]$/.test(p.a || '')) o.a = p.a;
        const r = o.lock ? undefined : normRuns(p && p.r, o.t);
        if (r) o.r = r;
      }
      out.push(o);
    }
    // the page setup first, then the header, the text, the footer (stable, so the order inside each part stays)
    return out.map((o, i) => [RANK[o.k] != null ? RANK[o.k] : 2, i, o]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((x) => x[2]);
  }
  const key = (p) => p.k + '\u0001' + (p.lock || '') + '\u0001' + p.t + (p.rows ? '\u0001' + JSON.stringify(p.rows) : '') + (p.a ? '\u0001a' + p.a : '') + (p.r ? '\u0001r' + JSON.stringify(p.r) : '') + (p.sh ? '\u0001s' + JSON.stringify(p.sh) : '') + (p.ps ? '\u0001p' + JSON.stringify(p.ps) : '');
  const shape = (p) => (p && p.k === 'table' && p.rows ? p.rows.map((r) => r.length).join(',') : null);
  /* one table changed on both sides: merge cell by cell (only when it still has the same rows and cells) */
  function mergeTable(b, m, t, prefer) {
    const sb = shape(b), sm = shape(m), st = shape(t);
    if (sb === null || sm === null || st === null) return null;
    let conflicts = 0;
    const shOf = (x, i, j) => (x.sh && x.sh[i] && x.sh[i][j]) || '';
    const withSh = (rows, sh) => { const it = { k: 'table', t: '', rows }; if (sh && sh.some((r) => r.some(Boolean))) it.sh = sh; return it; };
    if (sm === sb && st === sb) {
      const pick = (bc, mc, tc) => { if (mc === bc) return tc; if (tc === bc || tc === mc) return mc; conflicts++; return prefer === 'theirs' ? tc : mc; };
      const rows = b.rows.map((r, i) => r.map((bc, j) => pick(bc, m.rows[i][j], t.rows[i][j])));
      const sh = b.rows.map((r, i) => r.map((_, j) => pick(shOf(b, i, j), shOf(m, i, j), shOf(t, i, j))));
      return { item: withSh(rows, sh), conflicts };
    }
    // one side (Word) changed the table's rows: its rows win; the other side's typing is carried over to the rows
    // that are still the same as before (matched by content, so a row added in the middle doesn't shift anything)
    if (sm !== sb && st !== sb) return null;
    const shaped = sm !== sb ? m : t, edits = sm !== sb ? t : m;
    const row = (r) => ({ k: 'p', t: JSON.stringify(r) });
    const rows = shaped.rows.map((r) => r.slice());
    const matched = new Set();
    for (const [i, j] of lcs(b.rows.map(row), shaped.rows.map(row))) {
      matched.add(i);
      b.rows[i].forEach((bc, c) => { if (edits.rows[i][c] !== bc) rows[j][c] = edits.rows[i][c]; });
    }
    b.rows.forEach((r, i) => { if (!matched.has(i) && r.some((bc, c) => edits.rows[i][c] !== bc)) conflicts++; });
    return { item: withSh(rows, shaped.sh ? shaped.sh.map((r) => r.slice()) : null), conflicts };
  }
  function same(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (key(a[i]) !== key(b[i])) return false;
    return true;
  }
  /* longest common subsequence of two paragraph lists, as pairs [i, j] in order; the common start and end are
     matched first, so ordinary edits stay fast in long documents */
  function lcs(a, b) {
    const ka = a.map(key), kb = b.map(key);
    let s = 0; while (s < ka.length && s < kb.length && ka[s] === kb[s]) s++;
    let e = 0; while (e < ka.length - s && e < kb.length - s && ka[ka.length - 1 - e] === kb[kb.length - 1 - e]) e++;
    const pairs = [];
    for (let i = 0; i < s; i++) pairs.push([i, i]);
    const A = ka.slice(s, ka.length - e), B = kb.slice(s, kb.length - e), n = A.length, m = B.length;
    if (n && m && n * m <= 4e6) {
      const dp = []; for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      let i = 0, j = 0;
      while (i < n && j < m) { if (A[i] === B[j]) { pairs.push([s + i, s + j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
    }
    for (let i = 0; i < e; i++) pairs.push([ka.length - e + i, kb.length - e + i]);
    return pairs;
  }
  /* what changed from a to b: hunks { a0, a1, b0, b1 } = a[a0..a1) became b[b0..b1) */
  function hunks(a, b) {
    const out = []; let pa = 0, pb = 0;
    for (const [i, j] of lcs(a, b).concat([[a.length, b.length]])) {
      if (i > pa || j > pb) out.push({ a0: pa, a1: i, b0: pb, b1: j });
      pa = i + 1; pb = j + 1;
    }
    return out;
  }
  /* do two hunks (in base positions) touch the same paragraphs? Two insertions at the same place don't clash
     (both are kept), nor does an insertion right before or after a changed range. */
  const clash = (x, y) => (x.a0 < y.a1 && y.a0 < x.a1) || (x.a0 === x.a1 && y.a0 < x.a0 && x.a0 < y.a1) || (y.a0 === y.a1 && x.a0 < y.a0 && y.a0 < x.a1);
  /* three-way merge: the changes base → mine and base → theirs together. prefer = which side wins a clash. */
  function merge3(base, mine, theirs, prefer) {
    base = norm(base); mine = norm(mine); theirs = norm(theirs);
    if (same(mine, theirs)) return { doc: mine, conflicts: 0 };
    if (same(base, mine)) return { doc: theirs, conflicts: 0 };
    if (same(base, theirs)) return { doc: mine, conflicts: 0 };
    const hm = hunks(base, mine).map((x) => Object.assign(x, { src: mine, side: 'mine' }));
    const ht = hunks(base, theirs).map((x) => Object.assign(x, { src: theirs, side: 'theirs' }));
    const all = hm.concat(ht).sort((x, y) => x.a0 - y.a0 || (x.a1 - x.a0) - (y.a1 - y.a0) || (x.side === (prefer || 'mine') ? -1 : 1));
    const groups = [];
    for (const x of all) {
      const g = groups[groups.length - 1];
      if (g && g.some((y) => clash(x, y))) g.push(x); else groups.push([x]);
    }
    const out = []; let pos = 0, conflicts = 0;
    const apply = (list, from, to) => {   // base[from..to) with the hunks in list applied, in order
      const r = []; let p = from;
      for (const x of list) { for (; p < x.a0; p++) r.push(base[p]); r.push(...x.src.slice(x.b0, x.b1)); p = Math.max(p, x.a1); }
      for (; p < to; p++) r.push(base[p]);
      return r;
    };
    for (const g of groups) {
      const from = Math.min(...g.map((x) => x.a0)), to = Math.max(...g.map((x) => x.a1));
      for (; pos < from; pos++) out.push(base[pos]);
      const sides = new Set(g.map((x) => x.side));
      if (g.length === 2 && sides.size === 2 && g[0].a0 === g[1].a0 && g[0].a1 === g[1].a1 && g[0].a1 - g[0].a0 === 1 && g.every((x) => x.b1 - x.b0 === 1)) {
        const mh = g.find((x) => x.side === 'mine'), th = g.find((x) => x.side === 'theirs');
        const tm = mergeTable(base[from], mh.src[mh.b0], th.src[th.b0], prefer || 'mine');
        if (tm) { out.push(tm.item); conflicts += tm.conflicts; pos = to; continue; }
      }
      if (sides.size === 1 || g.every((x) => x.a0 === x.a1 && x.a0 === g[0].a0)) {
        // one side only, or insertions at the same place from both sides: keep everything (the same text only once)
        const seen = new Set(), list = [];
        for (const x of g) { const k = x.src.slice(x.b0, x.b1).map(key).join('\u0002'); if (x.a0 === x.a1 && seen.has(k)) continue; seen.add(k); list.push(x); }
        out.push(...apply(list, from, to));
      } else {
        const a = apply(g.filter((x) => x.side === 'mine'), from, to), b = apply(g.filter((x) => x.side === 'theirs'), from, to);
        if (!same(a, b)) conflicts++;
        out.push(...((prefer || 'mine') === 'mine' ? a : b));
      }
      pos = to;
    }
    for (; pos < base.length; pos++) out.push(base[pos]);
    return { doc: out, conflicts };
  }

  /* One side of a link. send(msg) talks to the bridge; read() → the document on this side now; write(target, now)
     changes this side to target (touching as little as possible); onSynced(info) after each change from the bridge.
     base is the last state this side and the bridge agreed on (the app keeps it with the page, so changes made while
     the link was off are merged when it comes back). */
  function makeClient(o) {
    const st = { id: o.id || Math.random().toString(36).slice(2, 10), base: o.base ? norm(o.base) : null, ver: 0, sent: null, inFlight: 0, timer: 0, busy: false, on: true, conflicts: 0 };
    let queue = Promise.resolve();
    const serial = (fn) => (queue = queue.then(fn, fn).catch((e) => { if (o.onError) o.onError(e); }));
    async function flush() {
      if (!st.on || st.busy) return;
      if (st.inFlight && Date.now() - st.inFlight < 6000) { later(400); return; }
      if (!st.ver && o.waitForDoc) return;               // the app waits for Word's document first
      const now = norm(await o.read());
      if (st.base && same(now, st.base)) return;
      st.sent = now; st.inFlight = Date.now();
      o.send({ type: 'push', base: st.ver, doc: now, by: st.id });
    }
    function later(ms) { clearTimeout(st.timer); st.timer = setTimeout(() => serial(flush), ms == null ? 250 : ms); }
    async function receive(msg) {
      if (!st.on || !msg || msg.type !== 'doc' || !(msg.ver > st.ver)) return;
      st.busy = true;
      try {
        const doc = norm(msg.doc), ack = msg.by === st.id && st.sent;
        const known = ack ? st.sent : (st.base || doc);   // what the bridge already has from this side
        const now = norm(await o.read());
        let target = doc, conflicts = 0;
        // a side with no history yet (a page just linked) takes the master copy as it is: its empty start must
        // never count as "everything was deleted"
        if (st.base && !same(now, known)) { const r = merge3(known, now, doc, 'mine'); target = r.doc; conflicts = r.conflicts; }
        if (!same(target, now)) await o.write(target, now);
        st.base = doc; st.ver = msg.ver; st.conflicts += conflicts;
        if (ack) { st.inFlight = 0; st.sent = null; }
        if (o.onSynced) o.onSynced({ ver: st.ver, base: doc, conflicts, changed: !same(target, now) });
        if (!same(target, doc)) later(150);               // this side still has changes the bridge doesn't know
      } finally { st.busy = false; }
    }
    return {
      id: st.id,
      changed: (ms) => later(ms),
      receive: (msg) => serial(() => receive(msg)),
      flushNow: () => serial(flush),
      stop() { st.on = false; clearTimeout(st.timer); },
      get ver() { return st.ver; },
      get base() { return st.base; },
      get conflicts() { return st.conflicts; },
      reset() { st.ver = 0; st.inFlight = 0; st.sent = null; },
    };
  }
  return { KINDS, LOCKS, norm, key, shape, same, lcs, hunks, merge3, makeClient, clean, words, fmt, fmtGet, perWord, runsOf };
})();

/* ================= Sections: Home, Subjects & grades, Projects, Calendar, Coding logbook =================
   UI preview of the study loop (designs in docs/design). The sidebar's section list opens a section in place of the
   page (the page stays loaded underneath; opening a page closes the section). Real already: recent pages on Home and
   the Inbox quick notes (prefs 'inboxPreview', this browser only). Everything else shows example data, marked
   “Preview”, and changes made there (ticking tasks, assigning people) last only until the window closes.
   Projects can have members (you and classmates): tasks are split between them, with an overall progress bar and
   one per person. Subjects can have classmates who share their progress (you choose what each one sees). */
const SECTIONS = [['home', 'Home', 'home'], ['notes', 'Notebooks', 'book'], ['word', 'Word link', 'textfile'], ['subjects', 'Subjects & grades', 'trend', 1], ['calendar', 'Calendar', 'cal', 1],
  ['task', 'Task projects', 'checklist', 1], ['study', 'Study projects', 'learn', 1], ['logbook', 'Coding logbook', 'code', 1]];
/* the coming sections (marked 1 above) are a preview with example data. They can be hidden, e.g. for a demo:
   View → “Coming sections (preview)” (pref 'previews'). PREVIEWS_DEFAULT is what a new user sees. */
const PREVIEWS_DEFAULT = false;   // off in the demo version for friends (November 2026); back on in the next version
const showPreviews = () => !!prefs.get('previews', PREVIEWS_DEFAULT);
const isPreviewSec = (k) => !!(SECTIONS.find((x) => x[0] === k) || [])[3];
let secOpen = null, secArg = null;
const secView = h('div', { class: 'secview', id: 'secView', hidden: true });
$('#work').after(secView);
const secNav = h('nav', { class: 'secnav', id: 'secNav', 'aria-label': 'Sections' });
$('#side .side-actions').before(secNav);
const sxEsc = (s) => esc(String(s == null ? '' : s));
const PEOPLE = { me: ['You', '#E5383B'], lena: ['Lena', '#6EA8FF'], noah: ['Noah', '#4CBDB4'], mia: ['Mia', '#F2B860'], luca: ['Luca', '#A996FF'] };
const ava = (p, size) => { const [n, c] = PEOPLE[p] || ['?', '#888']; return '<span class="sx-ava' + (size ? ' ' + size : '') + '" style="--c:' + c + '" title="' + sxEsc(n) + '">' + sxEsc(n === 'You' ? 'Me' : n[0]) + '</span>'; };
const sxIc = (name, col) => '<span class="sx-ic ' + (col || 'red') + '">' + svg(name).outerHTML + '</span>';
const PREVIEW = '<span class="sx-preview" title="These screens show example data for now. They fill with your own notes, grades and projects in the next updates.">Preview · example data</span>';

function renderSecNav() {
  secNav.textContent = '';
  for (const [k, label, icon, soon] of SECTIONS) {
    if (soon && !showPreviews()) continue;
    const on = k === 'notes' ? !secOpen : secOpen === k;
    secNav.append(h('button', { class: 'secnav-item', 'data-sec': k, 'aria-current': on ? 'page' : null, onclick: () => (k === 'notes' ? showNotebooks() : openSection(k)) },
      svg(icon), h('span', null, label), soon ? h('small', { class: 'secnav-new' }, 'new') : null));
  }
}
function openSection(k, arg) {
  if (!SECTIONS.some((s) => s[0] === k) || k === 'notes') return;
  if (isPreviewSec(k) && !showPreviews()) k = 'home';
  if (typeof exitEdit === 'function' && editing) exitEdit();
  if (cur && sel && sel.has) clearSel();
  closeMenu();
  secOpen = k; secArg = arg == null ? null : arg;
  $('#main').classList.add('in-sec'); app.classList.add('in-sec');
  secView.hidden = false; secView.dataset.sec = k; secView.scrollTop = 0;
  renderSection();
  renderSecNav(); renderCrumbs();
  if (isMobile()) setSide(false);
}
function closeSection() {
  if (!secOpen) return;
  secOpen = null; secArg = null;
  $('#main').classList.remove('in-sec'); app.classList.remove('in-sec');
  secView.hidden = true; secView.textContent = '';
  renderSecNav(); renderCrumbs();
}
/* “Notebooks”: back to the open page, or the page changed last */
function showNotebooks() {
  closeSection();
  if (cur) return;
  const last = Object.values(tree.nodes).filter((n) => live(n) && n.type === 'note').sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
  if (last) openNote(last.id); else { secSuppress = true; showEmpty(); secSuppress = false; }
  if (isMobile()) setSide(true);
}
let secSuppress = false;
function renderSection() {
  const k = secOpen;
  if (k === 'home') renderHome();
  else if (k === 'word') renderWordSection();   // 49_wordlink.js
  else if (k === 'subjects') renderSubjects();
  else if (k === 'task' || k === 'study') renderProjects(k);
  else if (k === 'calendar') renderCalendarPreview();
  else if (k === 'logbook') renderLogbookPreview();
  wireSecView();
}
/* buttons inside the section view: data-act="name" (and data-arg) */
const SEC_ACTS = {};
function wireSecView(root) {
  for (const b of (root || secView).querySelectorAll('[data-act]')) b.addEventListener('click', (e) => { const f = SEC_ACTS[b.dataset.act]; if (f) f(b.dataset.arg, b, e); });
}

/* ---------- Home ---------- */
const HOME_TODAY = [['08:00', 'Mathe · Analysis', 'Room B204 · notebook Mathe', 'blue'], ['10:15', 'Bio · Zellbiologie', 'Record sound is ready · page “Mitose”', 'red', true],
  ['13:30', 'Informatik project', 'Team meeting · Coding logbook', 'teal'], ['16:00', 'Study block: Bio quiz', 'Learn mode, 25 min', 'violet'], ['19:30', 'Englisch vocab', 'Flashcards, 40 cards due', 'amber']];
const HOME_TASKS = [['Bio presentation slides', 'Bio', 'red', 'Wed', true], ['Fix pad link on the phone', 'Cortex Scribe', 'blue', 'Thu'], ['Read chapter 4: Mitose', 'Bio', 'red', 'Fri'], ['Analysis exercise sheet 6', 'Mathe', 'violet', 'Mon']];
function homeGreeting() { const h0 = new Date().getHours(); return h0 < 11 ? 'Good morning' : h0 < 18 ? 'Good afternoon' : 'Good evening'; }
function renderHome() {
  const name = prefs.get('myName', '');
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const pages = Object.values(tree.nodes).filter((n) => live(n) && n.type === 'note').sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 4);
  const nbOf = (n) => { const b = notebookOf(n.id); return b && b.id !== n.id ? b.name : ''; };
  const ago = (t) => { const m = Math.round((now() - (t || now())) / 60000); return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString(); };
  const inbox = prefs.get('inboxPreview', []);
  const pv = showPreviews();
  const thumb = (n) => '<div class="sx-pv ' + (n.kind === 'board' ? 'brd' : n.kind === 'a4' ? 'a4' : 'lined') + '"><i style="width:52%"></i><i style="width:76%"></i><i style="width:60%"></i></div>';
  secView.innerHTML = '<div class="sx sx-home">' +
    '<div class="sx-top"><div class="sx-hello"><h1>' + sxEsc(homeGreeting()) + (name ? ', ' + sxEsc(name) : '') + '</h1><p>' + sxEsc(date) + (pv ? ' · 3 classes · 7 open tasks · Bio test in 4 days ' : ' ') + (name ? '' : '<button class="sx-link" data-act="name">Add your name</button>') + '</p></div>' +
      '<label class="sx-capture">' + svg('plus').outerHTML + '<input id="sxCapture" placeholder="Quick note for your Inbox…" aria-label="Quick note for the Inbox"><kbd>Enter</kbd></label>' +
      '<button class="sx-btn" data-act="record">' + svg('mic').outerHTML + 'Record class</button><button class="sx-btn primary" data-act="newpage">' + svg('page').outerHTML + 'New page</button></div>' +
    '<div class="sx-quick"><button data-act="pad">' + svg('pen').outerHTML + 'Be the pad</button><button data-act="record">' + svg('mic').outerHTML + 'Record</button><button data-act="newpage">' + svg('page').outerHTML + 'New page</button>' + (pv ? '<button data-act="go" data-arg="task">' + svg('checklist').outerHTML + 'New task</button>' : '<button data-act="go" data-arg="word">' + svg('textfile').outerHTML + 'Word link</button>') + '</div>' +
    (pv ? '<div class="sx-note">' + PREVIEW + ' The calendar, tasks, study projects and logbook below are examples. Your recent pages and Inbox notes are real.</div>' : '') +
    '<div class="sx-grid home' + (pv ? '' : ' nopv') + '">' + (pv ? '' : wordCardHtml()) + (!pv ? '' :
      '<section class="sx-card today"><h3>' + sxIc('cal') + 'Today<span class="sx-more">' + sxEsc(new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })) + '</span></h3>' +
        HOME_TODAY.map(([t, a, b, c, now0]) => '<div class="sx-ev' + (now0 ? ' now' : '') + '"><time>' + t + '</time><i class="' + c + '"></i><div><b>' + a + '</b><small>' + b + '</small></div></div>').join('') + '</section>' +
      '<section class="sx-card"><h3>' + sxIc('checklist', 'amber') + 'Task projects<button class="sx-more" data-act="go" data-arg="task">7 open ›</button></h3>' +
        HOME_TASKS.map(([t, s, c, d, soon]) => '<div class="sx-task"><span class="sx-box"></span><span class="tt">' + t + '</span><span class="sx-chip ' + c + '">' + s + '</span><span class="sx-due' + (soon ? ' soon' : '') + '">' + d + '</span></div>').join('') +
        '<div class="sx-task done"><span class="sx-box on"></span><span class="tt">Hand in English essay</span><span class="sx-chip amber">Englisch</span></div></section>' +
      '<section class="sx-card"><h3>' + sxIc('learn', 'green') + 'Study projects<button class="sx-more" data-act="go" data-arg="study">Exam in 4 days ›</button></h3>' +
        [['Zellbiologie', 72, 'green', 'Next: flashcards for Mitose and Meiose', '8/10 quiz'], ['Analysis I', 45, 'blue', 'Next: integrals, sheet 6'], ['English vocab B2', 90, 'amber', '40 cards due today']].map(([n, p, c, s, q]) =>
          '<div class="sx-proj"><div class="row"><b>' + n + '</b>' + (q ? '<span class="sx-chip green">' + q + '</span>' : '') + '<span class="pc">' + p + '%</span></div><div class="sx-track"><i class="' + c + '" style="width:' + p + '%"></i></div><small>' + s + '</small></div>').join('') + '</section>' +
      '<section class="sx-card"><h3>' + sxIc('code', 'teal') + 'Coding logbook<button class="sx-more" data-act="go" data-arg="logbook">🔥 12-day streak ›</button></h3>' +
        '<div class="sx-log"><span>Nov 9</span><span><b>Cortex Scribe</b> · jump tags and the lasso <code>+1,240</code></span><span>Nov 8</span><span><b>Cortex Scribe</b> · colour styles <code>+980</code></span><span>Nov 7</span><span><b>School project</b> · login page in React</span></div>' +
        '<div class="sx-bars">' + [60, 85, 40, 100, 70, 15, 8].map((v, i) => '<i class="' + (i > 4 ? 'off' : '') + '" style="height:' + v + '%"></i>').join('') + '</div><div class="sx-days"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div></section>') +
      '<section class="sx-card"><h3>' + sxIc('inbox', 'violet') + 'Inbox<span class="sx-more">' + (inbox.length ? inbox.length + ' to sort' : 'empty') + '</span></h3><div class="sx-inbox" id="sxInbox">' +
        (inbox.length ? inbox.slice(0, 4).map((t) => '<div>• ' + sxEsc(t) + '</div>').join('') : '<div class="muted">Type above and press Enter: quick notes land here.</div>') + '</div>' +
        (pv ? '<div class="sx-timer"><div class="ring"><b>25:00</b></div><div><b>Study timer</b><small>Pick a study project and start a 25-minute block, then a 5-minute break.</small></div></div>' : '') + '</section>' +
      (pv ? wordCardHtml() : '') +
      '<section class="sx-card cont"><h3>' + sxIc('page', 'blue') + 'Continue where you left off</h3><div class="sx-thumbs">' +
        (pages.length ? pages.map((n) => '<button class="sx-thumb" data-act="open" data-arg="' + sxEsc(n.id) + '">' + thumb(n) + '<b>' + sxEsc(n.name || 'Untitled') + '</b><small>' + sxEsc([nbOf(n), ago(n.updated)].filter(Boolean).join(' · ')) + '</small></button>').join('') : '<p class="muted">Your pages will show here.</p>') + '</div></section>' +
    '</div>' +
    '<nav class="sx-tabbar" aria-label="Sections"><button class="on" data-act="go" data-arg="home">' + svg('home').outerHTML + 'Home</button><button data-act="notes">' + svg('book').outerHTML + 'Notes</button>' + (pv ? '<button data-act="go" data-arg="calendar">' + svg('cal').outerHTML + 'Calendar</button><button data-act="go" data-arg="task">' + svg('checklist').outerHTML + 'Tasks</button>' : '<button data-act="go" data-arg="word">' + svg('textfile').outerHTML + 'Word</button>') + '<button data-act="more">' + svg('menu').outerHTML + 'More</button></nav>' +
  '</div>';
  wlWireCode(secView); setTimeout(() => wlConnect(), 0);   // the Word link card (49_wordlink.js)
  const cap = secView.querySelector('#sxCapture');
  cap.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !cap.value.trim()) return;
    const list = prefs.get('inboxPreview', []); list.unshift(cap.value.trim().slice(0, 200)); prefs.set('inboxPreview', list.slice(0, 30));
    cap.value = ''; toast('Saved in your Inbox.'); renderSection();
    const c2 = secView.querySelector('#sxCapture'); if (c2) c2.focus();
  });
}
Object.assign(SEC_ACTS, {
  go: (k) => openSection(k),
  notes: () => showNotebooks(),
  more: () => setSide(true),
  open: (id) => openNote(id),
  pad: () => padHubModal(),
  name: async () => { const n = await promptModal('Your name', 'Name', prefs.get('myName', ''), 'Save'); if (n != null) { prefs.set('myName', n.trim().slice(0, 40)); renderSection(); } },
  newpage: () => { const nb = kids(null).find((x) => x.type === 'folder'); if (!nb) return newNotebook(); newPage(nb.id); },
  record: () => { if (!cur) return toast('Open the page you take notes on, then press Record class (Insert → Record sound).'); closeSection(); audStart(); },
});

/* ---------- Subjects & grades ---------- */
const SUBJ = [
  { id: 'bio', name: 'Bio', c: '#E5383B', avg: 4.9, tr: 0.1, next: 'Test Fri 14 Nov', spark: [4.5, 4.8, 4.6, 4.9, 4.85, 4.9], goal: 5, teacher: 'Frau Meier' },
  { id: 'mathe', name: 'Mathe', c: '#6EA8FF', avg: 4.4, tr: -0.3, next: 'Test Tue 18 Nov', spark: [4.9, 4.8, 4.7, 4.5, 4.4, 4.4], goal: 4.5, warn: 'below your goal 4.5', teacher: 'Herr Keller' },
  { id: 'info', name: 'Informatik', c: '#4CBDB4', avg: 5.5, tr: 0.2, next: 'Project due 28 Nov', spark: [5, 5.1, 5.3, 5.3, 5.4, 5.5], goal: 5.5, teacher: 'Frau Rossi' },
  { id: 'eng', name: 'Englisch', c: '#F2B860', avg: 5.0, tr: 0, next: 'Oral exam 2 Dec', spark: [5, 5.1, 4.9, 5, 5, 5], goal: 5, teacher: 'Mr Brown' },
  { id: 'phys', name: 'Physik', c: '#A996FF', avg: 3.8, tr: -0.2, next: 'Test Thu 13 Nov', spark: [4.2, 4, 4.1, 3.9, 3.8, 3.8], goal: 4.5, warn: 'insufficient: needs 4.5 next', teacher: 'Herr Weber' },
  { id: 'wirt', name: 'Wirtschaft', c: '#9B9BA5', avg: 4.6, tr: 0.1, next: 'no test planned', spark: [4.3, 4.4, 4.5, 4.5, 4.6, 4.6], goal: 4.5, teacher: 'Frau Huber' }];
const BIO_GRADES = [['7 Nov', 'Test: Mitose', 'Test', 'red', 2, 5.25, 'Mitose'], ['24 Oct', 'Oral: cell organelles', 'Oral', 'violet', 1, 4.75, 'Organellen'], ['10 Oct', 'Test: Organellen', 'Test', 'red', 2, 5.5, 'Organellen'], ['19 Sep', 'Quiz: membranes', 'Quiz', 'blue', 1, 4, 'Zellmembran'], ['5 Sep', 'Test: Die Zelle', 'Test', 'red', 2, 5, 'Zellen']];
const CLASSMATES = [['lena', 'same test Fri', 74, '5.2', 'grades and readiness'], ['noah', 'same test Fri', 51, null, 'readiness only'], ['mia', 'other class', 66, '4.6', 'grades and readiness']];
let subjTab = 'grades';
function spark(vals, c) {
  const w = 150, hh = 40, mn = 3.5, mx = 6;
  return '<svg class="sx-spark" viewBox="0 0 150 40" aria-hidden="true"><polyline points="' + vals.map((v, i) => (i * w / (vals.length - 1)).toFixed(1) + ',' + (hh - (v - mn) / (mx - mn) * hh).toFixed(1)).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}
function gradeChart(grades, goal) {
  const W = 760, H = 230, L = 34, R = 10, T = 10, B = 26;
  const pts = grades.slice().reverse().map((g, i, a) => ({ f: 0.05 + i * (0.7 / Math.max(1, a.length - 1)), g: g[5], w: g[4] }));
  const X = (f) => L + f * (W - L - R), Y = (g) => T + (6 - g) / 3 * (H - T - B);
  let s = 0, wsum = 0; const avg = pts.map((p) => { s += p.g * p.w; wsum += p.w; return { f: p.f, a: s / wsum }; });
  let out = '<svg class="sx-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grades this semester">';
  for (const g of [3, 3.5, 4, 4.5, 5, 5.5, 6]) out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '" class="grid"/><text x="4" y="' + (Y(g) + 4) + '">' + g + '</text>';
  out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(4) + '" y2="' + Y(4) + '" class="pass"/><line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(goal) + '" y2="' + Y(goal) + '" class="goal"/>';
  out += '<path class="avg" d="M' + avg.map((p) => X(p.f).toFixed(1) + ' ' + Y(p.a).toFixed(1)).join(' L') + '"/>';
  const last = avg[avg.length - 1], need = 5.25;
  out += '<path class="proj" d="M' + X(last.f).toFixed(1) + ' ' + Y(last.a).toFixed(1) + ' L' + X(0.86).toFixed(1) + ' ' + Y(goal).toFixed(1) + '"/>';
  for (const p of pts) out += '<circle cx="' + X(p.f).toFixed(1) + '" cy="' + Y(p.g).toFixed(1) + '" r="' + (5 + 2 * p.w) + '" class="' + (p.g >= 5 ? 'hi' : p.g >= 4 ? 'mid' : 'lo') + '"/>';
  out += '<circle cx="' + X(0.86) + '" cy="' + Y(need) + '" r="9" class="need"/><text x="' + X(0.86) + '" y="' + (Y(need) - 14) + '" text-anchor="middle" class="needt">needed: ' + need + '</text>';
  ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'].forEach((m, i) => { out += '<text x="' + X(0.02 + i * 0.18) + '" y="' + (H - 6) + '">' + m + '</text>'; });
  return out + '</svg>';
}
function renderSubjects() {
  const s = SUBJ.find((x) => x.id === secArg);
  if (!s) {
    secView.innerHTML = '<div class="sx">' +
      '<div class="sx-top"><div class="sx-hello"><h1>Subjects & grades</h1><p>Semester 1 · ' + SUBJ.length + ' subjects ' + PREVIEW + '</p></div><button class="sx-btn" data-act="soon" data-arg="Making a notebook a subject">' + svg('plus').outerHTML + 'Make a notebook a subject</button><button class="sx-btn primary" data-act="soon" data-arg="Adding grades">' + svg('plus').outerHTML + 'Add a grade</button></div>' +
      '<div class="sx-stats"><div class="sx-stat"><small>Overall average</small><b>4.7 <em class="up">▲ 0.1</em></b><span>weighted by lessons per week</span></div><div class="sx-stat"><small>Promotion</small><b class="ok">On track ✓</b><span>1 insufficient grade, compensated twice</span></div><div class="sx-stat"><small>Tests coming up</small><b>4</b><span>next: Physik on Thursday</span></div><div class="sx-stat"><small>Study time this week</small><b>6.5 h</b><span>most in Bio, least in Physik</span></div></div>' +
      '<div class="sx-subs">' + SUBJ.map((x) => '<button class="sx-sc" data-act="subject" data-arg="' + x.id + '"><div class="row"><i style="background:' + x.c + '"></i><b>' + x.name + '</b><span class="tr ' + (x.tr > 0 ? 'up' : x.tr < 0 ? 'down' : '') + '">' + (x.tr > 0 ? '▲ ' + x.tr : x.tr < 0 ? '▼ ' + (-x.tr) : '=') + '</span></div><div class="row2"><span class="avg' + (x.avg < 4 ? ' lo' : '') + '">' + x.avg.toFixed(1) + '</span>' + spark(x.spark, x.c) + '</div><small>' + x.next + '</small>' + (x.warn ? '<span class="warnline">' + x.warn + '</span>' : '') + '</button>').join('') + '</div>' +
      '<section class="sx-card"><h3>' + sxIc('users', 'blue') + 'Your study group<span class="sx-more">you choose what each one sees</span></h3><div class="sx-mates">' +
        CLASSMATES.map(([p, same, ready, avg, sees]) => '<div class="sx-mate">' + ava(p, 'big') + '<div><b>' + PEOPLE[p][0] + '</b><small>' + same + ' · shares ' + sees + '</small></div><div class="sx-track"><i style="width:' + ready + '%;background:' + PEOPLE[p][1] + '"></i></div><span class="pc">' + ready + '% ready</span>' + (avg ? '<span class="sx-chip">' + avg + ' avg</span>' : '') + '</div>').join('') +
        '<button class="sx-btn small" data-act="soon" data-arg="Adding classmates">' + svg('plus').outerHTML + 'Add a classmate</button></div></section>' +
      '<section class="sx-card coach"><h3>' + sxIc('bulb') + 'This week</h3><p><b>Physik</b> needs attention: the average is 3.8 and the next test is on Thursday. A 4.5 brings it back above 4. <b>Mathe</b> is sliding a little since September. Bio and Informatik are going well.</p></section>' +
    '</div>';
    return;
  }
  const tabs = [['notes', 'Notes'], ['grades', 'Grades & progress'], ['learn', 'Learn'], ['mates', 'Classmates']];
  let body = '';
  if (subjTab === 'grades') body =
    '<div class="sx-stats"><div class="sx-stat"><small>Average</small><b>' + s.avg.toFixed(1) + ' <em class="' + (s.tr >= 0 ? 'up' : 'down') + '">' + (s.tr >= 0 ? '▲ ' : '▼ ') + Math.abs(s.tr) + '</em></b><span>weighted · rounded to ½: ' + (Math.round(s.avg * 2) / 2).toFixed(1) + '</span></div><div class="sx-stat"><small>Your goal</small><b class="warn">' + s.goal.toFixed(1) + '</b><span>you need <strong>5.25</strong> in the next test</span></div><div class="sx-stat"><small>Next test</small><b class="mid">' + s.next.replace(/^Test /, '') + '</b><span>weight ×2 · in 4 days</span></div><div class="sx-stat"><small>Learn readiness</small><b>62% <em class="down">Meiose weak</em></b><span>from 9 quizzes this semester</span></div></div>' +
    '<div class="sx-cols"><div class="sx-col"><section class="sx-card"><h3>' + sxIc('trend', 'blue') + 'Grades this semester<span class="sx-more sx-legend"><i class="avg"></i>average <i class="goal"></i>goal <i class="pass"></i>pass (4)</span></h3>' + gradeChart(BIO_GRADES, s.goal) + '</section>' +
      '<section class="sx-card"><h3>' + sxIc('checklist') + 'All grades<span class="sx-more">bigger dot = more weight</span></h3><table class="sx-table"><tr><th>Date</th><th>What</th><th>Type</th><th>Weight</th><th>Grade</th><th>Notes for it</th></tr>' +
        BIO_GRADES.map(([d, w, t, c, wt, g, pg]) => '<tr><td class="muted">' + d + '</td><td>' + w + '</td><td><span class="sx-chip ' + c + '">' + t + '</span></td><td class="muted">×' + wt + '</td><td class="g ' + (g >= 5 ? 'hi' : g < 4 ? 'lo' : '') + '">' + g + '</td><td class="pg">' + pg + '</td></tr>').join('') + '</table></section></div>' +
    '<div class="sx-col"><section class="sx-card"><h3>' + sxIc('target', 'green') + 'Topics<span class="sx-more">from Learn quizzes</span></h3>' +
        [['Zelle', 88, 'green'], ['Organellen', 81, 'green'], ['Mitose', 66, 'amber'], ['Meiose', 38, 'red'], ['Genetik', 0, '']].map(([n, v, c]) => '<div class="sx-topic"><b>' + n + '</b><div class="sx-track"><i class="' + c + '" style="width:' + v + '%"></i></div><span>' + v + '%</span></div>').join('') +
        '<button class="sx-btn" data-act="soon" data-arg="Practising one topic">' + svg('learn').outerHTML + 'Practise Meiose (10 questions)</button></section>' +
      '<section class="sx-card coach"><h3>' + sxIc('bulb') + 'Feedback<span class="sx-more">updated after each quiz</span></h3><p>You’re on track for a 5 if the Meiose test goes well. Your quizzes show Meiose is your weakest topic (38%).</p><ul><li>Do 2 short Meiose quizzes before Thursday</li><li>Your notes on “Meiose” have no summary yet: try Learn → Summary</li><li>Oral grades are your lowest: practise explaining out loud</li></ul></section>' +
      '<section class="sx-card"><h3>' + sxIc('users', 'blue') + 'Classmates<button class="sx-more" data-act="subjtab" data-arg="mates">all ›</button></h3>' + CLASSMATES.slice(0, 2).map(([p, same, ready]) => '<div class="sx-mate small">' + ava(p) + '<b>' + PEOPLE[p][0] + '</b><small>' + same + '</small><div class="sx-track"><i style="width:' + ready + '%;background:' + PEOPLE[p][1] + '"></i></div><span class="pc">' + ready + '%</span></div>').join('') + '<div class="sx-mate small">' + ava('me') + '<b>You</b><small>same test Fri</small><div class="sx-track"><i style="width:62%;background:var(--accent)"></i></div><span class="pc">62%</span></div></section></div></div>';
  else if (subjTab === 'mates') body =
    '<div class="sx-cols"><div class="sx-col"><section class="sx-card"><h3>' + sxIc('users', 'blue') + 'Classmates in ' + s.name + '<span class="sx-more">nobody sees anything unless you allow it</span></h3>' +
      '<p class="muted sx-p">Add classmates to compare how ready you are for the same test, or just to follow each other’s progress, even with different tests. Each person chooses what the others see: nothing, readiness only, or grades too.</p>' +
      '<div class="sx-race"><h4>Bio test on Fri 14 Nov: who’s ready?</h4>' + [['me', 62], ['lena', 74], ['noah', 51]].map(([p, v]) => '<div class="sx-mate small">' + ava(p) + '<b>' + PEOPLE[p][0] + '</b><div class="sx-track big"><i style="width:' + v + '%;background:' + (p === 'me' ? 'var(--accent)' : PEOPLE[p][1]) + '"></i></div><span class="pc">' + v + '%</span></div>').join('') + '</div>' +
      '<div class="sx-mates">' + CLASSMATES.map(([p, same, ready, avg, sees]) => '<div class="sx-mate">' + ava(p, 'big') + '<div><b>' + PEOPLE[p][0] + '</b><small>' + same + ' · shares ' + sees + '</small></div>' + spark(p === 'noah' ? [4.4, 4.5, 4.6, 4.7, 4.7, 4.8] : p === 'lena' ? [5, 5.1, 5.1, 5.2, 5.3, 5.2] : [4.4, 4.5, 4.5, 4.6, 4.6, 4.6], PEOPLE[p][1]) + (avg ? '<span class="sx-chip">' + avg + ' avg</span>' : '<span class="sx-chip">grades hidden</span>') + '</div>').join('') + '</div>' +
      '<div class="sx-row"><button class="sx-btn primary" data-act="soon" data-arg="Adding classmates">' + svg('plus').outerHTML + 'Add a classmate</button><button class="sx-btn" data-act="soon" data-arg="Choosing who sees what">' + svg('eye').outerHTML + 'Who sees my progress?</button><button class="sx-btn" data-act="soon" data-arg="Quizzing each other">' + svg('learn').outerHTML + 'Quiz each other</button></div></section></div>' +
    '<div class="sx-col"><section class="sx-card coach"><h3>' + sxIc('bulb') + 'Together</h3><p>Lena is strongest on Meiose (91%), you’re best at Mitose (82%). A 20-minute session where you explain your strong topic to each other helps you both.</p></section></div></div>';
  else body = '<section class="sx-card"><p class="muted sx-p">' + (subjTab === 'notes' ? 'The pages of your ' + s.name + ' notebook will show here, each with the grades and tests it belongs to.' : 'Learn for ' + s.name + ': quizzes, flashcards and summaries from your notes, with a score per topic that feeds the grades page.') + ' ' + PREVIEW + '</p></section>';
  secView.innerHTML = '<div class="sx">' +
    '<div class="sx-top"><button class="sx-back" data-act="subject" data-arg="">‹ All subjects</button><span class="sx-dot" style="background:' + s.c + '"></span><div class="sx-hello"><h1>' + s.name + '</h1><p>Subject · Semester 1 · ' + s.teacher + ' ' + PREVIEW + '</p></div>' +
      '<div class="sx-tabs" role="tablist">' + tabs.map(([k, l]) => '<button role="tab" aria-selected="' + (k === subjTab) + '" data-act="subjtab" data-arg="' + k + '">' + l + '</button>').join('') + '</div><button class="sx-btn primary" data-act="soon" data-arg="Adding grades">' + svg('plus').outerHTML + 'Add a grade</button></div>' + body + '</div>';
}
Object.assign(SEC_ACTS, {
  subject: (id) => { secArg = id || null; renderSection(); secView.scrollTop = 0; },
  subjtab: (k) => { subjTab = k; renderSection(); },
  soon: (what) => toast((what || 'This') + ' comes in one of the next updates. This screen is a preview.'),
});

/* ---------- Projects: task projects and study projects, with members ---------- */
const PROJ = [
  { id: 'pres', kind: 'task', name: 'Bio presentation: cell division', subj: 'Bio', c: '#E5383B', due: 'Wed 19 Nov', grade: 'counts as a grade (weight ×1)', members: ['me', 'lena', 'noah', 'mia'],
    tasks: [['Outline', 'me', 'done'], ['Check the sources', 'lena', 'done', 'fact check 92'], ['Pick the topic', 'me', 'done'], ['Book the projector', 'mia', 'done'], ['Slides 4–8: the phases', 'me', 'doing', 'Sun 16'], ['3D model of a cell', 'noah', 'doing', '3D studio'],
      ['Find pictures for each phase', 'lena', 'todo', 'Mon 17'], ['Write speaker notes', 'mia', 'todo', 'Tue 18'], ['Practise the talk twice', 'me', 'todo', 'Learn: flashcards'], ['Print handout', 'noah', 'todo', 'Wed 19'], ['Slides 1–3: intro', 'lena', 'todo', 'Sun 16'], ['Quiz for the class', 'noah', 'todo', 'Tue 18']],
    feed: [['lena', 'finished “Check the sources”', '2 h ago'], ['mia', 'finished “Book the projector”', 'yesterday'], ['noah', 'started “3D model of a cell”', 'yesterday']] },
  { id: 'app', kind: 'task', name: 'Cortex Scribe app', subj: 'Informatik', c: '#4CBDB4', due: 'Sun 30 Nov', grade: 'coding project · logbook', members: ['me', 'luca'],
    tasks: [['Phone pad fix', 'me', 'done'], ['Subjects screen', 'me', 'doing'], ['Calendar data', 'luca', 'doing'], ['Import from OneNote', 'luca', 'todo'], ['Sync between devices', 'me', 'todo']], feed: [['luca', 'pushed “calendar model”', '3 h ago']] },
  { id: 'meiose', kind: 'study', name: 'Bio test: Meiose', subj: 'Bio', c: '#E5383B', due: 'Fri 14 Nov', members: ['me', 'lena', 'noah'], ready: { me: 62, lena: 74, noah: 51 } },
  { id: 'phys', kind: 'study', name: 'Physik test: Kräfte', subj: 'Physik', c: '#A996FF', due: 'Thu 13 Nov', members: ['me', 'mia'], ready: { me: 25, mia: 40 } }];
let projSel = { task: 'pres', study: 'meiose' }, projWho = 'all';
function renderProjects(kind) {
  const list = PROJ.filter((p) => p.kind === kind), p = list.find((x) => x.id === projSel[kind]) || list[0];
  const side = '<aside class="sx-plist"><h4>' + (kind === 'task' ? 'Task projects' : 'Study projects') + '</h4>' + list.map((x) => {
    const pc = x.kind === 'task' ? Math.round(x.tasks.filter((t) => t[2] === 'done').length / x.tasks.length * 100) : x.ready.me;
    return '<button class="sx-pitem" aria-current="' + (x === p) + '" data-act="proj" data-arg="' + x.id + '"><span class="sx-ring" style="--p:' + pc + ';--c:' + x.c + '"></span><span><b>' + sxEsc(x.name) + '</b><small>' + x.members.length + ' people · ' + x.due + '</small></span></button>';
  }).join('') + '<button class="sx-btn small" data-act="soon" data-arg="New projects">' + svg('plus').outerHTML + 'New project</button><button class="sx-link" data-act="go" data-arg="' + (kind === 'task' ? 'study' : 'task') + '">' + (kind === 'task' ? 'Study projects ›' : 'Task projects ›') + '</button></aside>';
  const team = p.members.map((m) => '<span class="sx-member">' + ava(m, 'big') + '<span>' + PEOPLE[m][0] + (m === 'me' ? '<small>owner</small>' : '') + '</span></span>').join('') + '<button class="sx-btn small" data-act="soon" data-arg="Inviting classmates">' + svg('plus').outerHTML + 'Invite</button>';
  const conn = (items) => '<div class="sx-conn">' + items.map(([c, ic, t, s]) => '<div>' + sxIc(ic, c) + '<span><b>' + t + '</b><small>' + s + '</small></span></div>').join('') + '</div>';
  let body;
  if (p.kind === 'task') {
    const done = p.tasks.filter((t) => t[2] === 'done').length, all = p.tasks.length, pc = Math.round(done / all * 100);
    const per = p.members.map((m) => { const mine = p.tasks.filter((t) => t[1] === m); return [m, mine.filter((t) => t[2] === 'done').length, mine.length]; });
    const seg = per.map(([m, d]) => d ? '<i style="width:' + (d / all * 100) + '%;background:' + (m === 'me' ? 'var(--accent)' : PEOPLE[m][1]) + '" title="' + PEOPLE[m][0] + ': ' + d + ' done"></i>' : '').join('');
    const shown = p.tasks.map((t, i) => [t, i]).filter(([t]) => projWho === 'all' || t[1] === projWho);
    const col = (st, label) => '<div class="sx-kcol" data-col="' + st + '"><h4>' + label + ' · ' + shown.filter(([t]) => t[2] === st).length + '</h4>' + shown.filter(([t]) => t[2] === st).map(([t, i]) =>
      '<div class="sx-kc' + (st === 'done' ? ' done' : '') + '"><div class="r1"><button class="sx-check' + (st === 'done' ? ' on' : '') + '" data-act="tick" data-arg="' + i + '" aria-label="' + (st === 'done' ? 'Not done yet: ' : 'Done: ') + sxEsc(t[0]) + '"></button><span>' + sxEsc(t[0]) + '</span></div><div class="r2"><button class="sx-assign" data-act="assign" data-arg="' + i + '" title="Who does it? Click to change">' + ava(t[1]) + '</button>' + (t[3] ? '<span class="sx-chip">' + sxEsc(t[3]) + '</span>' : '') + (st !== 'done' ? '<button class="sx-move" data-act="move" data-arg="' + i + '" title="Move to the next column">›</button>' : '') + '</div></div>').join('') + '</div>';
    body = conn([['blue', 'cal', 'Calendar', 'due ' + p.due + ' · deadlines per task'], ['green', 'trend', 'Grades', p.grade], ['violet', 'learn', 'Learn', 'practise the talk: 12 flashcards'], ['amber', 'page', 'Notes', 'slides page · 2 sources fact-checked']]) +
      '<section class="sx-card"><h3>' + sxIc('users', 'blue') + 'Team<span class="sx-more">' + p.members.length + ' people</span></h3><div class="sx-team">' + team + '</div>' +
        '<div class="sx-overall"><div class="lbl"><b>Overall</b><span>' + done + ' of ' + all + ' tasks done · ' + pc + '%</span></div><div class="sx-track big sx-segs" id="sxOverall">' + seg + '</div></div>' +
        '<div class="sx-per">' + per.map(([m, d, n]) => '<div class="sx-mate small">' + ava(m) + '<b>' + PEOPLE[m][0] + '</b><div class="sx-track"><i style="width:' + (n ? d / n * 100 : 0) + '%;background:' + (m === 'me' ? 'var(--accent)' : PEOPLE[m][1]) + '"></i></div><span class="pc">' + d + '/' + n + '</span></div>').join('') + '</div></section>' +
      '<div class="sx-cols"><div class="sx-col"><section class="sx-card"><h3>' + sxIc('checklist', 'amber') + 'Tasks<span class="sx-filter">' + [['all', 'Everyone']].concat(p.members.map((m) => [m, PEOPLE[m][0]])).map(([k, l]) => '<button aria-pressed="' + (projWho === k) + '" data-act="who" data-arg="' + k + '">' + l + '</button>').join('') + '</span></h3>' +
        '<div class="sx-kan">' + col('todo', 'To do') + col('doing', 'Doing') + col('done', 'Done') + '</div><div class="sx-row"><button class="sx-btn small" data-act="addtask">' + svg('plus').outerHTML + 'Add a task</button><button class="sx-btn small" data-act="soon" data-arg="Splitting tasks fairly">' + svg('sparkle').outerHTML + 'Split the tasks fairly</button></div></section></div>' +
      '<div class="sx-col"><section class="sx-card coach"><h3>' + sxIc('bulb') + 'Coach</h3><p>The slides are behind: 2 of 5 done and due Sunday. Lena has the most open tasks (3), Mia has finished hers: she could take “Slides 1–3”. Your calendar is free on Saturday from 10:00.</p><button class="sx-btn small" data-act="soon" data-arg="Coach actions">' + svg('cal').outerHTML + 'Block Sat 10:00–12:00</button></section>' +
        '<section class="sx-card"><h3>' + sxIc('clock', 'violet') + 'Activity</h3>' + p.feed.map(([m, t, w]) => '<div class="sx-feed">' + ava(m) + '<span><b>' + PEOPLE[m][0] + '</b> ' + sxEsc(t) + '<small>' + w + '</small></span></div>').join('') + '</section></div></div>';
  } else {
    const plan = [['Mon 10', [['done', 'Learn: Mitose recap', '25 min · 8/10'], ['cls', 'Bio lesson', '10:15']]], ['Tue 11', [['todo', 'Learn: Meiose I', '30 min · page “Meiose”'], ['added', 'Extra: Meiose quiz', 'added by the coach']]],
      ['Wed 12', [['todo', 'Summary: Meiose', '20 min · Learn → Summary'], ['group', 'Quiz each other', 'with Lena · 17:00']]], ['Thu 13', [['todo', 'Mixed quiz, all topics', '30 min · like the test']]], ['Fri 14', [['exam', p.name.split(':')[0], '08:20 · weight ×2']]]];
    body = conn([['blue', 'cal', 'Calendar', '4 study sessions · test ' + p.due], ['green', 'trend', 'Grades', 'you need 5.25 for your goal 5.0'], ['violet', 'learn', 'Learn', p.ready.me + '% ready · 9 quizzes'], ['amber', 'page', 'Notes', '5 pages · 2 sound recordings']]) +
      '<div class="sx-cols"><div class="sx-col"><section class="sx-card"><h3>' + sxIc('cal', 'blue') + 'Plan until the test<span class="sx-more">sessions are in your calendar</span></h3><div class="sx-plan">' +
        plan.map(([d, ss], i) => '<div class="sx-day' + (i === plan.length - 1 ? ' test' : '') + '"><h4><b>' + d.split(' ')[0] + '</b>' + d.split(' ')[1] + ' Nov</h4>' + ss.map(([k, t, s]) => '<div class="sx-ss ' + k + '">' + sxEsc(t) + '<small>' + sxEsc(s) + '</small></div>').join('') + '</div>').join('') + '</div></section>' +
        '<section class="sx-card"><h3>' + sxIc('users', 'blue') + 'Studying together<span class="sx-more">readiness for this test</span></h3>' +
          p.members.map((m) => '<div class="sx-mate small">' + ava(m) + '<b>' + PEOPLE[m][0] + '</b><div class="sx-track big"><i style="width:' + p.ready[m] + '%;background:' + (m === 'me' ? 'var(--accent)' : PEOPLE[m][1]) + '"></i></div><span class="pc">' + p.ready[m] + '%</span></div>').join('') +
          '<div class="sx-team">' + team + '</div></section>' +
        '<section class="sx-card"><h3>' + sxIc('target', 'violet') + 'Topics</h3>' + [['Mitose', 82, 'green'], ['Meiose I', 41, 'red'], ['Meiose II', 35, 'red'], ['Crossing-over', 58, 'amber']].map(([n, v, c]) => '<div class="sx-topic"><b>' + n + '</b><div class="sx-track"><i class="' + c + '" style="width:' + v + '%"></i></div><span>' + v + '%</span></div>').join('') + '</section></div>' +
      '<div class="sx-col"><section class="sx-card coach"><h3>' + sxIc('bulb') + 'Coach</h3><p>You’re <b>' + p.ready.me + '% ready</b>. Meiose I and II are still weak, so I added one short quiz on Tuesday. ' + (p.members.includes('lena') ? 'Lena is strong on Meiose: the session on Wednesday where you quiz each other helps you both.' : '') + '</p></section>' +
        '<section class="sx-card"><h3>' + sxIc('check', 'green') + 'Do next</h3><div class="sx-act">' + svg('learn').outerHTML + 'Quiz: Meiose I, 10 questions<button class="sx-btn small" data-act="soon" data-arg="Starting quizzes from here">Start</button></div><div class="sx-act">' + svg('page').outerHTML + 'Write a summary of “Meiose”<button class="sx-btn small" data-act="soon" data-arg="Opening pages from here">Open</button></div><div class="sx-act">' + svg('mic').outerHTML + 'Listen again: Tuesday’s class, 08:12<button class="sx-btn small" data-act="soon" data-arg="Playing recordings from here">Play</button></div></section>' +
        '<section class="sx-card"><h3>' + sxIc('trend', 'blue') + 'After the test</h3><p class="muted sx-p">When the date has passed, Cortex Scribe asks for your grade. It goes into ' + p.subj + '’s grades, and the project closes with a short review.</p></section></div></div>';
  }
  secView.innerHTML = '<div class="sx sx-projects">' + side + '<div class="sx-pmain">' +
    '<div class="sx-top"><span class="sx-ic big ' + (p.kind === 'task' ? 'red' : 'green') + '">' + svg(p.kind === 'task' ? 'checklist' : 'learn').outerHTML + '</span><div class="sx-hello"><h1>' + sxEsc(p.name) + '</h1><p>' + (p.kind === 'task' ? 'Task project' : 'Study project') + ' · subject <b style="color:' + p.c + '">' + p.subj + '</b> · ' + (p.kind === 'task' ? 'due ' : 'test on ') + p.due + ' ' + PREVIEW + '</p></div>' +
      (p.kind === 'task' ? '<button class="sx-btn" data-act="soon" data-arg="Breaking projects into tasks">' + svg('sparkle').outerHTML + 'Break it into tasks</button><button class="sx-btn primary" data-act="addtask">' + svg('plus').outerHTML + 'Add a task</button>'
        : '<button class="sx-btn" data-act="soon" data-arg="Planning">' + svg('sparkle').outerHTML + 'Plan it for me</button><button class="sx-btn primary" data-act="soon" data-arg="Study sessions">' + svg('play').outerHTML + 'Start next session</button>') + '</div>' + body + '</div></div>';
}
const curTaskProj = () => PROJ.find((x) => x.id === projSel.task && x.kind === 'task') || PROJ.find((x) => x.kind === 'task');
Object.assign(SEC_ACTS, {
  proj: (id) => { const p = PROJ.find((x) => x.id === id); if (p) { projSel[p.kind] = id; projWho = 'all'; renderSection(); } },
  who: (k) => { projWho = k; renderSection(); },
  tick: (i) => { const p = curTaskProj(), t = p.tasks[+i]; if (!t) return; t[2] = t[2] === 'done' ? 'todo' : 'done'; if (t[2] === 'done') p.feed.unshift([t[1], 'finished “' + t[0] + '”', 'just now']); renderSection(); },
  move: (i) => { const t = curTaskProj().tasks[+i]; if (t) { t[2] = t[2] === 'todo' ? 'doing' : 'done'; renderSection(); } },
  assign: (i, b) => { const p = curTaskProj(), t = p.tasks[+i]; if (!t) return; openMenu(b, [{ label: 'Who does “' + t[0] + '”?', header: true }, ...p.members.map((m) => ({ label: PEOPLE[m][0], checked: t[1] === m, fn: () => { t[1] = m; renderSection(); } }))]); },
  addtask: async () => { const p = curTaskProj(); const n = await promptModal('New task for “' + p.name + '”', 'Task', '', 'Add'); if (n && n.trim()) { p.tasks.push([n.trim().slice(0, 80), projWho !== 'all' ? projWho : 'me', 'todo']); renderSection(); } },
});

/* ---------- Calendar and Coding logbook: what's coming ---------- */
function renderCalendarPreview() {
  const days = [['10', 'Mon', [[0, 34, 'blue', 'Mathe'], [40, 34, 'red', 'Bio'], [144, 30, 'violet', 'Study: Bio quiz']]], ['11', 'Tue', [[20, 50, 'teal', 'Informatik'], [110, 30, 'amber', 'English']]], ['12', 'Wed', [[0, 34, 'red', 'Bio'], [80, 30, 'blue', 'Mathe'], [150, 40, 'violet', 'Quiz with Lena']]],
    ['13', 'Thu', [[30, 40, 'teal', 'Coding club'], [120, 30, 'amber', 'Slides due']]], ['14', 'Fri', [[10, 46, 'exam', 'Bio test'], [100, 34, 'blue', 'Mathe']]], ['15', 'Sat', [[60, 60, 'teal', 'Logbook']]], ['16', 'Sun', [[120, 34, 'violet', 'Plan week']]]];
  secView.innerHTML = '<div class="sx"><div class="sx-top"><div class="sx-hello"><h1>Calendar</h1><p>This week ' + PREVIEW + '</p></div><div class="sx-tabs"><button>Day</button><button aria-selected="true">Week</button><button>Month</button></div></div>' +
    '<section class="sx-card"><div class="sx-week"><div></div>' + days.map(([d, n], i) => '<div class="h' + (i === 0 ? ' tdy' : '') + '"><b>' + d + '</b>' + n + '</div>').join('') +
      '<div class="hours">' + ['08', '10', '12', '14', '16', '18'].map((x) => '<span>' + x + '</span>').join('') + '</div>' + days.map(([, , evs]) => '<div class="day">' + evs.map(([t, hh, c, l]) => '<div class="e ' + c + '" style="top:' + t + 'px;height:' + hh + 'px">' + l + '</div>').join('') + '</div>').join('') + '</div></section>' +
    '<section class="sx-card"><p class="muted sx-p">Coming next: your timetable, tests from your subjects, deadlines from your projects and the study sessions the coach plans, all in one calendar. Drag a session to move it.</p></section></div>';
}
function renderLogbookPreview() {
  secView.innerHTML = '<div class="sx"><div class="sx-top"><div class="sx-hello"><h1>Coding logbook</h1><p>What you built each day ' + PREVIEW + '</p></div><button class="sx-btn primary" data-act="soon" data-arg="Logbook entries">' + svg('plus').outerHTML + 'Add today’s entry</button></div>' +
    '<div class="sx-cols"><div class="sx-col"><section class="sx-card"><h3>' + sxIc('code', 'teal') + 'Entries<span class="sx-more">🔥 12-day streak</span></h3><div class="sx-log big"><span>Nov 9</span><span><b>Cortex Scribe</b> · jump tags and the lasso <code>+1,240</code><small>2 h 10 min · 3 commits</small></span><span>Nov 8</span><span><b>Cortex Scribe</b> · colour styles, block folders <code>+980</code><small>1 h 40 min</small></span><span>Nov 7</span><span><b>School project</b> · login page in React<small>55 min · with Luca</small></span></div></section></div>' +
    '<div class="sx-col"><section class="sx-card"><h3>' + sxIc('clock', 'teal') + 'This week</h3><div class="sx-bars">' + [60, 85, 40, 100, 70, 15, 8].map((v, i) => '<i class="' + (i > 4 ? 'off' : '') + '" style="height:' + v + '%"></i>').join('') + '</div><div class="sx-days"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div></section></div></div></div>';
}
renderSecNav();
/* the sidebar's tool buttons in two short columns, so the notebook list keeps its room under the section list
   (the full names stay as tooltips). Runs after every module has added its button. The AI button keeps its full width. */
setTimeout(() => {
  const short = { joinBtn: 'Join a page', padBtn: 'Drawing pad', blocksBtn: 'Blocks', libraryBtn: 'Recordings', trashBtn: 'Deleted', backupBtn: 'Backup', helpBtn: 'Help' };
  for (const [id, label] of Object.entries(short)) {
    const b = document.getElementById(id); if (!b) continue;
    const full = b.textContent.trim();
    [...b.childNodes].filter((n) => n.nodeType === 3).forEach((n) => n.remove());
    if (!b.querySelector('svg')) b.prepend(svg('info'));
    b.append(h('span', null, label)); b.title = full; b.setAttribute('aria-label', full);
  }
  const f = $('#side .side-foot'); if (f) f.classList.add('compact');
});

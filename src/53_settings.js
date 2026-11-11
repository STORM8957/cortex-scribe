/* ================= ⚙ Settings: the whole app's settings in one place =================
   Sidebar → Settings (next to Help) and View → Settings. Background (black, white, navy blue, like the device),
   the accent colour (the red of buttons, chosen items and highlights: red, pink, blue, green or black), the intro,
   the coming sections, AI settings. The accent is the pref 'accent'; red is the app's own colour (no override). */
const ACCENTS = {
  red: { label: 'Red', dark: ['#E5383B', '#FFFFFF', '#3B1517', '#FF7B7B'], light: ['#D92D2D', '#FFFFFF', '#FBE4E4', '#C21F1F'] },
  pink: { label: 'Pink', dark: ['#FF5FA2', '#1A0710', '#3E1729', '#FF8CBF'], light: ['#D6337A', '#FFFFFF', '#FCE3EE', '#B8235F'] },
  blue: { label: 'Blue', dark: ['#4C8DFF', '#06101F', '#14274A', '#8AB6FF'], light: ['#2563EB', '#FFFFFF', '#E3ECFD', '#1D4FC4'] },
  green: { label: 'Green', dark: ['#2FBF71', '#04140B', '#13331F', '#6FD48F'], light: ['#168A4A', '#FFFFFF', '#E2F4E9', '#11703C'] },
  black: { label: 'Black', dark: ['#EDEDF0', '#111113', '#2B2B30', '#DADADF'], light: ['#141416', '#FFFFFF', '#E7E7EA', '#141416'] },
};
const isDarkTheme = () => { const t = prefs.get('theme', 'dark'); return t === 'dark' || t === 'navy' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); };
function applyAccent() {
  const k = prefs.get('accent', 'red'), a = ACCENTS[k], st = document.documentElement.style;
  const vars = ['--accent', '--accent-ink', '--accent-soft', '--link', '--magic', '--magic-soft'];
  if (!a || k === 'red') { for (const v of vars) st.removeProperty(v); }
  else { const c = isDarkTheme() ? a.dark : a.light; [c[0], c[1], c[2], c[3], c[0], c[2]].forEach((x, i) => st.setProperty(vars[i], x)); }   // the chips' “magic” colour follows too
  document.documentElement.dataset.accent = ACCENTS[k] ? k : 'red';
}
applyAccent();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyAccent); } catch {}

function settingsModal() {
  const body = h('div', { class: 'settings' });
  const render = () => {
    body.textContent = '';
    const theme = prefs.get('theme', 'dark'), accent = prefs.get('accent', 'red');
    const seg = (items, cur0, fn) => h('div', { class: 'set-seg', role: 'group' }, items.map(([v, l]) => h('button', { class: 'chip', 'aria-pressed': String(cur0 === v), onclick: () => { fn(v); render(); } }, l)));
    const check = (label, on, fn, hint) => { const c = h('input', { type: 'checkbox', checked: on ? true : null }); c.addEventListener('change', () => fn(c.checked)); return h('label', { class: 'set-check', title: hint || '' }, c, h('span', null, label)); };
    body.append(
      h('h3', null, 'Background'),
      seg([['dark', 'Black'], ['light', 'White'], ['navy', 'Navy blue'], ['auto', 'Like my device']], theme, (v) => { prefs.set('theme', v); applyTheme(); }),
      h('h3', null, 'Accent colour'),
      h('p', { class: 'hint' }, 'The colour of buttons, chosen items and highlights in the app.'),
      h('div', { class: 'set-accents', role: 'group', 'aria-label': 'Accent colour' }, Object.entries(ACCENTS).map(([k, a]) => h('button', { class: 'set-accent', 'aria-pressed': String(accent === k), 'data-accent': k, title: a.label, onclick: () => { prefs.set('accent', k); applyAccent(); render(); } },
        h('span', { class: 'dot', style: { background: (isDarkTheme() ? a.dark : a.light)[0] } }), h('span', null, a.label)))),
      h('h3', null, 'The app'),
      check('Intro animation when the app opens', prefs.get('intro', true), (v) => { prefs.set('intro', v); }),
      check('Coming sections (preview): Subjects & grades, Calendar, projects, Coding logbook', showPreviews(), (v) => { prefs.set('previews', v); renderSecNav(); if (secOpen) renderSection(); }, 'Screens with example data that show what is coming.'),
      h('h3', null, 'AI'),
      h('div', { class: 'btnrow' }, h('button', { class: 'btn small', onclick: () => { m.close(); aiSettingsModal(); } }, svg('sparkle'), 'AI settings')));
  };
  render();
  const m = modal({ title: 'Settings', body: [body], actions: [{ label: 'Done', kind: 'primary' }] });
}
$('#helpBtn').after(h('button', { class: 'btn ghost', id: 'settingsBtn', onclick: settingsModal }, svg('cog'), 'Settings'));

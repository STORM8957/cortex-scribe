
/* ================= Stay in place on screen (pinning) =================
   A pinned object is drawn on a screen-fixed layer (view.pinSurf) instead of the page,
   so it stays where it is while you scroll, pan or zoom. Its x/y are then screen pixels
   inside the work area; `pin.k` remembers the zoom at the moment it was pinned.
   Unpinning puts it back on the page under where it is now, at the same size on screen. */
function pinSel() {
  if (!sel.has || !cur || cur.ro || !view || !view.pinSurf) return;
  const s0 = sel.surf, ps = view.pinSurf, pr = ps.el.getBoundingClientRect(), k = s0.k();
  const list = selObjs().filter((o) => o.t !== 'conn' && o.t !== 'group' && !o.pin);
  if (!list.length) return;
  pushUndo();
  for (const o of list) {
    const c = s0.toClient(o.x, o.y);
    o.pin = { k: Math.round(k * 1000) / 1000 };
    o.x = Math.round(c.x - pr.left); o.y = Math.round(c.y - pr.top);
    o.w = Math.round((o.w || 0) * k); if (o.h) o.h = Math.round(o.h * k);
    o.sc = Math.round((o.sc || 1) * k * 1000) / 1000;
    changed(o);
  }
  clearSel(); view.renderAll(); saveDoc('main');
  toast((list.length === 1 ? 'It stays' : 'They stay') + ' in place on your screen while you scroll or pan. Drag to move; right-click → Unpin puts it back on the page.');
}
function unpinSel() {
  if (!sel.has || !cur || cur.ro || !view) return;
  const list = selObjs().filter((o) => o.pin); if (!list.length) return;
  const pr = view.pinSurf.el.getBoundingClientRect();
  pushUndo();
  for (const o of list) {
    const cx = pr.left + o.x, cy = pr.top + o.y, mx = cx + (o.w || 0) / 2, my = cy + (o.h || 0) / 2;
    let s = view.surf(0);
    if (view.kind === 'a4') {
      let best = Infinity;
      for (const t of view.surfaces) { if (!t) continue; const r = t.el.getBoundingClientRect(); const d = my < r.top ? r.top - my : my > r.bottom ? my - r.bottom : 0; if (d < best) { best = d; s = t; } }
    }
    const k = s.k() || 1, p = s.toLocal(cx, cy);
    o.x = Math.round(p.x); o.y = Math.round(p.y);
    o.w = Math.round((o.w || 0) / k); if (o.h) o.h = Math.round(o.h / k);
    o.sc = Math.round((o.sc || 1) / k * 1000) / 1000; if (Math.abs(o.sc - 1) < 0.02) delete o.sc;
    o.sh = s.sheet; delete o.pin;
    changed(o);
  }
  clearSel(); view.renderAll(); saveDoc('main');
  toast('Back on the page.');
}

/* ================= Language picker (scroll or search) ================= */
const LANGS = [['English', 'English'], ['German', 'Deutsch'], ['Swiss German', 'Schwiizerdütsch'], ['French', 'Français'], ['Italian', 'Italiano'], ['Spanish', 'Español'], ['Portuguese', 'Português'], ['Dutch', 'Nederlands'],
  ['Turkish', 'Türkçe'], ['Kurdish (Kurmanji)', 'Kurmancî'], ['Kurdish (Sorani)', 'کوردی'], ['Albanian', 'Shqip'], ['Serbian', 'Српски'], ['Croatian', 'Hrvatski'], ['Bosnian', 'Bosanski'], ['Slovenian', 'Slovenščina'],
  ['Macedonian', 'Македонски'], ['Bulgarian', 'Български'], ['Romanian', 'Română'], ['Hungarian', 'Magyar'], ['Polish', 'Polski'], ['Czech', 'Čeština'], ['Slovak', 'Slovenčina'], ['Ukrainian', 'Українська'],
  ['Russian', 'Русский'], ['Belarusian', 'Беларуская'], ['Lithuanian', 'Lietuvių'], ['Latvian', 'Latviešu'], ['Estonian', 'Eesti'], ['Finnish', 'Suomi'], ['Swedish', 'Svenska'], ['Norwegian', 'Norsk'],
  ['Danish', 'Dansk'], ['Icelandic', 'Íslenska'], ['Greek', 'Ελληνικά'], ['Arabic', 'العربية'], ['Hebrew', 'עברית'], ['Persian', 'فارسی'], ['Urdu', 'اردو'], ['Pashto', 'پښتو'],
  ['Hindi', 'हिन्दी'], ['Bengali', 'বাংলা'], ['Punjabi', 'ਪੰਜਾਬੀ'], ['Gujarati', 'ગુજરાતી'], ['Marathi', 'मराठी'], ['Tamil', 'தமிழ்'], ['Telugu', 'తెలుగు'], ['Kannada', 'ಕನ್ನಡ'],
  ['Malayalam', 'മലയാളം'], ['Nepali', 'नेपाली'], ['Sinhala', 'සිංහල'], ['Chinese (Simplified)', '简体中文'], ['Chinese (Traditional)', '繁體中文'], ['Cantonese', '廣東話'], ['Japanese', '日本語'], ['Korean', '한국어'],
  ['Vietnamese', 'Tiếng Việt'], ['Thai', 'ไทย'], ['Khmer', 'ខ្មែរ'], ['Lao', 'ລາວ'], ['Burmese', 'မြန်မာ'], ['Indonesian', 'Bahasa Indonesia'], ['Malay', 'Bahasa Melayu'], ['Filipino', 'Filipino'],
  ['Swahili', 'Kiswahili'], ['Amharic', 'አማርኛ'], ['Tigrinya', 'ትግርኛ'], ['Somali', 'Soomaali'], ['Yoruba', 'Yorùbá'], ['Igbo', 'Igbo'], ['Hausa', 'Hausa'], ['Zulu', 'isiZulu'],
  ['Xhosa', 'isiXhosa'], ['Afrikaans', 'Afrikaans'], ['Irish', 'Gaeilge'], ['Welsh', 'Cymraeg'], ['Scottish Gaelic', 'Gàidhlig'], ['Catalan', 'Català'], ['Basque', 'Euskara'], ['Galician', 'Galego'],
  ['Maltese', 'Malti'], ['Luxembourgish', 'Lëtzebuergesch'], ['Romansh', 'Rumantsch'], ['Armenian', 'Հայերեն'], ['Georgian', 'ქართული'], ['Azerbaijani', 'Azərbaycanca'], ['Kazakh', 'Қазақша'], ['Uzbek', 'Oʻzbekcha'],
  ['Kyrgyz', 'Кыргызча'], ['Tajik', 'Тоҷикӣ'], ['Turkmen', 'Türkmençe'], ['Mongolian', 'Монгол'], ['Tibetan', 'བོད་ཡིག'], ['Maori', 'Māori'], ['Samoan', 'Gagana Samoa'], ['Haitian Creole', 'Kreyòl ayisyen'],
  ['Latin', 'Latina'], ['Esperanto', 'Esperanto']];
const LANG_DE = { English: 'Englisch', German: 'Deutsch', 'Swiss German': 'Schweizerdeutsch', French: 'Französisch', Italian: 'Italienisch', Spanish: 'Spanisch', Portuguese: 'Portugiesisch', Dutch: 'Niederländisch Holländisch',
  Turkish: 'Türkisch', 'Kurdish (Kurmanji)': 'Kurdisch', 'Kurdish (Sorani)': 'Kurdisch', Albanian: 'Albanisch', Serbian: 'Serbisch', Croatian: 'Kroatisch', Bosnian: 'Bosnisch', Slovenian: 'Slowenisch', Macedonian: 'Mazedonisch',
  Bulgarian: 'Bulgarisch', Romanian: 'Rumänisch', Hungarian: 'Ungarisch', Polish: 'Polnisch', Czech: 'Tschechisch', Slovak: 'Slowakisch', Ukrainian: 'Ukrainisch', Russian: 'Russisch', Belarusian: 'Weissrussisch Belarussisch',
  Lithuanian: 'Litauisch', Latvian: 'Lettisch', Estonian: 'Estnisch', Finnish: 'Finnisch', Swedish: 'Schwedisch', Norwegian: 'Norwegisch', Danish: 'Dänisch', Icelandic: 'Isländisch', Greek: 'Griechisch', Arabic: 'Arabisch',
  Hebrew: 'Hebräisch', Persian: 'Persisch Farsi', Urdu: 'Urdu', Pashto: 'Paschtu', Hindi: 'Hindi', Bengali: 'Bengalisch', Punjabi: 'Pandschabi', Tamil: 'Tamilisch', Nepali: 'Nepalesisch', Sinhala: 'Singhalesisch',
  'Chinese (Simplified)': 'Chinesisch', 'Chinese (Traditional)': 'Chinesisch', Cantonese: 'Kantonesisch', Japanese: 'Japanisch', Korean: 'Koreanisch', Vietnamese: 'Vietnamesisch', Thai: 'Thailändisch', Indonesian: 'Indonesisch',
  Malay: 'Malaiisch', Swahili: 'Suaheli', Amharic: 'Amharisch', Tigrinya: 'Tigrinisch', Somali: 'Somalisch', Afrikaans: 'Afrikaans', Irish: 'Irisch', Welsh: 'Walisisch', 'Scottish Gaelic': 'Schottisch-Gälisch',
  Catalan: 'Katalanisch', Basque: 'Baskisch', Galician: 'Galicisch', Maltese: 'Maltesisch', Luxembourgish: 'Luxemburgisch', Romansh: 'Rätoromanisch Romanisch', Armenian: 'Armenisch', Georgian: 'Georgisch',
  Azerbaijani: 'Aserbaidschanisch', Kazakh: 'Kasachisch', Uzbek: 'Usbekisch', Kyrgyz: 'Kirgisisch', Tajik: 'Tadschikisch', Turkmen: 'Turkmenisch', Mongolian: 'Mongolisch', Tibetan: 'Tibetisch', Latin: 'Latein' };
const langLabel = (n) => (n === 'auto' || !n ? 'Auto-detect' : n);
let langPop = null;
function closeLangPop() { if (langPop) { langPop.remove(); langPop = null; document.removeEventListener('pointerdown', langOutside, true); } }
function langOutside(e) { if (langPop && !langPop.contains(e.target)) closeLangPop(); }
function langPicker(anchor, current, onPick, opts = {}) {
  closeLangPop();
  const list = h('div', { class: 'lp-list', role: 'listbox', 'aria-label': opts.title || 'Languages' });
  const search = h('input', { type: 'search', class: 'lp-search', placeholder: 'Search a language…', 'aria-label': 'Search a language', autocomplete: 'off' });
  const all = (opts.auto ? [['auto', 'Detect the language automatically']] : []).concat(LANGS);
  const render = () => {
    const q = fold(search.value.trim()); list.textContent = '';
    const hits = all.filter(([n, nat]) => !q || fold(n).includes(q) || fold(nat).includes(q) || fold(LANG_DE[n] || '').includes(q));
    for (const [n, nat] of hits) list.append(h('button', { class: 'lp-item', type: 'button', role: 'option', 'aria-selected': String(n === current), onclick: () => { closeLangPop(); onPick(n); } },
      h('span', null, n === 'auto' ? nat : n), n !== 'auto' && nat !== n ? h('small', null, nat) : null, n === current ? svg('check') : null));
    if (!hits.length) list.append(h('p', { class: 'hint', style: { padding: '8px 10px', margin: '0' } }, 'No language matches “' + search.value.trim() + '”.'));
  };
  search.addEventListener('input', render);
  search.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closeLangPop(); anchor.focus && anchor.focus(); }
    else if (e.key === 'Enter') { e.preventDefault(); const b = list.querySelector('.lp-item'); if (b) b.click(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); const b = list.querySelector('.lp-item'); if (b) b.focus(); }
  });
  list.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const items = [...list.querySelectorAll('.lp-item')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[i]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? items[i - 1] : search).focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeLangPop(); }
  });
  const pop = h('div', { class: 'menu langpop', role: 'dialog', 'aria-label': opts.title || 'Choose a language' }, h('div', { class: 'mlabel' }, opts.title || 'Language'), search, list);
  document.body.append(pop); render(); placePopup(pop, anchor);
  langPop = pop; search.focus({ preventScroll: true });
  const on = list.querySelector('[aria-selected="true"]'); if (on) on.scrollIntoView({ block: 'center' });
  setTimeout(() => document.addEventListener('pointerdown', langOutside, true));
}
function langCog(getL, setL, opts) {
  const b = h('button', { class: 'lang-cog', type: 'button', title: (opts.title || 'Language') + ': choose', 'aria-label': (opts.title || 'Language') + ': ' + langLabel(getL()) + '. Choose another' }, h('span', null, langLabel(getL())), svg('cog'));
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); langPicker(b, getL(), (v) => { setL(v); b.firstChild.textContent = langLabel(v); b.setAttribute('aria-label', (opts.title || 'Language') + ': ' + langLabel(v) + '. Choose another'); }, opts); });
  return b;
}
function corrRule(lang) {
  return 'Correct spelling, grammar and punctuation mistakes only' + (lang && lang !== 'auto' ? ', following the rules of ' + lang + ' (the text is written in ' + lang + ')' : ', in whatever language the text is written in') +
    '. Do not translate, rephrase, shorten or add anything. Keep formatting, line breaks, links and structure exactly.';
}
const translateRule = (lang) => 'Finally, translate all of the text into ' + (lang || 'English') + ' (this overrides any instruction to keep the original language). Keep the formatting and structure exactly.';

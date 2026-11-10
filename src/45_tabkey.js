/* ================= Tab like in Word =================
   In page text and in text boxes: Tab at the start of a paragraph (or with several paragraphs
   selected) moves them to the right, Shift+Tab back; in a list it nests the item; in a table it goes
   to the next cell (and adds a row after the last one); in the middle of a line it adds a tab stop
   (span.tab, every 48 px). Shift+Tab right after a tab removes it. Mind maps keep their own Tab. */
function caretAtBlockStart(b, r) {
  if (!b) return false;
  const pre = document.createRange();
  try { pre.setStart(b, 0); pre.setEnd(r.startContainer, r.startOffset); } catch { return false; }
  return pre.toString().replace(/​/g, '') === '';
}
function removeTabBefore(r) {
  if (!r.collapsed) return false;
  const n = r.startContainer, o = r.startOffset;
  if (n.nodeType === 3 && o > 0 && n.data[o - 1] === '\t') { n.deleteData(o - 1, 1); if (!n.data && n.parentElement && n.parentElement.classList.contains('tab')) n.parentElement.remove(); return true; }
  let prev = n.nodeType === 3 ? (o === 0 ? n.previousSibling || (n.parentElement && n.parentElement.classList.contains('tab') ? n.parentElement : null) : null) : n.childNodes[o - 1];
  if (prev && prev.nodeType === 1 && prev.classList.contains('tab')) { prev.remove(); return true; }
  return false;
}
function tabToCell(cell, back, ed) {
  const table = cell.closest('table'); if (!table) return;
  let cells = [...table.querySelectorAll('td,th')];
  let i = cells.indexOf(cell) + (back ? -1 : 1);
  if (i < 0) return;
  if (i >= cells.length) {
    const last = cells[cells.length - 1].closest('tr'), nr = last.cloneNode(true);
    nr.querySelectorAll('td,th').forEach((c) => { c.innerHTML = '<br>'; });
    last.after(nr); cells = [...table.querySelectorAll('td,th')];
  }
  const t = cells[i], r = document.createRange();
  r.selectNodeContents(t); if (!t.textContent.trim()) r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  edChanged(ed);
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  const ed = e.target && e.target.closest && e.target.closest('.flow[contenteditable="true"],.otext[contenteditable="true"]');
  if (!ed || !work.contains(ed) || ed.closest('.obj-mm') || !cur || cur.ro) return;
  const s = getSelection(); if (!s.rangeCount) return;
  const r = s.getRangeAt(0); if (!ed.contains(r.startContainer)) return;
  e.preventDefault();
  const back = e.shiftKey, node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
  const cell = node && node.closest('td,th');
  if (cell && ed.contains(cell)) return tabToCell(cell, back, ed);
  const li = node && node.closest('li');
  if (li && ed.contains(li)) { document.execCommand(back ? 'outdent' : 'indent'); edChanged(ed); return; }
  if (back && removeTabBefore(r)) { edChanged(ed); return; }
  let blocks = blocksInSel(ed);
  if (!blocks.length && !back && caretAtBlockStart(ed, r)) { document.execCommand('formatBlock', false, 'p'); blocks = blocksInSel(ed); if (blocks.length) { blocks[0].style.marginLeft = '48px'; edChanged(ed); return; } }
  if (blocks.length && (back || blocks.length > 1 || (r.collapsed && caretAtBlockStart(blocks[0], r)))) {
    for (const b of blocks) { const m = (parseInt(b.style.marginLeft, 10) || 0) + (back ? -48 : 48); b.style.marginLeft = m > 0 ? Math.min(m, 384) + 'px' : ''; }
    edChanged(ed); return;
  }
  document.execCommand('insertHTML', false, '<span class="tab">\t</span>');
  edChanged(ed);
}, true);


/* ================= backup: export everything / import =================
   One JSON file with all notebooks, pages, drawings, sources, chats, scores, fact checks,
   3D models and the pictures/recordings they use (embedded as data URLs).
   Format is described in ARCHITECTURE.md ("Export format"). */
const BACKUP_FORMAT = 1;
const MEDIA_RE = /(?:\/_blob\/[A-Za-z0-9_-]+|idb:[A-Za-z0-9_-]+|inkf:[A-Za-z0-9_-]+\.[a-z0-9]+)/g;
async function exportAll() {
  const prog = h('span', null, 'Collecting your notebooks…');
  const m = modal({ title: 'Export everything', body: [h('div', { class: 'busy' }, h('span', { class: 'spinner' }), prog)], actions: [] });
  try {
    await Saver.flushAll();
    const out = { app: 'Inkling', format: BACKUP_FORMAT, exported: new Date().toISOString(), tree: deep(tree.nodes), notes: {}, notebooks: {}, media: {}, prefs: {} };
    const nodes = Object.values(tree.nodes).filter(live);
    const notes = nodes.filter((n) => n.type === 'note');
    let i = 0;
    for (const n of notes) {
      prog.textContent = 'Pages: ' + (++i) + ' of ' + notes.length + '…';
      try {
        const d = await loadDocData(n.id);
        const main = cur && cur.id === n.id && doc ? serializeMain(doc, n.id) : serializeMain(d.main, n.id);
        const ink = cur && cur.id === n.id && doc ? doc.ink : d.ink;
        out.notes[n.id] = { main, ink };
        const fc = await Store.get('fc_' + n.id).catch(() => null);
        if (fc) out.notes[n.id].fc = fc;
      } catch (e) { console.error(e); }
    }
    for (const nb of nodes.filter((n) => n.type === 'folder' && !n.parent)) {
      prog.textContent = 'Notebook “' + nb.name + '”…';
      const g = (k) => Store.get(k + nb.id).catch(() => null);
      const [chat, studio, scores, srcs, models] = await Promise.all([g('chat_'), g('studio_'), g('scores_'), g('srcs_'), g('models_')]);
      const srctexts = {};
      for (const it of (srcs && srcs.items) || []) { const t = await Store.get('srct_' + it.id).catch(() => null); if (t) srctexts[it.id] = t; }
      out.notebooks[nb.id] = { chat, studio, scores, srcs, srctexts, models };
    }
    for (const k of ['theme', 'magic', 'inkColor', 'inkSize', 'hlColor', 'hlSize', 'autoTidy', 'padStyle', 'zoomScale', 'newKind']) out.prefs[k] = prefs.get(k, null);
    out.library = (await Store.get('media').catch(() => null)) || null;
    const bidx = await Store.get('blocks').catch(() => null);
    if (bidx && Array.isArray(bidx.items)) { out.blocks = { items: bidx.items, folders: Array.isArray(bidx.folders) ? bidx.folders : [], data: {} }; for (const b of bidx.items) { const d = await Store.get('block_' + b.id).catch(() => null); if (d) out.blocks.data[b.id] = d; } }
    const refs = [...new Set(JSON.stringify(out).match(MEDIA_RE) || [])];
    let j = 0, missing = 0;
    for (const r of refs) {
      prog.textContent = 'Pictures and recordings: ' + (++j) + ' of ' + refs.length + '…';
      const b = await Files.blob(r);
      if (b) out.media[r] = await toDataURL(b); else missing++;
    }
    prog.textContent = 'Saving the file…';
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const name = 'cortex-scribe-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    m.close();
    try {
      await Downloads.save(name, blob);
      toast('Backup ready: ' + notes.length + ' page' + (notes.length === 1 ? '' : 's') + ', ' + Object.keys(out.media).length + ' pictures and recordings.' + (missing ? ' ' + missing + ' file(s) couldn’t be included.' : ''));
    } catch (e) {
      toast(e && e.code === 'declined' ? 'Export cancelled.' : (Platform.desktop ? 'The file couldn’t be saved. Try again, or pick another folder.' : 'The file couldn’t be saved here. Try again.'));
    }
  } catch (e) { console.error(e); m.close(); toast('Export didn’t work. Your notes are safe. Try again.'); }
}
async function importAll(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast('That file isn’t a Cortex Scribe backup.'); }
  if (!data || !['Inkling', 'Cortex Scribe'].includes(data.app) || !data.tree || typeof data.tree !== 'object') return toast('That file isn’t a Cortex Scribe backup.');
  if ((data.format || 1) > BACKUP_FORMAT) return toast('This backup was made by a newer Cortex Scribe. Update the app first.');
  const srcNodes = Object.values(data.tree).filter((n) => n && !n.deleted && n.id);
  const nNotes = srcNodes.filter((n) => n.type === 'note').length, nBooks = srcNodes.filter((n) => n.type === 'folder' && !n.parent).length;
  const ok = await confirmModal('Import this backup?', 'It adds ' + nBooks + ' notebook' + (nBooks === 1 ? '' : 's') + ' with ' + nNotes + ' page' + (nNotes === 1 ? '' : 's') + ' as copies next to your current notebooks. Nothing you already have is changed or deleted.', 'Import');
  if (!ok) return;
  const prog = h('span', null, 'Importing…');
  const m = modal({ title: 'Importing your backup', body: [h('div', { class: 'busy' }, h('span', { class: 'spinner' }), prog)], actions: [] });
  try {
    const srcMap = {};
    const media = Object.entries(data.media || {});
    // desktop: pictures used on pages or in blocks stay inside them (they are drawn straight from the src)
    const onPages = Platform.desktop ? JSON.stringify([data.notes || {}, data.blocks || {}]) : '';
    let k = 0;
    for (const [src, durl] of media) {
      prog.textContent = 'Pictures and recordings: ' + (++k) + ' of ' + media.length + '…';
      if (onPages && /^data:image\//.test(durl) && onPages.includes(src)) { srcMap[src] = durl; continue; }
      const b = dataURLtoBlob(durl);
      srcMap[src] = (b && await Files.put(b)) || (/^data:image\//.test(durl) && durl.length < 150000 ? durl : null);
    }
    const fixMedia = (o) => (o == null ? o : JSON.parse(JSON.stringify(o).replace(MEDIA_RE, (r) => srcMap[r] || r)));
    const idMap = {};
    const nid = (old, p) => idMap[old] || (idMap[old] = newId(p));
    const names = new Set(kids(null).map((n) => n.name.toLowerCase()));
    for (const n of srcNodes) {
      const c = { ...n, id: nid(n.id, n.type === 'folder' ? 'f' : 'n'), parent: n.parent ? nid(n.parent, 'f') : null, updated: now(), order: (n.order || 0) };
      delete c.shared; delete c.owner; delete c.inbox;
      if (!n.parent && names.has(String(n.name).toLowerCase())) c.name = n.name + ' (imported)';
      tree.nodes[c.id] = c;
      if (c.type === 'folder') openSet.add(c.id);
    }
    persistOpen(); saveTree();
    const notes = Object.entries(data.notes || {});
    let i = 0;
    for (const [oldId, nd] of notes) {
      const id = idMap[oldId]; if (!id || !nd) continue;
      prog.textContent = 'Pages: ' + (++i) + ' of ' + notes.length + '…';
      const main = normalizeMain(fixMedia(nd.main), (data.tree[oldId] || {}).kind);
      await Store.set('note_' + id, serializeMain(main, id)).catch(() => toast('One page was too big to import.'));
      await Store.set('ink_' + id, { ink: fixMedia(nd.ink) || {}, u: now() }).catch(() => {});
      if (nd.fc) await Store.set('fc_' + id, nd.fc).catch(() => {});
    }
    for (const [oldNb, d] of Object.entries(data.notebooks || {})) {
      const nb = idMap[oldNb]; if (!nb || !d) continue;
      prog.textContent = 'Notebook extras…';
      if (d.chat) await Store.set('chat_' + nb, d.chat).catch(() => {});
      if (d.studio) await Store.set('studio_' + nb, d.studio).catch(() => {});
      if (d.scores) await Store.set('scores_' + nb, d.scores).catch(() => {});
      if (d.models) await Store.set('models_' + nb, fixMedia(d.models)).catch(() => {});
      if (d.srcs && Array.isArray(d.srcs.items)) {
        const items = [];
        for (const it of d.srcs.items) {
          const nidS = newId('src');
          const t = d.srctexts && d.srctexts[it.id];
          if (t) await Store.set('srct_' + nidS, fixMedia(t)).catch(() => {});
          items.push({ ...it, id: nidS });
        }
        await Store.set('srcs_' + nb, { items }).catch(() => {});
      }
    }
    if (data.library && Array.isArray(data.library.items)) {
      await loadMediaLib();
      const lib = fixMedia(data.library.items).map((it) => ({ ...it, page: it.page ? (idMap[it.page] || null) : null }));
      mediaLib.items = lib.concat(mediaLib.items); saveMediaLib();
    }
    if (data.blocks && Array.isArray(data.blocks.items)) {
      await loadBlocks();
      const fmap = {};
      for (const f of Array.isArray(data.blocks.folders) ? data.blocks.folders : []) if (f && f.id && f.name) fmap[f.id] = addBlockFolder(f.name).id;
      for (const b of data.blocks.items) { const d = data.blocks.data && data.blocks.data[b.id]; if (!d) continue; const nb = newId('bl'); try { await Store.set('block_' + nb, fixMedia(d)); const nbk = { ...b, id: nb }; if (b.folder && fmap[b.folder]) nbk.folder = fmap[b.folder]; else delete nbk.folder; blocksIndex.items.push(nbk); } catch {} }
      saveBlocksIndex();
    }
    await Saver.flushAll();
    m.close(); renderTree();
    toast('Imported ' + nBooks + ' notebook' + (nBooks === 1 ? '' : 's') + ' with ' + nNotes + ' page' + (nNotes === 1 ? '' : 's') + '.');
  } catch (e) { console.error(e); m.close(); toast('Import stopped partway. Pages that were already imported are kept.'); renderTree(); }
}
function backupModal() {
  modal({ title: 'Backup and move', body: [
    h('p', null, 'Export everything saves all your notebooks, pages, drawings, pictures, 3D models, recordings, sources, chats and scores into one file.'),
    h('p', { class: 'hint' }, 'Keep it as a backup, or bring your notes into the full Cortex Scribe app later. Importing adds the notebooks as copies, so nothing you have is overwritten.')],
    actions: [{ label: 'Close' }, { label: 'Import a backup…', fn: () => { $('#importIn').click(); } }, { label: 'Export everything', kind: 'primary', fn: () => { exportAll(); } }] });
}
$('#importIn').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importAll(f); });
$('#backupBtn').append(svg('upload'), 'Backup and move');
$('#backupBtn').addEventListener('click', backupModal);

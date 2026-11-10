// Stand-in for the desktop app (Tauri): window.__TAURI__ with the commands from src-tauri/src/lib.rs.
// "Files" live in localStorage under "deskfs:" so they survive a reload, like files on disk.
(() => {
  const K = 'deskfs:';
  const get = (p) => localStorage.getItem(K + p), set = (p, v) => localStorage.setItem(K + p, v), del = (p) => localStorage.removeItem(K + p);
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const okName = (n) => /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,159}$/.test(n || '');
  const listeners = {};
  window.__desk = { calls: [], saved: null, closed: false, opened: null, emit: (name) => (listeners[name] || []).forEach((cb) => cb({ event: name, payload: null })) };
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args, opts) => {
        __desk.calls.push(cmd);
        await new Promise((r) => setTimeout(r, 5));
        const hdr = (opts && opts.headers) || {};
        switch (cmd) {
          case 'store_info': return { folder: '/home/student/Documents/Inkling' };
          case 'store_get': if (!okName(args.key)) throw 'bad name'; return get('data/' + args.key);
          case 'store_set': if (!okName(args.key)) throw 'bad name'; set('data/' + args.key, args.data); return null;
          case 'store_del': del('data/' + args.key); return null;
          case 'file_put': if (!(args instanceof Uint8Array) || !okName(hdr['x-name'])) throw 'bad file'; set('media/' + hdr['x-name'], b64(args)); return null;
          case 'file_get': { const v = get('media/' + args.name); if (v == null) throw 'not found'; return unb64(v).buffer; }
          case 'save_as': __desk.saved = { name: decodeURIComponent(hdr['x-filename']), text: new TextDecoder().decode(args) }; return true;
          case 'close_now': __desk.closed = true; return null;
          case 'plugin:opener|open_url': __desk.opened = args.url; return null;
          case 'open_pad_window': if (!okName(args.code)) throw 'bad name'; __desk.padWindow = args.code; return null;
          case 'word_link_start': (__desk.wordStarts = __desk.wordStarts || []).push(args.port); return __desk.wordReply || { state: 'running', detail: '' };
          case 'word_find': (__desk.wordFinds = __desk.wordFinds || []).push(args.query); return (__desk.wordFind || []).filter((d) => !args.query || d.name.toLowerCase().includes(String(args.query).toLowerCase()));
          case 'word_open': (__desk.wordOpened = __desk.wordOpened || []).push(args.path); return null;
          case 'pad_link_start': (__desk.padStarts = __desk.padStarts || []).push(args.port); return __desk.padReply || { state: 'running', detail: '' };
        }
        throw 'unknown command ' + cmd;
      },
    },
    event: { listen: async (name, cb) => { (listeners[name] = listeners[name] || []).push(cb); return () => {}; } },
  };
})();

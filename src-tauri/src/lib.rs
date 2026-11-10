//! Inkling desktop app: the native side of the platform layer.
//!
//! The web app (src/, built into dist/index.html) calls these commands from
//! src/11_store.js and src/11b_platform.js. Everything is stored as plain files:
//!
//!   Documents/Inkling/data/<key>.json   one file per Store key (tree, note_<id>, ink_<id>, ...)
//!   Documents/Inkling/media/<name>      recordings, screenshots and files of windows ("inkf:<name>")
//!
//! Names coming from the page are checked so they can't leave these folders.
//!
//! AI requests (src/11c_ai.js) go through the http plugin, so AI servers on this computer
//! (Ollama, LM Studio) answer without having to allow web pages (CORS).

pub mod padrelay;

use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use percent_encoding::percent_decode_str;
use serde::Serialize;
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

/// The folder that holds everything: Documents/Inkling (or the app's data folder if there is no Documents).
fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    Ok(base.join("Inkling"))
}

fn sub(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = root(app)?.join(name);
    fs::create_dir_all(&dir).map_err(|e| format!("can't create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Only letters, digits, '_', '-' and '.' (not first), so a name can't point outside its folder.
fn safe(name: &str) -> Result<&str, String> {
    let ok = !name.is_empty()
        && name.len() <= 160
        && !name.starts_with('.')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
    if ok { Ok(name) } else { Err(format!("not an allowed name: {name:?}")) }
}

/// Write to a temporary file first, then swap it in, so a crash never leaves half a file.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("saving");
    let res = (|| {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        fs::rename(&tmp, path)
    })();
    res.map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("can't write {}: {e}", path.display())
    })
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Option<&'a str> {
    request.headers().get(name).and_then(|v| v.to_str().ok())
}

fn raw_body(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        _ => Err("expected the file's bytes".into()),
    }
}

#[derive(Serialize)]
struct StoreInfo {
    folder: String,
}

#[tauri::command]
fn store_info(app: AppHandle) -> Result<StoreInfo, String> {
    sub(&app, "data")?;
    sub(&app, "media")?;
    Ok(StoreInfo { folder: root(&app)?.display().to_string() })
}

/// Returns the stored JSON text, or nothing if the key was never saved.
#[tauri::command]
fn store_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let path = sub(&app, "data")?.join(format!("{}.json", safe(&key)?));
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("can't read {}: {e}", path.display())),
    }
}

#[tauri::command]
fn store_set(app: AppHandle, key: String, data: String) -> Result<(), String> {
    let path = sub(&app, "data")?.join(format!("{}.json", safe(&key)?));
    write_atomic(&path, data.as_bytes())
}

#[tauri::command]
fn store_del(app: AppHandle, key: String) -> Result<(), String> {
    let path = sub(&app, "data")?.join(format!("{}.json", safe(&key)?));
    match fs::remove_file(&path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// Saves a media file. The page sends the bytes and the file name in the "x-name" header.
#[tauri::command]
fn file_put(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let name = safe(header(&request, "x-name").ok_or("missing file name")?)?.to_string();
    let bytes = raw_body(&request)?;
    write_atomic(&sub(&app, "media")?.join(name), &bytes)
}

#[tauri::command]
fn file_get(app: AppHandle, name: String) -> Result<Response, String> {
    let path = sub(&app, "media")?.join(safe(&name)?);
    fs::read(&path).map(Response::new).map_err(|e| format!("can't read {}: {e}", path.display()))
}

/// "Save as…": shows the system's save dialog and writes the bytes there.
/// Returns false if the person cancels. The suggested name comes URL-encoded in "x-filename".
#[tauri::command]
async fn save_as(app: AppHandle, request: Request<'_>) -> Result<bool, String> {
    let suggested = header(&request, "x-filename")
        .map(|s| percent_decode_str(s).decode_utf8_lossy().replace(['/', '\\'], "_"))
        .unwrap_or_else(|| "inkling-file".into());
    let bytes = raw_body(&request)?;
    let mut dialog = app.dialog().file().set_file_name(&suggested);
    if let Ok(dir) = app.path().download_dir() {
        dialog = dialog.set_directory(dir);
    }
    let Some(target) = dialog.blocking_save_file() else { return Ok(false) };
    let path = target.into_path().map_err(|e| e.to_string())?;
    write_atomic(&path, &bytes)?;
    Ok(true)
}

/// Opens Inkling as a drawing pad in a second window (src/37_pad.js); both windows talk through BroadcastChannel.
/// Must be async: on Windows, creating a window in a synchronous command deadlocks (WebView2), and the new
/// window stays blank.
#[tauri::command]
async fn open_pad_window(app: AppHandle, code: String) -> Result<(), String> {
    let code = safe(&code)?.to_string();
    let label = format!("pad-{code}");
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(format!("index.html#pad={code}").into()))
        .title("Cortex Scribe pad")
        .inner_size(1100.0, 760.0)
        .min_inner_size(420.0, 420.0)
        .disable_drag_drop_handler()
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// The Word link's bridge (scripts/word-bridge.mjs, run with Node.js), started by the app so nobody has to run
/// `npm run word` by hand. Works in builds made from the source folder (npm run app): the script is looked up
/// where the app was built from. It runs without a window, writes to Documents/Inkling/word-link.log, and is
/// stopped when the app closes (only if the app started it).
struct WordBridge(std::sync::Mutex<Option<std::process::Child>>);

#[derive(Serialize)]
struct BridgeState {
    state: String,
    detail: String,
}

fn port_open(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(&std::net::SocketAddr::from(([127, 0, 0, 1], port)), Duration::from_millis(300)).is_ok()
}

/// Starts a Node.js helper from the source folder's scripts/ without a window, logging to Documents/Inkling/<log>.
/// "running" (already there), "started", "missing" (no script: an installed app), "no-node" or "failed" (detail = what it said).
fn start_helper(app: &AppHandle, slot: &std::sync::Mutex<Option<std::process::Child>>, script: &str, log_name: &str, port: u16, port_env: &str, missing: &str) -> Result<BridgeState, String> {
    let done = |s: &str, d: String| Ok(BridgeState { state: s.into(), detail: d });
    if port_open(port) {
        return done("running", String::new());
    }
    let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let script = repo.join("scripts").join(script);
    if !script.exists() {
        return done("missing", missing.into());
    }
    let log = root(app).ok().map(|r| r.join(log_name));
    let mut cmd = std::process::Command::new("node");
    cmd.arg(&script).current_dir(&repo).env(port_env, port.to_string());
    if let Some(l) = &log {
        if let Ok(f) = fs::File::create(l) {
            if let Ok(f2) = f.try_clone() {
                cmd.stdout(f).stderr(f2);
            }
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no black console window
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => return done("no-node", format!("Node.js couldn't be started ({e}). Is Node.js installed?")),
    };
    // it stops right away if something is missing (like the certificate): wait up to 3 seconds for it to listen
    for _ in 0..30 {
        if port_open(port) || matches!(child.try_wait(), Ok(Some(_))) {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    if let Ok(Some(_)) = child.try_wait() {
        let said = log.and_then(|l| fs::read_to_string(l).ok()).unwrap_or_default();
        return done("failed", said.trim().to_string());
    }
    if let Some(mut old) = slot.lock().map_err(|e| e.to_string())?.replace(child) {
        let _ = old.kill();
    }
    done("started", String::new())
}

#[tauri::command]
async fn word_link_start(app: AppHandle, state: tauri::State<'_, WordBridge>, port: Option<u16>) -> Result<BridgeState, String> {
    start_helper(&app, &state.0, "word-bridge.mjs", "word-link.log", port.unwrap_or(3456), "CS_WORD_PORT", "The Word link isn't in the installed app yet: it needs the Cortex Scribe folder (npm run word).")
}

/// The pad relay (padrelay.rs, inside the app: nothing else to install): a phone or tablet on the same Wi-Fi
/// becomes the drawing pad (the QR code in the pad dialog leads to it). It runs until the app closes.
struct PadRelay(std::sync::Mutex<Option<std::process::Child>>);
static PAD_RELAY_ON: std::sync::OnceLock<u16> = std::sync::OnceLock::new();

#[tauri::command]
async fn pad_link_start(app: AppHandle, port: Option<u16>) -> Result<BridgeState, String> {
    let port = port.unwrap_or(3457);
    let done = |s: &str, d: String| Ok(BridgeState { state: s.into(), detail: d });
    if PAD_RELAY_ON.get() == Some(&port) || port_open(port) {
        return done("running", String::new());
    }
    let Some(page) = app.asset_resolver().get("index.html".into()) else {
        return done("failed", "The app's page wasn't found.".into());
    };
    match padrelay::start(port, String::from_utf8_lossy(&page.bytes).to_string()) {
        Ok(()) => {
            let _ = PAD_RELAY_ON.set(port);
            done("started", String::new())
        }
        Err(e) => done("failed", format!("The pad link couldn't use port {port}: {e}")),
    }
}

/// A Word document found on this computer (word_find).
#[derive(Serialize)]
struct DocFile {
    name: String,
    path: String,
    folder: String,
    modified: u64,
}

fn find_docx(dir: &Path, depth: usize, q: &str, out: &mut Vec<DocFile>, seen: &mut usize) {
    if depth > 5 || *seen > 25_000 {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        *seen += 1;
        if *seen > 25_000 {
            return;
        }
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.starts_with("~$") || name == "node_modules" || name == "AppData" || name == "target" {
            continue;
        }
        let Ok(ft) = e.file_type() else { continue };   // links and junctions are not followed (no loops)
        let path = e.path();
        if ft.is_dir() {
            find_docx(&path, depth + 1, q, out, seen);
        } else if ft.is_file() && name.to_lowercase().ends_with(".docx") && (q.is_empty() || name.to_lowercase().contains(q)) {
            let modified = e.metadata().ok().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
            let folder = dir.file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
            out.push(DocFile { name, path: path.to_string_lossy().to_string(), folder, modified });
        }
    }
}

/// The Word documents (.docx) in Documents, Desktop, Downloads and OneDrive whose name contains `query`, newest first (at most 60).
#[tauri::command]
async fn word_find(app: AppHandle, query: Option<String>) -> Result<Vec<DocFile>, String> {
    let q = query.unwrap_or_default().trim().to_lowercase();
    let mut roots: Vec<std::path::PathBuf> = Vec::new();
    for p in [app.path().document_dir(), app.path().desktop_dir(), app.path().download_dir()].into_iter().flatten() {
        if p.is_dir() && !roots.contains(&p) {
            roots.push(p);
        }
    }
    if let Ok(home) = app.path().home_dir() {
        if let Ok(rd) = fs::read_dir(&home) {
            for e in rd.flatten() {
                let p = e.path();
                if e.file_name().to_string_lossy().starts_with("OneDrive") && p.is_dir() && !roots.contains(&p) {
                    roots.push(p);
                }
            }
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        let (mut out, mut seen) = (Vec::new(), 0usize);
        for r in &roots {
            find_docx(r, 0, &q, &mut out, &mut seen);
        }
        out.sort_by(|a, b| b.modified.cmp(&a.modified));
        out.dedup_by(|a, b| a.path == b.path);
        out.truncate(60);
        out
    })
    .await
    .map_err(|e| e.to_string())
}

/// Opens a Word document (.docx) in Word (the app that opens .docx files on this computer).
#[tauri::command]
fn word_open(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let p = Path::new(&path);
    if !p.is_file() || !path.to_lowercase().ends_with(".docx") {
        return Err("That isn't a Word document on this computer.".into());
    }
    app.opener().open_path(path.clone(), None::<&str>).map_err(|e| e.to_string())
}

/// Set once the page has been asked to save before closing.
struct Closing(AtomicBool);

/// The page calls this when it has finished saving.
#[tauri::command]
fn close_now(window: tauri::WebviewWindow) {
    let _ = window.destroy();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .manage(Closing(AtomicBool::new(false)))
        .manage(WordBridge(std::sync::Mutex::new(None)))
        .manage(PadRelay(std::sync::Mutex::new(None)))
        .on_window_event(|window, event| {
            if let (WindowEvent::Destroyed, "main") = (event, window.label()) {
                // the app is closing: stop the Word link and the pad relay if the app started them
                if let Ok(mut b) = window.state::<WordBridge>().0.lock() {
                    if let Some(mut c) = b.take() {
                        let _ = c.kill();
                    }
                }
                if let Ok(mut b) = window.state::<PadRelay>().0.lock() {
                    if let Some(mut c) = b.take() {
                        let _ = c.kill();
                    }
                }
            }
            if let (WindowEvent::CloseRequested { api, .. }, "main") = (event, window.label()) {
                // First close: let the page save what's still waiting, then it calls close_now.
                // If the page doesn't answer within 8 seconds, or the person clicks close again, close anyway.
                if !window.state::<Closing>().0.swap(true, Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.emit("inkling-close", ());
                    let w = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_secs(8));
                        let _ = w.destroy();
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            store_info, store_get, store_set, store_del, file_put, file_get, save_as, close_now, open_pad_window, word_link_start, pad_link_start, word_find, word_open
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cortex Scribe");
}

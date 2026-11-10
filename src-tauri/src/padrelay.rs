//! The pad relay inside the app: a phone or tablet on the same Wi-Fi becomes the drawing pad, with nothing else
//! installed (the browser version uses scripts/pad-relay.mjs, which does the same with Node.js).
//! - http://<this computer>:3457/ serves the app's own page (index.html) to the phone, marked with
//!   window.CS_PAD_RELAY, so the page there becomes the pad (the QR code adds #pad=<code>).
//! - ws://…/padlink passes the pad's messages between the screens that joined the same pad code
//!   ({type:'join', code, side}, then {type:'msg', env}); it sends {type:'info', port, ips} on connect.
//! The code is the secret; only the app, a file page and pages served from here may connect. Nothing is stored.
use std::{
    collections::HashMap,
    io::{ErrorKind, Read, Write},
    net::{TcpListener, TcpStream, UdpSocket},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tungstenite::{
    handshake::server::{ErrorResponse, Request, Response},
    http, Message,
};

type Rooms = Arc<Mutex<HashMap<String, Vec<(u64, mpsc::Sender<String>)>>>>;

/// This computer's address on the home network (the one used to reach other machines), if it has one.
fn addresses() -> Vec<String> {
    if let Ok(v) = std::env::var("CS_PAD_IPS") {
        return v.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect(); // for the tests
    }
    let ip = UdpSocket::bind("0.0.0.0:0").and_then(|s| {
        s.connect("192.168.1.1:9")?; // no packet is sent: this only picks the network the computer would use
        s.local_addr()
    });
    match ip {
        Ok(a) if !a.ip().is_loopback() && !a.ip().is_unspecified() => vec![a.ip().to_string()],
        _ => vec![],
    }
}
fn info(port: u16) -> String {
    serde_json::json!({ "type": "info", "port": port, "ips": addresses() }).to_string()
}
fn allowed(origin: &str, port: u16) -> bool {
    if origin.is_empty() || origin == "null" || origin == "file://" {
        return true;
    }
    if ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost", "http://localhost:1430", "http://127.0.0.1:1430"].contains(&origin) {
        return true;
    }
    // a page served from here: http://<an address of this computer>:<port>
    origin.strip_prefix("http://").and_then(|h| h.rsplit_once(':')).map(|(_, p)| p == port.to_string()).unwrap_or(false)
}

/// Starts the relay on `port` (all network addresses). `page` is the app's index.html.
pub fn start(port: u16, page: String) -> Result<(), String> {
    let listener = TcpListener::bind(("0.0.0.0", port)).map_err(|e| e.to_string())?;
    let page = Arc::new(page.replacen("<head>", "<head><script>window.CS_PAD_RELAY = 1;</script>", 1));
    let rooms: Rooms = Arc::default();
    let next = Arc::new(AtomicU64::new(1));
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let (page, rooms, id) = (page.clone(), rooms.clone(), next.fetch_add(1, Ordering::Relaxed));
            thread::spawn(move || {
                let _ = handle(stream, &page, &rooms, id, port);
            });
        }
    });
    Ok(())
}

fn handle(stream: TcpStream, page: &str, rooms: &Rooms, id: u64, port: u16) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    let mut buf = [0u8; 1024];
    let n = stream.peek(&mut buf)?;
    let head = String::from_utf8_lossy(&buf[..n]).to_string();
    let path = head.lines().next().unwrap_or("").split_whitespace().nth(1).unwrap_or("/").to_string();
    if path.starts_with("/padlink") {
        return socket(stream, rooms, id, port);
    }
    let mut s = stream;
    let mut req = Vec::new();
    let mut tmp = [0u8; 2048];
    while !req.windows(4).any(|w| w == b"\r\n\r\n") && req.len() < 65536 {
        let k = s.read(&mut tmp)?;
        if k == 0 {
            break;
        }
        req.extend_from_slice(&tmp[..k]);
    }
    let page_path = path == "/" || path.starts_with("/?") || path.starts_with("/index.html") || path == "/pad";
    let (status, ctype, body): (&str, &str, &[u8]) = if page_path { ("200 OK", "text/html; charset=utf-8", page.as_bytes()) } else { ("404 Not Found", "text/plain", b"Not here.") };
    write!(s, "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n", body.len())?;
    s.write_all(body)?;
    s.flush()
}

fn socket(stream: TcpStream, rooms: &Rooms, id: u64, port: u16) -> std::io::Result<()> {
    let check = |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
        let origin = req.headers().get("origin").and_then(|v| v.to_str().ok()).unwrap_or("");
        if allowed(origin, port) {
            Ok(resp)
        } else {
            let mut r = ErrorResponse::new(Some("Only Cortex Scribe may connect here".into()));
            *r.status_mut() = http::StatusCode::FORBIDDEN;
            Err(r)
        }
    };
    let Ok(mut ws) = tungstenite::accept_hdr(stream, check) else { return Ok(()) };
    ws.get_ref().set_read_timeout(Some(Duration::from_millis(40)))?;
    let (tx, rx) = mpsc::channel::<String>();
    let mut code: Option<String> = None;
    let _ = ws.send(Message::Text(info(port)));
    let leave = |code: &Option<String>| {
        if let (Some(c), Ok(mut r)) = (code, rooms.lock()) {
            if let Some(list) = r.get_mut(c) {
                list.retain(|(i, _)| *i != id);
                if list.is_empty() {
                    r.remove(c);
                }
            }
        }
    };
    loop {
        match ws.read() {
            Ok(Message::Text(t)) => {
                let Ok(m) = serde_json::from_str::<serde_json::Value>(&t) else { continue };
                match m.get("type").and_then(|v| v.as_str()) {
                    Some("join") => {
                        let c: String = m.get("code").and_then(|v| v.as_str()).unwrap_or("").to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric()).take(16).collect();
                        if c.len() < 4 {
                            let _ = ws.send(Message::Text(r#"{"type":"error","why":"code"}"#.into()));
                            continue;
                        }
                        leave(&code);
                        if let Ok(mut r) = rooms.lock() {
                            r.entry(c.clone()).or_default().push((id, tx.clone()));
                        }
                        let _ = ws.send(Message::Text(serde_json::json!({ "type": "joined", "code": c }).to_string()));
                        code = Some(c);
                    }
                    Some("msg") => {
                        if let (Some(c), Some(env)) = (&code, m.get("env")) {
                            let out = serde_json::json!({ "type": "msg", "env": env }).to_string();
                            if let Ok(r) = rooms.lock() {
                                for (i, s) in r.get(c).into_iter().flatten() {
                                    if *i != id {
                                        let _ = s.send(out.clone());
                                    }
                                }
                            }
                        }
                    }
                    Some("info") => {
                        let _ = ws.send(Message::Text(info(port)));
                    }
                    _ => {}
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(e)) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(_) => break,
        }
        while let Ok(out) = rx.try_recv() {
            if ws.send(Message::Text(out)).is_err() {
                leave(&code);
                return Ok(());
            }
        }
    }
    leave(&code);
    Ok(())
}

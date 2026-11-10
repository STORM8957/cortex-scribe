//! The app's pad relay on its own, for tests (tests/test32.py with CS_PAD_RUST=1):
//! cargo run --example pad_relay -- ../inkling.html   (port: CS_PAD_PORT, default 3457)
fn main() {
    let port = std::env::var("CS_PAD_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(3457);
    let file = std::env::args().nth(1).unwrap_or_else(|| "../inkling.html".into());
    let page = std::fs::read_to_string(&file).expect("the app's page");
    inkling_lib::padrelay::start(port, page).expect("the pad relay");
    println!("READY {port}");
    loop {
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
}

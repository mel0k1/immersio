use tauri::AppHandle;

#[derive(Clone, Debug, Default)]
pub struct Meta {
    pub title: String,
    pub artist: String,
    pub art: String,
    pub len_us: u64,
    pub pos_us: u64,
    pub playing: bool,
}

#[cfg(target_os = "linux")]
mod inner {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    use tauri::{AppHandle, Emitter};
    use tokio::sync::watch;
    use zbus::object_server::SignalContext;
    use zbus::zvariant::{ObjectPath, Value};
    use zbus::{connection, interface};

    use super::Meta;

    static TX: OnceLock<watch::Sender<Meta>> = OnceLock::new();
    static CTX: OnceLock<SignalContext<'static>> = OnceLock::new();

    struct Root;

    #[interface(name = "org.mpris.MediaPlayer2")]
    impl Root {
        #[zbus(property)]
        fn can_quit(&self) -> bool {
            false
        }
        #[zbus(property)]
        fn can_set_fullscreen(&self) -> bool {
            false
        }
        #[zbus(property)]
        fn can_raise(&self) -> bool {
            false
        }
        #[zbus(property)]
        fn has_track_list(&self) -> bool {
            false
        }
        #[zbus(property)]
        fn identity(&self) -> String {
            "Immersio".into()
        }
        #[zbus(property)]
        fn desktop_entry(&self) -> String {
            "fun.immersio.app".into()
        }
        #[zbus(property)]
        fn supported_uri_schemes(&self) -> Vec<String> {
            vec![]
        }
        #[zbus(property)]
        fn supported_mime_types(&self) -> Vec<String> {
            vec![]
        }
    }

    struct Player {
        rx: watch::Receiver<Meta>,
        ctl: tokio::sync::mpsc::UnboundedSender<String>,
    }

    #[interface(name = "org.mpris.MediaPlayer2.Player")]
    impl Player {
        #[zbus(property)]
        fn playback_status(&self) -> String {
            if self.rx.borrow().playing { "Playing".into() } else { "Paused".into() }
        }

        #[zbus(property)]
        fn loop_status(&self) -> String {
            "None".into()
        }

        #[zbus(property)]
        fn rate(&self) -> f64 {
            1.0
        }

        #[zbus(property)]
        fn shuffle(&self) -> bool {
            false
        }

        #[zbus(property)]
        fn metadata(&self) -> HashMap<String, Value> {
            let m = self.rx.borrow();
            let mut map = HashMap::new();
            let _ = map.insert(
                "mpris:trackid".to_string(),
                Value::ObjectPath(ObjectPath::from_str_unchecked("/org/immersio/Track/1")),
            );
            let _ = map.insert("mpris:length".to_string(), Value::I64(m.len_us as i64));
            if !m.title.is_empty() {
                let _ = map.insert("xesam:title".to_string(), Value::Str(m.title.clone().into()));
                let _ = map.insert("xesam:artist".to_string(), Value::Array(vec![m.artist.clone()].into()));
            }
            if !m.art.is_empty() {
                let _ = map.insert("mpris:artUrl".to_string(), Value::Str(m.art.clone().into()));
            }
            map
        }

        #[zbus(property)]
        fn volume(&self) -> f64 {
            1.0
        }

        #[zbus(property(emits_changed_signal = "false"))]
        fn position(&self) -> i64 {
            self.rx.borrow().pos_us as i64
        }

        #[zbus(property)]
        fn can_go_next(&self) -> bool {
            true
        }

        #[zbus(property)]
        fn can_go_previous(&self) -> bool {
            true
        }

        #[zbus(property)]
        fn can_play(&self) -> bool {
            true
        }

        #[zbus(property)]
        fn can_pause(&self) -> bool {
            true
        }

        #[zbus(property)]
        fn can_seek(&self) -> bool {
            true
        }

        #[zbus(property)]
        fn can_control(&self) -> bool {
            true
        }

        #[zbus(signal)]
        async fn seeked(emitter: &SignalContext<'_>, position: i64) -> zbus::Result<()>;

        fn next(&self) {
            let _ = self.ctl.send("next".into());
        }

        fn previous(&self) {
            let _ = self.ctl.send("prev".into());
        }

        fn pause(&self) {
            let _ = self.ctl.send("pause".into());
        }

        fn play(&self) {
            let _ = self.ctl.send("play".into());
        }

        fn play_pause(&self) {
            let _ = self.ctl.send("toggle".into());
        }

        fn stop(&self) {
            let _ = self.ctl.send("pause".into());
        }

        fn seek(&self, _x: i64) {}

        fn set_position(&self, _track_id: ObjectPath<'_>, _pos: i64) {}

        fn open_uri(&self, _uri: String) {}
    }

    pub fn init(app: &AppHandle) {
        let (tx, rx) = watch::channel(Meta::default());
        if TX.set(tx).is_err() {
            return;
        }
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let (ctx, mut crx) = tokio::sync::mpsc::unbounded_channel::<String>();
            let result = connection::Builder::session()
                .and_then(|b| b.name("org.mpris.MediaPlayer2.immersio"))
                .and_then(|b| b.serve_at("/org/mpris/MediaPlayer2", Root))
                .and_then(|b| b.serve_at("/org/mpris/MediaPlayer2", Player { rx, ctl: ctx }))
                .and_then(|b| b.build());
            let conn = match result {
                Ok(c) => c,
                Err(_) => return,
            };
            let ctxt = match SignalContext::new(&conn, "/org/mpris/MediaPlayer2") {
                Ok(c) => c,
                Err(_) => return,
            };
            let _ = CTX.set(ctxt);
            while let Some(action) = crx.recv().await {
                let _ = handle.emit("imm-mpris", action);
            }
        });
        tauri::async_runtime::spawn(async move {
            let mut rx = TX.get().unwrap().subscribe();
            let (dctx, _drx) = tokio::sync::mpsc::unbounded_channel();
            let mut last = Meta::default();
            let mut first = true;
            loop {
                if rx.changed().await.is_err() {
                    return;
                }
                let m = rx.borrow().clone();
                let status_changed = first || m.playing != last.playing;
                let seeked_jump =
                    !first && (m.pos_us as i64 - last.pos_us as i64).abs() > 2_000_000;
                first = false;
                last = m.clone();
                let Some(ctxt) = CTX.get() else { continue };
                let p = Player { rx: rx.clone(), ctl: dctx.clone() };
                let _ = p.metadata_changed(ctxt).await;
                if status_changed {
                    let _ = p.playback_status_changed(ctxt).await;
                }
                if seeked_jump {
                    let _ = Player::seeked(ctxt, m.pos_us as i64).await;
                }
            }
        });
    }

    pub fn update(_app: &AppHandle, meta: Meta) {
        if let Some(tx) = TX.get() {
            let _ = tx.send(meta);
        }
    }
}

#[cfg(not(target_os = "linux"))]
mod inner {
    use super::Meta;
    use tauri::AppHandle;

    pub fn init(_app: &AppHandle) {}
    pub fn update(_app: &AppHandle, _meta: Meta) {}
}

pub fn init(app: &AppHandle) {
    inner::init(app);
}

pub fn update(app: &AppHandle, meta: Meta) {
    inner::update(app, meta);
}

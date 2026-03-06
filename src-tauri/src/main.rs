#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let runtime = tauri::async_runtime::block_on(server::start_server(app.handle().clone()))
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;

      let url = format!("http://127.0.0.1:{}/", runtime.port);
      let parsed_url = tauri::Url::parse(&url)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error.to_string()))?;

      WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed_url))
        .title("SoloLog")
        .inner_size(1440.0, 920.0)
        .min_inner_size(1120.0, 720.0)
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

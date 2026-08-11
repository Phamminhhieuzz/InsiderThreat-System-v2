#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      Some(vec!["--minimized"]),
    ))
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      use tauri_plugin_shell::ShellExt;
      use tauri_plugin_autostart::ManagerExt;
      use tauri::Manager;

      // Enable autostart automatically
      let _ = app.autolaunch().enable();

      use std::process::Command;
      use std::os::windows::process::CommandExt;
      const CREATE_NO_WINDOW: u32 = 0x08000000;

      // Khởi động các Agent ngầm từ resources folder
      if let Ok(resource_path) = app.path().resource_dir() {
        let client = resource_path.join("InsiderThreat.ClientAgent.exe");
        let monitor = resource_path.join("InsiderThreat.MonitorAgent.exe");
        let watchdog = resource_path.join("InsiderThreat.Watchdog.exe");

        if client.exists() { let _ = Command::new(&client).creation_flags(CREATE_NO_WINDOW).spawn(); }
        if monitor.exists() { let _ = Command::new(&monitor).creation_flags(CREATE_NO_WINDOW).spawn(); }
        if watchdog.exists() { let _ = Command::new(&watchdog).creation_flags(CREATE_NO_WINDOW).spawn(); }
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

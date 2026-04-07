use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;

const PALETTE_WINDOW_LABEL: &str = "main";
const TRAY_ID: &str = "command-palette-tray";
const GLOBAL_SHORTCUT: &str = "Ctrl+Alt+Space";

fn show_palette<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(PALETTE_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_palette<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(PALETTE_WINDOW_LABEL) {
        let _ = window.hide();
    }
}

fn toggle_palette<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(PALETTE_WINDOW_LABEL) {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_minimized = window.is_minimized().unwrap_or(false);

        if is_visible && !is_minimized {
            let _ = window.hide();
        } else {
            show_palette(app);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let app_handle = app.handle();

                if let Err(error) = app_handle.plugin(
                    tauri_plugin_autostart::Builder::new()
                        .app_name(app_handle.package_info().name.clone())
                        .build(),
                ) {
                    eprintln!("failed to configure autostart: {error}");
                } else {
                    let autostart = app_handle.autolaunch();
                    match autostart.is_enabled() {
                        Ok(true) => {}
                        Ok(false) => {
                            if let Err(error) = autostart.enable() {
                                eprintln!("failed to enable autostart: {error}");
                            }
                        }
                        Err(error) => {
                            eprintln!("failed to check autostart state: {error}");
                        }
                    }
                }

                match tauri_plugin_global_shortcut::Builder::new().with_shortcut(GLOBAL_SHORTCUT)
                {
                    Ok(builder) => {
                        if let Err(error) = app_handle.plugin(
                            builder
                                .with_handler(|app, _shortcut, event| {
                                    if event.state
                                        == tauri_plugin_global_shortcut::ShortcutState::Pressed
                                    {
                                        toggle_palette(app);
                                    }
                                })
                                .build(),
                        ) {
                            eprintln!("failed to register global shortcut: {error}");
                        }
                    }
                    Err(error) => {
                        eprintln!("failed to configure global shortcut: {error}");
                    }
                }

                let show_item = MenuItem::with_id(
                    app,
                    "show",
                    "Show Command Palette",
                    true,
                    None::<&str>,
                )?;
                let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

                let tray_icon = app_handle
                    .default_window_icon()
                    .cloned()
                    .expect("default window icon missing");

                TrayIconBuilder::with_id(TRAY_ID)
                    .tooltip("Command Palette")
                    .icon(tray_icon)
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => show_palette(app),
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            toggle_palette(tray.app_handle());
                        }
                    })
                    .build(app)?;

                hide_palette(&app_handle);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == PALETTE_WINDOW_LABEL {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

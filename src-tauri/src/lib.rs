mod commands;

use commands::{env_doctor::*, gateway::*, im_connector::*, llm_config::*, skills::*};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // Environment Doctor
            detect_environment,
            get_geo_mirror,
            set_npm_mirror,
            install_node,
            install_brew,
            download_openclaw,
            // LLM Config
            save_llm_config,
            test_llm_connection,
            // IM Connector
            start_feishu_channel,
            write_feishu_config,
            verify_feishu_credentials,
            start_whatsapp_login,
            cancel_whatsapp_login,
            // Gateway
            check_port,
            get_gateway_token,
            get_gateway_status,
            start_gateway,
            stop_gateway,
            open_gateway_browser,
            kill_port_process,
            // Skills
            list_skills,
            toggle_skill,
            get_skill_detail,
            install_skill_dep,
            create_skill,
            import_skill_zip,
            import_skill_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use serde::{Deserialize, Serialize};
use std::net::TcpListener;
use std::process::Command;

const OPENCLAW_BIN: &str = "/opt/homebrew/bin/openclaw";
const GATEWAY_PORT: u16 = 18789;

const EXTRA_PATHS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
];

fn full_path_env() -> std::ffi::OsString {
    let current = std::env::var("PATH").unwrap_or_default();
    format!("{}:{}", EXTRA_PATHS.join(":"), current).into()
}

fn openclaw_bin() -> String {
    for dir in EXTRA_PATHS {
        let p = format!("{}/openclaw", dir);
        if std::path::Path::new(&p).exists() {
            return p;
        }
    }
    OPENCLAW_BIN.to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PortStatus {
    pub free: bool,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GatewayStatus {
    pub running: bool,
    pub url: String,
    pub port: u16,
}

#[tauri::command]
pub fn check_port(port: u16) -> Result<PortStatus, String> {
    match TcpListener::bind(format!("127.0.0.1:{}", port)) {
        Ok(_) => Ok(PortStatus { free: true, pid: None, process_name: None }),
        Err(_) => {
            let output = Command::new("/usr/sbin/lsof")
                .args(["-i", &format!(":{}", port), "-n", "-P", "-t"])
                .output();
            let pid = output.ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .and_then(|s| s.lines().next().and_then(|l| l.trim().parse().ok()));
            Ok(PortStatus { free: false, pid, process_name: None })
        }
    }
}

#[tauri::command]
pub fn get_gateway_status() -> GatewayStatus {
    let running = TcpListener::bind(format!("127.0.0.1:{}", GATEWAY_PORT)).is_err();
    GatewayStatus {
        running,
        url: format!("http://127.0.0.1:{}/", GATEWAY_PORT),
        port: GATEWAY_PORT,
    }
}

#[tauri::command]
pub async fn start_gateway(app: tauri::AppHandle) -> Result<GatewayStatus, String> {
    use tauri::Emitter;

    let bin = openclaw_bin();
    app.emit("gateway_log", serde_json::json!({ "text": format!("openclaw 路径: {}", bin) })).ok();

    // 检查是否已在运行
    if TcpListener::bind(format!("127.0.0.1:{}", GATEWAY_PORT)).is_err() {
        app.emit("gateway_log", serde_json::json!({ "text": "Gateway 已在运行 ✓" })).ok();
        return Ok(get_gateway_status());
    }

    // 启动 gateway 服务（launchd 托管）
    app.emit("gateway_log", serde_json::json!({ "text": "正在启动 Gateway 服务..." })).ok();

    let output = Command::new(&bin)
        .args(["gateway", "start"])
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| format!("执行失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !stdout.trim().is_empty() {
        for line in stdout.lines() {
            app.emit("gateway_log", serde_json::json!({ "text": line })).ok();
        }
    }
    if !stderr.trim().is_empty() {
        for line in stderr.lines() {
            app.emit("gateway_log", serde_json::json!({ "text": line })).ok();
        }
    }

    // 等待端口就绪（最多 20 秒）
    for i in 0..20 {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        if TcpListener::bind(format!("127.0.0.1:{}", GATEWAY_PORT)).is_err() {
            app.emit("gateway_log", serde_json::json!({ "text": "Gateway 启动成功 ✓" })).ok();
            return Ok(get_gateway_status());
        }
        if i == 4 {
            app.emit("gateway_log", serde_json::json!({ "text": "等待端口就绪..." })).ok();
        }
        if i == 14 {
            app.emit("gateway_log", serde_json::json!({ "text": "仍在等待..." })).ok();
        }
    }

    // 超时，检查实际状态
    let status = get_gateway_status();
    if !status.running {
        app.emit("gateway_log", serde_json::json!({
            "text": "⚠ 端口未就绪，尝试前台运行模式..."
        })).ok();

        // 尝试前台运行
        Command::new(&bin)
            .args(["gateway", "run", "--allow-unconfigured"])
            .env("PATH", full_path_env())
            .spawn()
            .ok();

        // 等待前台进程启动（最多 8 秒）
        for _ in 0..8 {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            if TcpListener::bind(format!("127.0.0.1:{}", GATEWAY_PORT)).is_err() {
                app.emit("gateway_log", serde_json::json!({ "text": "Gateway 启动成功 ✓" })).ok();
                return Ok(get_gateway_status());
            }
        }
    }

    Ok(get_gateway_status())
}

/// 直接调用 `openclaw dashboard` 打开浏览器（自动携带 token）
#[tauri::command]
pub fn open_gateway_browser(_token: String) -> Result<(), String> {
    let bin = openclaw_bin();

    // 优先用 openclaw dashboard（自动处理 token）
    let result = Command::new(&bin)
        .arg("dashboard")
        .env("PATH", full_path_env())
        .spawn();

    if result.is_ok() {
        return Ok(());
    }

    // 降级：直接用系统 open 命令
    Command::new("/usr/bin/open")
        .arg(format!("http://127.0.0.1:{}/", GATEWAY_PORT))
        .spawn()
        .map_err(|e| format!("无法打开浏览器: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_gateway_token() -> Result<String, String> {
    // 让 openclaw dashboard --no-open 输出 URL，从中提取 token
    let bin = openclaw_bin();
    let output = Command::new(&bin)
        .args(["dashboard", "--no-open"])
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| e.to_string())?;

    let text = String::from_utf8_lossy(&output.stdout).to_string();
    // 输出格式: "Dashboard URL: http://127.0.0.1:18789/?token=xxx"
    for line in text.lines() {
        if let Some(url) = line.strip_prefix("Dashboard URL:") {
            let url = url.trim();
            if let Some(token_part) = url.split("token=").nth(1) {
                return Ok(token_part.trim().to_string());
            }
            // 无 token 参数
            return Err("无 token（可能未设置鉴权）".to_string());
        }
    }

    Err("无法获取 Dashboard URL".to_string())
}

#[tauri::command]
pub async fn stop_gateway(app: tauri::AppHandle) -> Result<GatewayStatus, String> {
    use tauri::Emitter;

    let bin = openclaw_bin();

    app.emit("gateway_log", serde_json::json!({ "text": "正在停止 Gateway..." })).ok();

    let output = Command::new(&bin)
        .args(["gateway", "stop"])
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| format!("执行失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    for line in stdout.lines().chain(stderr.lines()) {
        let t = line.trim();
        if !t.is_empty() {
            app.emit("gateway_log", serde_json::json!({ "text": t })).ok();
        }
    }

    // 等待端口释放（最多 6 秒）
    for _ in 0..6 {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        if TcpListener::bind(format!("127.0.0.1:{}", GATEWAY_PORT)).is_ok() {
            app.emit("gateway_log", serde_json::json!({ "text": "Gateway 已停止 ✓" })).ok();
            return Ok(get_gateway_status());
        }
    }

    // 端口仍被占用 → 可能是前台模式启动的，直接 kill 进程
    if TcpListener::bind(format!("127.0.0.1:{}", GATEWAY_PORT)).is_err() {
        app.emit("gateway_log", serde_json::json!({ "text": "launchd 服务未找到，尝试终止端口进程..." })).ok();

        let lsof = Command::new("/usr/sbin/lsof")
            .args(["-i", &format!(":{}", GATEWAY_PORT), "-n", "-P", "-t"])
            .output();

        if let Ok(out) = lsof {
            let pids_str = String::from_utf8_lossy(&out.stdout).to_string();
            for pid_line in pids_str.lines() {
                if let Ok(pid) = pid_line.trim().parse::<u32>() {
                    app.emit("gateway_log", serde_json::json!({ "text": format!("终止进程 PID {}...", pid) })).ok();
                    Command::new("kill").args(["-15", &pid.to_string()]).output().ok();
                }
            }

            // 等待端口释放
            for _ in 0..5 {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                if TcpListener::bind(format!("127.0.0.1:{}", GATEWAY_PORT)).is_ok() {
                    app.emit("gateway_log", serde_json::json!({ "text": "Gateway 已停止 ✓" })).ok();
                    return Ok(get_gateway_status());
                }
            }

            // SIGTERM 没用，强制 SIGKILL
            for pid_line in pids_str.lines() {
                if let Ok(pid) = pid_line.trim().parse::<u32>() {
                    Command::new("kill").args(["-9", &pid.to_string()]).output().ok();
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    }

    Ok(get_gateway_status())
}

#[tauri::command]
pub fn kill_port_process(pid: u32) -> Result<(), String> {
    Command::new("kill")
        .args(["-9", &pid.to_string()])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Uninstall OpenClaw ──────────────────────────────────────────────────────

/// Completely uninstall OpenClaw:
///   1. Stop gateway
///   2. Uninstall gateway LaunchAgent service
///   3. Remove ~/.openclaw/ config directory
///   4. npm uninstall -g openclaw (remove CLI)
///   5. Remove /tmp/openclaw/ logs
#[tauri::command]
pub async fn uninstall_openclaw(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Emitter;

    let emit = |text: &str| {
        app.emit("uninstall_log", serde_json::json!({ "text": text })).ok();
    };

    let bin = openclaw_bin();
    let path_env = full_path_env();

    // 1. Stop gateway
    emit("正在停止 Gateway ...");
    let _ = Command::new(&bin)
        .args(["gateway", "stop"])
        .env("PATH", &path_env)
        .output();

    // Also kill any leftover processes on the port
    if TcpListener::bind(format!("127.0.0.1:{}", GATEWAY_PORT)).is_err() {
        let lsof = Command::new("/usr/sbin/lsof")
            .args(["-i", &format!(":{}", GATEWAY_PORT), "-n", "-P", "-t"])
            .output();
        if let Ok(out) = lsof {
            for pid_line in String::from_utf8_lossy(&out.stdout).lines() {
                if let Ok(pid) = pid_line.trim().parse::<u32>() {
                    Command::new("kill").args(["-9", &pid.to_string()]).output().ok();
                }
            }
        }
    }
    emit("Gateway 已停止 ✓");

    // 2. Uninstall LaunchAgent service
    emit("正在移除 Gateway 服务 ...");
    let _ = Command::new(&bin)
        .args(["gateway", "uninstall"])
        .env("PATH", &path_env)
        .output();

    // Also remove the plist file directly
    let home = std::env::var("HOME").unwrap_or_default();
    let plist = format!("{}/Library/LaunchAgents/ai.openclaw.gateway.plist", home);
    if std::path::Path::new(&plist).exists() {
        // Get current user ID
        let uid = Command::new("id").arg("-u").output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();
        if !uid.is_empty() {
            let _ = Command::new("launchctl")
                .args(["bootout", &format!("gui/{}", uid), &plist])
                .output();
        }
        std::fs::remove_file(&plist).ok();
    }
    emit("Gateway 服务已移除 ✓");

    // 3. Remove ~/.openclaw/ config directory
    emit("正在删除配置目录 (~/.openclaw/) ...");
    let config_dir = format!("{}/.openclaw", home);
    if std::path::Path::new(&config_dir).exists() {
        match std::fs::remove_dir_all(&config_dir) {
            Ok(_) => emit("配置目录已删除 ✓"),
            Err(e) => emit(&format!("删除配置目录失败: {} (可手动删除)", e)),
        }
    } else {
        emit("配置目录不存在，跳过");
    }

    // 4. npm uninstall -g openclaw
    emit("正在卸载 OpenClaw CLI (npm uninstall -g openclaw) ...");
    let npm = find_npm();
    let uninstall = Command::new(&npm)
        .args(["uninstall", "-g", "openclaw"])
        .env("PATH", &path_env)
        .output();

    match uninstall {
        Ok(out) => {
            if out.status.success() {
                emit("OpenClaw CLI 已卸载 ✓");
            } else {
                let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
                emit(&format!("CLI 卸载可能不完整: {}", err));
            }
        }
        Err(e) => emit(&format!("npm 执行失败: {} (可手动运行 npm uninstall -g openclaw)", e)),
    }

    // 5. Remove /tmp/openclaw/ logs
    emit("正在清理日志文件 ...");
    let tmp_dir = "/tmp/openclaw";
    if std::path::Path::new(tmp_dir).exists() {
        std::fs::remove_dir_all(tmp_dir).ok();
        emit("日志已清理 ✓");
    }

    emit("✅ OpenClaw 已完全卸载");
    Ok(true)
}

fn find_npm() -> String {
    for dir in EXTRA_PATHS {
        let p = format!("{}/npm", dir);
        if std::path::Path::new(&p).exists() {
            return p;
        }
    }
    "npm".to_string()
}

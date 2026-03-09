use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvReport {
    pub os: String,
    pub arch: String,
    pub node_version: Option<String>,
    pub npm_version: Option<String>,
    pub brew_installed: bool,
    pub git_installed: bool,
    pub needs_node: bool,
    pub needs_brew: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MirrorConfig {
    pub npm: String,
    pub cdn: String,
    pub region: String,
}

/// macOS 常见二进制路径（Tauri 应用 PATH 很短，必须手动补全）
const EXTRA_PATHS: &[&str] = &[
    "/opt/homebrew/bin",      // Apple Silicon Homebrew
    "/usr/local/bin",         // Intel Homebrew / nvm
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
];

fn full_path_env() -> std::ffi::OsString {
    let current = std::env::var("PATH").unwrap_or_default();
    let extra = EXTRA_PATHS.join(":");
    format!("{}:{}", extra, current).into()
}

/// 在扩展 PATH 下查找二进制
fn find_bin(name: &str) -> Option<String> {
    for dir in EXTRA_PATHS {
        let p = format!("{}/{}", dir, name);
        if std::path::Path::new(&p).exists() {
            return Some(p);
        }
    }
    None
}

/// 在扩展 PATH 下执行命令，返回 stdout
fn run_cmd_full_path(cmd: &str, args: &[&str]) -> Option<String> {
    let bin = find_bin(cmd).unwrap_or_else(|| cmd.to_string());
    Command::new(&bin)
        .args(args)
        .env("PATH", full_path_env())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

fn is_node_version_ok(version: &str) -> bool {
    let num = version.trim_start_matches('v');
    let major: u32 = num.split('.').next().and_then(|s| s.parse().ok()).unwrap_or(0);
    major >= 18 // 放宽到 18，避免不必要的重装
}

#[tauri::command]
pub async fn detect_environment() -> Result<EnvReport, String> {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    let node_version = run_cmd_full_path("node", &["--version"]);
    let npm_version = run_cmd_full_path("npm", &["--version"]);
    let brew_installed = find_bin("brew").is_some();
    let git_installed = find_bin("git").is_some();

    let needs_node = node_version
        .as_ref()
        .map(|v| !is_node_version_ok(v))
        .unwrap_or(true);
    let needs_brew = os == "macos" && !brew_installed;

    Ok(EnvReport {
        os,
        arch,
        node_version,
        npm_version,
        brew_installed,
        git_installed,
        needs_node,
        needs_brew,
    })
}

#[tauri::command]
pub async fn get_geo_mirror() -> Result<MirrorConfig, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .map_err(|e| e.to_string())?;

    let result = client
        .get("http://ip-api.com/json?fields=countryCode")
        .send()
        .await;

    let country_code = match result {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                json["countryCode"].as_str().unwrap_or("").to_string()
            } else {
                String::new()
            }
        }
        Err(_) => String::new(),
    };

    if country_code == "CN" {
        Ok(MirrorConfig {
            npm: "https://registry.npmmirror.com".to_string(),
            cdn: "https://cdn.npmmirror.com/binaries".to_string(),
            region: "CN".to_string(),
        })
    } else {
        Ok(MirrorConfig {
            npm: "https://registry.npmjs.org".to_string(),
            cdn: "https://nodejs.org/dist".to_string(),
            region: country_code,
        })
    }
}

#[tauri::command]
pub async fn set_npm_mirror(registry_url: String) -> Result<(), String> {
    let npm = find_bin("npm").unwrap_or_else(|| "npm".to_string());
    let output = Command::new(&npm)
        .args(["config", "set", "registry", &registry_url])
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn install_node(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Emitter;

    let os = std::env::consts::OS;
    app.emit("install_log", serde_json::json!({ "text": "开始安装 Node.js..." })).ok();

    if os == "macos" {
        let brew = find_bin("brew").unwrap_or_else(|| "/opt/homebrew/bin/brew".to_string());

        app.emit("install_log", serde_json::json!({ "text": "正在通过 Homebrew 安装 node@22..." })).ok();

        let output = Command::new(&brew)
            .args(["install", "node@22"])
            .env("PATH", full_path_env())
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            app.emit("install_log", serde_json::json!({ "text": "Node.js 22 安装成功 ✓" })).ok();
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let err_msg = if stderr.is_empty() {
                String::from_utf8_lossy(&output.stdout).to_string()
            } else {
                stderr
            };
            return Err(err_msg);
        }
    } else if os == "windows" {
        let output = Command::new("winget")
            .args(["install", "OpenJS.NodeJS.LTS", "--silent",
                   "--accept-source-agreements", "--accept-package-agreements"])
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        app.emit("install_log", serde_json::json!({ "text": "Node.js LTS 安装成功 ✓" })).ok();
    } else {
        return Err("不支持的操作系统".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn install_brew(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Emitter;

    app.emit("install_log", serde_json::json!({ "text": "开始安装 Homebrew..." })).ok();

    let script_url = "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh";

    // 正确方式：用管道将脚本传入 bash stdin，避免 shebang 被当作命令执行
    let cmd = format!("curl -fsSL '{}' | bash", script_url);
    let output = Command::new("/bin/bash")
        .args(["-c", &cmd])
        .env("NONINTERACTIVE", "1")
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        app.emit("install_log", serde_json::json!({ "text": "Homebrew 安装成功 ✓" })).ok();
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(if stderr.is_empty() {
            String::from_utf8_lossy(&output.stdout).to_string()
        } else {
            stderr
        })
    }
}

#[tauri::command]
pub async fn download_openclaw(app: tauri::AppHandle, _cdn_base: String) -> Result<String, String> {
    use tauri::Emitter;

    let npm = find_bin("npm").unwrap_or_else(|| "npm".to_string());

    // 检查 openclaw 是否已安装
    let check = Command::new(find_bin("openclaw").unwrap_or_else(|| "openclaw".to_string()))
        .arg("--version")
        .env("PATH", full_path_env())
        .output();

    if check.map(|o| o.status.success()).unwrap_or(false) {
        app.emit("install_log", serde_json::json!({ "text": "OpenClaw 已安装 ✓" })).ok();
    } else {
        app.emit("install_log", serde_json::json!({ "text": "正在安装 OpenClaw (npm)..." })).ok();

        // 使用 npx 方式或全局安装（包名待确认后替换）
        let output = Command::new(&npm)
            .args(["install", "-g", "@openclaw/core"])
            .env("PATH", full_path_env())
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            app.emit("install_log", serde_json::json!({ "text": "OpenClaw 安装成功 ✓" })).ok();
        } else {
            // 安装失败时只警告，不阻断流程（包名尚未发布时的容错）
            let warn = String::from_utf8_lossy(&output.stderr).to_string();
            app.emit("install_log", serde_json::json!({
                "text": format!("⚠ OpenClaw 包暂未发布，跳过安装: {}", warn.lines().next().unwrap_or(""))
            })).ok();
        }
    }

    // 确保配置目录存在
    if let Some(home) = dirs::home_dir() {
        let config_dir = home.join(".openclaw").join("config");
        let _ = std::fs::create_dir_all(&config_dir);
        return Ok(home.join(".openclaw").to_string_lossy().to_string());
    }

    Ok(String::from("~/.openclaw"))
}

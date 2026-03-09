use serde::{Deserialize, Serialize};
use std::process::Command;

const EXTRA_PATHS: &[&str] = &["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];

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
    "openclaw".to_string()
}

// ─── Feishu ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeishuConfig {
    pub app_id: String,
    pub app_secret: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FeishuTokenResult {
    pub ok: bool,
    pub error: Option<String>,
    pub bot_name: Option<String>,
}

fn write_feishu_config_inner(app_id: &str, app_secret: &str) -> Result<(), String> {
    let bin = openclaw_bin();

    // openclaw config set channels.feishu.appId "<id>"
    let r1 = Command::new(&bin)
        .args(["config", "set", "channels.feishu.appId", app_id])
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| format!("config set appId 失败: {}", e))?;

    if !r1.status.success() {
        let err = String::from_utf8_lossy(&r1.stderr).to_string();
        return Err(format!("config set appId 失败: {}", err));
    }

    // openclaw config set channels.feishu.appSecret "<secret>"
    let r2 = Command::new(&bin)
        .args(["config", "set", "channels.feishu.appSecret", app_secret])
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| format!("config set appSecret 失败: {}", e))?;

    if !r2.status.success() {
        let err = String::from_utf8_lossy(&r2.stderr).to_string();
        return Err(format!("config set appSecret 失败: {}", err));
    }

    Ok(())
}

async fn verify_feishu_token(app_id: &str, app_secret: &str) -> FeishuTokenResult {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => return FeishuTokenResult { ok: false, error: Some(e.to_string()), bot_name: None },
    };

    let body = serde_json::json!({ "app_id": app_id, "app_secret": app_secret });

    let resp = match client
        .post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return FeishuTokenResult {
            ok: false,
            error: Some(format!("网络错误: {}", e)),
            bot_name: None,
        },
    };

    if !resp.status().is_success() {
        return FeishuTokenResult {
            ok: false,
            error: Some(format!("HTTP {}", resp.status())),
            bot_name: None,
        };
    }

    let json: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => return FeishuTokenResult { ok: false, error: Some(e.to_string()), bot_name: None },
    };

    if json["code"].as_i64().unwrap_or(-1) != 0 {
        return FeishuTokenResult {
            ok: false,
            error: Some(json["msg"].as_str().unwrap_or("验证失败").to_string()),
            bot_name: None,
        };
    }

    FeishuTokenResult { ok: true, error: None, bot_name: Some("飞书机器人".to_string()) }
}

/// 一键连接飞书：验证凭据 → 写入配置 → 启用插件，通过事件流式输出日志
#[tauri::command]
pub async fn start_feishu_channel(
    app: tauri::AppHandle,
    app_id: String,
    app_secret: String,
) -> Result<FeishuTokenResult, String> {
    use tauri::Emitter;

    let log = |kind: &str, text: String| {
        app.emit("feishu_log", serde_json::json!({ "kind": kind, "text": text })).ok();
    };

    // 1. 验证凭据
    log("log", "正在向飞书开放平台验证 App ID / App Secret...".into());
    let result = verify_feishu_token(&app_id, &app_secret).await;
    if !result.ok {
        let msg = result.error.clone().unwrap_or_else(|| "验证失败".to_string());
        log("error", msg);
        return Ok(result);
    }
    log("log", "凭据验证通过 ✓".into());

    // 2. 写入凭据配置
    log("log", "正在写入飞书配置...".into());
    if let Err(e) = write_feishu_config_inner(&app_id, &app_secret) {
        log("error", format!("写入配置失败: {}", e));
        return Ok(FeishuTokenResult { ok: false, error: Some(e), bot_name: None });
    }
    log("log", "App ID / App Secret 已写入 ✓".into());

    // 3. 设置 dmPolicy = open（允许任何人私信机器人）
    log("log", "正在设置消息策略（dmPolicy=open）...".into());
    let _ = Command::new(openclaw_bin())
        .args(["config", "set", "channels.feishu.dmPolicy", "open"])
        .env("PATH", full_path_env())
        .output();

    // 4. doctor --fix 自动补全 allowFrom: ["*"]
    log("log", "正在自动修复配置（doctor --fix）...".into());
    let _ = Command::new(openclaw_bin())
        .args(["doctor", "--fix"])
        .env("PATH", full_path_env())
        .output();
    log("log", "消息策略配置完成 ✓".into());

    // 5. 启用飞书插件
    log("log", "正在启用飞书插件...".into());
    let plugin_out = Command::new(openclaw_bin())
        .args(["plugins", "enable", "feishu"])
        .env("PATH", full_path_env())
        .output();

    match plugin_out {
        Ok(o) => {
            let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let err = String::from_utf8_lossy(&o.stderr).trim().to_string();
            if !out.is_empty() { log("log", out); }
            if !err.is_empty() { log("log", err); }
        }
        Err(e) => log("log", format!("插件命令执行失败（可忽略）: {}", e)),
    }

    log("success", "飞书长连接已就绪，启动 Gateway 后即可从手机收发消息 ✓".into());
    Ok(FeishuTokenResult { ok: true, error: None, bot_name: result.bot_name })
}

#[tauri::command]
pub async fn write_feishu_config(config: FeishuConfig) -> Result<(), String> {
    write_feishu_config_inner(&config.app_id, &config.app_secret)
}

#[tauri::command]
pub async fn verify_feishu_credentials(
    app_id: String,
    app_secret: String,
) -> Result<FeishuTokenResult, String> {
    Ok(verify_feishu_token(&app_id, &app_secret).await)
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

/// 启动 WhatsApp 登录流程：
///   1. 先 enable whatsapp 插件（如果未启用）
///   2. 运行 `openclaw channels login --channel whatsapp`
///   3. 流式推送日志；识别 ASCII QR 块字符行，聚合后以 kind=qr_art 推送
#[tauri::command]
pub async fn start_whatsapp_login(app: tauri::AppHandle) -> Result<(), String> {
    use std::io::{BufRead, BufReader};
    use tauri::Emitter;

    let bin = openclaw_bin();

    // Step 1: enable plugin
    app.emit("wa_log", serde_json::json!({ "kind": "log", "text": "正在启用 WhatsApp 插件..." })).ok();
    let _ = Command::new(&bin)
        .args(["plugins", "enable", "whatsapp"])
        .env("PATH", full_path_env())
        .output();

    app.emit("wa_log", serde_json::json!({ "kind": "log", "text": "正在连接 WhatsApp，等待二维码..." })).ok();

    // Step 2: launch login
    let mut child = std::process::Command::new(&bin)
        .args(["channels", "login", "--channel", "whatsapp"])
        .env("PATH", full_path_env())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动失败: {}", e))?;

    let stderr = child.stderr.take().unwrap();
    let stdout = child.stdout.take().unwrap();

    // stderr → 纯日志转发
    let app_err = app.clone();
    let stderr_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            let text = strip_ansi(&line);
            let text = text.trim().to_string();
            if text.is_empty() { continue; }
            app_err.emit("wa_log", serde_json::json!({ "kind": "log", "text": text })).ok();
        }
    });

    // stdout → QR 检测（openclaw 的 QR 和交互输出都在 stdout）
    let app_out = app.clone();
    let stdout_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut qr_lines: Vec<String> = Vec::new();
        let mut in_qr = false;

        for line in reader.lines().flatten() {
            let clean = strip_ansi(&line);

            if is_qr_art_line(&clean) {
                // QR 行：每行都立刻推送已累积行，前端逐行渲染
                in_qr = true;
                qr_lines.push(clean);
                app_out.emit("wa_log", serde_json::json!({
                    "kind": "qr_art",
                    "lines": &qr_lines
                })).ok();
            } else {
                // 非 QR 行：重置缓冲，处理文字
                if in_qr {
                    qr_lines = Vec::new();
                    in_qr = false;
                }

                let text = clean.trim().to_string();
                if text.is_empty() { continue; }

                let lower = text.to_lowercase();
                // 精确匹配成功信号，避免 "Scan QR in WhatsApp (Linked Devices)" 误触发
                let is_success = lower.contains("successfully linked")
                    || lower.contains("login success")
                    || lower.contains("logged in successfully")
                    || lower.contains("pairing successful")
                    || lower.contains("connected successfully")
                    || (lower.contains("success") && !lower.contains("scan"))
                    || text.contains("✓");
                let is_error = (lower.contains("error") || lower.contains("failed"))
                    && !lower.contains("scan");

                if is_success {
                    app_out.emit("wa_log", serde_json::json!({ "kind": "success", "text": text })).ok();
                } else if is_error {
                    app_out.emit("wa_log", serde_json::json!({ "kind": "error", "text": text })).ok();
                } else {
                    app_out.emit("wa_log", serde_json::json!({ "kind": "log", "text": text })).ok();
                }
            }
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    stderr_handle.join().ok();
    stdout_handle.join().ok();

    if status.success() {
        app.emit("wa_log", serde_json::json!({ "kind": "success", "text": "WhatsApp 登录成功 ✓" })).ok();
    } else {
        app.emit("wa_log", serde_json::json!({
            "kind": "error",
            "text": format!("进程退出码: {:?}", status.code())
        })).ok();
    }

    Ok(())
}

/// 判断是否是 ASCII QR 块字符行（包含 █ ▄ ▀ 及空格）
fn is_qr_art_line(s: &str) -> bool {
    let s = s.trim();
    if s.is_empty() { return false; }
    let char_count = s.chars().count();
    let block_count = s.chars().filter(|c| matches!(c, '█' | '▄' | '▀' | '▌' | '▐' | '▖' | '▗' | '▘' | '▙' | '▚' | '▛' | '▜' | '▝' | '▞' | '▟')).count();
    // 至少 30% 是块字符，且行够长（用字符数而非字节数）
    char_count >= 10 && block_count * 10 >= char_count * 3
}

/// 去除 ANSI 转义序列
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_escape = false;
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            in_escape = true;
        } else if in_escape {
            if c.is_ascii_alphabetic() { in_escape = false; }
        } else {
            out.push(c);
        }
    }
    out
}

#[tauri::command]
pub fn cancel_whatsapp_login() -> Result<(), String> {
    // 直接 kill 进程（简化版：kill by name）
    Command::new("pkill")
        .args(["-f", "openclaw channels login"])
        .output()
        .ok();
    Ok(())
}

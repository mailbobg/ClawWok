use serde::{Deserialize, Serialize};
use std::fs;
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

// ─── QQ Relay Deploy (Vercel CLI) ────────────────────────────────────────────

// Embedded relay source files
const RELAY_QQ_TS: &str = include_str!("../../../qq-relay/api/qq.ts");
const RELAY_POLL_TS: &str = include_str!("../../../qq-relay/api/poll.ts");
const RELAY_PACKAGE_JSON: &str = include_str!("../../../qq-relay/package.json");
const RELAY_VERCEL_JSON: &str = include_str!("../../../qq-relay/vercel.json");

#[derive(Debug, Serialize, Deserialize)]
pub struct DeployResult {
    pub ok: bool,
    pub url: Option<String>,
    pub error: Option<String>,
}

/// Deploy QQ relay to Vercel via CLI.
/// Writes embedded relay files to a temp directory, runs `npx vercel deploy`,
/// sets environment variables, then redeploys to production.
/// Streams progress via "qq_deploy_log" events.
#[tauri::command]
pub async fn deploy_qq_relay(
    app: tauri::AppHandle,
    qq_bot_secret: String,
    relay_token: String,
) -> Result<DeployResult, String> {
    use tauri::Emitter;

    let emit = |kind: &str, text: &str| {
        app.emit(
            "qq_deploy_log",
            serde_json::json!({ "kind": kind, "text": text }),
        )
        .ok();
    };

    // 1. Create temp directory with relay files
    emit("log", "准备中转服务文件...");
    let tmp_dir = std::env::temp_dir().join("openclaw-qq-relay");
    let api_dir = tmp_dir.join("api");
    fs::create_dir_all(&api_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    fs::write(api_dir.join("qq.ts"), RELAY_QQ_TS)
        .map_err(|e| format!("写入 qq.ts 失败: {}", e))?;
    fs::write(api_dir.join("poll.ts"), RELAY_POLL_TS)
        .map_err(|e| format!("写入 poll.ts 失败: {}", e))?;
    fs::write(tmp_dir.join("package.json"), RELAY_PACKAGE_JSON)
        .map_err(|e| format!("写入 package.json 失败: {}", e))?;
    fs::write(tmp_dir.join("vercel.json"), RELAY_VERCEL_JSON)
        .map_err(|e| format!("写入 vercel.json 失败: {}", e))?;

    emit("log", "文件就绪 ✓");

    // 2. First deploy (preview) — this creates the project on Vercel
    emit("log", "正在部署到 Vercel（首次可能需要浏览器登录）...");

    let npx = find_npx();
    let deploy_output = run_streaming_command(
        &npx,
        &["vercel", "deploy", "--yes"],
        &tmp_dir,
        &app,
        "qq_deploy_log",
    )?;

    // Extract preview URL from output (last line is typically the URL)
    let preview_url = deploy_output
        .lines()
        .rev()
        .find(|l| l.starts_with("https://"))
        .map(|s| s.trim().to_string());

    if preview_url.is_none() {
        emit("error", "未能获取部署 URL，请检查 Vercel 登录状态");
        return Ok(DeployResult {
            ok: false,
            url: None,
            error: Some("部署失败：未获取到 URL".into()),
        });
    }
    emit("log", &format!("Preview 部署完成: {}", preview_url.as_ref().unwrap()));

    // 3. Set environment variables
    emit("log", "正在设置环境变量...");
    set_vercel_env(&npx, &tmp_dir, "QQ_BOT_SECRET", &qq_bot_secret)?;
    emit("log", "QQ_BOT_SECRET ✓");
    set_vercel_env(&npx, &tmp_dir, "RELAY_TOKEN", &relay_token)?;
    emit("log", "RELAY_TOKEN ✓");

    // 4. Production deploy
    emit("log", "正在部署到生产环境...");
    let prod_output = run_streaming_command(
        &npx,
        &["vercel", "deploy", "--prod", "--yes"],
        &tmp_dir,
        &app,
        "qq_deploy_log",
    )?;

    let prod_url = prod_output
        .lines()
        .rev()
        .find(|l| l.starts_with("https://"))
        .map(|s| s.trim().to_string());

    if let Some(ref url) = prod_url {
        emit("success", &format!("部署成功 ✓ {}", url));
        Ok(DeployResult {
            ok: true,
            url: prod_url,
            error: None,
        })
    } else {
        // Fallback: use the preview URL domain as production URL
        let fallback = preview_url.as_ref().and_then(|u| {
            // Preview URL is like https://project-xxx.vercel.app
            // Production URL is the project name: https://project.vercel.app
            // We can't reliably derive it, so return the preview URL
            Some(u.clone())
        });
        emit("success", "部署完成 ✓（请在 Vercel Dashboard 查看生产 URL）");
        Ok(DeployResult {
            ok: true,
            url: fallback,
            error: None,
        })
    }
}

fn find_npx() -> String {
    for dir in EXTRA_PATHS {
        let p = format!("{}/npx", dir);
        if std::path::Path::new(&p).exists() {
            return p;
        }
    }
    "npx".to_string()
}

/// Run a command, stream stdout/stderr via Tauri events, return combined stdout
fn run_streaming_command(
    program: &str,
    args: &[&str],
    cwd: &std::path::Path,
    app: &tauri::AppHandle,
    event_name: &str,
) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    use tauri::Emitter;

    let mut child = std::process::Command::new(program)
        .args(args)
        .current_dir(cwd)
        .env("PATH", full_path_env())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 {} 失败: {}", program, e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_out = app.clone();
    let event_out = event_name.to_string();
    let stdout_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut output = String::new();
        for line in reader.lines().flatten() {
            let clean = strip_ansi(&line);
            let text = clean.trim().to_string();
            if !text.is_empty() {
                app_out
                    .emit(&event_out, serde_json::json!({ "kind": "log", "text": text }))
                    .ok();
                output.push_str(&text);
                output.push('\n');
            }
        }
        output
    });

    let app_err = app.clone();
    let event_err = event_name.to_string();
    let stderr_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            let clean = strip_ansi(&line);
            let text = clean.trim().to_string();
            if !text.is_empty() {
                app_err
                    .emit(&event_err, serde_json::json!({ "kind": "log", "text": text }))
                    .ok();
            }
        }
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    let output = stdout_handle.join().unwrap_or_default();
    stderr_handle.join().ok();

    if !status.success() {
        return Err(format!("命令退出码: {:?}", status.code()));
    }

    Ok(output)
}

// ─── Clawin (openclaw-app) ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ClawinSaveResult {
    pub ok: bool,
    pub error: Option<String>,
}

/// Save Clawin (openclaw-app) config:
///   1. Uninstall old plugin (if exists)
///   2. Install openclaw-app@1.2.2
///   3. Set roomId, relayUrl, enabled=true
///   4. Restart gateway
#[tauri::command]
pub async fn save_clawin_config(
    app: tauri::AppHandle,
    room_id: String,
    relay_url: String,
) -> Result<ClawinSaveResult, String> {
    use tauri::Emitter;

    let emit = |kind: &str, text: &str| {
        app.emit(
            "clawin_log",
            serde_json::json!({ "kind": kind, "text": text }),
        )
        .ok();
    };

    let bin = openclaw_bin();
    let path_env = full_path_env();

    // 1. Uninstall old plugin (ignore errors)
    emit("log", "卸载旧插件（如有）...");
    let _ = Command::new(&bin)
        .args(["plugins", "uninstall", "openclaw-app"])
        .env("PATH", &path_env)
        .output();

    // 2. Install openclaw-app@1.2.2
    emit("log", "安装 openclaw-app@1.2.2 ...");
    let install = Command::new(&bin)
        .args(["plugins", "install", "openclaw-app@1.2.2"])
        .env("PATH", &path_env)
        .output()
        .map_err(|e| format!("安装插件失败: {}", e))?;

    if !install.status.success() {
        let err = String::from_utf8_lossy(&install.stderr).trim().to_string();
        emit("error", &format!("安装失败: {}", err));
        return Ok(ClawinSaveResult {
            ok: false,
            error: Some(err),
        });
    }
    emit("log", "插件安装完成 ✓");

    // 3. Set config values
    let configs = [
        ("channels.openclaw-app.accounts.default.roomId", room_id.as_str()),
        ("channels.openclaw-app.accounts.default.relayUrl", relay_url.as_str()),
        ("channels.openclaw-app.accounts.default.enabled", "true"),
    ];

    for (key, val) in &configs {
        emit("log", &format!("设置 {} ...", key.rsplit('.').next().unwrap_or(key)));
        let r = Command::new(&bin)
            .args(["config", "set", key, val])
            .env("PATH", &path_env)
            .output()
            .map_err(|e| format!("config set {} 失败: {}", key, e))?;

        if !r.status.success() {
            let err = String::from_utf8_lossy(&r.stderr).trim().to_string();
            emit("error", &format!("设置失败: {}", err));
            return Ok(ClawinSaveResult {
                ok: false,
                error: Some(err),
            });
        }
    }
    emit("log", "配置写入完成 ✓");

    // 4. Restart gateway
    emit("log", "正在重启 Gateway ...");
    let _ = Command::new(&bin)
        .args(["gateway", "restart"])
        .env("PATH", &path_env)
        .output();

    emit("success", "Clawin 配置完成 ✓ 请等待约 30 秒后回到 Clawin App 完成连接");
    Ok(ClawinSaveResult {
        ok: true,
        error: None,
    })
}

/// Set a Vercel environment variable by piping value to stdin
fn set_vercel_env(
    npx: &str,
    cwd: &std::path::Path,
    name: &str,
    value: &str,
) -> Result<(), String> {
    use std::io::Write;

    let mut child = std::process::Command::new(npx)
        .args(["vercel", "env", "add", name, "production", "--force"])
        .current_dir(cwd)
        .env("PATH", full_path_env())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("vercel env add 失败: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(value.as_bytes()).ok();
        stdin.write_all(b"\n").ok();
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("设置 {} 失败: {}", name, err));
    }

    Ok(())
}

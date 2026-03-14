use dirs::home_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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

#[derive(Debug, Serialize, Deserialize)]
pub struct TestResult {
    pub ok: bool,
    pub latency_ms: u64,
    pub error: Option<String>,
    pub model_name: Option<String>,
    /// "ok" | "rate_limited" | "error"
    pub status: String,
}

#[tauri::command]
pub async fn save_llm_config(
    provider: String,
    api_key: String,
    model: String,
) -> Result<(), String> {
    let agent_dir = home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openclaw")
        .join("agents")
        .join("main")
        .join("agent");
    fs::create_dir_all(&agent_dir).map_err(|e| e.to_string())?;

    let auth_path = agent_dir.join("auth-profiles.json");
    let mut store: serde_json::Value = if auth_path.exists() {
        fs::read_to_string(&auth_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| serde_json::json!({ "version": 1, "profiles": {} }))
    } else {
        serde_json::json!({ "version": 1, "profiles": {} })
    };

    // Map provider → openclaw model ID
    // For openrouter, the model ID from the UI is already the openclaw-style sub-path
    // e.g. "deepseek/deepseek-r1" or "deepseek/deepseek-r1:free"
    let openclaw_model = match provider.as_str() {
        "claude"      => format!("anthropic/{}", model),
        "deepseek"    => format!("vllm/{}", model),
        "deepseek_or" => format!("openrouter/{}", model),
        "minimax"     => format!("minimax/{}", model),
        p             => format!("{}/{}", p, model),
    };

    match provider.as_str() {
        "claude" => {
            store["profiles"]["anthropic:manual"] = serde_json::json!({
                "type": "api_key", "provider": "anthropic", "key": api_key
            });
        }
        "deepseek" => {
            // vllm profile for the API call auth
            store["profiles"]["vllm:default"] = serde_json::json!({
                "type": "api_key", "provider": "vllm", "key": api_key
            });
            // Also write the vllm provider config into openclaw.json
            save_vllm_deepseek_config(&api_key)?;
        }
        "deepseek_or" => {
            store["profiles"]["openrouter:manual"] = serde_json::json!({
                "type": "api_key", "provider": "openrouter", "key": api_key
            });
        }
        "minimax" => {
            store["profiles"]["minimax:manual"] = serde_json::json!({
                "type": "api_key", "provider": "minimax", "key": api_key
            });
        }
        p => {
            store["profiles"][&format!("{}:manual", p)] = serde_json::json!({
                "type": "api_key", "provider": p, "key": api_key
            });
        }
    }

    fs::write(&auth_path, serde_json::to_string_pretty(&store).unwrap())
        .map_err(|e| e.to_string())?;

    // Set default model via CLI (writes agents.defaults.model.primary)
    let bin = openclaw_bin();
    let out = Command::new(&bin)
        .args(["models", "set", &openclaw_model])
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| format!("openclaw models set 失败: {}", e))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        eprintln!("openclaw models set warning: {}", err);
    }

    // Also add the model to agents.defaults.models allowlist so the
    // Gateway chat UI allows switching to it.
    // Gateway supports hot-reload — no restart needed.
    let config_path = home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openclaw")
        .join("openclaw.json");
    if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(mut cfg) = serde_json::from_str::<serde_json::Value>(&content) {
            // Ensure agents.defaults.models exists
            if cfg.pointer("/agents/defaults/models").is_none() {
                cfg["agents"]["defaults"]["models"] = serde_json::json!({});
            }
            // Add this model to the allowlist
            cfg["agents"]["defaults"]["models"][&openclaw_model] = serde_json::json!({});
            let _ = fs::write(&config_path, serde_json::to_string_pretty(&cfg).unwrap());
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn test_llm_connection(
    provider: String,
    api_key: String,
    model: String,
) -> Result<TestResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();

    let result = match provider.as_str() {
        "claude"      => test_claude(&client, &api_key).await,
        "deepseek"    => test_deepseek_direct(&client, &api_key).await,
        "deepseek_or" => test_openrouter(&client, &api_key, &model).await,
        "minimax"     => test_minimax(&client, &api_key).await,
        _ => Err("未知的 AI 提供商".to_string()),
    };

    let latency_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(model_name) => Ok(TestResult {
            ok: true,
            latency_ms,
            error: None,
            model_name: Some(model_name),
            status: "ok".to_string(),
        }),
        Err(e) => {
            // Detect rate limit errors (HTTP 429) and region restrictions (HTTP 403)
            let is_rate_limited = e.contains("HTTP 429") || e.to_lowercase().contains("rate limit") || e.contains("请求过多");
            let is_region_blocked = e.contains("区域不可用") || e.contains("not available in your region");
            let status_str = if is_rate_limited {
                "rate_limited"
            } else if is_region_blocked {
                "region_blocked"
            } else {
                "error"
            };
            Ok(TestResult {
                ok: false,
                latency_ms,
                error: Some(e),
                model_name: None,
                status: status_str.to_string(),
            })
        }
    }
}

/// Write vllm provider config into ~/.openclaw/openclaw.json so openclaw
/// routes vllm/deepseek-chat → https://api.deepseek.com/v1 (OpenAI-compatible)
fn save_vllm_deepseek_config(_api_key: &str) -> Result<(), String> {
    let config_path = home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openclaw")
        .join("openclaw.json");

    let mut cfg: serde_json::Value = if config_path.exists() {
        fs::read_to_string(&config_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Inject models.providers.vllm pointing at DeepSeek
    cfg["models"]["mode"] = serde_json::json!("merge");
    cfg["models"]["providers"]["vllm"] = serde_json::json!({
        "baseUrl": "https://api.deepseek.com/v1",
        "api": "openai-completions",
        "models": [{
            "id": "deepseek-chat",
            "name": "DeepSeek Chat",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 65536,
            "maxTokens": 8192
        }]
    });

    fs::write(&config_path, serde_json::to_string_pretty(&cfg).unwrap())
        .map_err(|e| e.to_string())
}

async fn test_deepseek_direct(client: &reqwest::Client, api_key: &str) -> Result<String, String> {
    let model = "deepseek-chat";
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Hi"}]
    });

    let resp = client
        .post("https://api.deepseek.com/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("网络错误: {}", e))?;

    if resp.status().is_success() {
        Ok(model.to_string())
    } else {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        Err(format!("HTTP {}: {}", status, text))
    }
}

async fn test_claude(client: &reqwest::Client, api_key: &str) -> Result<String, String> {
    let model = "claude-sonnet-4-6";
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Hi"}]
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("网络错误: {}", e))?;

    if resp.status().is_success() {
        Ok(model.to_string())
    } else {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        Err(format!("HTTP {}: {}", status, text))
    }
}

async fn test_openrouter(client: &reqwest::Client, api_key: &str, model: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 10,
        "messages": [{"role": "user", "content": "Hi"}]
    });

    let resp = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("网络错误: {}", e))?;

    let status = resp.status();
    if status.is_success() {
        Ok(model.to_string())
    } else {
        let text = resp.text().await.unwrap_or_default();
        let code = status.as_u16();
        match code {
            429 => Err(format!("HTTP 429: 该模型当前请求过多，请稍后再试")),
            403 if text.contains("not available in your region") => {
                Err(format!("HTTP 403: 该模型在当前区域不可用"))
            }
            404 if text.contains("No endpoints") => {
                Err(format!("HTTP 404: 该模型暂无可用节点"))
            }
            _ => Err(format!("HTTP {}: {}", code, text)),
        }
    }
}

/// Read saved config status from disk — active provider, all saved providers, channels
#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigStatus {
    /// Currently active provider (derived from default model), e.g. "claude", "deepseek"
    pub active_provider: Option<String>,
    /// All providers that have API keys saved
    pub saved_providers: Vec<String>,
    /// Whether any API key exists
    pub model_key_set: bool,
    /// Which channels have config saved
    pub channels: Vec<String>,
}

const PROFILE_MAP: &[(&str, &str)] = &[
    ("anthropic:manual", "claude"),
    ("vllm:default", "deepseek"),
    ("openrouter:manual", "deepseek_or"),
    ("minimax:manual", "minimax"),
];

#[tauri::command]
pub fn get_config_status() -> ConfigStatus {
    let home = home_dir().unwrap_or_else(|| PathBuf::from("."));
    let oc_dir = home.join(".openclaw");

    // 1. Check auth-profiles.json — collect ALL providers with keys
    let auth_path = oc_dir.join("agents").join("main").join("agent").join("auth-profiles.json");
    let mut saved_providers: Vec<String> = Vec::new();

    if let Ok(content) = fs::read_to_string(&auth_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(profiles) = json.get("profiles").and_then(|p| p.as_object()) {
                for (key, prov_name) in PROFILE_MAP {
                    if let Some(profile) = profiles.get(*key) {
                        if let Some(k) = profile.get("key").and_then(|k| k.as_str()) {
                            if !k.is_empty() {
                                saved_providers.push(prov_name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Determine active provider from openclaw.json default model
    let config_path = oc_dir.join("openclaw.json");
    let mut active_provider: Option<String> = None;

    if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(default_model) = json.pointer("/models/default").and_then(|v| v.as_str()) {
                // Model format: "anthropic/claude-xxx" or "vllm/deepseek-chat" etc.
                let prefix = default_model.split('/').next().unwrap_or("");
                active_provider = match prefix {
                    "anthropic" => Some("claude".to_string()),
                    "vllm" => Some("deepseek".to_string()),
                    "openrouter" => Some("deepseek_or".to_string()),
                    "minimax" => Some("minimax".to_string()),
                    _ => None,
                };
            }
        }
    }

    // Fallback: if no default model set but exactly one provider has key, that's active
    if active_provider.is_none() && saved_providers.len() == 1 {
        active_provider = Some(saved_providers[0].clone());
    }

    let model_key_set = !saved_providers.is_empty();

    // 3. Check channels from openclaw.json
    let mut channels: Vec<String> = Vec::new();

    if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(ch) = json.get("channels").and_then(|c| c.as_object()) {
                if let Some(feishu) = ch.get("feishu").and_then(|f| f.as_object()) {
                    if feishu.get("appId").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false) {
                        channels.push("feishu".to_string());
                    }
                }
                if let Some(clawin) = ch.get("openclaw-app").and_then(|c| c.as_object()) {
                    if let Some(accounts) = clawin.get("accounts").and_then(|a| a.as_object()) {
                        if let Some(default) = accounts.get("default").and_then(|d| d.as_object()) {
                            if default.get("roomId").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false) {
                                channels.push("clawin".to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // WhatsApp: check if session directory exists
    let wa_store = oc_dir.join("channels").join("whatsapp");
    if wa_store.exists() && wa_store.is_dir() {
        if let Ok(entries) = fs::read_dir(&wa_store) {
            if entries.into_iter().any(|e| e.is_ok()) {
                channels.push("whatsapp".to_string());
            }
        }
    }

    ConfigStatus {
        active_provider,
        saved_providers,
        model_key_set,
        channels,
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrModel {
    pub id: String,
    pub name: String,
    pub free: bool,
}

/// List OpenRouter models supported by the installed OpenClaw version.
/// Uses `openclaw models list --all --provider openrouter --json`.
#[tauri::command]
pub fn list_openrouter_models() -> Vec<OrModel> {
    let bin = openclaw_bin();
    let out = Command::new(&bin)
        .args(["models", "list", "--all", "--provider", "openrouter", "--json"])
        .env("PATH", full_path_env())
        .output();

    let output = match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        _ => return Vec::new(),
    };

    // stdout may contain plugin log lines before the JSON.
    // The output is an object: {"count": N, "models": [...]}
    // Find the JSON object boundaries.
    let start = output.find("{\"count\"")
        .or_else(|| output.find("{\n"))
        .or_else(|| output.find("[{"))
        .unwrap_or(0);
    let end = output.rfind('}').map(|i| i + 1)
        .or_else(|| output.rfind(']').map(|i| i + 1))
        .unwrap_or(output.len());
    let json_str = &output[start..end];

    // IDs that are not real models (aliases / pseudo-entries)
    const INVALID_IDS: &[&str] = &["auto", "free", "healer-alpha", "hunter-alpha"];

    // Try parsing as object with "models" array first, then as plain array
    let items: Vec<serde_json::Value> = if let Ok(obj) = serde_json::from_str::<serde_json::Value>(json_str) {
        if let Some(arr) = obj.get("models").and_then(|m| m.as_array()) {
            arr.clone()
        } else if let Some(arr) = obj.as_array() {
            arr.clone()
        } else {
            return Vec::new();
        }
    } else {
        return Vec::new();
    };

    items.iter()
        .filter_map(|item| {
            let key = item.get("key")?.as_str()?;
            let name = item.get("name").and_then(|n| n.as_str()).unwrap_or(key);
            let sub = key.strip_prefix("openrouter/")?;
            // Skip invalid pseudo-model IDs
            if INVALID_IDS.contains(&sub) {
                return None;
            }
            Some(OrModel {
                id: sub.to_string(),
                name: name.to_string(),
                free: sub.ends_with(":free"),
            })
        })
        .collect()
}

async fn test_minimax(client: &reqwest::Client, api_key: &str) -> Result<String, String> {
    let model = "minimax-m2.5:free";
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "name": "user", "content": "Hi"}],
        "tokens_to_generate": 10
    });

    let resp = client
        .post("https://api.minimax.chat/v1/text/chatcompletion_v2")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("网络错误: {}", e))?;

    if resp.status().is_success() {
        Ok(model.to_string())
    } else {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        Err(format!("HTTP {}: {}", status, text))
    }
}

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

    // Map provider → (auth_provider, openclaw_model, extra_profile_id)
    // deepseek: use vllm provider pointing at api.deepseek.com (OpenAI-compatible)
    // deepseek_or: route through OpenRouter
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

    // Set default model
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

    Ok(())
}

#[tauri::command]
pub async fn test_llm_connection(
    provider: String,
    api_key: String,
) -> Result<TestResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let start = std::time::Instant::now();

    let result = match provider.as_str() {
        "claude"      => test_claude(&client, &api_key).await,
        "deepseek"    => test_deepseek_direct(&client, &api_key).await,
        "deepseek_or" => test_deepseek_openrouter(&client, &api_key).await,
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
        }),
        Err(e) => Ok(TestResult {
            ok: false,
            latency_ms,
            error: Some(e),
            model_name: None,
        }),
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

async fn test_deepseek_openrouter(client: &reqwest::Client, api_key: &str) -> Result<String, String> {
    let model = "deepseek/deepseek-chat-v3-0324:free";
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

    if resp.status().is_success() {
        Ok(model.to_string())
    } else {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        Err(format!("HTTP {}: {}", status, text))
    }
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

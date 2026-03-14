use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MarketSkill {
    pub slug: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub downloads: u64,
    #[serde(default)]
    pub stars: u64,
    #[serde(default)]
    pub installs: u64,
    #[serde(default)]
    pub updated_at: Option<serde_json::Value>, // can be number or string
    #[serde(default)]
    pub score: Option<f64>,
    #[serde(default)]
    pub owner: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MarketCategory {
    pub name: String,
    pub name_zh: String,
    pub count: u32,
    pub slugs: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MarketData {
    pub total: u64,
    pub featured: Vec<String>,        // slug list
    pub categories: Vec<MarketCategory>,
    pub skills: Vec<MarketSkill>,
}

// Raw JSON shape from the CDN
#[derive(Debug, Deserialize)]
struct RawMarketJson {
    total: u64,
    #[serde(default)]
    featured: Vec<String>,             // slug list, NOT skill objects
    #[serde(default)]
    categories: serde_json::Value,     // object keyed by category name
    #[serde(default)]
    skills: Vec<MarketSkill>,
}

/// Category name → Chinese label mapping
fn category_zh(name: &str) -> &str {
    match name {
        "ai-intelligence" | "AI 智能" => "AI 智能",
        "dev-tools" | "开发工具" => "开发工具",
        "productivity" | "效率提升" => "效率提升",
        "data-analytics" | "数据分析" => "数据分析",
        "content-creation" | "内容创作" => "内容创作",
        "security-compliance" | "安全合规" => "安全合规",
        "communication" | "通讯协作" => "通讯协作",
        _ => name,
    }
}

fn category_en(name: &str) -> &str {
    match name {
        "ai-intelligence" | "AI 智能" => "AI Intelligence",
        "dev-tools" | "开发工具" => "Dev Tools",
        "productivity" | "效率提升" => "Productivity",
        "data-analytics" | "数据分析" => "Data Analytics",
        "content-creation" | "内容创作" => "Content Creation",
        "security-compliance" | "安全合规" => "Security",
        "communication" | "通讯协作" => "Communication",
        _ => name,
    }
}

/// Known fallback data URLs (most recent hashes)
const KNOWN_DATA_URLS: &[&str] = &[
    "https://cloudcache.tencentcs.com/qcloud/tea/app/data/skills.2d46363b.json",
];

#[tauri::command]
pub async fn fetch_skill_market() -> Result<MarketData, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .user_agent("ClawWok/0.1.0")
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    // Try known URLs first (fastest path), then discover
    let mut last_err = String::new();
    let mut raw: Option<RawMarketJson> = None;

    for url in KNOWN_DATA_URLS {
        match client.get(*url).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<RawMarketJson>().await {
                    Ok(data) => { raw = Some(data); break; }
                    Err(e) => { last_err = format!("Parse error from {}: {e}", url); }
                }
            }
            Ok(resp) => { last_err = format!("HTTP {} from {}", resp.status(), url); }
            Err(e) => { last_err = format!("Fetch error from {}: {e}", url); }
        }
    }

    // Fallback: discover URL from HTML
    if raw.is_none() {
        if let Some(discovered) = discover_data_url(&client).await {
            match client.get(&discovered).send().await {
                Ok(resp) if resp.status().is_success() => {
                    match resp.json::<RawMarketJson>().await {
                        Ok(data) => { raw = Some(data); }
                        Err(e) => { last_err = format!("Parse discovered URL: {e}"); }
                    }
                }
                Ok(resp) => { last_err = format!("HTTP {} from discovered URL", resp.status()); }
                Err(e) => { last_err = format!("Fetch discovered URL: {e}"); }
            }
        }
    }

    let raw = raw.ok_or_else(|| format!("All fetch attempts failed. Last error: {last_err}"))?;

    // Convert categories object → vec
    let categories = if let serde_json::Value::Object(map) = &raw.categories {
        map.iter()
            .filter_map(|(key, val)| {
                let slugs: Vec<String> = val
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                Some(MarketCategory {
                    name: category_en(key).to_string(),
                    name_zh: category_zh(key).to_string(),
                    count: slugs.len() as u32,
                    slugs,
                })
            })
            .collect()
    } else {
        vec![]
    };

    Ok(MarketData {
        total: raw.total,
        featured: raw.featured,
        categories,
        skills: raw.skills,
    })
}

async fn discover_data_url(client: &reqwest::Client) -> Option<String> {
    // Try to fetch the HTML index and find the JS bundle that references the data file
    let html = client
        .get("https://skillhub.tencent.com/")
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;

    // Look for skills.<hash>.json pattern anywhere in HTML/JS
    let needle = "skills.";
    let suffix = ".json";
    let base = "https://cloudcache.tencentcs.com/qcloud/tea/app/data/";

    // Search byte-by-byte for the pattern
    if let Some(pos) = html.find(needle) {
        let rest = &html[pos..];
        if let Some(end) = rest.find(suffix) {
            let filename = &rest[..end + suffix.len()];
            if filename.len() < 60 && !filename.contains(' ') && !filename.contains('\n') {
                return Some(format!("{}{}", base, filename));
            }
        }
    }

    // Try finding JS bundles and scanning them
    for js_pattern in &["app.", "index.", "main."] {
        if let Some(pos) = html.find(js_pattern) {
            let rest = &html[pos..];
            if let Some(end) = rest.find(".js") {
                let js_file = &rest[..end + 3];
                if js_file.len() < 60 && !js_file.contains(' ') {
                    let js_url = format!("https://cloudcache.tencentcs.com/qcloud/tea/app/{}", js_file);
                    if let Ok(resp) = client.get(&js_url).send().await {
                        if let Ok(js_text) = resp.text().await {
                            if let Some(pos2) = js_text.find("skills.") {
                                let rest2 = &js_text[pos2..];
                                if let Some(end2) = rest2.find(".json") {
                                    let filename2 = &rest2[..end2 + 5];
                                    if filename2.len() < 60 && !filename2.contains(' ') {
                                        return Some(format!("{}{}", base, filename2));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

/// Scan disk for user-installed skill slugs (NOT bundled ones).
/// Only checks ~/.openclaw/skills/ — bundled skills ship with openclaw
/// and should not be marked as "installed from market".
#[tauri::command]
pub fn list_installed_skills() -> Vec<String> {
    let mut slugs = std::collections::HashSet::new();

    if let Some(home) = dirs::home_dir() {
        let user_dir = home.join(".openclaw").join("skills");
        if let Ok(entries) = std::fs::read_dir(&user_dir) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    if let Some(name) = entry.file_name().to_str() {
                        slugs.insert(name.to_string());
                    }
                }
            }
        }
    }

    slugs.into_iter().collect()
}

#[tauri::command]
pub async fn install_market_skill(
    slug: String,
    app: tauri::AppHandle,
) -> Result<String, String> {
    use tauri::Emitter;

    let extra_paths = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/local/sbin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ];
    let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("/tmp"));
    let local_bin = home.join(".local").join("bin");

    let current = std::env::var("PATH").unwrap_or_default();
    let full_path: std::ffi::OsString = format!(
        "{}:{}:{}",
        local_bin.display(),
        extra_paths.join(":"),
        current
    )
    .into();

    // Find skillhub binary (installed via SkillHub CLI)
    let skillhub_bin = [local_bin.join("skillhub").to_string_lossy().to_string()]
        .into_iter()
        .chain(extra_paths.iter().map(|p| format!("{}/skillhub", p)))
        .find(|p| std::path::Path::new(p).exists());

    let Some(bin) = skillhub_bin else {
        return Err(
            "skillhub CLI not found. Install it first:\n\
             curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash -s -- --cli-only"
                .to_string(),
        );
    };

    app.emit(
        "market_install_log",
        serde_json::json!({ "slug": slug, "text": format!("Installing {}...", slug) }),
    )
    .ok();

    // Install to ~/.openclaw/skills so openclaw can find them
    let skills_dir = home.join(".openclaw").join("skills");
    std::fs::create_dir_all(&skills_dir).ok();

    let output = std::process::Command::new(&bin)
        .args(["--dir", &skills_dir.to_string_lossy(), "install", &slug])
        .env("PATH", &full_path)
        .output()
        .map_err(|e| format!("Failed to run skillhub: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    for line in stdout.lines().chain(stderr.lines()) {
        if !line.trim().is_empty() {
            app.emit(
                "market_install_log",
                serde_json::json!({ "slug": slug, "text": line }),
            )
            .ok();
        }
    }

    if output.status.success() {
        app.emit(
            "market_install_log",
            serde_json::json!({ "slug": slug, "text": "Installed ✓" }),
        )
        .ok();
        Ok(slug)
    } else {
        let err_msg = if stderr.trim().is_empty() {
            stdout
        } else {
            stderr
        };
        Err(format!("Install failed: {}", err_msg.trim()))
    }
}

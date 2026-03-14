use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read as IoRead;
use std::process::Command;

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
    "openclaw".to_string()
}

/// Strip plugin registration lines that appear before JSON in CLI stdout.
fn extract_json(raw: &str) -> &str {
    if let Some(pos) = raw.find('{') {
        &raw[pos..]
    } else {
        raw
    }
}

// ---------- Data types matching `openclaw skills list --json` ----------

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MissingRequirements {
    #[serde(default)]
    pub bins: Vec<String>,
    #[serde(default)]
    pub any_bins: Vec<String>,
    #[serde(default)]
    pub env: Vec<String>,
    #[serde(default)]
    pub config: Vec<String>,
    #[serde(default)]
    pub os: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillItem {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub emoji: Option<String>,
    pub eligible: bool,
    pub disabled: bool,
    #[serde(default)]
    pub blocked_by_allowlist: bool,
    pub source: String,
    #[serde(default)]
    pub bundled: bool,
    #[serde(default)]
    pub homepage: Option<String>,
    pub missing: MissingRequirements,
    /// Directory modification time (epoch ms), filled post-parse
    #[serde(default)]
    pub installed_at: Option<u64>,
    /// Directory name on disk (may differ from name), filled post-parse
    #[serde(default)]
    pub dir_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillsListResponse {
    skills: Vec<SkillItem>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsListResult {
    pub skills: Vec<SkillItem>,
    pub total: usize,
    pub eligible_count: usize,
}

// ---------- Commands ----------

#[tauri::command]
pub async fn list_skills() -> Result<SkillsListResult, String> {
    let bin = openclaw_bin();
    let output = Command::new(&bin)
        .args(["skills", "list", "--json"])
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| format!("执行失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let json_str = extract_json(&stdout);

    let parsed: SkillsListResponse = serde_json::from_str(json_str)
        .map_err(|e| format!("JSON 解析失败: {} — 输出: {}", e, &stdout[..stdout.len().min(200)]))?;

    // Enrich with installed_at from directory modification time
    let skill_dirs: Vec<std::path::PathBuf> = if let Some(home) = dirs::home_dir() {
        vec![
            home.join(".openclaw").join("skills"),
            home.join(".agents").join("skills"),
            home.join(".cursor").join("skills"),
        ]
    } else {
        vec![]
    };

    let mut skills = parsed.skills;

    // Build a set of known skill names from CLI output
    let cli_names: std::collections::HashSet<String> = skills.iter().map(|s| s.name.clone()).collect();

    for skill in &mut skills {
        // Try to find the skill directory and get its mtime + dir_name
        for dir in &skill_dirs {
            // Try matching by name first
            let candidate = dir.join(&skill.name);
            if candidate.exists() {
                if let Ok(meta) = fs::metadata(&candidate) {
                    if let Ok(modified) = meta.modified() {
                        if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                            skill.installed_at = Some(duration.as_millis() as u64);
                        }
                    }
                }
                skill.dir_name = Some(skill.name.clone());
                break;
            }
            // Also scan dir entries for SKILL.md that declares this skill name
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        continue;
                    }
                    let dir_name = entry.file_name().to_string_lossy().to_string();
                    let skill_md = entry.path().join("SKILL.md");
                    if skill_md.exists() {
                        if let Ok(content) = fs::read_to_string(&skill_md) {
                            if let Some(parsed_name) = parse_skill_name(&content) {
                                if parsed_name == skill.name {
                                    skill.dir_name = Some(dir_name);
                                    if let Ok(meta) = fs::metadata(entry.path()) {
                                        if let Ok(modified) = meta.modified() {
                                            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                                                skill.installed_at = Some(duration.as_millis() as u64);
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            if skill.dir_name.is_some() {
                break;
            }
        }
    }

    // Supplement: scan disk directories for skills NOT in CLI output
    for dir in &skill_dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    continue;
                }
                let dir_name = entry.file_name().to_string_lossy().to_string();
                let skill_md = entry.path().join("SKILL.md");
                if !skill_md.exists() {
                    continue;
                }
                // Parse SKILL.md to get name and description
                let content = match fs::read_to_string(&skill_md) {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                let parsed_name = parse_skill_name(&content).unwrap_or_else(|| dir_name.clone());

                // Skip if CLI already reported this skill (by name or dir_name)
                if cli_names.contains(&parsed_name) {
                    continue;
                }
                if skills.iter().any(|s| s.dir_name.as_deref() == Some(&dir_name)) {
                    continue;
                }

                let description = parse_skill_description(&content).unwrap_or_default();
                let emoji = parse_skill_emoji(&content);

                let mut installed_at = None;
                if let Ok(meta) = fs::metadata(entry.path()) {
                    if let Ok(modified) = meta.modified() {
                        if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                            installed_at = Some(duration.as_millis() as u64);
                        }
                    }
                }

                let source = dir.to_string_lossy().to_string();

                skills.push(SkillItem {
                    name: parsed_name,
                    description,
                    emoji,
                    eligible: true, // on disk = available
                    disabled: false,
                    blocked_by_allowlist: false,
                    source,
                    bundled: false,
                    homepage: None,
                    missing: MissingRequirements::default(),
                    installed_at,
                    dir_name: Some(dir_name),
                });
            }
        }
    }

    let total = skills.len();
    let eligible_count = skills.iter().filter(|s| s.eligible).count();

    // Sort: most recently installed first (non-bundled with timestamp),
    // then bundled skills alphabetically
    skills.sort_by(|a, b| {
        match (a.installed_at, b.installed_at) {
            (Some(ta), Some(tb)) => tb.cmp(&ta), // newer first
            (Some(_), None) => std::cmp::Ordering::Less, // installed before non-installed
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.name.cmp(&b.name), // alphabetical fallback
        }
    });

    Ok(SkillsListResult {
        skills,
        total,
        eligible_count,
    })
}

#[tauri::command]
pub async fn toggle_skill(name: String, enabled: bool) -> Result<(), String> {
    let bin = openclaw_bin();
    let path = format!("skills.entries.{}.enabled", name);

    let output = if enabled {
        // Re-enable: remove the explicit disabled entry
        Command::new(&bin)
            .args(["config", "unset", &path])
            .env("PATH", full_path_env())
            .output()
    } else {
        // Disable: set enabled to false
        Command::new(&bin)
            .args(["config", "set", &path, "false"])
            .env("PATH", full_path_env())
            .output()
    };

    let output = output.map_err(|e| format!("执行失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("操作失败: {}", stderr.trim()));
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDetail {
    pub name: String,
    pub description: String,
    pub source: String,
    #[serde(default)]
    pub bundled: bool,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub base_dir: Option<String>,
    #[serde(default)]
    pub emoji: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    pub disabled: bool,
    pub eligible: bool,
    #[serde(default)]
    pub blocked_by_allowlist: bool,
    #[serde(default)]
    pub always: bool,
    #[serde(default)]
    pub missing: MissingRequirements,
    #[serde(default)]
    pub install: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstallOption {
    pub id: String,
    pub kind: String,
    pub label: String,
    #[serde(default)]
    pub bins: Vec<String>,
    // brew
    #[serde(default)]
    pub formula: Option<String>,
    #[serde(default)]
    pub cask: Option<String>,
    // node
    #[serde(default)]
    pub package: Option<String>,
}

/// Install a dependency for a skill (brew or npm).
/// Streams progress via `skill_install_log` events.
#[tauri::command]
pub async fn install_skill_dep(
    app: tauri::AppHandle,
    skill_name: String,
    install_id: String,
) -> Result<(), String> {
    use tauri::Emitter;

    // Fetch skill detail to get the install option
    let bin = openclaw_bin();
    let output = Command::new(&bin)
        .args(["skills", "info", &skill_name, "--json"])
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| format!("执行失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let json_str = extract_json(&stdout);

    let detail: SkillDetail = serde_json::from_str(json_str)
        .map_err(|e| format!("JSON 解析失败: {}", e))?;

    let opt: InstallOption = detail
        .install
        .iter()
        .find_map(|v| {
            let o: Result<InstallOption, _> = serde_json::from_value(v.clone());
            o.ok().filter(|o| o.id == install_id)
        })
        .ok_or_else(|| format!("未找到安装选项: {}", install_id))?;

    let emit = |text: &str| {
        app.emit(
            "skill_install_log",
            serde_json::json!({ "skill": &skill_name, "text": text }),
        )
        .ok();
    };

    emit(&format!("开始安装: {}", opt.label));

    // Build the command + args.
    // OpenClaw install options: { id, kind, label, bins[] }
    // - bins[0] is the formula/package name to install
    // - id containing "cask" means brew --cask
    // - formula/cask/package fields are optional overrides (rarely present)
    let (cmd_bin, cmd_args, err_label) = match opt.kind.as_str() {
        "brew" => {
            let target = opt
                .cask
                .as_deref()
                .or(opt.formula.as_deref())
                .or(opt.bins.first().map(|s| s.as_str()))
                .unwrap_or(&opt.id)
                .to_string();
            let brew_bin = EXTRA_PATHS
                .iter()
                .map(|d| format!("{}/brew", d))
                .find(|p| std::path::Path::new(p).exists())
                .unwrap_or_else(|| "brew".to_string());

            let is_cask = opt.cask.is_some() || opt.id.contains("cask");
            let mut args = vec!["install".to_string()];
            if is_cask {
                args.push("--cask".to_string());
            }
            args.push(target);

            emit(&format!("$ brew {}", args.join(" ")));
            (brew_bin, args, "brew install 失败")
        }
        "node" => {
            let pkg = opt
                .package
                .as_deref()
                .or(opt.bins.first().map(|s| s.as_str()))
                .unwrap_or(&opt.id)
                .to_string();
            let npm_bin = EXTRA_PATHS
                .iter()
                .map(|d| format!("{}/npm", d))
                .find(|p| std::path::Path::new(p).exists())
                .unwrap_or_else(|| "npm".to_string());

            emit(&format!("$ npm install -g {}", pkg));
            (
                npm_bin,
                vec!["install".to_string(), "-g".to_string(), pkg],
                "npm install 失败",
            )
        }
        other => {
            return Err(format!("不支持的安装类型: {}", other));
        }
    };

    // Run the install command, capture all output, then emit to frontend
    let app_handle = app.clone();
    let skill = skill_name.clone();
    let err_msg = err_label.to_string();

    let result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        use tauri::Emitter;

        let emit_log = |text: &str| {
            app_handle
                .emit(
                    "skill_install_log",
                    serde_json::json!({ "skill": &skill, "text": text }),
                )
                .ok();
        };

        let home = std::env::var("HOME").unwrap_or_else(|_| {
            format!("/Users/{}", std::env::var("USER").unwrap_or_default())
        });
        let user = std::env::var("USER").unwrap_or_default();

        emit_log(&format!("执行: {} {}", cmd_bin, cmd_args.join(" ")));

        let output = Command::new(&cmd_bin)
            .args(&cmd_args)
            .env("PATH", full_path_env())
            .env("HOME", &home)
            .env("USER", &user)
            .env("LANG", "en_US.UTF-8")
            .env("HOMEBREW_NO_AUTO_UPDATE", "1")
            .env("HOMEBREW_NO_INSTALL_CLEANUP", "1")
            .env("HOMEBREW_NO_ENV_HINTS", "1")
            .output()
            .map_err(|e| {
                emit_log(&format!("启动失败: {}", e));
                format!("执行失败: {}", e)
            })?;

        // Emit stdout
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let t = line.trim();
            if !t.is_empty() {
                emit_log(t);
            }
        }

        // Emit stderr
        let stderr = String::from_utf8_lossy(&output.stderr);
        for line in stderr.lines() {
            let t = line.trim();
            if !t.is_empty() {
                emit_log(t);
            }
        }

        let code = output.status.code().unwrap_or(-1);

        if !output.status.success() {
            emit_log(&format!("退出码: {}", code));
            emit_log("安装失败 ✗");
            return Err(err_msg);
        }

        emit_log("安装成功 ✓");
        Ok(())
    })
    .await
    .map_err(|e| format!("任务执行失败: {}", e))?;

    result
}

#[tauri::command]
pub async fn get_skill_detail(name: String) -> Result<SkillDetail, String> {
    let bin = openclaw_bin();
    let output = Command::new(&bin)
        .args(["skills", "info", &name, "--json"])
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| format!("执行失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let json_str = extract_json(&stdout);

    serde_json::from_str(json_str)
        .map_err(|e| format!("JSON 解析失败: {}", e))
}

#[derive(Debug, Deserialize)]
pub struct CreateSkillInput {
    pub name: String,
    pub description: String,
    pub body: String,
    #[serde(default)]
    pub bins: Vec<String>,
    #[serde(default)]
    pub env: Vec<String>,
}

#[tauri::command]
pub async fn create_skill(input: CreateSkillInput) -> Result<String, String> {
    let home = std::env::var("HOME")
        .map_err(|_| "无法获取 HOME 目录".to_string())?;
    let skills_dir = format!("{}/.openclaw/skills", home);
    let skill_dir = format!("{}/{}", skills_dir, input.name);

    if std::path::Path::new(&skill_dir).exists() {
        return Err(format!("技能 '{}' 已存在", input.name));
    }

    // Build YAML frontmatter
    let mut frontmatter = format!(
        "---\nname: {}\ndescription: {}",
        input.name, input.description
    );
    if !input.bins.is_empty() {
        frontmatter.push_str(&format!("\nbins: [{}]", input.bins.join(", ")));
    }
    if !input.env.is_empty() {
        frontmatter.push_str(&format!("\nenv: [{}]", input.env.join(", ")));
    }
    frontmatter.push_str("\n---\n");

    let content = format!("{}\n{}\n", frontmatter, input.body);
    let file_path = format!("{}/SKILL.md", skill_dir);

    // Ensure parent dirs exist
    fs::create_dir_all(&skill_dir)
        .map_err(|e| format!("创建目录失败: {}", e))?;

    fs::write(&file_path, content)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    Ok(file_path)
}

// ---------- Shared zip extraction ----------

fn managed_skills_dir() -> Result<String, String> {
    let home = std::env::var("HOME")
        .map_err(|_| "无法获取 HOME 目录".to_string())?;
    Ok(format!("{}/.openclaw/skills", home))
}

/// Parse a YAML frontmatter field value.
fn parse_frontmatter_field<'a>(content: &'a str, field: &str) -> Option<&'a str> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    let after_open = &trimmed[3..];
    let end = after_open.find("---")?;
    let frontmatter = &after_open[..end];
    let prefix = format!("{}:", field);
    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix(&prefix) {
            let val = rest.trim().trim_matches('"').trim_matches('\'');
            if !val.is_empty() {
                return Some(val);
            }
        }
    }
    None
}

fn parse_skill_description(content: &str) -> Option<String> {
    parse_frontmatter_field(content, "description").map(|s| s.to_string())
}

fn parse_skill_emoji(content: &str) -> Option<String> {
    parse_frontmatter_field(content, "emoji").map(|s| s.to_string())
}

/// Parse `name` from SKILL.md YAML frontmatter.
fn parse_skill_name(content: &str) -> Option<String> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return None;
    }
    // Find closing ---
    let after_open = &trimmed[3..];
    let end = after_open.find("---")?;
    let frontmatter = &after_open[..end];
    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("name:") {
            let name = rest.trim().trim_matches('"').trim_matches('\'');
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
    }
    None
}

/// Extract a zip archive into `~/.openclaw/skills/{name}/`.
/// The zip must contain a SKILL.md (at root or inside a single top-level dir).
/// Returns the skill name.
fn extract_skill_zip(zip_path: &std::path::Path) -> Result<String, String> {
    let file = fs::File::open(zip_path)
        .map_err(|e| format!("无法打开文件: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("无法读取 ZIP: {}", e))?;

    // Find SKILL.md and detect prefix (could be at root or inside a single folder)
    let mut skill_md_path: Option<String> = None;
    let mut prefix = String::new();
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| format!("ZIP 条目错误: {}", e))?;
        let name = entry.name().to_string();
        if name.ends_with("SKILL.md") {
            // Check if it's root-level or one dir deep
            let parts: Vec<&str> = name.split('/').collect();
            if parts.len() == 1 {
                // SKILL.md at root
                prefix = String::new();
            } else if parts.len() == 2 {
                // dir/SKILL.md
                prefix = format!("{}/", parts[0]);
            } else {
                continue; // too deep, skip
            }
            skill_md_path = Some(name);
            break;
        }
    }

    let skill_md_path = skill_md_path
        .ok_or_else(|| "ZIP 中未找到 SKILL.md 文件".to_string())?;

    // Read SKILL.md content to get the name
    let mut skill_md_content = String::new();
    {
        let mut entry = archive.by_name(&skill_md_path)
            .map_err(|e| format!("无法读取 SKILL.md: {}", e))?;
        entry.read_to_string(&mut skill_md_content)
            .map_err(|e| format!("读取 SKILL.md 失败: {}", e))?;
    }

    let skill_name = parse_skill_name(&skill_md_content)
        .ok_or_else(|| "SKILL.md 中未找到 name 字段".to_string())?;

    let skills_dir = managed_skills_dir()?;
    let dest = format!("{}/{}", skills_dir, skill_name);

    if std::path::Path::new(&dest).exists() {
        return Err(format!("技能 '{}' 已存在", skill_name));
    }

    fs::create_dir_all(&dest)
        .map_err(|e| format!("创建目录失败: {}", e))?;

    // Extract all files under the prefix
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)
            .map_err(|e| format!("ZIP 条目错误: {}", e))?;
        let full_name = entry.name().to_string();

        // Skip entries not under our prefix
        let relative = if prefix.is_empty() {
            full_name.clone()
        } else if let Some(r) = full_name.strip_prefix(&prefix) {
            r.to_string()
        } else {
            continue;
        };

        if relative.is_empty() {
            continue;
        }

        let out_path = format!("{}/{}", dest, relative);

        if entry.is_dir() {
            fs::create_dir_all(&out_path).ok();
        } else {
            if let Some(parent) = std::path::Path::new(&out_path).parent() {
                fs::create_dir_all(parent).ok();
            }
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)
                .map_err(|e| format!("解压文件失败: {}", e))?;
            fs::write(&out_path, &buf)
                .map_err(|e| format!("写入文件失败: {}", e))?;
        }
    }

    Ok(skill_name)
}

// ---------- Uninstall skill ----------

#[tauri::command]
pub async fn uninstall_skill(name: String) -> Result<(), String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?;

    // Use `openclaw skills info` to get the actual baseDir
    let bin = openclaw_bin();
    let output = Command::new(&bin)
        .args(["skills", "info", &name, "--json"])
        .env("PATH", full_path_env())
        .output()
        .map_err(|e| format!("Failed to query skill info: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let json_str = extract_json(&stdout);
    let detail: SkillDetail = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse skill info: {}", e))?;

    if detail.bundled {
        return Err("Cannot uninstall bundled skills".to_string());
    }

    let base_dir = detail.base_dir
        .ok_or_else(|| format!("Skill '{}' has no baseDir", name))?;
    let skill_path = std::path::PathBuf::from(&base_dir);

    if !skill_path.exists() {
        return Err(format!("Skill directory not found: {}", base_dir));
    }

    // Safety: only allow deletion within known skill directories
    let allowed_bases = [
        home.join(".openclaw").join("skills"),
        home.join(".agents").join("skills"),
        home.join(".cursor").join("skills"),
    ];

    let canonical = skill_path.canonicalize()
        .map_err(|e| format!("Path error: {}", e))?;

    let is_safe = allowed_bases.iter().any(|base| {
        base.canonicalize()
            .map(|cb| canonical.starts_with(&cb))
            .unwrap_or(false)
    });

    if !is_safe {
        return Err(format!("Cannot uninstall skill at {}: outside managed directories", base_dir));
    }

    fs::remove_dir_all(&skill_path)
        .map_err(|e| format!("Failed to remove skill: {}", e))?;

    Ok(())
}

// ---------- Import from zip file ----------

#[tauri::command]
pub async fn import_skill_zip(path: String) -> Result<String, String> {
    let zip_path = std::path::PathBuf::from(&path);
    if !zip_path.exists() {
        return Err("文件不存在".to_string());
    }
    extract_skill_zip(&zip_path)
}

// ---------- Import from URL ----------

#[tauri::command]
pub async fn import_skill_url(app: tauri::AppHandle, url: String) -> Result<String, String> {
    use tauri::Emitter;
    use tokio::io::AsyncWriteExt;

    let emit = |text: &str| {
        app.emit(
            "skill_install_log",
            serde_json::json!({ "skill": "__import__", "text": text }),
        )
        .ok();
    };

    emit(&format!("下载: {}", url));

    // Download to temp file
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP 客户端错误: {}", e))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP 错误: {}", resp.status()));
    }

    let total_size = resp.content_length();
    if let Some(size) = total_size {
        emit(&format!("文件大小: {:.1} KB", size as f64 / 1024.0));
    }

    let tmp_dir = std::env::temp_dir();
    let tmp_file = tmp_dir.join("openclaw_skill_import.zip");

    let bytes = resp.bytes().await
        .map_err(|e| format!("下载数据失败: {}", e))?;

    let mut file = tokio::fs::File::create(&tmp_file)
        .await
        .map_err(|e| format!("创建临时文件失败: {}", e))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| format!("写入临时文件失败: {}", e))?;
    file.flush().await.ok();

    emit("下载完成，解压中...");

    // Extract (blocking I/O)
    let tmp_path = tmp_file.clone();
    let result = tokio::task::spawn_blocking(move || extract_skill_zip(&tmp_path))
        .await
        .map_err(|e| format!("任务执行失败: {}", e))?;

    // Cleanup temp file
    tokio::fs::remove_file(&tmp_file).await.ok();

    match &result {
        Ok(name) => emit(&format!("导入成功: {} ✓", name)),
        Err(e) => emit(&format!("导入失败: {}", e)),
    }

    result
}

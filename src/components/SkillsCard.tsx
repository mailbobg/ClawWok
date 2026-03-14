import { useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useSkillsStore,
  type SkillItem,
  type SkillsListResult,
  type SkillDetail,
} from "@/store/skills";
import {
  RefreshCw,
  Loader2,
  ChevronRight,
  ExternalLink,
  Search,
  ToggleLeft,
  ToggleRight,
  Download,
  Plus,
  Upload,
  Link,
  FileText,
  Trash2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

export function SkillsCard() {
  const t = useT();

  const {
    skills,
    loading,
    error,
    searchQuery,
    expandedSkill,
    togglingSkill,
    installingSkill,
    installDone,
    installLogs,
    skillDetails,
    setSkills,
    setLoading,
    setError,
    setSearchQuery,
    setExpandedSkill,
    setTogglingSkill,
    updateSkillDisabled,
    setInstallingSkill,
    setInstallDone,
    appendInstallLog,
    clearInstallLogs,
    setSkillDetail,
    clearSkillDetail,
  } = useSkillsStore();

  const [uninstallingSkill, setUninstallingSkill] = useState<string | null>(null);

  const handleUninstall = async (skillName: string) => {
    const msg = t("skills.uninstallConfirm").replace("{name}", skillName);
    if (!window.confirm(msg)) return;
    setUninstallingSkill(skillName);
    try {
      await invoke("uninstall_skill", { name: skillName });
      await fetchSkills();
    } catch (err) {
      setError(String(err));
    } finally {
      setUninstallingSkill(null);
    }
  };

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SkillsListResult>("list_skills");
      setSkills(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError, setSkills]);

  useEffect(() => {
    fetchSkills();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSkill = async (skill: SkillItem) => {
    if (!skill.eligible || togglingSkill) return;
    setTogglingSkill(skill.name);
    const newDisabled = !skill.disabled;
    updateSkillDisabled(skill.name, newDisabled);
    try {
      await invoke("toggle_skill", {
        name: skill.name,
        enabled: !newDisabled,
      });
    } catch (err) {
      updateSkillDisabled(skill.name, !newDisabled);
      setError(String(err));
    } finally {
      setTogglingSkill(null);
    }
  };

  const fetchDetail = useCallback(
    async (name: string) => {
      if (skillDetails[name]) return;
      try {
        const detail = await invoke<SkillDetail>("get_skill_detail", { name });
        setSkillDetail(name, detail);
      } catch {
        // silently ignore
      }
    },
    [skillDetails, setSkillDetail]
  );

  const handleExpand = useCallback(
    (name: string) => {
      setExpandedSkill(name);
      const skill = skills.find((s) => s.name === name);
      if (skill && !skill.eligible) {
        fetchDetail(name);
      }
    },
    [setExpandedSkill, skills, fetchDetail]
  );

  const installDep = async (skillName: string, installId: string) => {
    if (installingSkill && !installDone) return;
    setInstallingSkill(skillName);
    setInstallDone(false);
    clearInstallLogs();
    const unlisten = await listen<{ skill: string; text: string }>(
      "skill_install_log",
      (e) => {
        if (e.payload.skill === skillName) {
          appendInstallLog(e.payload.text);
        }
      }
    );
    try {
      await invoke("install_skill_dep", {
        skillName,
        installId,
      });
      clearSkillDetail(skillName);
      appendInstallLog(t("skills.log.refreshing"));
      await fetchSkills();
      const updated = useSkillsStore.getState().skills.find(
        (s) => s.name === skillName
      );
      if (updated?.eligible) {
        appendInstallLog(t("skills.log.nowEligible"));
      } else {
        appendInstallLog(t("skills.log.stillNotEligible"));
      }
    } catch (err) {
      appendInstallLog(`${t("skills.log.error")} ${err}`);
    } finally {
      unlisten();
      setInstallDone(true);
    }
  };

  const dismissInstall = () => {
    setInstallingSkill(null);
    setInstallDone(false);
    clearInstallLogs();
  };

  // --- Create / Import skill ---
  type CreateTab = "manual" | "zip" | "url";
  const [showCreate, setShowCreate] = useState(false);
  const [createTab, setCreateTab] = useState<CreateTab>("url");
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    body: "",
    bins: "",
    env: "",
  });
  const [zipPath, setZipPath] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importLogs, setImportLogs] = useState<string[]>([]);

  const toKebab = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const resetCreateState = () => {
    setShowCreate(false);
    setCreateForm({ name: "", description: "", body: "", bins: "", env: "" });
    setZipPath(null);
    setImportUrl("");
    setImportLogs([]);
  };

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.description.trim()) return;
    setCreating(true);
    try {
      const input = {
        name: toKebab(createForm.name),
        description: createForm.description.trim(),
        body: createForm.body.trim() || "TODO: Add skill instructions here.",
        bins: createForm.bins
          ? createForm.bins.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        env: createForm.env
          ? createForm.env.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      };
      await invoke<string>("create_skill", { input });
      resetCreateState();
      await fetchSkills();
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  };

  const importZipFromPath = async (path: string) => {
    setZipPath(path);
    setCreating(true);
    try {
      const name = await invoke<string>("import_skill_zip", { path });
      resetCreateState();
      await fetchSkills();
      setExpandedSkill(name);
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  };

  const handlePickZip = async () => {
    const selected = await openFileDialog({
      title: t("skills.selectFile"),
      filters: [{ name: "Skill Package", extensions: ["zip"] }],
      multiple: false,
    });
    if (selected) {
      await importZipFromPath(selected as string);
    }
  };

  const handleImportUrl = async () => {
    if (!importUrl.trim()) return;
    setCreating(true);
    setImportLogs([]);
    const unlisten = await listen<{ skill: string; text: string }>(
      "skill_install_log",
      (e) => {
        if (e.payload.skill === "__import__") {
          setImportLogs((prev) => [...prev, e.payload.text]);
        }
      }
    );
    try {
      const name = await invoke<string>("import_skill_url", {
        url: importUrl.trim(),
      });
      resetCreateState();
      await fetchSkills();
      setExpandedSkill(name);
    } catch (err) {
      setError(String(err));
    } finally {
      unlisten();
      setCreating(false);
    }
  };

  // Hide bundled skills that are not eligible (missing system deps the user can't fix)
  // Show: all user-installed skills + eligible bundled skills
  const visible = skills.filter((s) => !s.bundled || s.eligible);

  const filtered = visible.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const dirName = (s.dirName || "").toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      dirName.includes(q) ||
      s.description.toLowerCase().includes(q) ||
      (s.emoji && s.emoji.toLowerCase().includes(q)) ||
      s.source.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Section label */}
      <div className="shrink-0 flex items-center justify-between px-4 mb-1.5">
        <p className="text-[13px] text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
          {t("skills.title")}
          {!loading && visible.length > 0 && (
            <span className="ml-1.5 normal-case tracking-normal">{visible.length}</span>
          )}
        </p>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors"
            title={t("skills.createSkill")}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={fetchSkills}
            disabled={loading}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 bg-[hsl(var(--card))] rounded-[12px]">

        {/* Search */}
        {visible.length > 10 && (
          <div className="px-3 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input
                placeholder={t("skills.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-[34px] pl-8 text-[14px] border-0 bg-[hsl(var(--muted))] rounded-[8px] shadow-none"
              />
            </div>
          </div>
        )}

        {/* Create / Import panel */}
        {showCreate && (
          <div className="px-4 py-3 space-y-3">
            {/* Tab switcher — segmented */}
            <div className="flex gap-0.5 rounded-[9px] bg-[hsl(var(--muted))] p-[3px]">
              {([
                { key: "url" as CreateTab, icon: Link, label: "URL" },
                { key: "zip" as CreateTab, icon: Upload, label: "ZIP" },
                { key: "manual" as CreateTab, icon: FileText, label: t("skills.manual") },
              ]).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setCreateTab(key)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 text-[13px] py-[6px] rounded-[7px] transition-all",
                    createTab === key
                      ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] font-medium shadow-sm"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Manual tab */}
            {createTab === "manual" && (
              <div className="space-y-2.5">
                {/* Template quick-fill */}
                {!createForm.name && (
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-[hsl(var(--muted-foreground))]">{t("skills.fromTemplate")}</span>
                    {[
                      {
                        label: t("skills.tplTranslator"),
                        form: {
                          name: "translator",
                          description: "将选中文本翻译为指定语言",
                          body: "你是一个翻译助手。用户会给你一段文本和目标语言，你需要将文本翻译为目标语言。\n\n## 规则\n- 保持原文格式和语气\n- 专业术语保留原文并在括号中给出翻译\n- 如果目标语言未指定，默认翻译为英文",
                          bins: "",
                          env: "",
                        },
                      },
                      {
                        label: t("skills.tplCodeReview"),
                        form: {
                          name: "code-review",
                          description: "审查代码质量并给出改进建议",
                          body: "你是一个代码审查专家。分析用户提交的代码，从以下维度给出反馈：\n\n1. **潜在 Bug** — 逻辑错误、边界情况\n2. **性能** — 可优化的地方\n3. **可读性** — 命名、结构、注释\n4. **安全性** — 注入、泄露等风险\n\n用简洁的中文回复，给出具体行号和修改建议。",
                          bins: "",
                          env: "",
                        },
                      },
                      {
                        label: t("skills.tplShell"),
                        form: {
                          name: "shell-helper",
                          description: "生成和解释 Shell 命令",
                          body: "你是一个 Shell 命令专家。用户描述想要完成的任务，你生成对应的命令。\n\n## 规则\n- 默认使用 bash/zsh 语法\n- 给出命令前先简要解释思路\n- 危险操作（rm -rf、chmod 等）必须警告\n- 如有多种方案，列出最简洁的",
                          bins: "bash",
                          env: "",
                        },
                      },
                    ].map((tpl) => (
                      <button
                        key={tpl.label}
                        onClick={() => setCreateForm(tpl.form)}
                        className="text-[13px] px-2.5 py-1 rounded-[7px] bg-[hsl(var(--primary))]/8 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/15 transition-colors"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                )}
                <Input
                  placeholder={t("skills.nameHint")}
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="h-[34px] text-[14px]"
                />
                <Input
                  placeholder={t("skills.descHint")}
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, description: e.target.value }))
                  }
                  className="h-[34px] text-[14px]"
                />
                <textarea
                  placeholder={t("skills.bodyHint")}
                  value={createForm.body}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, body: e.target.value }))
                  }
                  rows={4}
                  className="w-full rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--input))] px-3 py-2.5 text-[14px] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:border-[hsl(var(--primary))] resize-y"
                />
                <details className="group">
                  <summary className="text-[13px] text-[hsl(var(--muted-foreground))] cursor-pointer select-none flex items-center gap-1.5 hover:text-[hsl(var(--foreground))] transition-colors">
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                    {t("skills.advanced")}
                    {(createForm.bins || createForm.env) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--primary))]" />
                    )}
                  </summary>
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder={t("skills.binsHint")}
                      value={createForm.bins}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, bins: e.target.value }))
                      }
                      className="h-[34px] text-[14px] flex-1"
                    />
                    <Input
                      placeholder={t("skills.envHint")}
                      value={createForm.env}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, env: e.target.value }))
                      }
                      className="h-[34px] text-[14px] flex-1"
                    />
                  </div>
                </details>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={resetCreateState}>
                    {t("skills.cancel")}
                  </Button>
                  <Button
                    disabled={creating || !createForm.name.trim() || !createForm.description.trim()}
                    onClick={handleCreate}
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
                    {t("skills.create")}
                  </Button>
                </div>
              </div>
            )}

            {/* ZIP tab */}
            {createTab === "zip" && (
              <div className="space-y-2.5">
                <div
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.dataset.over = "true"; }}
                  onDragLeave={(e) => { e.currentTarget.dataset.over = "false"; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.dataset.over = "false";
                    const file = e.dataTransfer.files[0];
                    if (file && file.name.endsWith(".zip") && (file as any).path) {
                      importZipFromPath((file as any).path);
                    }
                  }}
                  onClick={() => { if (!creating) handlePickZip(); }}
                  className="flex flex-col items-center justify-center gap-2.5 py-8 rounded-[10px] border-2 border-dashed border-[hsl(var(--border))] hover:border-[hsl(var(--primary))] data-[over=true]:border-[hsl(var(--primary))] data-[over=true]:bg-[hsl(var(--primary))/0.05] transition-colors cursor-pointer"
                >
                  {creating ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--primary))]" />
                      <p className="text-[15px] text-[hsl(var(--muted-foreground))]">
                        {t("skills.importing")} {zipPath?.split("/").pop()}...
                      </p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-[hsl(var(--muted-foreground))]" />
                      <div className="text-center">
                        <p className="text-[15px] text-[hsl(var(--foreground))]">{t("skills.dropZip")}</p>
                        <p className="text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5">{t("skills.dropZipHint")}</p>
                      </div>
                    </>
                  )}
                </div>
                {!creating && (
                  <div className="flex justify-end">
                    <Button variant="ghost" onClick={resetCreateState}>
                      {t("skills.cancel")}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* URL tab */}
            {createTab === "url" && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] text-[hsl(var(--muted-foreground))]">
                    {t("skills.urlHint")}
                  </p>
                  <button
                    onClick={() => openUrl("https://clawhub.ai/skills?sort=downloads")}
                    className="inline-flex items-center gap-1 text-[14px] text-[hsl(var(--primary))] hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    ClawHub
                  </button>
                </div>
                <Input
                  placeholder="https://example.com/my-skill.zip"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="h-[34px] text-[14px]"
                />
                {importLogs.length > 0 && (
                  <div className="log-stream rounded-[8px] bg-[hsl(var(--muted))] px-3 py-2.5 max-h-28 overflow-y-auto">
                    {importLogs.map((l, i) => (
                      <div key={i} className="text-[hsl(var(--muted-foreground))] py-[3px]">
                        <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>
                        {l}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={resetCreateState}>
                    {t("skills.cancel")}
                  </Button>
                  <Button
                    disabled={creating || !importUrl.trim()}
                    onClick={handleImportUrl}
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Link className="w-4 h-4 mr-1.5" />}
                    {t("skills.import")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && skills.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--muted-foreground))]" />
            <span className="text-[15px] text-[hsl(var(--muted-foreground))]">
              {t("skills.loading")}
            </span>
          </div>
        )}

        {/* Error */}
        {error && <div className="px-4 py-3 text-[15px] text-[hsl(var(--destructive))]">{error}</div>}

        {/* Skills list — fill remaining height */}
        {filtered.length > 0 && (
          <div className="relative flex-1 min-h-0">
          <div className="absolute inset-0 overflow-y-auto divide-y divide-[hsl(var(--border))]">
            {filtered.map((skill) => (
              <SkillRow
                key={skill.name}
                skill={skill}
                expanded={expandedSkill === skill.name}
                toggling={togglingSkill === skill.name}
                installing={installingSkill === skill.name && !installDone}
                installDone={installingSkill === skill.name && installDone}
                installLogs={
                  installingSkill === skill.name ? installLogs : []
                }
                installOptions={skillDetails[skill.name]?.install ?? []}
                onToggle={() => toggleSkill(skill)}
                onExpand={() => handleExpand(skill.name)}
                onInstall={(installId) => installDep(skill.name, installId)}
                onDismissInstall={dismissInstall}
                uninstalling={uninstallingSkill === skill.name}
                onUninstall={() => handleUninstall(skill.name)}
              />
            ))}
          </div>
          </div>
        )}

        {/* Empty after filter */}
        {!loading && filtered.length === 0 && visible.length > 0 && (
          <div className="py-6 text-center text-[15px] text-[hsl(var(--muted-foreground))]">
            {t("skills.noMatch")}
          </div>
        )}

        {/* Empty: no skills at all */}
        {!loading && visible.length === 0 && !error && (
          <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
            <p className="text-[15px] text-[hsl(var(--muted-foreground))]">
              {t("skills.noSkills")}
            </p>
            <Button variant="outline" onClick={fetchSkills}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> {t("skills.retry")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- SkillRow ----------

interface SkillRowProps {
  skill: SkillItem;
  expanded: boolean;
  toggling: boolean;
  installing: boolean;
  installDone: boolean;
  installLogs: string[];
  installOptions: { id: string; kind: string; label: string }[];
  onToggle: () => void;
  onExpand: () => void;
  onInstall: (installId: string) => void;
  onDismissInstall: () => void;
  uninstalling: boolean;
  onUninstall: () => void;
}

function SkillRow({
  skill,
  expanded,
  toggling,
  installing,
  installDone,
  installLogs,
  installOptions,
  onToggle,
  onExpand,
  onInstall,
  onDismissInstall,
  uninstalling,
  onUninstall,
}: SkillRowProps) {
  const t = useT();

  const statusBadge = skill.eligible ? (
    skill.disabled ? (
      <Badge variant="warning" className="text-[11px] py-0">
        {t("skills.badgeDisabled")}
      </Badge>
    ) : (
      <Badge variant="success" className="text-[11px] py-0">
        {t("skills.badgeEnabled")}
      </Badge>
    )
  ) : (
    <Badge variant="warning" className="text-[11px] py-0">
      {t("skills.badgeNeedSetup")}
    </Badge>
  );

  const hasMissing =
    !skill.eligible &&
    (skill.missing.bins.length > 0 ||
      skill.missing.anyBins.length > 0 ||
      skill.missing.env.length > 0 ||
      skill.missing.config.length > 0 ||
      skill.missing.os.length > 0);

  return (
    <div className="hover:bg-[hsl(var(--background))] transition-colors">
      {/* Main row — consistent with market style */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={onExpand}
      >
        <div className="flex-1 min-w-0 mr-3">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium truncate">{skill.name}</span>
            {statusBadge}
          </div>
          <p className={cn(
            "text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5",
            !expanded && "truncate"
          )}>
            {skill.description.trim()}
          </p>
          {!expanded && (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                {skill.source}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {skill.eligible && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              disabled={toggling}
              className="shrink-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              title={skill.disabled ? t("skills.enable") : t("skills.disable")}
            >
              {toggling ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : skill.disabled ? (
                <ToggleLeft className="w-6 h-6" />
              ) : (
                <ToggleRight className="w-6 h-6 text-[hsl(var(--success))]" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 pt-0 space-y-1.5">
          <DetailLine label={t("skills.source")} value={skill.source} />
          {hasMissing && (
            <div className="space-y-1">
              {skill.missing.bins.length > 0 && (
                <DetailLine label={t("skills.missingBins")} value={skill.missing.bins.join(", ")} warn />
              )}
              {skill.missing.anyBins.length > 0 && (
                <DetailLine label={t("skills.missingAnyBins")} value={skill.missing.anyBins.join(" / ")} warn />
              )}
              {skill.missing.env.length > 0 && (
                <DetailLine label={t("skills.missingEnv")} value={skill.missing.env.join(", ")} warn />
              )}
              {skill.missing.config.length > 0 && (
                <DetailLine label={t("skills.missingConfig")} value={skill.missing.config.join(", ")} warn />
              )}
              {skill.missing.os.length > 0 && (
                <DetailLine label={t("skills.unsupportedOs")} value={skill.missing.os.join(", ")} warn />
              )}
            </div>
          )}
          {/* Install buttons */}
          {!skill.eligible && installOptions.length > 0 && !installing && !installDone && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {installOptions.map((opt) => (
                <Button
                  key={opt.id}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInstall(opt.id);
                  }}
                >
                  <Download className="w-3.5 h-3.5" />
                  {opt.label}
                </Button>
              ))}
            </div>
          )}
          {/* Installing indicator */}
          {installing && (
            <div className="flex items-center gap-1.5 pt-1 text-[13px] text-[hsl(var(--muted-foreground))]">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("skills.installing")}
            </div>
          )}
          {/* Install logs */}
          {(installing || installDone) && installLogs.length > 0 && (
            <div className="mt-1.5 log-stream rounded-[8px] bg-[hsl(var(--muted))] px-3 py-2.5 max-h-36 overflow-y-auto">
              {installLogs.map((l, i) => (
                <div key={i} className="text-[hsl(var(--muted-foreground))] py-[3px]">
                  <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>
                  {l}
                </div>
              ))}
            </div>
          )}
          {/* Dismiss button after install done */}
          {installDone && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismissInstall();
              }}
              className="mt-1 text-[13px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
            >
              {t("skills.closeLogs")}
            </button>
          )}
          <div className="flex items-center gap-3 pt-1">
            {skill.homepage && (
              <button
                onClick={() => openUrl(skill.homepage!)}
                className="inline-flex items-center gap-1.5 text-[14px] text-[hsl(var(--primary))] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> {t("skills.docs")}
              </button>
            )}
            {/* Uninstall — only for non-bundled skills (managed, extra, personal, etc.) */}
            {!skill.bundled && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!uninstalling) onUninstall();
                }}
                disabled={uninstalling}
                className="inline-flex items-center gap-1.5 text-[13px] text-red-500 hover:text-red-700 transition-colors"
              >
                {uninstalling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {uninstalling ? t("skills.uninstalling") : t("skills.uninstall")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailLine({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-2.5 text-[13px]">
      <span className="text-[hsl(var(--muted-foreground))] shrink-0 w-22">
        {label}
      </span>
      <span
        className={
          warn
            ? "text-[hsl(var(--warning))]"
            : "text-[hsl(var(--foreground))]/70"
        }
      >
        {value}
      </span>
    </div>
  );
}

import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWizard, type LlmProvider, type TestResult } from "@/store/wizard";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  ChevronRight,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { Search } from "lucide-react";

interface OrModel { id: string; name: string; free: boolean }

/** Simple fuzzy match: all chars of query appear in order in target */
function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  // exact substring is best
  if (t.includes(q)) return { match: true, score: 2 };
  // fuzzy: chars appear in order
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length ? { match: true, score: 1 } : { match: false, score: 0 };
}

// Cache fetched models across renders
let _modelsCache: OrModel[] | null = null;

export function Step2_Model() {
  const {
    llmProvider,
    llmApiKey,
    llmModel,
    llmTestResult,
    llmTesting,
    setLlmProvider,
    setLlmApiKey,
    setLlmTestResult,
    setLlmTesting,
    setLlmModel,
    editingFromManage,
    advance,
    back,
  } = useWizard();

  const t = useT();
  const [showKey, setShowKey] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const [orModels, setOrModels] = useState<OrModel[]>(_modelsCache ?? []);
  const [modelsLoading, setModelsLoading] = useState(false);

  const fetchModels = useCallback(async () => {
    if (_modelsCache) { setOrModels(_modelsCache); return; }
    setModelsLoading(true);
    try {
      // Get models from OpenClaw CLI (guaranteed to work)
      const list: OrModel[] = await invoke("list_openrouter_models");
      list.sort((a, b) => (a.free === b.free ? a.name.localeCompare(b.name) : a.free ? -1 : 1));
      _modelsCache = list;
      setOrModels(list);
    } catch {
      // Fallback: if invoke fails (e.g. browser-only mode), user can type custom model ID
    } finally {
      setModelsLoading(false);
    }
  }, []);

  // Fetch models when OpenRouter is selected
  useEffect(() => {
    if (llmProvider === "deepseek_or" && orModels.length === 0) fetchModels();
  }, [llmProvider, orModels.length, fetchModels]);

  const selectedModelLabel = useMemo(() => {
    const found = orModels.find((m) => m.id === llmModel);
    return found ? `${found.name}${found.free ? " ✦ Free" : ""}` : llmModel;
  }, [llmModel, orModels]);

  const filteredModels = useMemo(() => {
    if (!modelSearch) return orModels.slice(0, 50); // show first 50 by default
    return orModels
      .map((m) => {
        const nameMatch = fuzzyMatch(modelSearch, m.name);
        const idMatch = fuzzyMatch(modelSearch, m.id);
        const best = nameMatch.score >= idMatch.score ? nameMatch : idMatch;
        return { ...m, ...best };
      })
      .filter((m) => m.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }, [modelSearch, orModels]);

  const PROVIDERS: { id: LlmProvider; name: string; desc: string; tag: string; keyHint: string }[] = [
    {
      id: "claude",
      name: "Claude",
      desc: t("model.claude.desc"),
      tag: t("model.tag.anthropic"),
      keyHint: "Anthropic API Key (sk-ant-...)",
    },
    {
      id: "deepseek",
      name: t("model.deepseek.name"),
      desc: t("model.deepseek.desc"),
      tag: t("model.tag.recommended"),
      keyHint: "DeepSeek API Key (sk-...)",
    },
    {
      id: "deepseek_or",
      name: t("model.deepseekOr.name"),
      desc: t("model.deepseekOr.desc"),
      tag: t("model.tag.multiModel"),
      keyHint: "OpenRouter API Key (sk-or-...)",
    },
    {
      id: "minimax",
      name: "Minimax",
      desc: t("model.minimax.desc"),
      tag: t("model.tag.cnOptimized"),
      keyHint: "Minimax API Key",
    },
  ];

  const testConnection = async () => {
    if (!llmApiKey.trim()) return;
    setLlmTesting(true);
    setLlmTestResult(null);
    try {
      const result = await invoke<TestResult>("test_llm_connection", {
        provider: llmProvider,
        apiKey: llmApiKey.trim(),
        model: llmModel,
      });
      setLlmTestResult(result);

      if (result.ok || result.status === "rate_limited") {
        await invoke("save_llm_config", {
          provider: llmProvider,
          apiKey: llmApiKey.trim(),
          model: llmModel,
        });
      }
    } catch (err) {
      setLlmTestResult({ ok: false, latency_ms: 0, error: String(err), model_name: null, status: "error" });
    } finally {
      setLlmTesting(false);
    }
  };

  const canAdvance = llmTestResult?.ok === true || llmTestResult?.status === "rate_limited";

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-5">
      {/* Section header */}
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight">{t("model.title")}</h2>
        <p className="text-[15px] text-[hsl(var(--muted-foreground))] mt-1">
          {t("model.subtitle")}
        </p>
      </div>

      {/* Provider selector — Apple grouped list */}
      <div className="apple-group">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => setLlmProvider(p.id)}
            className={cn(
              "apple-row w-full cursor-pointer transition-colors",
              llmProvider === p.id
                ? "bg-[hsl(var(--primary))]/[0.06]"
                : "hover:bg-[hsl(var(--background))]"
            )}
          >
            <div className="flex items-center gap-3.5">
              <div className={cn(
                "w-[34px] h-[34px] rounded-[8px] flex items-center justify-center text-[13px] font-bold text-white",
                p.id === "claude" ? "bg-[#d97706]" :
                p.id === "deepseek" ? "bg-[hsl(var(--primary))]" :
                p.id === "deepseek_or" ? "bg-[hsl(var(--success))]" :
                "bg-[#8b5cf6]"
              )}>
                {p.name.charAt(0)}
              </div>
              <div className="text-left">
                <div className="text-[17px] font-medium text-[hsl(var(--foreground))]">
                  {p.name}
                  <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                    {p.tag}
                  </span>
                </div>
                <div className="text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5">{p.desc}</div>
              </div>
            </div>
            {llmProvider === p.id ? (
              <CheckCircle2 className="w-5 h-5 text-[hsl(var(--primary))] shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[hsl(var(--muted-foreground))]/40 shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* API Key input — Apple grouped */}
      <div className="apple-group">
        <div className="apple-row">
          <span className="text-[17px] text-[hsl(var(--foreground))] shrink-0 mr-3">{t("model.apiKeyLabel")}</span>
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder={PROVIDERS.find((p) => p.id === llmProvider)?.keyHint ?? t("model.pasteKey")}
              value={llmApiKey}
              onChange={(e) => setLlmApiKey(e.target.value)}
              className="pr-9 border-0 bg-transparent shadow-none focus-visible:ring-0 h-auto py-0 text-[15px]"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Model selector — only for OpenRouter */}
      {llmProvider === "deepseek_or" && (
        <div className="relative">
          <div className="apple-group">
            <button
              type="button"
              onClick={() => {
                setModelDropdownOpen(!modelDropdownOpen);
                setModelSearch("");
                setTimeout(() => modelInputRef.current?.focus(), 50);
              }}
              className="apple-row w-full cursor-pointer"
            >
              <span className="text-[17px] text-[hsl(var(--foreground))] shrink-0 mr-3">{t("model.modelLabel")}</span>
              <span className="flex-1 text-[15px] text-[hsl(var(--foreground))] text-left truncate">{selectedModelLabel}</span>
              <ChevronRight className={cn("w-4 h-4 text-[hsl(var(--muted-foreground))] shrink-0 transition-transform", modelDropdownOpen && "rotate-90")} />
            </button>
          </div>
          {modelDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[hsl(var(--border))]">
                <Search className="w-4 h-4 text-[hsl(var(--muted-foreground))] shrink-0" />
                <input
                  ref={modelInputRef}
                  type="text"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder={t("model.modelHint")}
                  className="flex-1 bg-transparent text-[14px] outline-none text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && modelSearch.trim()) {
                      // If search matches exactly one preset, pick it; otherwise use as custom model ID
                      if (filteredModels.length === 1) {
                        setLlmModel(filteredModels[0].id);
                      } else if (modelSearch.includes("/")) {
                        setLlmModel(modelSearch.trim());
                      }
                      setModelDropdownOpen(false);
                    } else if (e.key === "Escape") {
                      setModelDropdownOpen(false);
                    }
                  }}
                />
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {modelsLoading && (
                  <div className="px-3 py-4 text-center text-[13px] text-[hsl(var(--muted-foreground))]">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    {t("skills.loading")}
                  </div>
                )}
                {filteredModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setLlmModel(m.id); setModelDropdownOpen(false); }}
                    className={cn(
                      "w-full px-3 py-2.5 text-left flex items-center justify-between hover:bg-[hsl(var(--primary))]/[0.06] transition-colors",
                      llmModel === m.id && "bg-[hsl(var(--primary))]/[0.06]",
                    )}
                  >
                    <div className="min-w-0">
                      <span className="text-[14px] font-medium text-[hsl(var(--foreground))]">{m.name}</span>
                      {m.free && <span className="ml-1.5 text-[11px] text-[hsl(var(--success))]">Free</span>}
                      <div className="text-[12px] text-[hsl(var(--muted-foreground))] truncate">{m.id}</div>
                    </div>
                    {llmModel === m.id && <CheckCircle2 className="w-4 h-4 text-[hsl(var(--primary))] shrink-0" />}
                  </button>
                ))}
                {!modelsLoading && filteredModels.length === 0 && modelSearch.trim() && (
                  <button
                    type="button"
                    onClick={() => { setLlmModel(modelSearch.trim()); setModelDropdownOpen(false); }}
                    className="w-full px-3 py-2.5 text-left hover:bg-[hsl(var(--primary))]/[0.06]"
                  >
                    <span className="text-[14px] text-[hsl(var(--foreground))]">{t("model.customModel")}</span>
                    <div className="text-[12px] text-[hsl(var(--muted-foreground))]">{modelSearch.trim()}</div>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Test result */}
      {llmTestResult && (
        <div className="apple-group">
          <div className="apple-row">
            <div className="flex items-center gap-2.5">
              {llmTestResult.ok ? (
                <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))] shrink-0" />
              ) : llmTestResult.status === "rate_limited" ? (
                <CheckCircle2 className="w-5 h-5 text-[#f59e0b] shrink-0" />
              ) : llmTestResult.status === "region_blocked" ? (
                <XCircle className="w-5 h-5 text-[#f59e0b] shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0" />
              )}
              <div>
                {llmTestResult.ok ? (
                  <div className="text-[15px]">
                    <span className="text-[hsl(var(--success))] font-medium">{t("model.testSuccess")}</span>
                    <span className="text-[hsl(var(--muted-foreground))] ml-2">
                      {llmTestResult.model_name} · {llmTestResult.latency_ms}ms
                    </span>
                  </div>
                ) : llmTestResult.status === "rate_limited" ? (
                  <div className="text-[15px]">
                    <span className="text-[#f59e0b] font-medium">{t("model.testRateLimit")}</span>
                    <div className="text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5">
                      {t("model.testRateLimitHint")}
                    </div>
                  </div>
                ) : llmTestResult.status === "region_blocked" ? (
                  <div className="text-[15px]">
                    <span className="text-[#f59e0b] font-medium">{t("model.testRegionBlocked")}</span>
                    <div className="text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5">
                      {t("model.testRegionBlockedHint")}
                    </div>
                  </div>
                ) : (
                  <div className="text-[15px]">
                    <span className="text-[hsl(var(--destructive))] font-medium">{t("model.testFail")}</span>
                    <span className="text-[hsl(var(--muted-foreground))] ml-2 text-[13px]">
                      {llmTestResult.error}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-auto pt-3">
        <Button variant="ghost" onClick={back}>
          <ArrowLeft className="w-5 h-5 mr-1.5" /> {editingFromManage ? t("common.cancel") : t("model.back")}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={testConnection}
            disabled={!llmApiKey.trim() || llmTesting}
          >
            {llmTesting ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : null}
            {t("model.test")}
          </Button>
          <Button onClick={advance} disabled={editingFromManage ? false : !canAdvance}>
            {editingFromManage ? t("common.done") : t("model.next")} {!editingFromManage && <ArrowRight className="w-5 h-5 ml-1.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

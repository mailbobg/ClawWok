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
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

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
    advance,
    back,
  } = useWizard();

  const t = useT();
  const [showKey, setShowKey] = useState(false);

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
      tag: t("model.tag.free"),
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
      });
      setLlmTestResult(result);

      if (result.ok) {
        await invoke("save_llm_config", {
          provider: llmProvider,
          apiKey: llmApiKey.trim(),
          model: llmModel,
        });
      }
    } catch (err) {
      setLlmTestResult({ ok: false, latency_ms: 0, error: String(err), model_name: null });
    } finally {
      setLlmTesting(false);
    }
  };

  const canAdvance = llmTestResult?.ok === true;

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

      {/* Test result */}
      {llmTestResult && (
        <div className="apple-group">
          <div className="apple-row">
            <div className="flex items-center gap-2.5">
              {llmTestResult.ok ? (
                <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))] shrink-0" />
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
          <ArrowLeft className="w-5 h-5 mr-1.5" /> {t("model.back")}
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
          <Button onClick={advance} disabled={!canAdvance}>
            {t("model.next")} <ArrowRight className="w-5 h-5 ml-1.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

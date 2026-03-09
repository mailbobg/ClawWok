import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useWizard, type LlmProvider, type TestResult } from "@/store/wizard";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const PROVIDERS: { id: LlmProvider; name: string; desc: string; tag: string; keyHint: string }[] = [
  {
    id: "claude",
    name: "Claude",
    desc: "最强大脑 · 复杂推理首选",
    tag: "Anthropic",
    keyHint: "Anthropic API Key (sk-ant-...)",
  },
  {
    id: "deepseek",
    name: "DeepSeek 直连",
    desc: "直连官方 API · 填 DeepSeek Key",
    tag: "推荐",
    keyHint: "DeepSeek API Key (sk-...)",
  },
  {
    id: "deepseek_or",
    name: "DeepSeek 免费",
    desc: "经由 OpenRouter · 有免费额度",
    tag: "免费",
    keyHint: "OpenRouter API Key (sk-or-...)",
  },
  {
    id: "minimax",
    name: "Minimax",
    desc: "中文语境专家 · 高并发长文本",
    tag: "国内优化",
    keyHint: "Minimax API Key",
  },
];

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

  const [showKey, setShowKey] = useState(false);

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
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <div>
        <h2 className="text-lg font-semibold">模型配置</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
          选择 AI 提供商并填入 API Key
        </p>
      </div>

      {/* Provider selector */}
      <div className="grid grid-cols-2 gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => setLlmProvider(p.id)}
            className={cn(
              "rounded-lg border p-3 text-left transition-all",
              llmProvider === p.id
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.08)]"
                : "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.5)]"
            )}
          >
            <div className="flex items-start justify-between gap-1 mb-1">
              <span className="text-sm font-medium">{p.name}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
                {p.tag}
              </span>
            </div>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-4">
              {p.desc}
            </p>
          </button>
        ))}
      </div>

      {/* API Key input */}
      <div className="space-y-2">
        <label className="text-sm text-[hsl(var(--foreground)/0.7)]">
          API Key
        </label>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            placeholder={PROVIDERS.find((p) => p.id === llmProvider)?.keyHint ?? "粘贴 API Key..."}
            value={llmApiKey}
            onChange={(e) => setLlmApiKey(e.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Test result */}
      {llmTestResult && (
        <div
          className={cn(
            "rounded-lg p-3 flex items-start gap-3",
            llmTestResult.ok
              ? "bg-emerald-500/10 border border-emerald-500/20"
              : "bg-red-500/10 border border-red-500/20"
          )}
        >
          {llmTestResult.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          )}
          <div className="text-sm">
            {llmTestResult.ok ? (
              <>
                <span className="text-emerald-400 font-medium">连接成功</span>
                <span className="text-[hsl(var(--muted-foreground))] ml-2">
                  · {llmTestResult.model_name} · {llmTestResult.latency_ms}ms
                </span>
              </>
            ) : (
              <>
                <span className="text-red-400 font-medium">连接失败</span>
                <span className="text-[hsl(var(--muted-foreground))] ml-2 text-xs">
                  {llmTestResult.error}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {canAdvance && (
        <Badge variant="success" className="self-start">
          <CheckCircle2 className="w-3 h-3" />
          API Key 已验证
        </Badge>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-auto pt-2">
        <Button variant="ghost" size="sm" onClick={back}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={testConnection}
            disabled={!llmApiKey.trim() || llmTesting}
          >
            {llmTesting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            测试连接
          </Button>
          <Button onClick={advance} disabled={!canAdvance}>
            下一步 <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

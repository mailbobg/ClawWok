import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { useWizard } from "@/store/wizard";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  ArrowLeft,
  Zap,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GatewayStatus {
  running: boolean;
  url: string;
  port: number;
}

export function Step4_Complete() {
  const { llmProvider, activeChannel, back } = useWizard();

  const [gwStatus, setGwStatus] = useState<GatewayStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [startLog, setStartLog] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [hasTriedStart, setHasTriedStart] = useState(false);

  const refreshStatus = async () => {
    const s = await invoke<GatewayStatus>("get_gateway_status");
    setGwStatus(s);
    return s;
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const startGateway = async () => {
    setStarting(true);
    setStartLog([]);
    setHasTriedStart(true);

    const unlisten = await listen<{ text: string }>("gateway_log", (e) => {
      setStartLog((prev) => [...prev, e.payload.text]);
    });

    try {
      const status = await invoke<GatewayStatus>("start_gateway");
      setGwStatus(status);
    } catch (err) {
      setStartLog((prev) => [...prev, `错误: ${err}`]);
      await refreshStatus();
    } finally {
      unlisten();
      setStarting(false);
    }
  };

  const stopGateway = async () => {
    setStopping(true);
    setStartLog([]);

    const unlisten = await listen<{ text: string }>("gateway_log", (e) => {
      setStartLog((prev) => [...prev, e.payload.text]);
    });

    try {
      const status = await invoke<GatewayStatus>("stop_gateway");
      setGwStatus(status);
    } catch (err) {
      setStartLog((prev) => [...prev, `错误: ${err}`]);
      await refreshStatus();
    } finally {
      unlisten();
      setStopping(false);
    }
  };

  // 打开控制台：调用 openclaw dashboard（自动带 token）
  const openDashboard = async () => {
    await invoke("open_gateway_browser", { token: "" });
  };

  const copyUrl = async () => {
    const url = gwStatus?.url ?? `http://127.0.0.1:18789/`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const PROVIDER_LABELS: Record<string, string> = {
    claude: "Claude (Anthropic)",
    deepseek: "DeepSeek",
    minimax: "Minimax",
  };
  const CHANNEL_LABELS: Record<string, string> = {
    feishu: "飞书 (WebSocket 长连接)",
    whatsapp: "WhatsApp",
  };

  const gatewayRunning = gwStatus?.running === true;
  const gatewayUrl = gwStatus?.url ?? "http://127.0.0.1:18789/";

  return (
    <div className="flex flex-col items-center flex-1 min-h-0 gap-4 pt-1">
      {/* 标题 */}
      <div className="flex flex-col items-center gap-2">
        <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-emerald-400" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold">配置完成！</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            启动 Gateway 后进入 Web 控制台
          </p>
        </div>
      </div>

      {/* 配置摘要 + Gateway 状态 */}
      <div className="w-full rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))] divide-y divide-[hsl(var(--border))]">
        <div className="flex justify-between items-center px-4 py-2">
          <span className="text-sm text-[hsl(var(--muted-foreground))]">AI 模型</span>
          <span className="text-sm font-medium">{PROVIDER_LABELS[llmProvider] ?? llmProvider}</span>
        </div>
        <div className="flex justify-between items-center px-4 py-2">
          <span className="text-sm text-[hsl(var(--muted-foreground))]">渠道</span>
          <span className="text-sm font-medium">{CHANNEL_LABELS[activeChannel] ?? activeChannel}</span>
        </div>
        <div className="flex justify-between items-center px-4 py-2">
          <span className="text-sm text-[hsl(var(--muted-foreground))]">Gateway 端口</span>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-sm font-medium flex items-center gap-1",
              gatewayRunning ? "text-emerald-400" : "text-amber-400"
            )}>
              {gwStatus === null
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : gatewayRunning
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> {gwStatus.port} 运行中</>
                  : <><AlertCircle className="w-3.5 h-3.5" /> {gwStatus?.port ?? 18789} 未启动</>
              }
            </span>
            <button onClick={refreshStatus} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 启动日志 */}
      {startLog.length > 0 && (
        <div className="w-full rounded-md bg-black/40 border border-[hsl(var(--border))] px-3 py-2 max-h-24 overflow-y-auto">
          {startLog.map((l, i) => (
            <div key={i} className="text-xs text-[hsl(var(--muted-foreground))] font-mono py-0.5">
              <span className="text-[hsl(var(--primary)/0.5)] mr-1">›</span>{l}
            </div>
          ))}
        </div>
      )}

      {/* URL 展示（Gateway 运行中时显示）*/}
      {gatewayRunning && (
        <div className="w-full flex items-center gap-2 rounded-lg bg-[hsl(var(--primary)/0.06)] border border-[hsl(var(--primary)/0.2)] px-3 py-2">
          <code className="flex-1 text-xs text-[hsl(var(--primary))] truncate">{gatewayUrl}</code>
          <button onClick={copyUrl} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* 操作按钮区 */}
      <div className="w-full space-y-2">
        {!gatewayRunning ? (
          <Button size="lg" className="w-full gap-2" onClick={startGateway} disabled={starting || stopping}>
            {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            {starting ? "正在启动..." : "启动 OpenClaw Gateway"}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="lg" className="flex-1 gap-2" onClick={openDashboard}>
              <ExternalLink className="w-5 h-5" />
              进入 Web 控制台
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="gap-2 text-red-400 border-red-400/40 hover:bg-red-500/10 hover:text-red-400"
              onClick={stopGateway}
              disabled={stopping}
            >
              {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              {stopping ? "停止中..." : "停止"}
            </Button>
          </div>
        )}

        {/* 已尝试启动但仍未就绪：提供降级入口 */}
        {hasTriedStart && !gatewayRunning && !starting && (
          <Button variant="outline" className="w-full gap-2 text-sm" onClick={openDashboard}>
            <ExternalLink className="w-4 h-4" />
            直接打开控制台（手动确认 Gateway 已运行）
          </Button>
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={back} className="mt-auto">
        <ArrowLeft className="w-4 h-4 mr-1" /> 返回修改
      </Button>
    </div>
  );
}

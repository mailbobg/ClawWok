import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { useWizard } from "@/store/wizard";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Square,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  ChevronLeft,
  Puzzle,
} from "lucide-react";

interface GatewayStatus {
  running: boolean;
  url: string;
  port: number;
}

export function ManagePage() {
  const setAppMode = useWizard((s) => s.setAppMode);

  const [gwStatus, setGwStatus] = useState<GatewayStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

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
    setLog([]);
    const unlisten = await listen<{ text: string }>("gateway_log", (e) => {
      setLog((prev) => [...prev, e.payload.text]);
    });
    try {
      const s = await invoke<GatewayStatus>("start_gateway");
      setGwStatus(s);
    } catch (err) {
      setLog((prev) => [...prev, `错误: ${err}`]);
      await refreshStatus();
    } finally {
      unlisten();
      setStarting(false);
    }
  };

  const stopGateway = async () => {
    setStopping(true);
    setLog([]);
    const unlisten = await listen<{ text: string }>("gateway_log", (e) => {
      setLog((prev) => [...prev, e.payload.text]);
    });
    try {
      const s = await invoke<GatewayStatus>("stop_gateway");
      setGwStatus(s);
    } catch (err) {
      setLog((prev) => [...prev, `错误: ${err}`]);
      await refreshStatus();
    } finally {
      unlisten();
      setStopping(false);
    }
  };

  const openDashboard = () => invoke("open_gateway_browser", { token: "" });

  const copyUrl = async () => {
    await navigator.clipboard.writeText(gwStatus?.url ?? "http://127.0.0.1:18789/");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const busy = starting || stopping;
  const running = gwStatus?.running === true;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {/* 页头 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setAppMode("home")}
          className="p-1 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-base font-semibold">管理龙虾</h2>
      </div>

      {/* Gateway 状态卡 */}
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
        {/* 状态栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
          <span className="text-sm font-medium">OpenClaw Gateway</span>
          <div className="flex items-center gap-2">
            {gwStatus === null ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[hsl(var(--muted-foreground))]" />
            ) : running ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                运行中 · 端口 {gwStatus.port}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                已停止
              </span>
            )}
            <button
              onClick={refreshStatus}
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* URL 行（运行中显示）*/}
        {running && (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/5 border-b border-[hsl(var(--border))]">
            <code className="flex-1 text-xs text-emerald-400 truncate">{gwStatus?.url}</code>
            <button
              onClick={copyUrl}
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-2 px-4 py-3">
          {!running ? (
            <Button className="flex-1 gap-2" onClick={startGateway} disabled={busy}>
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {starting ? "启动中..." : "启动 Gateway"}
            </Button>
          ) : (
            <>
              <Button className="flex-1 gap-2" onClick={openDashboard}>
                <ExternalLink className="w-4 h-4" />
                打开控制台
              </Button>
              <Button
                variant="outline"
                className="gap-2 text-red-400 border-red-400/40 hover:bg-red-500/10 hover:text-red-400"
                onClick={stopGateway}
                disabled={busy}
              >
                {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                {stopping ? "停止中..." : "停止"}
              </Button>
            </>
          )}
        </div>

        {/* 日志 */}
        {log.length > 0 && (
          <div className="mx-4 mb-3 rounded-md bg-black/40 border border-[hsl(var(--border))] px-3 py-2 max-h-20 overflow-y-auto">
            {log.map((l, i) => (
              <div key={i} className="text-xs text-[hsl(var(--muted-foreground))] font-mono py-0.5">
                <span className="text-[hsl(var(--primary)/0.5)] mr-1">›</span>{l}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skills 区（预留）*/}
      <div className="rounded-xl border border-[hsl(var(--border))] border-dashed bg-[hsl(var(--card)/0.5)]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-dashed border-[hsl(var(--border))]">
          <Puzzle className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <span className="text-sm font-medium">技能 (Skills)</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
            即将推出
          </span>
        </div>
        <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            在这里添加、启用或禁用 OpenClaw Skills
          </p>
        </div>
      </div>
    </div>
  );
}

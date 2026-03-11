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
  Home,
  Zap,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

interface GatewayStatus {
  running: boolean;
  url: string;
  port: number;
}

export function Step4_Complete() {
  const { llmProvider, activeChannel, back, setAppMode } = useWizard();
  const t = useT();

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
      setStartLog((prev) => [...prev, `${t("complete.error")} ${err}`]);
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
      setStartLog((prev) => [...prev, `${t("complete.error")} ${err}`]);
      await refreshStatus();
    } finally {
      unlisten();
      setStopping(false);
    }
  };

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
    claude: t("complete.providerClaude"),
    deepseek: t("complete.providerDeepseek"),
    minimax: t("complete.providerMinimax"),
  };
  const CHANNEL_LABELS: Record<string, string> = {
    feishu: t("complete.channelFeishu"),
    whatsapp: "WhatsApp",
  };

  const gatewayRunning = gwStatus?.running === true;
  const gatewayUrl = gwStatus?.url ?? "http://127.0.0.1:18789/";

  return (
    <div className="flex flex-col items-center flex-1 min-h-0 gap-5 pt-2">
      {/* Hero */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-[64px] h-[64px] rounded-full bg-[hsl(var(--success))]/12 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-[hsl(var(--success))]" />
        </div>
        <div className="text-center">
          <h2 className="text-[24px] font-bold tracking-tight">{t("complete.title")}</h2>
          <p className="text-[15px] text-[hsl(var(--muted-foreground))] mt-1">
            {t("complete.subtitle")}
          </p>
        </div>
      </div>

      {/* Config summary — Apple grouped */}
      <div className="w-full apple-group">
        <div className="apple-row">
          <span className="text-[17px] text-[hsl(var(--muted-foreground))]">{t("complete.aiModel")}</span>
          <span className="text-[17px] font-medium">{PROVIDER_LABELS[llmProvider] ?? llmProvider}</span>
        </div>
        <div className="apple-row">
          <span className="text-[17px] text-[hsl(var(--muted-foreground))]">{t("complete.channel")}</span>
          <span className="text-[17px] font-medium">{CHANNEL_LABELS[activeChannel] ?? activeChannel}</span>
        </div>
        <div className="apple-row">
          <span className="text-[17px] text-[hsl(var(--muted-foreground))]">Gateway</span>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[17px] font-medium flex items-center gap-1.5",
              gatewayRunning ? "text-[hsl(var(--success))]" : "text-[hsl(var(--warning))]"
            )}>
              {gwStatus === null
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : gatewayRunning
                  ? <><CheckCircle2 className="w-4 h-4" /> {t("complete.port")} {gwStatus.port}</>
                  : <><AlertCircle className="w-4 h-4" /> {t("complete.notStarted")}</>
              }
            </span>
            <button onClick={refreshStatus} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Startup logs */}
      {startLog.length > 0 && (
        <div className="w-full log-stream rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2.5 max-h-28 overflow-y-auto">
          {startLog.map((l, i) => (
            <div key={i} className="text-[hsl(var(--muted-foreground))] py-[3px]">
              <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>{l}
            </div>
          ))}
        </div>
      )}

      {/* URL display */}
      {gatewayRunning && (
        <div className="w-full apple-group">
          <div className="apple-row">
            <code className="flex-1 text-[15px] text-[hsl(var(--primary))] truncate">{gatewayUrl}</code>
            <button onClick={copyUrl} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0">
              {copied ? <Check className="w-4 h-4 text-[hsl(var(--success))]" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="w-full space-y-2">
        {!gatewayRunning ? (
          <Button size="lg" className="w-full gap-2" onClick={startGateway} disabled={starting || stopping}>
            {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            {starting ? t("complete.starting") : t("complete.startGateway")}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="lg" className="flex-1 gap-2" onClick={openDashboard}>
              <ExternalLink className="w-5 h-5" />
              {t("complete.openConsole")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="gap-2 text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/30 hover:bg-[hsl(var(--destructive))]/8"
              onClick={stopGateway}
              disabled={stopping}
            >
              {stopping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5" />}
              {stopping ? t("complete.stopping") : t("complete.stop")}
            </Button>
          </div>
        )}

        {hasTriedStart && !gatewayRunning && !starting && (
          <Button variant="outline" className="w-full gap-2" onClick={openDashboard}>
            <ExternalLink className="w-5 h-5" />
            {t("complete.openManual")}
          </Button>
        )}
      </div>

      <div className="flex gap-3 mt-auto">
        <Button variant="ghost" onClick={back}>
          <ArrowLeft className="w-5 h-5 mr-1.5" /> {t("complete.backEdit")}
        </Button>
        <Button variant="ghost" onClick={() => setAppMode("home")}>
          <Home className="w-5 h-5 mr-1.5" /> {t("complete.goHome")}
        </Button>
      </div>
    </div>
  );
}

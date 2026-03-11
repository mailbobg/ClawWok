import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useWizard } from "@/store/wizard";
import {
  Loader2,
  Play,
  Square,
  ExternalLink,
  RefreshCw,
  ChevronLeft,
  Globe,
} from "lucide-react";
import { SkillsCard } from "@/components/SkillsCard";
import { useT, useI18n } from "@/i18n";

interface GatewayStatus {
  running: boolean;
  url: string;
  port: number;
}

export function ManagePage() {
  const setAppMode = useWizard((s) => s.setAppMode);
  const t = useT();
  const toggleLang = useI18n((s) => s.toggleLang);

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
      setLog((prev) => [...prev, `${t("skills.log.error")} ${err}`]);
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
      setLog((prev) => [...prev, `${t("skills.log.error")} ${err}`]);
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
    <div className="flex flex-col flex-1 min-h-0 gap-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setAppMode("home")}
          className="p-1.5 rounded-[7px] hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-[20px] font-semibold flex-1">{t("manage.title")}</h2>
        <button
          onClick={toggleLang}
          className="flex items-center gap-1 text-[13px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <Globe className="w-3.5 h-3.5" />
          {t("common.langLabel")}
        </button>
      </div>

      {/* Gateway — tofu block + log */}
      <div>
        <div className="flex gap-3">
          {/* Left: tofu control block */}
          <button
            onClick={running ? stopGateway : startGateway}
            disabled={busy}
            className={`
              w-[120px] shrink-0 rounded-[14px] flex flex-col items-center justify-center gap-2 p-4
              border transition-all cursor-pointer
              ${busy ? "opacity-60 cursor-not-allowed" : ""}
              ${running
                ? "bg-[hsl(var(--destructive))] border-[hsl(var(--destructive))] text-white hover:brightness-110"
                : "bg-[hsl(var(--primary))] border-[hsl(var(--primary))] text-white hover:brightness-110"
              }
            `}
          >
            {busy ? (
              <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--muted-foreground))]" />
            ) : running ? (
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Square className="w-4 h-4 text-white" />
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Play className="w-5 h-5 text-white fill-white" />
              </div>
            )}
            <span className="text-[13px] font-medium text-white">
              {starting ? t("manage.starting") : stopping ? t("manage.stopping") : running ? t("manage.running") : t("manage.start")}
            </span>
            {running && (
              <span className="text-[11px] text-white/70">
                :{gwStatus?.port}
              </span>
            )}
          </button>

          {/* Right: info + log panel */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* Status bar */}
            <div className="flex items-center justify-between rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2.5">
              <span className="text-[15px] font-medium text-[hsl(var(--foreground))]">OpenClaw</span>
              <div className="flex items-center gap-2">
                {running && (
                  <>
                    <button
                      onClick={copyUrl}
                      className="text-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]/70 text-[13px] font-mono truncate max-w-[160px]"
                      title={gwStatus?.url}
                    >
                      {copied ? t("manage.copied") : gwStatus?.url?.replace("http://", "")}
                    </button>
                    <button
                      onClick={openDashboard}
                      className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                      title={t("manage.openConsole")}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={refreshStatus}
                  className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                  title={t("manage.refreshStatus")}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Log area */}
            <div className="flex-1 min-h-[72px] max-h-[120px] overflow-y-auto rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2">
              {log.length > 0 ? (
                log.map((l, i) => (
                  <div key={i} className="log-stream text-[hsl(var(--muted-foreground))] py-[2px]">
                    <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>{l}
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center text-[13px] text-[hsl(var(--muted-foreground))]/50">
                  {running ? t("manage.gwRunning") : t("manage.gwWaiting")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Skills */}
      <SkillsCard />
    </div>
  );
}

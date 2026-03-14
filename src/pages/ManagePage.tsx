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
  Bot,
  MessageSquare,
  Trash2,
  AlertTriangle,
  Store,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useT, useI18n } from "@/i18n";

interface GatewayStatus {
  running: boolean;
  url: string;
  port: number;
}

interface ConfigStatus {
  active_provider: string | null;
  saved_providers: string[];
  model_key_set: boolean;
  channels: string[];
}

export function ManagePage() {
  const { setAppMode, editStep } = useWizard();
  const t = useT();
  const toggleLang = useI18n((s) => s.toggleLang);

  const [gwStatus, setGwStatus] = useState<GatewayStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);

  const refreshStatus = async () => {
    const s = await invoke<GatewayStatus>("get_gateway_status");
    setGwStatus(s);
    return s;
  };

  const refreshConfigStatus = async () => {
    try {
      const s = await invoke<ConfigStatus>("get_config_status");
      setConfigStatus(s);
    } catch {
      // silently ignore
    }
  };

  useEffect(() => {
    refreshStatus();
    refreshConfigStatus();
  }, []);

  const providerLabel = (p: string | null) => {
    if (!p) return null;
    switch (p) {
      case "claude": return "Claude";
      case "deepseek": return "DeepSeek";
      case "deepseek_or": return "OpenRouter";
      case "minimax": return "Minimax";
      default: return p;
    }
  };

  const channelLabel = (ch: string) => {
    switch (ch) {
      case "feishu": return t("channel.feishu");
      case "whatsapp": return "WhatsApp";
      case "clawin": return "Clawin";
      case "qq": return "QQ";
      default: return ch;
    }
  };

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

      {/* Quick config shortcuts */}
      <div className="flex gap-2">
        <button
          onClick={() => { editStep(2); }}
          className="flex-1 flex items-center gap-2.5 rounded-[12px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-4 py-3 hover:bg-[hsl(var(--muted))] transition-colors"
        >
          <Bot className="w-5 h-5 text-[hsl(var(--primary))]" />
          <div className="flex-1 text-left min-w-0">
            <span className="text-[15px] font-medium">{t("manage.modelConfig")}</span>
            {configStatus && (
              <div className="flex items-center gap-1 mt-0.5">
                {configStatus.model_key_set ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-[hsl(var(--success))] shrink-0" />
                    <span className="text-[12px] text-[hsl(var(--success))] truncate">
                      {providerLabel(configStatus.active_provider)}
                      {configStatus.saved_providers.length > 1 && (
                        <span className="text-[hsl(var(--muted-foreground))]">
                          {" "}({configStatus.saved_providers.length} {t("manage.keysSaved")})
                        </span>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-[hsl(var(--warning))] shrink-0" />
                    <span className="text-[12px] text-[hsl(var(--warning))]">
                      {t("manage.notConfigured")}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </button>
        <button
          onClick={() => { editStep(3); }}
          className="flex-1 flex items-center gap-2.5 rounded-[12px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-4 py-3 hover:bg-[hsl(var(--muted))] transition-colors"
        >
          <MessageSquare className="w-5 h-5 text-[hsl(var(--primary))]" />
          <div className="flex-1 text-left min-w-0">
            <span className="text-[15px] font-medium">{t("manage.channelConfig")}</span>
            {configStatus && (
              <div className="flex items-center gap-1 mt-0.5">
                {configStatus.channels.length > 0 ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-[hsl(var(--success))] shrink-0" />
                    <span className="text-[12px] text-[hsl(var(--success))] truncate">
                      {configStatus.channels.map(channelLabel).join(", ")}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-[hsl(var(--warning))] shrink-0" />
                    <span className="text-[12px] text-[hsl(var(--warning))]">
                      {t("manage.notConfigured")}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </button>
      </div>

      {/* Skills Market shortcut */}
      <button
        onClick={() => setAppMode("skills")}
        className="flex items-center gap-2.5 rounded-[12px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-4 py-3 hover:bg-[hsl(var(--muted))] transition-colors"
      >
        <Store className="w-5 h-5 text-[hsl(32,82%,52%)]" />
        <span className="text-[15px] font-medium flex-1 text-left">{t("market.title")}</span>
        <ArrowRight className="w-4 h-4 text-[hsl(var(--muted-foreground))]/40" />
      </button>

      {/* Uninstall */}
      <UninstallSection />
    </div>
  );
}

// ─── Uninstall Section ──────────────────────────────────────────────────────
type UninstallState = "idle" | "confirm" | "running" | "done";

function UninstallSection() {
  const t = useT();
  const { setAppMode } = useWizard();
  const [state, setState] = useState<UninstallState>("idle");
  const [logs, setLogs] = useState<string[]>([]);

  const doUninstall = async () => {
    setState("running");
    setLogs([]);

    const unlisten = await listen<{ text: string }>("uninstall_log", (e) => {
      setLogs((p) => [...p, e.payload.text]);
    });

    try {
      await invoke("uninstall_openclaw");
      setState("done");
    } catch (err) {
      setLogs((p) => [...p, `Error: ${err}`]);
      setState("done");
    } finally {
      unlisten();
    }
  };

  if (state === "done") {
    return (
      <div className="space-y-3">
        <div className="rounded-[12px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-4 py-3">
          <p className="text-[15px] font-medium text-[hsl(var(--success))]">{t("uninstall.done")}</p>
        </div>
        {logs.length > 0 && (
          <div className="log-stream rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2.5 max-h-[160px] overflow-auto">
            {logs.map((l, i) => (
              <div key={i} className="text-[hsl(var(--muted-foreground))] py-[2px]">
                <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>{l}
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => setAppMode("home")}
          className="text-[13px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          {t("complete.goHome")}
        </button>
      </div>
    );
  }

  if (state === "running") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2.5 rounded-[12px] bg-[hsl(var(--destructive))]/10 border border-[hsl(var(--destructive))]/20 px-4 py-3">
          <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--destructive))]" />
          <span className="text-[15px] font-medium text-[hsl(var(--destructive))]">{t("uninstall.running")}</span>
        </div>
        {logs.length > 0 && (
          <div className="log-stream rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2.5 max-h-[160px] overflow-auto">
            {logs.map((l, i) => (
              <div key={i} className="text-[hsl(var(--muted-foreground))] py-[2px]">
                <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>{l}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (state === "confirm") {
    return (
      <div className="rounded-[12px] bg-[hsl(var(--destructive))]/5 border border-[hsl(var(--destructive))]/20 px-4 py-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0" />
          <span className="text-[15px] font-semibold text-[hsl(var(--destructive))]">{t("uninstall.title")}</span>
        </div>
        <p className="text-[13px] text-[hsl(var(--muted-foreground))] leading-5">{t("uninstall.desc")}</p>
        <div className="flex gap-2">
          <button
            onClick={() => setState("idle")}
            className="flex-1 py-2 rounded-[8px] text-[13px] font-medium bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/80 transition-colors"
          >
            {t("uninstall.cancel")}
          </button>
          <button
            onClick={doUninstall}
            className="flex-1 py-2 rounded-[8px] text-[13px] font-medium bg-[hsl(var(--destructive))] text-white hover:brightness-110 transition-all"
          >
            {t("uninstall.confirm")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setState("confirm")}
      className="flex items-center justify-center gap-2 w-full rounded-[12px] border border-[hsl(var(--border))]/60 px-4 py-3 text-[14px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))] hover:border-[hsl(var(--destructive))]/30 transition-colors"
    >
      <Trash2 className="w-4 h-4" />
      {t("uninstall.btn")}
    </button>
  );
}

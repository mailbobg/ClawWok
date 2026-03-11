import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWizard, type Channel, type FeishuVerifyResult } from "@/store/wizard";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Smartphone,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

// ─── WhatsApp 面板 ────────────────────────────────────────────────────────────
type WaState = "idle" | "connecting" | "qr_ready" | "success" | "error";

function WhatsAppPanel({
  ready,
  onReady,
}: {
  ready: boolean;
  onReady: () => void;
}) {
  const t = useT();
  const [state, setState] = useState<WaState>(ready ? "success" : "idle");
  const [qrLines, setQrLines] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);

  const startLogin = async () => {
    setState("connecting");
    setQrLines([]);
    setLogs([]);

    const unlisten = await listen<{ kind: string; text?: string; lines?: string[] }>(
      "wa_log",
      (e) => {
        const { kind, text, lines } = e.payload;
        if (kind === "qr_art" && lines && lines.length > 0) {
          setQrLines(lines);
          setState("qr_ready");
        } else if (kind === "success") {
          setState("success");
          onReady();
          unlisten();
        } else if (kind === "error") {
          setState("error");
          if (text) setLogs((p) => [...p, text]);
        } else if (text) {
          setLogs((p) => [...p, text]);
        }
      }
    );
    unlistenRef.current = unlisten;

    try {
      await invoke("start_whatsapp_login");
    } catch (err) {
      setState("error");
      setLogs((p) => [...p, String(err)]);
      unlisten();
    }
  };

  const cancel = async () => {
    unlistenRef.current?.();
    await invoke("cancel_whatsapp_login").catch(() => {});
    setState("idle");
    setQrLines([]);
    setLogs([]);
  };

  useEffect(() => () => { unlistenRef.current?.(); }, []);

  if (state === "success" || ready) {
    return (
      <div className="apple-group">
        <div className="apple-row">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))] shrink-0" />
            <span className="text-[17px] text-[hsl(var(--success))] font-medium">{t("wa.bound")}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {state !== "qr_ready" && (
        <p className="text-[15px] text-[hsl(var(--muted-foreground))] leading-6">
          {t("wa.scanHint")}
        </p>
      )}

      {/* QR 码区域 */}
      {state === "qr_ready" && qrLines.length > 0 ? (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="flex-1 min-h-[320px] apple-group overflow-auto p-2 flex items-center justify-center">
            <pre
              style={{
                fontFamily: '"Courier New", "Lucida Console", monospace',
                fontSize: "10px",
                lineHeight: "1.05",
                color: "#000",
                margin: 0,
                letterSpacing: "-0.3px",
              }}
            >
              {qrLines.join("\n")}
            </pre>
          </div>
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 text-[13px] text-[hsl(var(--muted-foreground))]">
              <Smartphone className="w-4 h-4" />
              {t("wa.phoneHint")}
            </div>
            <Button variant="ghost" onClick={cancel}>
              {t("wa.cancel")}
            </Button>
          </div>
        </div>
      ) : state === "connecting" ? (
        <div className="flex flex-col flex-1 min-h-0 items-center gap-3 py-6">
          <Loader2 className="w-9 h-9 animate-spin text-[hsl(var(--primary))] shrink-0" />
          <p className="text-[15px] text-[hsl(var(--muted-foreground))] shrink-0">{t("wa.connecting")}</p>
          {logs.length > 0 && (
            <div className="w-full flex-1 min-h-0 log-stream rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2.5 overflow-auto">
              {logs.map((l, i) => (
                <div key={i} className="text-[hsl(var(--muted-foreground))] py-[3px] whitespace-pre">
                  <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>{l}
                </div>
              ))}
            </div>
          )}
          <Button variant="ghost" onClick={cancel} className="shrink-0">{t("wa.cancel")}</Button>
        </div>
      ) : state === "error" ? (
        <div className="space-y-3">
          <div className="apple-group">
            <div className="apple-row">
              <div className="flex items-center gap-2.5">
                <XCircle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0" />
                <div>
                  <span className="text-[17px] text-[hsl(var(--destructive))] font-medium">{t("wa.failed")}</span>
                  {logs.length > 0 && (
                    <p className="text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5">{logs[logs.length - 1]}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={startLogin} className="w-full gap-2">
            <RefreshCw className="w-5 h-5" /> {t("wa.retry")}
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={startLogin} className="w-full gap-2">
          <Smartphone className="w-5 h-5" />
          {t("wa.startScan")}
        </Button>
      )}
    </div>
  );
}

// ─── 飞书面板 ─────────────────────────────────────────────────────────────────
type FeishuState = "idle" | "connecting" | "success" | "error";

function FeishuPanel({
  appId,
  appSecret,
  onAppIdChange,
  onAppSecretChange,
  verified,
  onConnected,
}: {
  appId: string;
  appSecret: string;
  onAppIdChange: (v: string) => void;
  onAppSecretChange: (v: string) => void;
  verified: FeishuVerifyResult | null;
  onConnected: (r: FeishuVerifyResult) => void;
}) {
  const t = useT();
  const [state, setState] = useState<FeishuState>(verified?.ok ? "success" : "idle");
  const [logs, setLogs] = useState<string[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (state === "success" || state === "error") {
      setState("idle");
      setLogs([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, appSecret]);

  useEffect(() => () => { unlistenRef.current?.(); }, []);

  const connect = async () => {
    if (!appId.trim() || !appSecret.trim()) return;
    setState("connecting");
    setLogs([]);

    const unlisten = await listen<{ kind: string; text: string }>("feishu_log", (e) => {
      const { kind, text } = e.payload;
      if (kind === "success") {
        setState("success");
        unlisten();
      } else if (kind === "error") {
        setState("error");
        setLogs((p) => [...p, text]);
      } else {
        setLogs((p) => [...p, text]);
      }
    });
    unlistenRef.current = unlisten;

    try {
      const result = await invoke<FeishuVerifyResult>("start_feishu_channel", {
        appId: appId.trim(),
        appSecret: appSecret.trim(),
      });
      if (result.ok) {
        onConnected(result);
      } else {
        setState("error");
        unlisten();
      }
    } catch (err) {
      setState("error");
      setLogs((p) => [...p, String(err)]);
      unlisten();
    }
  };

  const reset = () => {
    unlistenRef.current?.();
    setState("idle");
    setLogs([]);
  };

  if (state === "success") {
    return (
      <div className="space-y-3">
        <div className="apple-group">
          <div className="apple-row">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))] shrink-0" />
              <div>
                <span className="text-[17px] text-[hsl(var(--success))] font-medium">{t("fs.ready")}</span>
                <p className="text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5">
                  {t("fs.readyHint")}
                </p>
              </div>
            </div>
          </div>
        </div>
        <Button variant="ghost" onClick={reset} className="w-full">
          <RefreshCw className="w-4 h-4 mr-1.5" /> {t("fs.reconfig")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[15px] text-[hsl(var(--muted-foreground))] leading-6">
        <strong className="text-[hsl(var(--primary))]">{t("fs.longConn")}</strong>
        {t("fs.longConnDesc")}
      </p>

      {/* Input fields — Apple grouped */}
      <div className="apple-group">
        <div className="apple-row">
          <span className="text-[17px] text-[hsl(var(--foreground))] shrink-0 w-[90px]">App ID</span>
          <Input
            placeholder="cli_xxxxxxxxxxxxxxxxx"
            value={appId}
            onChange={(e) => onAppIdChange(e.target.value)}
            disabled={state === "connecting"}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 h-auto py-0 text-[15px] text-right"
          />
        </div>
        <div className="apple-row">
          <span className="text-[17px] text-[hsl(var(--foreground))] shrink-0 w-[90px]">App Secret</span>
          <Input
            type="password"
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            value={appSecret}
            onChange={(e) => onAppSecretChange(e.target.value)}
            disabled={state === "connecting"}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 h-auto py-0 text-[15px] text-right"
          />
        </div>
      </div>

      {/* 连接中：日志流 */}
      {state === "connecting" && (
        <div className="log-stream rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2.5 min-h-[80px] max-h-[120px] overflow-auto">
          {logs.map((l, i) => (
            <div key={i} className="text-[hsl(var(--muted-foreground))] py-[3px] whitespace-pre leading-5">
              <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>{l}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}

      {/* 错误状态 */}
      {state === "error" && logs.length > 0 && (
        <div className="apple-group">
          <div className="apple-row">
            <div className="flex items-center gap-2.5">
              <XCircle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0" />
              <span className="text-[15px] text-[hsl(var(--destructive))]">{logs[logs.length - 1]}</span>
            </div>
          </div>
        </div>
      )}

      <Button
        variant="outline"
        onClick={connect}
        disabled={!appId.trim() || !appSecret.trim() || state === "connecting"}
        className="w-full gap-2"
      >
        {state === "connecting" ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> {t("fs.connecting")}</>
        ) : state === "error" ? (
          <><RefreshCw className="w-5 h-5" /> {t("wa.retry")}</>
        ) : (
          <><Zap className="w-5 h-5" /> {t("fs.verify")}</>
        )}
      </Button>
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export function Step3_Channel() {
  const t = useT();
  const {
    activeChannel,
    feishuAppId,
    feishuAppSecret,
    feishuVerified,
    whatsappReady,
    setActiveChannel,
    setFeishuAppId,
    setFeishuAppSecret,
    setFeishuVerified,
    setWhatsappReady,
    advance,
    back,
  } = useWizard();

  const canAdvance =
    (activeChannel === "feishu" && feishuVerified?.ok === true) ||
    (activeChannel === "whatsapp" && whatsappReady);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-5">
      {/* Section header */}
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight">{t("channel.title")}</h2>
        <p className="text-[15px] text-[hsl(var(--muted-foreground))] mt-1">
          {t("channel.subtitle")}
        </p>
      </div>

      {/* 渠道 segmented control — Apple style */}
      <div className="flex gap-0.5 rounded-[9px] bg-[hsl(var(--muted))] p-[3px]">
        {(["feishu", "whatsapp"] as Channel[]).map((ch) => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            className={cn(
              "flex-1 py-[7px] rounded-[7px] text-[15px] font-medium transition-all",
              activeChannel === ch
                ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            )}
          >
            {ch === "feishu" ? t("channel.feishu") : "WhatsApp"}
          </button>
        ))}
      </div>

      {/* 飞书面板 */}
      {activeChannel === "feishu" && (
        <FeishuPanel
          appId={feishuAppId}
          appSecret={feishuAppSecret}
          onAppIdChange={setFeishuAppId}
          onAppSecretChange={setFeishuAppSecret}
          verified={feishuVerified}
          onConnected={(r) => setFeishuVerified(r)}
        />
      )}

      {/* WhatsApp 面板 */}
      {activeChannel === "whatsapp" && (
        <div className="flex flex-col flex-1 min-h-0">
          <WhatsAppPanel ready={whatsappReady} onReady={() => setWhatsappReady(true)} />
        </div>
      )}

      {canAdvance && (
        <div className="flex items-center gap-2 text-[15px] text-[hsl(var(--success))] font-medium mt-auto">
          <CheckCircle2 className="w-5 h-5" />
          {t("channel.connected")}
        </div>
      )}

      {/* 导航 */}
      <div className="flex justify-between mt-auto pt-3">
        <Button variant="ghost" onClick={back}>
          <ArrowLeft className="w-5 h-5 mr-1.5" /> {t("channel.back")}
        </Button>
        <Button onClick={advance} disabled={!canAdvance}>
          {t("channel.next")} <ArrowRight className="w-5 h-5 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

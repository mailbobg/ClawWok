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
  Copy,
  Check,
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

// ─── QQ 面板 ──────────────────────────────────────────────────────────────────
type DeployState = "idle" | "deploying" | "done" | "error";

function QQPanel({
  appId,
  appSecret,
  relayUrl,
  relayToken,
  saved,
  onAppIdChange,
  onAppSecretChange,
  onRelayUrlChange,
  onRelayTokenChange,
  onSave,
}: {
  appId: string;
  appSecret: string;
  relayUrl: string;
  relayToken: string;
  saved: boolean;
  onAppIdChange: (v: string) => void;
  onAppSecretChange: (v: string) => void;
  onRelayUrlChange: (v: string) => void;
  onRelayTokenChange: (v: string) => void;
  onSave: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [deployState, setDeployState] = useState<DeployState>("idle");
  const [deployLogs, setDeployLogs] = useState<string[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-generate relay token if empty
  useEffect(() => {
    if (!relayToken.trim()) {
      const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
      onRelayTokenChange(token);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [deployLogs]);

  useEffect(() => () => { unlistenRef.current?.(); }, []);

  const webhookUrl = relayUrl.trim()
    ? `https://${relayUrl.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")}/api/qq`
    : "";

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startDeploy = async () => {
    if (!appSecret.trim() || !relayToken.trim()) return;
    setDeployState("deploying");
    setDeployLogs([]);

    const unlisten = await listen<{ kind: string; text: string }>(
      "qq_deploy_log",
      (e) => {
        const { kind, text } = e.payload;
        setDeployLogs((p) => [...p, text]);
        if (kind === "success") setDeployState("done");
        else if (kind === "error") setDeployState("error");
      }
    );
    unlistenRef.current = unlisten;

    try {
      const result = await invoke<{ ok: boolean; url?: string; error?: string }>(
        "deploy_qq_relay",
        { qqBotSecret: appSecret.trim(), relayToken: relayToken.trim() }
      );
      if (result.ok && result.url) {
        // Auto-fill relay URL from deploy result
        const domain = result.url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
        onRelayUrlChange(domain);
        setDeployState("done");
      } else if (!result.ok) {
        setDeployState("error");
        if (result.error) setDeployLogs((p) => [...p, result.error!]);
      }
    } catch (err) {
      setDeployState("error");
      setDeployLogs((p) => [...p, String(err)]);
    } finally {
      unlisten();
    }
  };

  const canSave = appId.trim() && appSecret.trim() && relayUrl.trim() && relayToken.trim();

  if (saved) {
    return (
      <div className="space-y-3">
        <div className="apple-group">
          <div className="apple-row">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))] shrink-0" />
              <div>
                <span className="text-[17px] text-[hsl(var(--success))] font-medium">{t("qq.saved")}</span>
                <p className="text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5">{t("qq.savedHint")}</p>
              </div>
            </div>
          </div>
        </div>
        {webhookUrl && (
          <div className="apple-group">
            <div className="apple-row">
              <code className="flex-1 text-[13px] text-[hsl(var(--primary))] truncate">{webhookUrl}</code>
              <button onClick={copyWebhook} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0">
                {copied ? <Check className="w-4 h-4 text-[hsl(var(--success))]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
        <Button variant="ghost" onClick={onSave} className="w-full">
          <RefreshCw className="w-4 h-4 mr-1.5" /> {t("qq.reconfig")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto">
      <p className="text-[15px] text-[hsl(var(--muted-foreground))] leading-6">{t("qq.desc")}</p>

      {/* Config inputs — fill these first */}
      <div className="apple-group">
        <div className="apple-row">
          <span className="text-[15px] text-[hsl(var(--foreground))] shrink-0 w-[100px]">{t("qq.appId")}</span>
          <Input
            placeholder={t("qq.appIdHint")}
            value={appId}
            onChange={(e) => onAppIdChange(e.target.value)}
            disabled={deployState === "deploying"}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 h-auto py-0 text-[13px] text-right"
          />
        </div>
        <div className="apple-row">
          <span className="text-[15px] text-[hsl(var(--foreground))] shrink-0 w-[100px]">{t("qq.appSecret")}</span>
          <Input
            type="password"
            placeholder={t("qq.appSecretHint")}
            value={appSecret}
            onChange={(e) => onAppSecretChange(e.target.value)}
            disabled={deployState === "deploying"}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 h-auto py-0 text-[13px] text-right"
          />
        </div>
        <div className="apple-row">
          <span className="text-[15px] text-[hsl(var(--foreground))] shrink-0 w-[100px]">{t("qq.relayToken")}</span>
          <Input
            placeholder={t("qq.relayTokenHint")}
            value={relayToken}
            onChange={(e) => onRelayTokenChange(e.target.value)}
            disabled={deployState === "deploying"}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 h-auto py-0 text-[13px] text-right font-mono"
          />
        </div>
      </div>

      {/* Step 1: Deploy */}
      <div>
        <h3 className="text-[15px] font-semibold mb-2">{t("qq.step0Title")}</h3>
        <p className="text-[13px] text-[hsl(var(--muted-foreground))] mb-3 leading-5">{t("qq.step0Desc")}</p>

        {deployState === "deploying" && (
          <div className="log-stream rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2.5 min-h-[80px] max-h-[120px] overflow-auto mb-3">
            {deployLogs.map((l, i) => (
              <div key={i} className="text-[hsl(var(--muted-foreground))] py-[3px] whitespace-pre leading-5">
                <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>{l}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}

        {deployState === "done" && (
          <div className="apple-group mb-3">
            <div className="apple-row">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))] shrink-0" />
                <div>
                  <span className="text-[15px] text-[hsl(var(--success))] font-medium">{t("qq.deployDone")}</span>
                  <p className="text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5">{t("qq.deployNeedKv")}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {deployState === "error" && deployLogs.length > 0 && (
          <div className="apple-group mb-3">
            <div className="apple-row">
              <div className="flex items-center gap-2.5">
                <XCircle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0" />
                <span className="text-[13px] text-[hsl(var(--destructive))]">{deployLogs[deployLogs.length - 1]}</span>
              </div>
            </div>
          </div>
        )}

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={startDeploy}
          disabled={!appSecret.trim() || !relayToken.trim() || deployState === "deploying"}
        >
          {deployState === "deploying" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t("qq.deploying")}</>
          ) : deployState === "done" ? (
            <><CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))]" /> {t("qq.deployDone")}</>
          ) : deployState === "error" ? (
            <><RefreshCw className="w-4 h-4" /> {t("wa.retry")}</>
          ) : (
            <><Zap className="w-4 h-4" /> {t("qq.deployBtn")}</>
          )}
        </Button>
      </div>

      {/* Relay URL (auto-filled after deploy, or manual) */}
      <div className="apple-group">
        <div className="apple-row">
          <span className="text-[15px] text-[hsl(var(--foreground))] shrink-0 w-[100px]">{t("qq.relayUrl")}</span>
          <Input
            placeholder={t("qq.relayUrlHint")}
            value={relayUrl}
            onChange={(e) => onRelayUrlChange(e.target.value)}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 h-auto py-0 text-[13px] text-right"
          />
        </div>
      </div>

      {/* Webhook URL */}
      <div>
        <h3 className="text-[15px] font-semibold mb-2">{t("qq.step2Title")}</h3>
        <p className="text-[13px] text-[hsl(var(--muted-foreground))] mb-2 leading-5">{t("qq.webhookDesc")}</p>
        <div className="apple-group">
          <div className="apple-row">
            {webhookUrl ? (
              <>
                <code className="flex-1 text-[13px] text-[hsl(var(--primary))] truncate">{webhookUrl}</code>
                <button onClick={copyWebhook} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] shrink-0">
                  {copied ? <Check className="w-4 h-4 text-[hsl(var(--success))]" /> : <Copy className="w-4 h-4" />}
                </button>
              </>
            ) : (
              <span className="text-[13px] text-[hsl(var(--muted-foreground))]">{t("qq.webhookEmpty")}</span>
            )}
          </div>
        </div>
      </div>

      <Button
        variant="outline"
        onClick={onSave}
        disabled={!canSave}
        className="w-full gap-2"
      >
        <Zap className="w-5 h-5" /> {t("qq.save")}
      </Button>
    </div>
  );
}

// ─── Clawin 面板 ────────────────────────────────────────────────────────────
type ClawinState = "idle" | "saving" | "success" | "error";

/** Parse roomId and relayUrl from the pasted command block */
function parseClawinCommands(text: string): { roomId: string; relayUrl: string } | null {
  // Match: openclaw config set channels.openclaw-app.accounts.default.roomId "xxx"
  const roomMatch = text.match(/\.roomId\s+"([^"]+)"/);
  // Match: openclaw config set channels.openclaw-app.accounts.default.relayUrl "xxx"
  const relayMatch = text.match(/\.relayUrl\s+"([^"]+)"/);
  if (!roomMatch) return null;
  return {
    roomId: roomMatch[1],
    relayUrl: relayMatch ? relayMatch[1] : "wss://openclaw.rewen.org",
  };
}

function ClawinPanel({
  saved,
  onRoomIdChange,
  onRelayUrlChange,
  onSaved,
}: {
  saved: boolean;
  onRoomIdChange: (v: string) => void;
  onRelayUrlChange: (v: string) => void;
  onSaved: (v: boolean) => void;
}) {
  const t = useT();
  const [state, setState] = useState<ClawinState>(saved ? "success" : "idle");
  const [pastedText, setPastedText] = useState("");
  const [parsed, setParsed] = useState<{ roomId: string; relayUrl: string } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => () => { unlistenRef.current?.(); }, []);

  const handlePaste = (text: string) => {
    setPastedText(text);
    const result = parseClawinCommands(text);
    setParsed(result);
    if (result) {
      onRoomIdChange(result.roomId);
      onRelayUrlChange(result.relayUrl);
    }
  };

  const save = async () => {
    if (!parsed) return;
    setState("saving");
    setLogs([]);
    setError(null);

    const unlisten = await listen<{ kind: string; text: string }>("clawin_log", (e) => {
      const { kind, text } = e.payload;
      if (kind === "success") {
        setState("success");
        onSaved(true);
      } else if (kind === "error") {
        setState("error");
        setError(text);
      }
      setLogs((p) => [...p, text]);
    });
    unlistenRef.current = unlisten;

    try {
      const result = await invoke<{ ok: boolean; error?: string }>("save_clawin_config", {
        roomId: parsed.roomId,
        relayUrl: parsed.relayUrl,
      });
      if (!result.ok) {
        setState("error");
        if (result.error) setError(result.error);
      }
    } catch (err) {
      setState("error");
      setError(String(err));
      setLogs((p) => [...p, String(err)]);
    } finally {
      unlisten();
    }
  };

  const reset = () => {
    onSaved(false);
    setState("idle");
    setPastedText("");
    setParsed(null);
    setLogs([]);
    setError(null);
  };

  if (state === "success" || saved) {
    return (
      <div className="space-y-3">
        <div className="apple-group">
          <div className="apple-row">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))] shrink-0" />
              <div>
                <span className="text-[17px] text-[hsl(var(--success))] font-medium">{t("clawin.saved")}</span>
                <p className="text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5">{t("clawin.savedHint")}</p>
              </div>
            </div>
          </div>
        </div>
        <Button variant="ghost" onClick={reset} className="w-full">
          <RefreshCw className="w-4 h-4 mr-1.5" /> {t("clawin.reconfig")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[15px] text-[hsl(var(--muted-foreground))] leading-6">{t("clawin.desc")}</p>

      {/* Paste area */}
      <textarea
        placeholder={t("clawin.pasteHint")}
        value={pastedText}
        onChange={(e) => handlePaste(e.target.value)}
        disabled={state === "saving"}
        rows={6}
        className="w-full rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2.5 text-[13px] font-mono text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30 resize-none"
      />

      {/* Parsed result preview */}
      {parsed && (
        <div className="apple-group">
          <div className="apple-row">
            <span className="text-[15px] text-[hsl(var(--foreground))] shrink-0 w-[100px]">Room ID</span>
            <span className="text-[13px] font-mono text-[hsl(var(--primary))] truncate">{parsed.roomId}</span>
          </div>
          <div className="apple-row">
            <span className="text-[15px] text-[hsl(var(--foreground))] shrink-0 w-[100px]">Relay URL</span>
            <span className="text-[13px] font-mono text-[hsl(var(--muted-foreground))] truncate">{parsed.relayUrl}</span>
          </div>
        </div>
      )}

      {pastedText.trim() && !parsed && (
        <div className="apple-group">
          <div className="apple-row">
            <div className="flex items-center gap-2.5">
              <XCircle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0" />
              <span className="text-[13px] text-[hsl(var(--destructive))]">{t("clawin.parseError")}</span>
            </div>
          </div>
        </div>
      )}

      {/* Log stream */}
      {state === "saving" && logs.length > 0 && (
        <div className="log-stream rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2.5 min-h-[80px] max-h-[120px] overflow-auto">
          {logs.map((l, i) => (
            <div key={i} className="text-[hsl(var(--muted-foreground))] py-[3px] whitespace-pre leading-5">
              <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>{l}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}

      {/* Error */}
      {state === "error" && error && (
        <div className="apple-group">
          <div className="apple-row">
            <div className="flex items-center gap-2.5">
              <XCircle className="w-5 h-5 text-[hsl(var(--destructive))] shrink-0" />
              <span className="text-[13px] text-[hsl(var(--destructive))]">{error}</span>
            </div>
          </div>
        </div>
      )}

      <Button
        variant="outline"
        onClick={save}
        disabled={!parsed || state === "saving"}
        className="w-full gap-2"
      >
        {state === "saving" ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> {t("clawin.saving")}</>
        ) : state === "error" ? (
          <><RefreshCw className="w-5 h-5" /> {t("wa.retry")}</>
        ) : (
          <><Zap className="w-5 h-5" /> {t("clawin.save")}</>
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
    qqAppId,
    qqAppSecret,
    qqRelayUrl,
    qqRelayToken,
    qqSaved,
    clawinSaved,
    editingFromManage,
    setActiveChannel,
    setFeishuAppId,
    setFeishuAppSecret,
    setFeishuVerified,
    setWhatsappReady,
    setQqAppId,
    setQqAppSecret,
    setQqRelayUrl,
    setQqRelayToken,
    setQqSaved,
    setClawinRoomId,
    setClawinRelayUrl,
    setClawinSaved,
    advance,
    back,
  } = useWizard();

  // Any channel configured = can advance (multiple channels supported)
  const feishuOk = feishuVerified?.ok === true;
  const whatsappOk = whatsappReady;
  const qqOk = qqSaved;
  const clawinOk = clawinSaved;
  const canAdvance = feishuOk || whatsappOk || qqOk || clawinOk;

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
        {(["clawin", "feishu", "whatsapp"] as Channel[]).map((ch) => {
          const configured = (ch === "feishu" && feishuOk) || (ch === "whatsapp" && whatsappOk) || (ch === "qq" && qqOk) || (ch === "clawin" && clawinOk);
          return (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              className={cn(
                "flex-1 py-[7px] rounded-[7px] text-[15px] font-medium transition-all relative flex items-center justify-center gap-1.5",
                activeChannel === ch
                  ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                  : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              )}
            >
              {configured && (
                <CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--success))] shrink-0" />
              )}
              {ch === "clawin" ? "Clawin" : ch === "feishu" ? t("channel.feishu") : ch === "whatsapp" ? "WhatsApp" : "QQ"}
            </button>
          );
        })}
      </div>

      {/* 面板内容区 — flex-1 撑满中间空间，导航按钮始终在底部 */}
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
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
          <WhatsAppPanel ready={whatsappReady} onReady={() => setWhatsappReady(true)} />
        )}

        {/* QQ 面板 */}
        {activeChannel === "qq" && (
          <QQPanel
            appId={qqAppId}
            appSecret={qqAppSecret}
            relayUrl={qqRelayUrl}
            relayToken={qqRelayToken}
            saved={qqSaved}
            onAppIdChange={setQqAppId}
            onAppSecretChange={setQqAppSecret}
            onRelayUrlChange={setQqRelayUrl}
            onRelayTokenChange={setQqRelayToken}
            onSave={() => setQqSaved(!qqSaved)}
          />
        )}

        {/* Clawin 面板 */}
        {activeChannel === "clawin" && (
          <ClawinPanel
            saved={clawinSaved}
            onRoomIdChange={setClawinRoomId}
            onRelayUrlChange={setClawinRelayUrl}
            onSaved={setClawinSaved}
          />
        )}
      </div>

      {/* 底部固定区域 */}
      {canAdvance && (
        <div className="flex items-center gap-2 text-[15px] text-[hsl(var(--success))] font-medium shrink-0">
          <CheckCircle2 className="w-5 h-5" />
          {t("channel.connected")}
        </div>
      )}

      {/* 导航 */}
      <div className="flex justify-between shrink-0 pt-3">
        <Button variant="ghost" onClick={back}>
          <ArrowLeft className="w-5 h-5 mr-1.5" /> {editingFromManage ? t("common.cancel") : t("channel.back")}
        </Button>
        <Button onClick={advance} disabled={editingFromManage ? false : !canAdvance}>
          {editingFromManage ? t("common.done") : t("channel.next")} {!editingFromManage && <ArrowRight className="w-5 h-5 ml-1.5" />}
        </Button>
      </div>
    </div>
  );
}

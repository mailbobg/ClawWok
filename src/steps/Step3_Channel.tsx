import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

// ─── WhatsApp 面板 ────────────────────────────────────────────────────────────
type WaState = "idle" | "connecting" | "qr_ready" | "success" | "error";

function WhatsAppPanel({
  ready,
  onReady,
}: {
  ready: boolean;
  onReady: () => void;
}) {
  const [state, setState] = useState<WaState>(ready ? "success" : "idle");
  const [qrLines, setQrLines] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);

  const startLogin = async () => {
    setState("connecting");
    setQrLines([]);
    setLogs([]);

    // 订阅 Gateway 日志事件
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

  // 清理
  useEffect(() => () => { unlistenRef.current?.(); }, []);

  if (state === "success" || ready) {
    return (
      <div className="rounded-lg p-3 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-sm">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-emerald-400 font-medium">WhatsApp 已绑定 ✓</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {state !== "qr_ready" && (
        <div className="rounded-lg bg-[hsl(var(--primary)/0.06)] border border-[hsl(var(--primary)/0.15)] p-3 text-xs text-[hsl(var(--muted-foreground))] leading-5">
          点击「开始扫码」后，用手机 WhatsApp 扫描下方二维码完成绑定。
        </div>
      )}

      {/* QR 码区域 */}
      {state === "qr_ready" && qrLines.length > 0 ? (
        <div className="flex flex-col flex-1 min-h-0 gap-2">
          <div className="flex-1 min-h-[320px] rounded-xl bg-white shadow-lg overflow-auto p-2 flex items-center justify-center">
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
            <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
              <Smartphone className="w-3.5 h-3.5" />
              打开 WhatsApp → 设置 → 已连接的设备 → 连接设备
            </div>
            <Button variant="ghost" size="sm" onClick={cancel} className="text-xs">
              取消
            </Button>
          </div>
        </div>
      ) : state === "connecting" ? (
        <div className="flex flex-col flex-1 min-h-0 items-center gap-3 py-4">
          <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--primary))] shrink-0" />
          <p className="text-sm text-[hsl(var(--muted-foreground))] shrink-0">正在连接，等待二维码...</p>
          {logs.length > 0 && (
            <div className="w-full flex-1 min-h-0 rounded-md bg-black/30 px-3 py-2 overflow-auto">
              {logs.map((l, i) => (
                <div key={i} className="text-[10px] font-mono text-[hsl(var(--muted-foreground))] whitespace-pre">{l}</div>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={cancel} className="text-xs shrink-0">取消</Button>
        </div>
      ) : state === "error" ? (
        <div className="space-y-2">
          <div className="rounded-lg p-3 flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-sm">
            <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-red-400 font-medium">连接失败</span>
              {logs.length > 0 && (
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{logs[logs.length - 1]}</p>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={startLogin} className="w-full gap-2">
            <RefreshCw className="w-4 h-4" /> 重试
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={startLogin} className="w-full gap-2">
          <Smartphone className="w-4 h-4" />
          开始扫码绑定 WhatsApp
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
  const [state, setState] = useState<FeishuState>(verified?.ok ? "success" : "idle");
  const [logs, setLogs] = useState<string[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // 输入变更时重置状态
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
        <div className="rounded-lg p-3 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <span className="text-emerald-400 font-medium text-sm">飞书长连接已就绪 ✓</span>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
              启动 Gateway 后，用飞书手机端发消息给机器人即可开始对话
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="text-xs w-full">
          <RefreshCw className="w-3 h-3 mr-1" /> 重新配置
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-[hsl(var(--primary)/0.06)] border border-[hsl(var(--primary)/0.15)] p-3 text-xs text-[hsl(var(--muted-foreground))] leading-5">
        <strong className="text-[hsl(var(--primary))]">长连接模式</strong>
        {" "}— 无需公网 IP 或内网穿透，手机飞书即可与家里的 AI 对话。
        在{" "}
        <span className="text-[hsl(var(--foreground)/0.7)]">飞书开放平台</span>
        {" "}创建自建应用后，填入 App ID 和 App Secret。
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[hsl(var(--foreground)/0.7)]">App ID</label>
        <Input
          placeholder="cli_xxxxxxxxxxxxxxxxx"
          value={appId}
          onChange={(e) => onAppIdChange(e.target.value)}
          disabled={state === "connecting"}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs text-[hsl(var(--foreground)/0.7)]">App Secret</label>
        <Input
          type="password"
          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          value={appSecret}
          onChange={(e) => onAppSecretChange(e.target.value)}
          disabled={state === "connecting"}
        />
      </div>

      {/* 连接中：日志流 */}
      {state === "connecting" && (
        <div className="rounded-md bg-black/30 px-3 py-2 min-h-[80px] max-h-[120px] overflow-auto">
          {logs.map((l, i) => (
            <div key={i} className="text-[10px] font-mono text-[hsl(var(--muted-foreground))] whitespace-pre leading-5">
              {l}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}

      {/* 错误状态 */}
      {state === "error" && logs.length > 0 && (
        <div className="rounded-lg p-2.5 flex items-start gap-2 bg-red-500/10 border border-red-500/20">
          <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <span className="text-red-400 text-xs">{logs[logs.length - 1]}</span>
        </div>
      )}

      <Button
        variant="outline"
        onClick={state === "error" ? connect : connect}
        disabled={!appId.trim() || !appSecret.trim() || state === "connecting"}
        className="w-full gap-2"
      >
        {state === "connecting" ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> 正在连接飞书...</>
        ) : state === "error" ? (
          <><RefreshCw className="w-4 h-4" /> 重试</>
        ) : (
          <><Zap className="w-4 h-4" /> 验证并连接飞书</>
        )}
      </Button>
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export function Step3_Channel() {
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
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <div>
        <h2 className="text-lg font-semibold">渠道接入</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
          连接即时通讯渠道，让 AI Agent 与用户对话
        </p>
      </div>

      {/* 渠道 Tab */}
      <div className="flex gap-1 rounded-lg bg-[hsl(var(--muted))] p-1">
        {(["feishu", "whatsapp"] as Channel[]).map((ch) => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            className={cn(
              "flex-1 py-1.5 rounded-md text-sm font-medium transition-all",
              activeChannel === ch
                ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            )}
          >
            {ch === "feishu" ? "🐦 飞书" : "📱 WhatsApp"}
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
        <Badge variant="success" className="self-start mt-auto">
          <CheckCircle2 className="w-3 h-3" />
          渠道已接入
        </Badge>
      )}

      {/* 导航 */}
      <div className="flex justify-between mt-auto pt-2">
        <Button variant="ghost" size="sm" onClick={back}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <Button onClick={advance} disabled={!canAdvance}>
          下一步 <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

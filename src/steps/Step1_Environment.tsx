import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogStream } from "@/components/LogStream";
import { useWizard, type EnvReport } from "@/store/wizard";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";

interface CheckRowProps {
  label: string;
  value: string | boolean | null;
  ok: boolean;
  loading?: boolean;
}

function CheckRow({ label, value, ok, loading }: CheckRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[hsl(var(--border)/0.5)] last:border-0">
      <span className="text-sm text-[hsl(var(--foreground)/0.7)]">{label}</span>
      <div className="flex items-center gap-2">
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--muted-foreground))]" />
        ) : ok ? (
          <>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              {typeof value === "string" ? value : ""}
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </>
        ) : (
          <XCircle className="w-4 h-4 text-red-400" />
        )}
      </div>
    </div>
  );
}

export function Step1_Environment() {
  const {
    envReport,
    envLogs,
    envReady,
    envLoading,
    setEnvReport,
    setEnvReady,
    setEnvLoading,
    appendLog,
    clearLogs,
    advance,
    back,
  } = useWizard();

  const runDiagnosis = async () => {
    setEnvLoading(true);
    clearLogs();
    setEnvReady(false);

    appendLog("正在检测系统环境...");

    try {
      const report = await invoke<EnvReport>("detect_environment");
      setEnvReport(report);

      appendLog(
        `操作系统: ${report.os} (${report.arch})`
      );
      appendLog(
        report.node_version
          ? `Node.js: ${report.node_version} ✓`
          : "Node.js: 未安装"
      );
      appendLog(report.git_installed ? "Git: 已安装 ✓" : "Git: 未安装");

      // Get geo mirror
      appendLog("正在检测网络区域...");
      const mirror = await invoke<{ npm: string; region: string }>(
        "get_geo_mirror"
      );
      appendLog(
        `网络区域: ${mirror.region === "CN" ? "中国大陆" : "海外"} — 使用 ${mirror.npm}`
      );

      if (mirror.region === "CN") {
        appendLog("正在切换 npm 镜像源...");
        await invoke("set_npm_mirror", { registryUrl: mirror.npm });
        appendLog("镜像源切换完成 ✓");
      }

      // Install brew if needed
      if (report.needs_brew) {
        appendLog("Homebrew 未安装，开始自动安装...");
        await invoke("install_brew");
      }

      // Install Node if needed
      if (report.needs_node) {
        appendLog("Node.js 版本不足，开始安装 Node.js 22...");
        const unlisten = await listen<{ text: string }>(
          "install_log",
          (e) => appendLog(e.payload.text)
        );
        await invoke("install_node");
        unlisten();

        // Re-detect
        const report2 = await invoke<EnvReport>("detect_environment");
        setEnvReport(report2);
      }

      // Install openclaw
      appendLog("正在安装 OpenClaw 核心包...");
      const unlisten2 = await listen<{ text: string }>(
        "install_log",
        (e) => appendLog(e.payload.text)
      );
      await invoke("download_openclaw", { cdnBase: "https://registry.npmjs.org" });
      unlisten2();

      appendLog("环境准备完成！✓");
      setEnvReady(true);
    } catch (err) {
      appendLog(`错误: ${err}`);
    } finally {
      setEnvLoading(false);
    }
  };

  useEffect(() => {
    if (!envReport) {
      runDiagnosis();
    }
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <div>
        <h2 className="text-lg font-semibold">环境准备</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
          自动检测并安装所有必要的运行环境
        </p>
      </div>

      {/* Check list */}
      <div className="rounded-lg bg-[hsl(var(--card))] border border-[hsl(var(--border))] px-4 py-1">
        <CheckRow
          label="操作系统"
          value={envReport ? `${envReport.os} · ${envReport.arch}` : null}
          ok={!!envReport}
          loading={envLoading && !envReport}
        />
        <CheckRow
          label="Node.js ≥ 22"
          value={envReport?.node_version ?? null}
          ok={!!envReport && !envReport.needs_node}
          loading={envLoading && !envReport}
        />
        <CheckRow
          label="Git"
          value={envReport?.git_installed ? "已安装" : "未安装"}
          ok={!!envReport?.git_installed}
          loading={envLoading && !envReport}
        />
        <CheckRow
          label="npm 镜像"
          value="已优化"
          ok={envReady}
          loading={envLoading}
        />
        <CheckRow
          label="OpenClaw 核心"
          value="已安装"
          ok={envReady}
          loading={envLoading}
        />
      </div>

      {/* Log stream */}
      <LogStream logs={envLogs} />

      {/* Status */}
      {envReady && (
        <Badge variant="success" className="self-start">
          <CheckCircle2 className="w-3 h-3" />
          环境就绪
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
            size="sm"
            onClick={runDiagnosis}
            disabled={envLoading}
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${envLoading ? "animate-spin" : ""}`} />
            重新检测
          </Button>
          <Button onClick={advance} disabled={!envReady}>
            下一步 <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

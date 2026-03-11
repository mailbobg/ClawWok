import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
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
import { useT } from "@/i18n";

function StatusIcon({ ok, loading }: { ok: boolean; loading?: boolean }) {
  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--muted-foreground))]" />;
  if (ok) return <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))]" />;
  return <XCircle className="w-5 h-5 text-[hsl(var(--destructive))]" />;
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

  const t = useT();

  const runDiagnosis = async () => {
    setEnvLoading(true);
    clearLogs();
    setEnvReady(false);

    appendLog(t("env.log.detecting"));

    try {
      const report = await invoke<EnvReport>("detect_environment");
      setEnvReport(report);

      appendLog(
        `${t("env.os")}: ${report.os} (${report.arch})`
      );
      appendLog(
        report.node_version
          ? `Node.js: ${report.node_version} ✓`
          : t("env.log.nodeNotInstalled")
      );
      appendLog(report.git_installed ? t("env.log.gitInstalled") : t("env.log.gitNotInstalled"));

      // Get geo mirror
      appendLog(t("env.log.detectingNetwork"));
      const mirror = await invoke<{ npm: string; region: string }>(
        "get_geo_mirror"
      );
      appendLog(
        `${mirror.region === "CN" ? t("env.log.regionCN") : t("env.log.regionOverseas")} — ${mirror.npm}`
      );

      if (mirror.region === "CN") {
        appendLog(t("env.log.switchingMirror"));
        await invoke("set_npm_mirror", { registryUrl: mirror.npm });
        appendLog(t("env.log.mirrorDone"));
      }

      // Install brew if needed
      if (report.needs_brew) {
        appendLog(t("env.log.brewNotInstalled"));
        await invoke("install_brew");
      }

      // Install Node if needed
      if (report.needs_node) {
        appendLog(t("env.log.nodeInsufficient"));
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
      appendLog(t("env.log.installingCore"));
      const unlisten2 = await listen<{ text: string }>(
        "install_log",
        (e) => appendLog(e.payload.text)
      );
      await invoke("download_openclaw", { cdnBase: "https://registry.npmjs.org" });
      unlisten2();

      appendLog(t("env.log.envDone"));
      setEnvReady(true);
    } catch (err) {
      appendLog(`${t("env.log.error")} ${err}`);
    } finally {
      setEnvLoading(false);
    }
  };

  useEffect(() => {
    if (!envReport) {
      runDiagnosis();
    }
  }, []);

  const checks: { label: string; value: string; ok: boolean; loading: boolean }[] = [
    {
      label: t("env.os"),
      value: envReport ? `${envReport.os} · ${envReport.arch}` : "",
      ok: !!envReport,
      loading: envLoading && !envReport,
    },
    {
      label: t("env.node"),
      value: envReport?.node_version ?? "",
      ok: !!envReport && !envReport.needs_node,
      loading: envLoading && !envReport,
    },
    {
      label: t("env.git"),
      value: envReport?.git_installed ? t("env.installed") : t("env.notInstalled"),
      ok: !!envReport?.git_installed,
      loading: envLoading && !envReport,
    },
    {
      label: t("env.npmMirror"),
      value: t("env.optimized"),
      ok: envReady,
      loading: envLoading,
    },
    {
      label: t("env.openclawCore"),
      value: t("env.installed"),
      ok: envReady,
      loading: envLoading,
    },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-5">
      {/* Section header */}
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight">{t("env.title")}</h2>
        <p className="text-[15px] text-[hsl(var(--muted-foreground))] mt-1">
          {t("env.subtitle")}
        </p>
      </div>

      {/* Check list — Apple grouped */}
      <div className="apple-group">
        {checks.map((c, i) => (
          <div key={i} className="apple-row">
            <span className="text-[17px] text-[hsl(var(--foreground))]">{c.label}</span>
            <div className="flex items-center gap-2.5">
              {!c.loading && c.ok && c.value && (
                <span className="text-[15px] text-[hsl(var(--muted-foreground))]">{c.value}</span>
              )}
              <StatusIcon ok={c.ok} loading={c.loading} />
            </div>
          </div>
        ))}
      </div>

      {/* Log stream */}
      <LogStream logs={envLogs} />

      {/* Status badge */}
      {envReady && (
        <div className="flex items-center gap-2 text-[15px] text-[hsl(var(--success))] font-medium">
          <CheckCircle2 className="w-5 h-5" />
          {t("env.ready")}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-auto pt-3">
        <Button variant="ghost" onClick={back}>
          <ArrowLeft className="w-5 h-5 mr-1.5" /> {t("env.back")}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={runDiagnosis}
            disabled={envLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${envLoading ? "animate-spin" : ""}`} />
            {t("env.recheck")}
          </Button>
          <Button onClick={advance} disabled={!envReady}>
            {t("env.next")} <ArrowRight className="w-5 h-5 ml-1.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

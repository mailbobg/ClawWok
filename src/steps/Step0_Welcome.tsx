import { useWizard } from "@/store/wizard";
import { ArrowRight, Settings2, Globe } from "lucide-react";
import { useT, useI18n } from "@/i18n";

export function Step0_Welcome() {
  const { setAppMode, goTo } = useWizard();
  const t = useT();
  const toggleLang = useI18n((s) => s.toggleLang);

  const startWizard = () => {
    setAppMode("wizard");
    goTo(1);
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-0 gap-12 px-6">
      {/* Hero */}
      <div className="flex flex-col items-center gap-5">
        <span
          className="material-symbols-rounded text-[hsl(var(--primary))]"
          style={{ fontSize: "96px" }}
        >
          robot_2
        </span>
        <div className="text-center">
          <h1 className="text-[32px] font-bold tracking-tight text-[hsl(var(--foreground))]">ClawWok</h1>
          <p className="text-[hsl(var(--muted-foreground))] text-[15px] mt-1">
            {t("welcome.subtitle")}
          </p>
        </div>
      </div>

      {/* Actions — Apple settings-style grouped list */}
      <div className="w-full max-w-[360px] apple-group">
        <button
          onClick={startWizard}
          className="apple-row w-full hover:bg-[hsl(var(--background))] transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-[34px] h-[34px] rounded-[8px] bg-[hsl(var(--primary))] flex items-center justify-center">
              <ArrowRight className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="text-left">
              <div className="text-[17px] font-medium text-[hsl(var(--foreground))]">{t("welcome.start")}</div>
              <div className="text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5">{t("welcome.startDesc")}</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[hsl(var(--muted-foreground))]/40" />
        </button>

        <button
          onClick={() => setAppMode("manage")}
          className="apple-row w-full hover:bg-[hsl(var(--background))] transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-[34px] h-[34px] rounded-[8px] bg-[hsl(var(--muted-foreground))] flex items-center justify-center">
              <Settings2 className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="text-left">
              <div className="text-[17px] font-medium text-[hsl(var(--foreground))]">{t("welcome.manage")}</div>
              <div className="text-[13px] text-[hsl(var(--muted-foreground))] mt-0.5">{t("welcome.manageDesc")}</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-[hsl(var(--muted-foreground))]/40" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-[13px] text-[hsl(var(--muted-foreground))]">
          v0.1.0 · Internal Use Only
        </p>
        <button
          onClick={toggleLang}
          className="flex items-center gap-1 text-[13px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          <Globe className="w-3.5 h-3.5" />
          {t("common.langLabel")}
        </button>
      </div>
    </div>
  );
}

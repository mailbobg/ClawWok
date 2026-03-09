import { useWizard } from "@/store/wizard";
import { ArrowRight, Settings2 } from "lucide-react";

function ChefLobsterIcon() {
  return (
    <svg
      viewBox="0 0 80 80"
      width="80"
      height="80"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      {/* Wok */}
      <ellipse cx="40" cy="62" rx="24" ry="8" fill="#1a1a2e" />
      <path
        d="M16 54 Q16 70 40 70 Q64 70 64 54"
        fill="#2d2d44"
        stroke="#444466"
        strokeWidth="1.5"
      />
      {/* Wok handle */}
      <rect x="62" y="55" width="12" height="4" rx="2" fill="#555577" />

      {/* Steam wisps */}
      <path d="M30 46 Q28 40 30 34 Q32 28 30 22" stroke="#94d8f0" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <path d="M40 44 Q38 38 40 32 Q42 26 40 20" stroke="#94d8f0" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M50 46 Q48 40 50 34 Q52 28 50 22" stroke="#94d8f0" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />

      {/* Lobster body (in wok) */}
      <ellipse cx="38" cy="56" rx="10" ry="5" fill="#e8441a" />
      {/* Lobster tail segments */}
      <ellipse cx="49" cy="57" rx="5" ry="3.5" fill="#d43518" />
      <ellipse cx="55" cy="58" rx="3" ry="2.5" fill="#c02e10" />
      {/* Lobster claws */}
      <path d="M30 53 Q24 49 22 52 Q24 55 30 54" fill="#e8441a" />
      <path d="M30 60 Q24 63 23 60 Q25 57 30 58" fill="#e8441a" />
      {/* Lobster antennae */}
      <line x1="28" y1="52" x2="20" y2="46" stroke="#e8441a" strokeWidth="1" />
      <line x1="30" y1="51" x2="24" y2="44" stroke="#e8441a" strokeWidth="1" />

      {/* Chef body */}
      <ellipse cx="40" cy="32" rx="9" ry="11" fill="#f5e6d0" />
      {/* Chef uniform */}
      <path d="M31 36 Q31 44 40 44 Q49 44 49 36" fill="white" stroke="#ddd" strokeWidth="0.5" />
      {/* Buttons */}
      <circle cx="40" cy="38" r="1" fill="#ccc" />
      <circle cx="40" cy="41" r="1" fill="#ccc" />

      {/* Chef head */}
      <ellipse cx="40" cy="22" rx="8" ry="9" fill="#f5d5a8" />
      {/* Chef face */}
      <circle cx="37" cy="21" r="1" fill="#555" />
      <circle cx="43" cy="21" r="1" fill="#555" />
      <path d="M37 25 Q40 27 43 25" stroke="#c0856a" strokeWidth="1" strokeLinecap="round" />
      {/* Rosy cheeks */}
      <ellipse cx="35" cy="23" rx="2" ry="1.2" fill="#f0a0a0" opacity="0.5" />
      <ellipse cx="45" cy="23" rx="2" ry="1.2" fill="#f0a0a0" opacity="0.5" />

      {/* Chef hat */}
      <rect x="33" y="12" width="14" height="5" rx="1" fill="white" stroke="#ddd" strokeWidth="0.5" />
      <ellipse cx="40" cy="12" rx="9" ry="4" fill="white" stroke="#ddd" strokeWidth="0.5" />
      <ellipse cx="40" cy="8" rx="6" ry="7" fill="white" stroke="#ddd" strokeWidth="0.5" />

      {/* Arms */}
      <path d="M31 35 Q24 40 25 48" stroke="#f5d5a8" strokeWidth="5" strokeLinecap="round" />
      <circle cx="25" cy="48" r="3" fill="#f5d5a8" />
      <path d="M49 35 Q57 38 60 45" stroke="#f5d5a8" strokeWidth="5" strokeLinecap="round" />
      {/* Spatula */}
      <line x1="60" y1="45" x2="50" y2="57" stroke="#888" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="48.5" cy="58.5" rx="4" ry="2" fill="#aaa" transform="rotate(-30 48.5 58.5)" />
    </svg>
  );
}

export function Step0_Welcome() {
  const { setAppMode, goTo } = useWizard();

  const startWizard = () => {
    setAppMode("wizard");
    goTo(1);
  };

  const openManage = () => {
    setAppMode("manage");
  };

  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-0 gap-8 px-8">
      {/* Logo */}
      <div className="flex flex-col items-center gap-4">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[hsl(16,90%,30%)] to-[hsl(196,90%,30%)] flex items-center justify-center shadow-2xl shadow-[hsl(16,70%,40%)/0.4]">
          <ChefLobsterIcon />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[hsl(var(--foreground))]">ClawWok</h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm mt-1">
            炒龙虾 · OpenClaw 管理器
          </p>
        </div>
      </div>

      {/* 两个入口卡片 */}
      <div className="w-full max-w-sm grid grid-cols-2 gap-3">
        {/* 开始配置 */}
        <button
          onClick={startWizard}
          className="group flex flex-col items-center gap-3 p-5 rounded-xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] hover:bg-[hsl(var(--primary)/0.12)] hover:border-[hsl(var(--primary)/0.5)] transition-all cursor-pointer text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-[hsl(var(--primary)/0.15)] flex items-center justify-center group-hover:bg-[hsl(var(--primary)/0.25)] transition-colors">
            <ArrowRight className="w-5 h-5 text-[hsl(var(--primary))]" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">开始配置</div>
            <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5 leading-relaxed">
              首次安装 · 一步步引导完成环境配置
            </div>
          </div>
        </button>

        {/* 管理龙虾 */}
        <button
          onClick={openManage}
          className="group flex flex-col items-center gap-3 p-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted)/0.5)] hover:border-[hsl(var(--border))] transition-all cursor-pointer text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-[hsl(var(--muted))] flex items-center justify-center group-hover:bg-[hsl(var(--muted)/0.7)] transition-colors">
            <Settings2 className="w-5 h-5 text-[hsl(var(--muted-foreground))]" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">管理龙虾</div>
            <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5 leading-relaxed">
              已安装 · 启停 Gateway · 管理技能
            </div>
          </div>
        </button>
      </div>

      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
        v0.1.0 · Confidential · Internal Use Only
      </p>
    </div>
  );
}

import { cn } from "@/lib/utils";

const STEPS = ["欢迎", "环境准备", "模型配置", "渠道接入", "完成"];

interface StepIndicatorProps {
  current: number;
}

export function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  done && "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
                  active && "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] ring-2 ring-[hsl(var(--primary)/0.3)] ring-offset-1 ring-offset-[hsl(var(--background))]",
                  !done && !active && "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                )}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] whitespace-nowrap",
                  active ? "text-[hsl(var(--primary))] font-medium" : "text-[hsl(var(--muted-foreground))]"
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-10 h-px mx-1 mb-4",
                  i < current ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--border))]"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useT } from "@/i18n";
import type { LocaleKeys } from "@/i18n";

const STEP_KEYS: LocaleKeys[] = ["step.env", "step.model", "step.channel", "step.done"];

interface StepIndicatorProps {
  current: number;
}

export function StepIndicator({ current }: StepIndicatorProps) {
  const t = useT();
  // current is 1-based (step 1 = index 0 here)
  const idx = current - 1;

  return (
    <div className="flex items-center gap-1">
      {STEP_KEYS.map((key, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={i} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-[26px] h-[26px] rounded-full flex items-center justify-center text-[12px] font-semibold transition-all",
                  done && "bg-[hsl(var(--primary))] text-white",
                  active && "bg-[hsl(var(--primary))] text-white",
                  !done && !active && "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                )}
              >
                {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[14px]",
                  active ? "text-[hsl(var(--foreground))] font-medium" : "text-[hsl(var(--muted-foreground))]"
                )}
              >
                {t(key)}
              </span>
            </div>
            {i < STEP_KEYS.length - 1 && (
              <div
                className={cn(
                  "w-7 h-[1.5px] mx-2.5 rounded-full",
                  i < idx ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--border))]"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

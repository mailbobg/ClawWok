import { useEffect, useRef } from "react";
import type { LogLine } from "@/store/wizard";
import { cn } from "@/lib/utils";

interface LogStreamProps {
  logs: LogLine[];
  className?: string;
}

export function LogStream({ logs, className }: LogStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div
      className={cn(
        "log-stream rounded-[10px] bg-[hsl(var(--card))] border border-[hsl(var(--border))]/60 px-3.5 py-2.5 max-h-36 overflow-y-auto",
        className
      )}
    >
      {logs.map((l) => (
        <div key={l.id} className="text-[hsl(var(--muted-foreground))] py-[3px]">
          <span className="text-[hsl(var(--primary))]/40 mr-1.5">›</span>
          {l.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

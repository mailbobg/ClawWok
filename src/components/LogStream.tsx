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
        "log-stream rounded-md bg-black/40 border border-[hsl(var(--border))] p-3 max-h-40 overflow-y-auto",
        className
      )}
    >
      {logs.map((l) => (
        <div key={l.id} className="text-[hsl(var(--muted-foreground))] py-0.5 leading-5">
          <span className="text-[hsl(var(--primary)/0.5)] mr-2">›</span>
          {l.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

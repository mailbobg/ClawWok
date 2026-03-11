import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[36px] w-full rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1 text-[13px] text-[hsl(var(--foreground))] transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/30 focus-visible:border-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-[hsl(var(--secondary))]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
  {
    variants: {
      variant: {
        default: "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))]",
        success: "bg-[hsl(var(--success))]/12 text-[hsl(var(--success))]",
        warning: "bg-[hsl(var(--warning))]/12 text-[hsl(var(--warning))]",
        error: "bg-[hsl(var(--destructive))]/12 text-[hsl(var(--destructive))]",
        muted: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

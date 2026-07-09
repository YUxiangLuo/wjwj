import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva("gap-1 border transition-colors", {
    variants: {
        intent: {
            success: "border-success/20 bg-success/10 text-success hover:bg-success/20",
            warning: "border-warning/20 bg-warning/10 text-warning hover:bg-warning/20",
            destructive: "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20",
            info: "border-info/20 bg-info/10 text-info hover:bg-info/20",
            primary: "border-primary/20 bg-primary/10 text-primary hover:bg-primary/20",
            auxiliary: "border-auxiliary/20 bg-auxiliary/10 text-auxiliary hover:bg-auxiliary/20",
            neutral: "border-border bg-muted text-muted-foreground hover:bg-muted/80",
        },
    },
    defaultVariants: {
        intent: "neutral",
    },
});

type StatusBadgeProps = Omit<React.ComponentProps<typeof Badge>, "variant"> &
    VariantProps<typeof statusBadgeVariants>;
type StatusBadgeIntent = NonNullable<VariantProps<typeof statusBadgeVariants>["intent"]>;

function StatusBadge({ className, intent, ...props }: StatusBadgeProps) {
    return (
        <Badge
            variant="outline"
            className={cn(statusBadgeVariants({ intent }), className)}
            {...props}
        />
    );
}

export { StatusBadge, statusBadgeVariants };
export type { StatusBadgeIntent };

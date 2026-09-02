import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva("gap-1 border transition-colors", {
    variants: {
        intent: {
            success: "border-success-border bg-success-muted text-success [a&]:hover:border-success",
            warning: "border-warning-border bg-warning-muted text-warning [a&]:hover:border-warning",
            destructive: "border-destructive-border bg-destructive-muted text-destructive [a&]:hover:border-destructive",
            info: "border-info-border bg-info-muted text-info [a&]:hover:border-info",
            primary: "border-primary-border bg-primary-muted text-primary [a&]:hover:border-primary",
            auxiliary: "border-auxiliary-border bg-auxiliary-muted text-auxiliary [a&]:hover:border-auxiliary",
            neutral: "border-border bg-muted text-muted-foreground [a&]:hover:border-input [a&]:hover:text-foreground",
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

export { StatusBadge };
export type { StatusBadgeIntent };

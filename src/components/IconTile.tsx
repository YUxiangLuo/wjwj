import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const iconTileVariants = cva("flex h-10 w-10 shrink-0 items-center justify-center rounded-control border", {
    variants: {
        intent: {
            success: "border-success-border bg-success-muted text-success",
            warning: "border-warning-border bg-warning-muted text-warning",
            destructive: "border-destructive-border bg-destructive-muted text-destructive",
            info: "border-info-border bg-info-muted text-info",
            primary: "border-primary-border bg-primary-muted text-primary",
            auxiliary: "border-auxiliary-border bg-auxiliary-muted text-auxiliary",
            neutral: "border-border bg-muted text-muted-foreground",
        },
    },
    defaultVariants: {
        intent: "neutral",
    },
});

type IconTileProps = React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof iconTileVariants>;

function IconTile({ className, intent, ...props }: IconTileProps) {
    return (
        <div
            className={cn(iconTileVariants({ intent }), className)}
            {...props}
        />
    );
}

export { IconTile };

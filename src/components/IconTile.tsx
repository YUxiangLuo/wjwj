import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const iconTileVariants = cva("flex shrink-0 items-center justify-center border", {
    variants: {
        intent: {
            success: "border-success/20 bg-success/10 text-success",
            warning: "border-warning/20 bg-warning/10 text-warning",
            destructive: "border-destructive/20 bg-destructive/10 text-destructive",
            info: "border-info/20 bg-info/10 text-info",
            primary: "border-primary/20 bg-primary/10 text-primary",
            auxiliary: "border-auxiliary/20 bg-auxiliary/10 text-auxiliary",
            neutral: "border-border bg-muted text-muted-foreground",
        },
        size: {
            sm: "h-8 w-8 rounded-md",
            md: "h-10 w-10 rounded-lg",
            lg: "h-12 w-12 rounded-xl",
        },
    },
    defaultVariants: {
        intent: "neutral",
        size: "md",
    },
});

type IconTileProps = React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof iconTileVariants>;

function IconTile({ className, intent, size, ...props }: IconTileProps) {
    return (
        <div
            className={cn(iconTileVariants({ intent, size }), className)}
            {...props}
        />
    );
}

export { IconTile, iconTileVariants };

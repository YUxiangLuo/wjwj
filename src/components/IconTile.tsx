import * as React from "react";
import MuiBox from "@mui/material/Box";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Understated Material Design 3 tonal icon container without decorative border clutter.
const iconTileVariants = cva(
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-surface",
    {
        variants: {
            intent: {
                success: "bg-success-muted text-success",
                warning: "bg-warning-muted text-warning",
                destructive: "bg-destructive-muted text-destructive",
                info: "bg-info-muted text-info",
                primary: "bg-primary-muted text-primary",
                auxiliary: "bg-auxiliary-muted text-auxiliary",
                neutral: "bg-muted text-muted-foreground",
            },
        },
        defaultVariants: {
            intent: "neutral",
        },
    },
);

type IconTileProps = React.HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof iconTileVariants>;

function IconTile({ className, intent, ...props }: IconTileProps) {
    return (
        <MuiBox
            component="div"
            className={cn(iconTileVariants({ intent }), className)}
            {...props}
        />
    );
}

export { IconTile };

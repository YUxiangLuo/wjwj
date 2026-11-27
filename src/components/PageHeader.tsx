import * as React from "react";
import MuiBox from "@mui/material/Box";

import { cn } from "@/lib/utils";

type PageHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
    as?: React.ElementType;
    border?: boolean;
};

function PageHeader({
    as: Component = "div",
    border = true,
    children,
    className,
    ...props
}: PageHeaderProps) {
    return (
        <MuiBox
            component={Component}
            className={cn(
                "flex flex-row items-center justify-between gap-4",
                border && "border-b border-border pb-4",
                className,
            )}
            {...props}
        >
            {children}
        </MuiBox>
    );
}

export { PageHeader };

import * as React from "react";

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
        <Component
            className={cn(
                "flex gap-4 flex-row items-center justify-between",
                border && "border-b border-border pb-4",
                className,
            )}
            {...props}
        >
            {children}
        </Component>
    );
}

export { PageHeader };

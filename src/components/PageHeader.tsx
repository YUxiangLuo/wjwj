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
                "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between",
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

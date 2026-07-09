import * as React from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = React.HTMLAttributes<HTMLDivElement> & {
    as?: React.ElementType;
    border?: boolean;
    title?: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    actionsClassName?: string;
    contentClassName?: string;
    descriptionClassName?: string;
    titleClassName?: string;
    titleAs?: React.ElementType;
};

function PageHeader({
    as: Component = "div",
    border = true,
    title,
    description,
    actions,
    actionsClassName,
    children,
    className,
    contentClassName,
    descriptionClassName,
    titleAs: Title = "h2",
    titleClassName,
    ...props
}: PageHeaderProps) {
    const headerClassName = cn(
        "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between",
        border && "border-b border-border pb-4",
        className,
    );

    if (!title && !description && !actions) {
        return (
            <Component className={headerClassName} {...props}>
                {children}
            </Component>
        );
    }

    return (
        <Component className={headerClassName} {...props}>
            <div className={contentClassName}>
                {title ? <Title className={cn("text-lg font-semibold text-foreground", titleClassName)}>{title}</Title> : null}
                {description ? <p className={cn("mt-1 text-sm text-muted-foreground", descriptionClassName)}>{description}</p> : null}
                {children}
            </div>
            {actions ? <div className={cn("flex flex-col gap-3 sm:flex-row", actionsClassName)}>{actions}</div> : null}
        </Component>
    );
}

export { PageHeader };

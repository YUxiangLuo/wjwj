import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { IconTile } from "@/components/IconTile";
import { cn } from "@/lib/utils";

export interface KpiStatCardProps {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    icon?: LucideIcon;
    intent?: "primary" | "success" | "warning" | "info" | "destructive" | "auxiliary" | "neutral";
    to?: string;
    loading?: boolean;
    testId?: string;
    className?: string;
}

export function KpiStatCard({
    label,
    value,
    hint,
    icon: Icon,
    intent = "primary",
    to,
    loading = false,
    testId,
    className,
}: KpiStatCardProps) {
    const isLongTextValue = typeof value === "string" && value.length > 6;
    const content = (
        <div className={cn(
            "flex h-full flex-col justify-between gap-2 rounded-surface border border-border bg-card p-3.5 transition-none",
            to && "hover:border-primary-border hover:bg-primary-muted",
            className,
        )}>
            <div className="min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-meta font-medium text-muted-foreground" title={label}>{label}</p>
                    {Icon && (
                        <IconTile intent={intent} className="h-8 w-8">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                        </IconTile>
                    )}
                </div>
                <div
                    data-testid={testId}
                    className={cn(
                        "truncate font-bold tabular-nums tracking-tight text-foreground",
                        isLongTextValue ? "text-subheading leading-snug" : "text-page-title",
                    )}
                    title={typeof value === "string" ? value : undefined}
                >
                    {loading ? (
                        <span aria-hidden="true" className="inline-block h-7 w-16 animate-pulse rounded-control bg-muted align-middle" />
                    ) : value}
                </div>
            </div>
            {(hint || to) && (
                <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-meta text-muted-foreground">
                    <span className="truncate">{hint ?? "点击查看明细"}</span>
                    {to && <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />}
                </div>
            )}
        </div>
    );

    if (to) {
        return (
            <Link to={to} className="block min-w-0 rounded-surface outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                {content}
            </Link>
        );
    }
    return content;
}

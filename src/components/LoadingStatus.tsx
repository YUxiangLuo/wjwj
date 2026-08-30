import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStatusProps {
    label?: string;
    className?: string;
    iconClassName?: string;
    showLabel?: boolean;
}

export function LoadingStatus({
    label = "加载中...",
    className,
    iconClassName,
    showLabel = false,
}: LoadingStatusProps) {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={cn("flex items-center justify-center", showLabel && "gap-2", className)}
        >
            <Loader2 aria-hidden="true" className={cn("h-6 w-6 animate-spin text-primary", iconClassName)} />
            <span className={showLabel ? undefined : "sr-only"}>{label}</span>
        </div>
    );
}

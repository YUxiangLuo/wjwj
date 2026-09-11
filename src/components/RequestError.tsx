import { Link } from "react-router-dom";
import { Button } from "./ui/button";

export function RequestError({ message, onRetry, retrying = false, backTo, backLabel = "返回" }: {
    message: string;
    onRetry: () => void;
    retrying?: boolean;
    /** Secondary escape hatch: retrying a permission error can never succeed. */
    backTo?: string;
    backLabel?: string;
}) {
    return (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-4 text-label text-destructive">
            <span>{message}</span>
            <Button type="button" variant="outline" disabled={retrying} onClick={onRetry}>
                {retrying ? "正在重试…" : "重试加载"}
            </Button>
            {backTo && (
                <Button asChild type="button" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive-muted">
                    <Link to={backTo}>{backLabel}</Link>
                </Button>
            )}
        </div>
    );
}

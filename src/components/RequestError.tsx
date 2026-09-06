import { Button } from "./ui/button";

export function RequestError({ message, onRetry, retrying = false }: {
    message: string;
    onRetry: () => void;
    retrying?: boolean;
}) {
    return (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-4 text-label text-destructive">
            <span>{message}</span>
            <Button type="button" variant="outline" disabled={retrying} onClick={onRetry}>
                {retrying ? "正在重试…" : "重试加载"}
            </Button>
        </div>
    );
}

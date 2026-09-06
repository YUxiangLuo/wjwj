import { Button } from "@/components/ui/button";
import type { DraftSaveState } from "../experiment/experiment-draft";

export function DraftSaveStatus({ status, onRetry }: { status: DraftSaveState; onRetry: () => void }) {
    if (status === "idle") return null;
    if (status === "error") return (
        <div role="alert" className="flex items-center gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-3 text-label text-destructive">
            <span>草稿保存失败。请重试或复制内容后再离开页面。</span>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>重试保存</Button>
        </div>
    );
    return <p role="status" className="text-meta text-muted-foreground">{status === "saving" ? "正在保存草稿…" : "草稿已保存到当前浏览器，尚未同步到服务器"}</p>;
}

import { Button } from "@/components/ui/button";
import type { DraftSaveState } from "../experiment/experiment-draft";

export function DraftSaveStatus({ status, onRetry, savedLabel }: { status: DraftSaveState; onRetry: () => void; savedLabel?: string }) {
    if (status === "idle") return null;
    if (status === "conflict") return (
        <div role="alert" className="rounded-surface border border-warning-border bg-warning-muted p-3 text-label text-warning">
            其他窗口已更新此实验草稿，本页修改尚未保存。请先复制保留本页内容，再重新进入实验加载最新草稿。
        </div>
    );
    if (status === "error") return (
        <div role="alert" className="flex items-center gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-3 text-label text-destructive">
            <span>草稿保存失败。请重试或复制内容后再离开页面。</span>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>重试保存</Button>
        </div>
    );
    return <p role="status" className="text-meta text-muted-foreground">{status === "saving" ? "正在保存草稿…" : savedLabel ?? "草稿已保存到当前浏览器，尚未同步到服务器"}</p>;
}

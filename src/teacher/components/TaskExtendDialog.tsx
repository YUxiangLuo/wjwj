import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatetimePicker24 } from "@/components/DatetimePicker24";
import { Label } from "@/components/ui/label";
import { localWallClockToUtcIso } from "@/lib/datetime";
import { formatDateTimeDisplay } from "@/utils/format";
import type { Task } from "../api-client";

interface TaskExtendDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedTask: Task | null;
    extendDeadline: string;
    onExtendDeadlineChange: (value: string) => void;
    extendError?: string | null;
    onConfirm: () => void;
}

export function TaskExtendDialog(props: TaskExtendDialogProps) {
    const {
        open,
        onOpenChange,
        selectedTask,
        extendDeadline,
        onExtendDeadlineChange,
        extendError,
        onConfirm,
    } = props;
    const candidateIso = extendDeadline.trim() ? localWallClockToUtcIso(extendDeadline) : null;
    const minTimestamp = Math.max(
        Date.now(),
        selectedTask?.deadline ? new Date(selectedTask.deadline).getTime() : 0,
    );
    const notStrictlyLater = Boolean(candidateIso && new Date(candidateIso).getTime() <= minTimestamp);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md border-border bg-card text-foreground">
                <DialogHeader>
                    <DialogTitle className="font-medium text-foreground">延长截止时间</DialogTitle>
                    <DialogDescription className="sr-only">
                        为所选任务设置新的截止时间。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-3">
                    <div className="space-y-1 rounded-surface bg-muted px-4 py-3">
                        <div className="text-label font-medium text-foreground">
                            {selectedTask ? `${selectedTask.topic} · ${selectedTask.className}` : ""}
                        </div>
                        <div className="text-meta tabular-nums text-muted-foreground">
                            当前截止时间：{selectedTask?.deadline ? `${formatDateTimeDisplay(selectedTask.deadline)}（UTC+8）` : "无截止时间"}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="extendDeadline" className="text-foreground">新截止时间（中国标准时间）</Label>
                        <DatetimePicker24
                            id="extendDeadline"
                            data-testid="teacher-task-extend-deadline"
                            value={extendDeadline}
                            onChange={onExtendDeadlineChange}
                            placeholder="选择日期与时间（24 小时制）"
                            allowClear={false}
                        />
                        {notStrictlyLater && (
                            <p className="text-meta text-warning">提示：新截止时间须晚于当前截止时间且晚于当前时刻。</p>
                        )}
                        <p className="text-meta text-muted-foreground">仅支持向后顺延截止时间（中国标准时间 UTC+8）。</p>
                    </div>
                    {extendError && (
                        <p role="alert" className="rounded-surface border border-destructive-border bg-destructive-muted p-3 text-label text-destructive">
                            {extendError}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button data-testid="teacher-task-extend-submit" disabled={!extendDeadline.trim()} onClick={onConfirm}>确认延长</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

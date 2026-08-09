import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatetimePicker24 } from "@/components/ui/datetime-picker";
import { Label } from "@/components/ui/label";
import type { Task } from "../api-client";

interface TaskExtendDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedTask: Task | null;
    extendDeadline: string;
    onExtendDeadlineChange: (value: string) => void;
    onConfirm: () => void;
}

export function TaskExtendDialog(props: TaskExtendDialogProps) {
    const {
        open,
        onOpenChange,
        selectedTask,
        extendDeadline,
        onExtendDeadlineChange,
        onConfirm,
    } = props;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border text-foreground max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-foreground">延长截止时间</DialogTitle>
                    <DialogDescription className="sr-only">
                        为所选任务设置新的截止时间。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="text-sm text-muted-foreground">
                        {selectedTask ? `${selectedTask.topic} · ${selectedTask.className}` : ""}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="extendDeadline" className="text-foreground/90">新截止时间（中国标准时间）</Label>
                        <DatetimePicker24
                            id="extendDeadline"
                            data-testid="teacher-task-extend-deadline"
                            value={extendDeadline}
                            onChange={onExtendDeadlineChange}
                            placeholder="选择日期与时间（24 小时制）"
                            allowClear={false}
                        />
                        <p className="text-xs text-muted-foreground">中国标准时间（UTC+8）</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground hover:bg-muted">取消</Button>
                    <Button data-testid="teacher-task-extend-submit" onClick={onConfirm} className="bg-primary hover:bg-primary/90 text-primary-foreground">确认延长</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

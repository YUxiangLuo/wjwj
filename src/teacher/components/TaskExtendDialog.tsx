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
            <DialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 dark:text-slate-100">延长截止时间</DialogTitle>
                    <DialogDescription className="sr-only">
                        为所选任务设置新的截止时间。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="text-sm text-slate-500">
                        {selectedTask ? `${selectedTask.topic} · ${selectedTask.className}` : ""}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="extendDeadline" className="text-slate-700 dark:text-slate-300">新截止时间</Label>
                        <DatetimePicker24
                            id="extendDeadline"
                            data-testid="teacher-task-extend-deadline"
                            value={extendDeadline}
                            onChange={onExtendDeadlineChange}
                            placeholder="选择日期与时间（24 小时制）"
                            allowClear={false}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800">取消</Button>
                    <Button data-testid="teacher-task-extend-submit" onClick={onConfirm} className="bg-indigo-600 hover:bg-indigo-700 text-white">确认延长</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

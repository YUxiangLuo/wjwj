import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-slate-100">延长截止时间</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="text-sm text-slate-500">
                        {selectedTask ? `${selectedTask.topic} · ${selectedTask.className}` : ""}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="extendDeadline" className="text-slate-300">新截止时间</Label>
                        <Input
                            id="extendDeadline"
                            data-testid="teacher-task-extend-deadline"
                            type="datetime-local"
                            value={extendDeadline}
                            onChange={(e) => onExtendDeadlineChange(e.target.value)}
                            className="bg-slate-950 border-slate-800 text-slate-200"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">取消</Button>
                    <Button data-testid="teacher-task-extend-submit" onClick={onConfirm} className="bg-indigo-600 hover:bg-indigo-700 text-white">确认延长</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

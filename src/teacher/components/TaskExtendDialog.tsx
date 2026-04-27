import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatetimePicker24 } from "@/components/ui/datetime-picker";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="text-foreground">延长截止时间</DialogTitle>
                    <DialogDescription className="sr-only">
                        为所选任务设置新的截止时间。
                    </DialogDescription>
                </DialogHeader>
                <FieldGroup className="gap-4 py-4">
                    <Field>
                        <FieldLabel htmlFor="extendDeadline">新截止时间</FieldLabel>
                        {selectedTask && (
                            <FieldDescription>
                                {selectedTask.topic} · {selectedTask.className}
                            </FieldDescription>
                        )}
                        <DatetimePicker24
                            id="extendDeadline"
                            data-testid="teacher-task-extend-deadline"
                            value={extendDeadline}
                            onChange={onExtendDeadlineChange}
                            placeholder="选择日期与时间（24 小时制）"
                            allowClear={false}
                        />
                    </Field>
                </FieldGroup>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button data-testid="teacher-task-extend-submit" onClick={onConfirm}>确认延长</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

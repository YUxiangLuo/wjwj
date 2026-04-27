import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { Assistant, TeacherClass } from "../api-client";

interface AssistantAssignDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    assistant: Assistant | null;
    classes: TeacherClass[];
    selectedClassIds: number[];
    onSelectedClassIdsChange: (value: number[]) => void;
    onSubmit: () => void;
}

export function AssistantAssignDialog(props: AssistantAssignDialogProps) {
    const {
        open,
        onOpenChange,
        assistant,
        classes,
        selectedClassIds,
        onSelectedClassIdsChange,
        onSubmit,
    } = props;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>分配班级 - {assistant?.name}</DialogTitle>
                    <DialogDescription className="sr-only">
                        为助教分配或取消负责的班级。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                        {classes.map((cls) => {
                            const checkboxId = `teacher-assistant-assign-check-${cls.id}`;
                            const selected = selectedClassIds.includes(cls.id);
                            const toggleClass = (checked = !selected) => {
                                if (checked) {
                                    onSelectedClassIdsChange([...selectedClassIds, cls.id]);
                                } else {
                                    onSelectedClassIdsChange(selectedClassIds.filter((id) => id !== cls.id));
                                }
                            };
                            return (
                                <div
                                    key={cls.id}
                                    className="flex cursor-pointer items-center gap-3 border border-border bg-background p-3 transition-colors hover:bg-muted"
                                    onClick={(event) => {
                                        if ((event.target as HTMLElement).closest("[data-slot='checkbox'], [data-slot='label']")) return;
                                        toggleClass();
                                    }}
                                >
                                    <Checkbox
                                        id={checkboxId}
                                        data-testid={`teacher-assistant-assign-check-${cls.id}`}
                                        checked={selected}
                                        onCheckedChange={(checked) => {
                                            toggleClass(checked === true);
                                        }}
                                    />
                                    <Label htmlFor={checkboxId} className="flex-1 cursor-pointer text-sm font-normal normal-case tracking-normal">
                                        <div className="font-medium text-foreground">{cls.name}</div>
                                        <div className="text-xs text-muted-foreground">{cls.studentCount}人 · {cls.semester}</div>
                                    </Label>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button data-testid="teacher-assistant-assign-submit" onClick={onSubmit}>确认分配</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

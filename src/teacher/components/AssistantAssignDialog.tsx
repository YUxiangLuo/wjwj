import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
            <DialogContent className="bg-card border-border text-foreground">
                <DialogHeader>
                    <DialogTitle className="text-foreground">分配班级 - {assistant?.name}</DialogTitle>
                    <DialogDescription className="sr-only">
                        为助教分配或取消负责的班级。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                        {classes.map((cls) => (
                            <label key={cls.id} className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted transition-colors bg-background">
                                <input
                                    data-testid={`teacher-assistant-assign-check-${cls.id}`}
                                    type="checkbox"
                                    className="rounded border-input bg-card text-primary focus:ring-ring/20 w-4 h-4"
                                    checked={selectedClassIds.includes(cls.id)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            onSelectedClassIdsChange([...selectedClassIds, cls.id]);
                                        } else {
                                            onSelectedClassIdsChange(selectedClassIds.filter((id) => id !== cls.id));
                                        }
                                    }}
                                />
                                <div>
                                    <div className="font-medium text-foreground">{cls.name}</div>
                                    <div className="text-xs text-muted-foreground">{cls.studentCount}人 · {cls.semester}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground hover:bg-muted">取消</Button>
                    <Button data-testid="teacher-assistant-assign-submit" onClick={onSubmit} className="bg-primary hover:bg-primary text-primary-foreground">确认分配</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

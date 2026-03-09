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
            <DialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 dark:text-slate-100">分配班级 - {assistant?.name}</DialogTitle>
                    <DialogDescription className="sr-only">
                        为助教分配或取消负责的班级。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                        {classes.map((cls) => (
                            <label key={cls.id} className="flex items-center gap-3 p-3 border border-slate-200 dark:border-slate-800 rounded-lg cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors bg-white dark:bg-slate-950">
                                <input
                                    data-testid={`teacher-assistant-assign-check-${cls.id}`}
                                    type="checkbox"
                                    className="rounded border-slate-400 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4"
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
                                    <div className="font-medium text-slate-800 dark:text-slate-200">{cls.name}</div>
                                    <div className="text-xs text-slate-500">{cls.studentCount}人 · {cls.semester}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800">取消</Button>
                    <Button data-testid="teacher-assistant-assign-submit" onClick={onSubmit} className="bg-indigo-600 hover:bg-indigo-700 text-white">确认分配</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

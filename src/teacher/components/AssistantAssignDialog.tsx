import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
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
                <FieldSet className="py-4">
                    {classes.length === 0 ? (
                        <Empty className="border border-dashed border-border py-8">
                            <EmptyHeader>
                                <EmptyTitle>暂无可分配班级</EmptyTitle>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <ScrollArea className="h-[300px] max-h-[300px] overflow-hidden pr-2">
                            <FieldGroup data-slot="checkbox-group" className="gap-3 pr-2">
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
                                        <Field
                                            key={cls.id}
                                            orientation="horizontal"
                                            className="cursor-pointer border border-border bg-background p-3 transition-colors hover:bg-muted"
                                            onClick={(event) => {
                                                if ((event.target as HTMLElement).closest("[data-slot='checkbox'], [data-slot='field-label']")) return;
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
                                            <FieldContent>
                                                <FieldLabel htmlFor={checkboxId} className="cursor-pointer font-normal normal-case tracking-normal">
                                                    {cls.name}
                                                </FieldLabel>
                                                <FieldDescription className="text-xs">{cls.studentCount}人 · {cls.semester}</FieldDescription>
                                            </FieldContent>
                                        </Field>
                                    );
                                })}
                            </FieldGroup>
                        </ScrollArea>
                    )}
                </FieldSet>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button data-testid="teacher-assistant-assign-submit" onClick={onSubmit}>确认分配</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

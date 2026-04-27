import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatetimePicker24 } from "@/components/ui/datetime-picker";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { TeacherClass, Topic } from "../api-client";

interface TaskPublishDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    availableTopics: Topic[];
    availableClasses: TeacherClass[];
    /** 当前课题下已发布过任务的班级 ID，对应复选框禁用 */
    disabledClassIds: ReadonlySet<number>;
    selectedTopicId: string;
    onSelectedTopicIdChange: (value: string) => void;
    selectedClassIds: number[];
    onToggleClass: (id: number) => void;
    deadline: string;
    onDeadlineChange: (value: string) => void;
    onPublish: () => void;
}

export function TaskPublishDialog(props: TaskPublishDialogProps) {
    const {
        open,
        onOpenChange,
        availableTopics,
        availableClasses,
        disabledClassIds,
        selectedTopicId,
        onSelectedTopicIdChange,
        selectedClassIds,
        onToggleClass,
        deadline,
        onDeadlineChange,
        onPublish,
    } = props;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="text-foreground">发布任务</DialogTitle>
                    <DialogDescription className="sr-only">
                        选择已发布课题、目标班级和任务截止时间。
                    </DialogDescription>
                </DialogHeader>
                <FieldGroup className="gap-4 py-4">
                    <Field>
                        <FieldLabel>选择课题</FieldLabel>
                        <Select onValueChange={onSelectedTopicIdChange} value={selectedTopicId}>
                            <SelectTrigger data-testid="teacher-task-topic-select">
                                <SelectValue placeholder="请选择课题" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {availableTopics.length === 0 ? <SelectItem value="none" disabled>暂无已发布课题</SelectItem> :
                                        availableTopics.map((t) => (
                                            <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                        ))
                                    }
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </Field>
                    <FieldSet>
                        <FieldLegend variant="label">选择班级</FieldLegend>
                        <ScrollArea className="h-40 border border-border bg-background">
                            <div className="flex flex-col gap-2 p-3 pr-5">
                            {availableClasses.length === 0 ? (
                                <Empty className="py-6">
                                    <EmptyHeader>
                                        <EmptyTitle>无班级</EmptyTitle>
                                    </EmptyHeader>
                                </Empty>
                            ) : availableClasses.map((cls) => {
                                const disabled = disabledClassIds.has(cls.id);
                                const checkboxId = `teacher-task-class-check-${cls.id}`;
                                const checked = !disabled && selectedClassIds.includes(cls.id);
                                const toggleClass = () => {
                                    if (!disabled) {
                                        onToggleClass(cls.id);
                                    }
                                };
                                return (
                                    <Field
                                        key={cls.id}
                                        orientation="horizontal"
                                        title={disabled ? "该课题已向此班级发布过任务" : undefined}
                                        data-disabled={disabled ? true : undefined}
                                        className={cn(
                                            "cursor-pointer gap-2 p-1.5 text-sm font-normal normal-case tracking-normal hover:bg-accent",
                                            disabled
                                                ? "cursor-not-allowed text-muted-foreground opacity-80 hover:bg-transparent"
                                                : "text-foreground"
                                        )}
                                        onClick={(event) => {
                                            if (disabled) return;
                                            if ((event.target as HTMLElement).closest("[data-slot='checkbox'], [data-slot='field-label']")) return;
                                            toggleClass();
                                        }}
                                    >
                                        <Checkbox
                                            id={checkboxId}
                                            data-testid={`teacher-task-class-check-${cls.id}`}
                                            disabled={disabled}
                                            checked={checked}
                                            onCheckedChange={() => {
                                                toggleClass();
                                            }}
                                        />
                                        <FieldLabel
                                            htmlFor={checkboxId}
                                            className={cn("cursor-pointer text-sm font-normal normal-case tracking-normal", disabled && "cursor-not-allowed")}
                                        >
                                            {cls.name}
                                        </FieldLabel>
                                        {disabled ? (
                                            <span className="text-xs text-muted-foreground shrink-0">已发布</span>
                                        ) : null}
                                    </Field>
                                );
                            })}
                            </div>
                        </ScrollArea>
                    </FieldSet>
                    <Field>
                        <FieldLabel htmlFor="deadline">截止时间（可选）</FieldLabel>
                        <DatetimePicker24
                            id="deadline"
                            data-testid="teacher-task-deadline"
                            value={deadline}
                            onChange={onDeadlineChange}
                            placeholder="选择日期与时间（24 小时制）"
                        />
                    </Field>
                </FieldGroup>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button data-testid="teacher-task-publish-submit" onClick={onPublish}>确认发布</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

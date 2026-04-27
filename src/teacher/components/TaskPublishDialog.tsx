import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatetimePicker24 } from "@/components/ui/datetime-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label className="text-foreground">选择课题</Label>
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
                    </div>
                    <div className="space-y-2">
                        <Label className="text-foreground">选择班级</Label>
                        <div className="space-y-2 border border-border bg-background rounded-md p-3 max-h-40 overflow-y-auto">
                            {availableClasses.length === 0 ? <div className="text-sm text-muted-foreground">无班级</div> : availableClasses.map((cls) => {
                                const disabled = disabledClassIds.has(cls.id);
                                const checkboxId = `teacher-task-class-check-${cls.id}`;
                                const checked = !disabled && selectedClassIds.includes(cls.id);
                                const toggleClass = () => {
                                    if (!disabled) {
                                        onToggleClass(cls.id);
                                    }
                                };
                                return (
                                    <div
                                        key={cls.id}
                                        title={disabled ? "该课题已向此班级发布过任务" : undefined}
                                        className={`flex items-center gap-2 rounded p-1.5 text-sm font-normal normal-case tracking-normal ${
                                            disabled
                                                ? "text-muted-foreground cursor-not-allowed opacity-80"
                                                : "text-foreground cursor-pointer hover:bg-accent"
                                        }`}
                                        onClick={(event) => {
                                            if (disabled) return;
                                            if ((event.target as HTMLElement).closest("[data-slot='checkbox'], [data-slot='label']")) return;
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
                                        <Label
                                            htmlFor={checkboxId}
                                            className={`flex-1 text-sm font-normal normal-case tracking-normal ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                                        >
                                            {cls.name}
                                        </Label>
                                        {disabled ? (
                                            <span className="text-xs text-muted-foreground shrink-0">已发布</span>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="deadline" className="text-foreground">截止时间（可选）</Label>
                        <DatetimePicker24
                            id="deadline"
                            data-testid="teacher-task-deadline"
                            value={deadline}
                            onChange={onDeadlineChange}
                            placeholder="选择日期与时间（24 小时制）"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button data-testid="teacher-task-publish-submit" onClick={onPublish}>确认发布</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

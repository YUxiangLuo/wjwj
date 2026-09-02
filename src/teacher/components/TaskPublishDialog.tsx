import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatetimePicker24 } from "@/components/ui/datetime-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
            <DialogContent className="bg-card border-border text-foreground max-w-md">
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
                            <SelectTrigger aria-label="选择发布课题" data-testid="teacher-task-topic-select" className="bg-card border-input text-foreground">
                                <SelectValue placeholder="请选择课题" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                {availableTopics.length === 0 ? <SelectItem value="none" disabled>暂无已发布课题</SelectItem> :
                                    availableTopics.map((t) => (
                                        <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-foreground">选择班级</Label>
                        <div className="space-y-2 border border-border bg-background rounded-control p-3 max-h-40 overflow-y-auto">
                            {availableClasses.length === 0 ? <div className="text-label text-muted-foreground">无班级</div> : availableClasses.map((cls) => {
                                const disabled = disabledClassIds.has(cls.id);
                                return (
                                    <label
                                        key={cls.id}
                                        title={disabled ? "该课题已向此班级发布过任务" : undefined}
                                        className={`flex items-center gap-2 text-label p-1.5 rounded-control ${
                                            disabled
                                                ? "text-muted-foreground cursor-not-allowed opacity-80"
                                                : "text-foreground cursor-pointer hover:bg-card"
                                        }`}
                                    >
                                        <input
                                            data-testid={`teacher-task-class-check-${cls.id}`}
                                            type="checkbox"
                                            disabled={disabled}
                                            className="rounded-control border-input bg-card text-primary focus:ring-ring disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed"
                                            checked={!disabled && selectedClassIds.includes(cls.id)}
                                            onChange={() => {
                                                if (!disabled) onToggleClass(cls.id);
                                            }}
                                        />
                                        <span className="flex-1">{cls.name}</span>
                                        {disabled ? (
                                            <span className="text-meta text-muted-foreground shrink-0">已发布</span>
                                        ) : null}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="deadline" className="text-foreground">截止时间（可选，中国标准时间）</Label>
                        <DatetimePicker24
                            id="deadline"
                            data-testid="teacher-task-deadline"
                            value={deadline}
                            onChange={onDeadlineChange}
                            placeholder="选择日期与时间（24 小时制）"
                        />
                        <p className="text-meta text-muted-foreground">所有教师和学生均按中国标准时间（UTC+8）查看该截止时刻。</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground hover:bg-muted">取消</Button>
                    <Button data-testid="teacher-task-publish-submit" onClick={onPublish} className="bg-primary hover:bg-primary-hover text-primary-foreground">确认发布</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

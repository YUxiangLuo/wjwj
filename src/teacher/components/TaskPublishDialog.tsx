import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TeacherClass, Topic } from "../api-client";

interface TaskPublishDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    availableTopics: Topic[];
    availableClasses: TeacherClass[];
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
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-slate-100">发布任务</DialogTitle>
                    <DialogDescription className="sr-only">
                        选择已发布课题、目标班级和任务截止时间。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label className="text-slate-300">选择课题</Label>
                        <Select onValueChange={onSelectedTopicIdChange} value={selectedTopicId}>
                            <SelectTrigger data-testid="teacher-task-topic-select" className="bg-slate-950 border-slate-800 text-slate-200">
                                <SelectValue placeholder="请选择课题" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                {availableTopics.length === 0 ? <SelectItem value="none" disabled>暂无已发布课题</SelectItem> :
                                    availableTopics.map((t) => (
                                        <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-slate-300">选择班级</Label>
                        <div className="space-y-2 border border-slate-800 bg-slate-950 rounded-md p-3 max-h-40 overflow-y-auto">
                            {availableClasses.length === 0 ? <div className="text-sm text-slate-500">无班级</div> : availableClasses.map((cls) => (
                                <label key={cls.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:bg-slate-900 p-1.5 rounded">
                                    <input
                                        data-testid={`teacher-task-class-check-${cls.id}`}
                                        type="checkbox"
                                        className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                                        checked={selectedClassIds.includes(cls.id)}
                                        onChange={() => onToggleClass(cls.id)}
                                    />
                                    {cls.name}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="deadline" className="text-slate-300">截止时间（可选）</Label>
                        <Input
                            id="deadline"
                            data-testid="teacher-task-deadline"
                            type="datetime-local"
                            value={deadline}
                            onChange={(e) => onDeadlineChange(e.target.value)}
                            className="bg-slate-950 border-slate-800 text-slate-200"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">取消</Button>
                    <Button data-testid="teacher-task-publish-submit" onClick={onPublish} className="bg-indigo-600 hover:bg-indigo-700 text-white">确认发布</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

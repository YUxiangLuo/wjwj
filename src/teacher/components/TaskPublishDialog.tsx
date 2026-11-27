import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { RequestError } from "@/components/RequestError";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatetimePicker24 } from "@/components/DatetimePicker24";
import { localWallClockToUtcIso } from "@/lib/datetime";
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
    loading: boolean;
    loadError: string | null;
    onRetry: () => void;
    publishing: boolean;
    publishError: string | null;
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
        loading,
        loadError,
        onRetry,
        publishing,
        publishError,
    } = props;
    const [classSearch, setClassSearch] = useState("");
    useEffect(() => { setClassSearch(""); }, [open]);
    const filteredClasses = availableClasses.filter(cls => cls.name.toLowerCase().includes(classSearch.trim().toLowerCase()));
    const selectedCount = selectedClassIds.filter(id => !disabledClassIds.has(id)).length;
    const errorRef = useRef<HTMLParagraphElement>(null);
    useEffect(() => { if (open && publishError && !publishing) errorRef.current?.focus(); }, [open, publishError, publishing]);
    const contentRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open || loading) return;
        contentRef.current?.querySelector<HTMLElement>(loadError
            ? '[role="alert"] button'
            : '[data-testid="teacher-task-topic-select"]')?.focus();
    }, [open, loading, loadError]);

    return (
        <Dialog open={open} onOpenChange={value => { if (!publishing) onOpenChange(value); }}>
            <DialogContent ref={contentRef} className="max-h-[90vh] max-w-md overflow-y-auto border-border bg-card text-foreground" showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle className="font-medium text-foreground">发布实验任务</DialogTitle>
                    <DialogDescription className="sr-only">
                        选择已发布实验模板、目标班级和任务截止时间。
                    </DialogDescription>
                </DialogHeader>
                {loadError ? <RequestError message={loadError} onRetry={onRetry} retrying={loading} />
                : loading ? <p role="status" className="py-4 text-label text-muted-foreground">正在加载分配选项…</p>
                : <div className="space-y-4 py-3">
                    <div className="space-y-2">
                        <Label className="text-foreground">选择实验模板</Label>
                        <Select disabled={publishing} onValueChange={onSelectedTopicIdChange} value={selectedTopicId}>
                            <SelectTrigger aria-label="选择发布实验模板" data-testid="teacher-task-topic-select" className="bg-card">
                                <SelectValue placeholder="请选择实验模板" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableTopics.length === 0 ? <SelectItem value="none" disabled>暂无已发布实验模板</SelectItem> :
                                    availableTopics.map((t) => (
                                        <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                    ))
                                }
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-foreground">选择班级</Label>
                        <Input aria-label="搜索班级" placeholder="搜索班级名称" value={classSearch} disabled={publishing} onChange={event => setClassSearch(event.target.value)} />
                        <p role="status" className="text-meta text-muted-foreground">已选 {selectedCount} 个班级；搜索不会取消已选班级。</p>
                        <div className="max-h-44 space-y-1 overflow-y-auto rounded-surface border border-border bg-card p-2">
                            {filteredClasses.length === 0 ? <div className="px-2 py-3 text-label text-muted-foreground">{availableClasses.length === 0 ? "无班级" : "没有匹配的班级"}</div> : filteredClasses.map((cls) => {
                                const disabled = disabledClassIds.has(cls.id);
                                const checked = !disabled && selectedClassIds.includes(cls.id);
                                return (
                                    <label
                                        key={cls.id}
                                        title={disabled ? "该实验模板已向此班级发布过任务" : undefined}
                                        className={`flex items-center gap-2.5 rounded-control px-2.5 py-2 text-label ${
                                            disabled
                                                ? "cursor-not-allowed text-muted-foreground"
                                                : checked
                                                    ? "cursor-pointer bg-muted font-medium text-foreground"
                                                    : "cursor-pointer text-foreground hover:bg-muted"
                                        }`}
                                    >
                                        <input
                                            data-testid={`teacher-task-class-check-${cls.id}`}
                                            type="checkbox"
                                            disabled={disabled || publishing}
                                            className="h-4 w-4 shrink-0 accent-primary"
                                            checked={checked}
                                            onChange={() => {
                                                if (!disabled) onToggleClass(cls.id);
                                            }}
                                        />
                                        <span className="flex-1">{cls.name}</span>
                                        {disabled ? (
                                            <span className="shrink-0 text-meta text-muted-foreground">已发布</span>
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
                            disabled={publishing}
                            onChange={onDeadlineChange}
                            placeholder="选择日期与时间（24 小时制）"
                        />
                        {deadline.trim() && (() => {
                            const iso = localWallClockToUtcIso(deadline);
                            return iso && new Date(iso).getTime() <= Date.now() ? (
                                <p className="text-meta text-warning">所选时间早于或等于当前时刻，发布时需使用未来截止时间。</p>
                            ) : null;
                        })()}
                        <p className="text-meta text-muted-foreground">所有教师和学生均按中国标准时间（UTC+8）查看该截止时刻；留空表示长期开放。</p>
                    </div>
                </div>}
                {publishError && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-surface border border-destructive-border bg-destructive-muted p-3 text-label text-destructive">{publishError}</p>}
                <DialogFooter>
                    <Button variant="outline" disabled={publishing} onClick={() => onOpenChange(false)}>取消</Button>
                    <Button data-testid="teacher-task-publish-submit" disabled={publishing || loading || Boolean(loadError)} onClick={onPublish}>{publishing ? "发布中…" : "确认发布"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

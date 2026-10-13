import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Clock, Plus, BarChart3, Trash2 } from "lucide-react";
import { teacherApi, type Task, type Topic, type TeacherClass, type DeletionImpact } from "../api-client";
import { describeCascadeImpact } from "@/lib/deletion-impact-copy";
import { TaskExtendDialog } from "../components/TaskExtendDialog";
import { TaskPublishDialog } from "../components/TaskPublishDialog";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { localWallClockToUtcIso } from "@/lib/datetime";
import { formatDateTimeDisplay } from "@/utils/format";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

function isTaskNotOpenYet(publishedAt: string | null) {
    if (!publishedAt) return false;
    const openAt = new Date(publishedAt).getTime();
    return Number.isFinite(openAt) && openAt > Date.now();
}

function isTaskDeadlinePassed(deadline: string | null) {
    if (!deadline) return false;
    const due = new Date(deadline).getTime();
    return Number.isFinite(due) && due <= Date.now();
}

export function compareTeacherTasks(a: Task, b: Task) {
    const rank = (task: Task) => {
        const hasPending = (task.pending ?? 0) > 0;
        if (hasPending && !isTaskNotOpenYet(task.publishedAt)) return 0;
        if (isTaskNotOpenYet(task.publishedAt)) return 2;
        if (isTaskDeadlinePassed(task.deadline)) return 3;
        return 1;
    };
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    const aDue = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;
    return a.id - b.id;
}

export function TaskManagement() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [tasks, setTasks] = useState<Task[]>([]);
    const { loading, error: loadError, run } = useAsyncLoad("任务列表加载失败");
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const publishLock = useRef(false);
    const [publishError, setPublishError] = useState<string | null>(null);
    useEffect(() => { setPublishError(null); }, [showPublishModal]);
    const [showExtendModal, setShowExtendModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [extendDeadline, setExtendDeadline] = useState("");
    const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);
    const [deleteImpact, setDeleteImpact] = useState<{
        loading: boolean;
        requiresConfirmation: boolean;
        summary: string | null;
        impact?: DeletionImpact;
    } | null>(null);

    // Data for modal
    const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
    const [availableClasses, setAvailableClasses] = useState<TeacherClass[]>([]);
    const { loading: optionsLoading, error: optionsError, run: runOptions, cancel: cancelOptions } = useAsyncLoad("分配选项加载失败");

    // Form state
    const [selectedTopicId, setSelectedTopicId] = useState<string>("");
    const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
    const [deadline, setDeadline] = useState("");
    const classFilter = searchParams.get("className") || "all";
    const searchTerm = searchParams.get("keyword") ?? "";
    const listSearch = searchParams.toString();
    function updateFilter(key: string, value: string) {
        setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            if (value) next.set(key, value);
            else next.delete(key);
            return next;
        }, { replace: true });
    }

    useEffect(() => {
        loadTasks();
    }, []);

    useEffect(() => {
        const topicId = searchParams.get("topicId");
        if (topicId === null) return;
        const remaining = new URLSearchParams(searchParams);
        remaining.delete("topicId");
        setSearchParams(remaining, { replace: true });
        if (!/^[1-9]\d*$/.test(topicId) || !Number.isSafeInteger(Number(topicId))) return;
        setSelectedTopicId(topicId);
        setSelectedClassIds([]);
        setDeadline("");
        setShowPublishModal(true);
    }, [searchParams, setSearchParams]);

    async function loadPublishOptions() {
        await runOptions(async () => {
            const [topicsRes, classesRes, tasksLoaded] = await Promise.all([
                teacherApi.getTopics(), teacherApi.getClasses(), loadTasks(),
            ]);
            const topics = requireApiData(topicsRes, "实验模板加载失败");
            const classes = requireApiData(classesRes, "班级加载失败");
            if (!tasksLoaded) throw new Error("已有任务加载失败，请重试后再分配");
            return { topics: topics.filter(topic => topic.status === 1), classes };
        }, ({ topics, classes }) => {
            setAvailableTopics(topics);
            setAvailableClasses(classes);
            setSelectedTopicId(current => topics.some(topic => String(topic.id) === current) ? current : "");
            setSelectedClassIds(current => current.filter(id => classes.some(cls => cls.id === id)));
        });
    }

    // Refresh all assignment prerequisites; a failed request is not an empty list.
    useEffect(() => {
        if (showPublishModal) void loadPublishOptions();
        return cancelOptions;
    }, [showPublishModal, cancelOptions]);

    /** 当前所选课题下已有任务的班级（不可再次勾选） */
    const publishedClassIdsForTopic = useMemo(() => {
        if (!selectedTopicId) return new Set<number>();
        const tid = Number(selectedTopicId);
        if (Number.isNaN(tid)) return new Set<number>();
        return new Set(tasks.filter((t) => t.topicId === tid).map((t) => t.classId));
    }, [tasks, selectedTopicId]);

    useEffect(() => {
        setSelectedClassIds((prev) => prev.filter((id) => !publishedClassIdsForTopic.has(id)));
    }, [publishedClassIdsForTopic]);

    async function loadTasks() {
        return run(async () => requireApiData(await teacherApi.getTasks(), "任务列表加载失败"), setTasks);
    }

    async function handlePublish() {
        if (optionsLoading || optionsError || publishLock.current) return;
        if (!selectedTopicId || selectedClassIds.length === 0) {
            setPublishError("请选择实验模板和班级");
            toast.error("请选择实验模板和班级");
            return;
        }
        publishLock.current = true;
        setPublishing(true);
        setPublishError(null);
        try {
            const res = await teacherApi.createTask({
                topicId: Number(selectedTopicId),
                classIds: selectedClassIds,
                deadline: localWallClockToUtcIso(deadline) ?? undefined,
            });

            if (res.success) {
                setShowPublishModal(false);
                loadTasks();
                setSelectedTopicId("");
                setSelectedClassIds([]);
                setDeadline("");
            } else {
                setPublishError(res.error?.message ?? "发布失败，请重试");
            }
        } catch { setPublishError("发布失败，请检查网络后重试"); }
        finally { publishLock.current = false; setPublishing(false); }
    }

    async function handleExtendDeadline() {
        if (!selectedTask || !extendDeadline.trim()) return;
        const deadlineIso = localWallClockToUtcIso(extendDeadline);
        if (!deadlineIso) {
            toast.error("截止时间格式无效");
            return;
        }
        const res = await teacherApi.extendTaskDeadline(selectedTask.id, deadlineIso);
        if (res.success) {
            setShowExtendModal(false);
            setSelectedTask(null);
            setExtendDeadline("");
            loadTasks();
        } else {
            toast.error("延长失败: " + res.error?.message);
        }
    }

    async function openDeleteDialog(task: Task) {
        setTaskToDelete(task);
        setDeleteImpact({ loading: true, requiresConfirmation: false, summary: null });
        const res = await teacherApi.getTaskDeletionImpact(task.id);
        if (res.success && res.data) {
            setDeleteImpact({
                loading: false,
                requiresConfirmation: res.data.requiresConfirmation,
                summary: describeCascadeImpact(res.data.impact, "task"),
                impact: res.data.impact,
            });
        } else {
            setDeleteImpact({ loading: false, requiresConfirmation: false, summary: "删除范围加载失败，请重试后再确认。" });
        }
    }

    async function confirmDeleteTask() {
        if (!taskToDelete || deleteSubmitting || deleteImpact?.loading) return;
        if (!deleteImpact?.impact) {
            await openDeleteDialog(taskToDelete);
            return;
        }
        setDeleteSubmitting(true);
        try {
            const res = await teacherApi.deleteTask(taskToDelete.id, {
                confirm: deleteImpact?.requiresConfirmation === true,
                expectedImpact: deleteImpact.impact,
            });
            if (res.success) {
                toast.success("任务已删除");
                setTaskToDelete(null);
                setDeleteImpact(null);
                await loadTasks();
            } else if (res.error?.code === "SUBMISSIONS_EXIST" || res.error?.code === "DELETION_IMPACT_CHANGED") {
                toast.error("删除范围已变化，请核对最新数量后再次确认。");
                await openDeleteDialog(taskToDelete);
            } else {
                toast.error("删除失败: " + (res.error?.message ?? ""));
            }
        } finally {
            setDeleteSubmitting(false);
        }
    }

    const toggleClass = (id: number) => {
        setSelectedClassIds(prev =>
            prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
        );
    };

    const summary = useMemo(() => {
        const total = tasks.length;
        const pendingTotal = tasks.reduce((sum, task) => sum + (task.pending ?? 0), 0);
        const completedTotal = tasks.reduce((sum, task) => sum + task.completed, 0);
        const expectedCount = tasks.reduce((sum, task) => sum + task.total, 0);
        return { total, pendingTotal, completedTotal, expectedCount };
    }, [tasks]);

    const filteredTasks = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return tasks.filter((task) => {
            const matchesClass = classFilter === "all" || task.className === classFilter;
            const matchesKeyword = !keyword || task.topic.toLowerCase().includes(keyword);
            return matchesClass && matchesKeyword;
        }).sort(compareTeacherTasks);
    }, [tasks, classFilter, searchTerm]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <dl aria-label="实验任务概览" className="grid grid-cols-4 gap-5 border-b border-border pb-5">
                <div><dt className="text-meta text-muted-foreground">实验任务总数</dt><dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.total}</dd></div>
                <div><dt className="text-meta text-muted-foreground">待批改</dt><dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : <StatusBadge intent={summary.pendingTotal > 0 ? "warning" : "neutral"}>{summary.pendingTotal}</StatusBadge>}</dd></div>
                <div><dt className="text-meta text-muted-foreground">已完成</dt><dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.completedTotal}</dd></div>
                <div><dt className="text-meta text-muted-foreground">应交人次</dt><dd className="mt-1"><span className="text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.expectedCount}</span><p className="mt-1 text-meta text-muted-foreground">按任务覆盖班级学生数累计，非实际提交数</p></dd></div>
            </dl>

            <Card>
                <PageHeader as={CardHeader} className="flex-wrap">
                    <div>
                        <CardTitle className="text-section-title text-foreground">实验任务列表</CardTitle>
                        <p className="text-meta text-muted-foreground mt-1">
                            {loading || loadError ? "共 - 条数据" : `共 ${filteredTasks.length} 条数据`}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3 flex-row w-auto">
                        <div className="relative w-56">
                            <Label htmlFor="teacher-task-search" className="sr-only">搜索实验模板</Label>
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="teacher-task-search"
                                data-testid="teacher-task-search"
                                placeholder="搜索实验模板"
                                value={searchTerm}
                                onChange={(e) => updateFilter("keyword", e.target.value)}
                                className="pl-9 bg-card border-input text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <Select value={classFilter} onValueChange={value => updateFilter("className", value === "all" ? "" : value)}>
                            <SelectTrigger aria-label="按班级筛选任务" data-testid="teacher-task-class-filter" className="bg-card border-input text-foreground w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部班级</SelectItem>
                                {Array.from(new Set(tasks.map((task) => task.className))).map((name) => (
                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button data-testid="teacher-task-publish-open" onClick={() => setShowPublishModal(true)} className="bg-primary hover:bg-primary-hover text-primary-foreground ">
                            <Plus className="w-4 h-4 mr-1" /> 发布实验任务
                        </Button>
                    </div>
                </PageHeader>
                <CardContent className="pt-0">
                    {loadError ? <RequestError message={loadError} onRetry={() => void loadTasks()} backTo="/" backLabel="返回教学概览" /> : loading ? <div role="status" aria-live="polite" className="text-center py-12 text-muted-foreground">加载中...</div> : (
                        <Table aria-label="实验任务列表">
                            <TableHeader>
                                <TableRow className="border-border">
                                    <TableHead className="text-muted-foreground">实验模板</TableHead>
                                    <TableHead className="text-muted-foreground">班级</TableHead>
                                    <TableHead className="text-muted-foreground">开放时间</TableHead>
                                    <TableHead className="text-muted-foreground">截止时间</TableHead>
                                    <TableHead className="text-muted-foreground">完成进度</TableHead>
                                    <TableHead className="text-muted-foreground">待批改</TableHead>
                                    <TableHead className="sticky right-0 z-10 bg-secondary text-right text-muted-foreground">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTasks.map((task) => (
                                    <TableRow data-testid={`teacher-task-row-${task.id}`} key={task.id} className="group border-border hover:bg-muted transition-none">
                                        <TableCell className="font-medium text-foreground">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span>{task.topic}</span>
                                                {isTaskNotOpenYet(task.publishedAt) && <StatusBadge intent="info">尚未开放</StatusBadge>}
                                                {isTaskDeadlinePassed(task.deadline) && <StatusBadge intent="neutral">已截止</StatusBadge>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-foreground">{task.className}</TableCell>
                                        <TableCell className="text-muted-foreground text-meta">{formatDateTimeDisplay(task.publishedAt, "-")}</TableCell>
                                        <TableCell className="text-muted-foreground text-meta">{task.deadline ? `${formatDateTimeDisplay(task.deadline)}（UTC+8）` : "无"}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress aria-label={`${task.topic}完成进度`} value={task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0} className="w-20 h-1.5 bg-muted [&>div]:bg-success" />
                                                <span className="text-meta text-muted-foreground">{task.completed}/{task.total}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {task.pending && task.pending > 0 ? (
                                                <StatusBadge intent="destructive">
                                                    {task.pending}
                                                </StatusBadge>
                                            ) : (
                                                <span className="text-muted-foreground text-meta">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="sticky right-0 z-10 bg-card text-right group-hover:bg-muted">
                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                <Button variant="ghost" size="sm" asChild className="h-8 text-muted-foreground hover:text-success hover:bg-success-muted">
                                                    <Link to={`/task/${task.id}/progress${listSearch ? `?${listSearch}` : ""}`}>
                                                        <BarChart3 className="w-3.5 h-3.5 mr-1" />
                                                        进度
                                                    </Link>
                                                </Button>
                                                <Button
                                                    data-testid={`teacher-task-extend-open-${task.id}`}
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedTask(task);
                                                        setExtendDeadline("");
                                                        setShowExtendModal(true);
                                                    }}
                                                    className="h-8 text-muted-foreground hover:text-primary hover:bg-primary-muted"
                                                >
                                                    <Clock className="w-3.5 h-3.5 mr-1" />
                                                    延时
                                                </Button>
                                                <Button variant="ghost" size="sm" asChild className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive-muted">
                                                    <Link to={`/grading?taskId=${task.id}`}>批改</Link>
                                                </Button>
                                                <Button
                                                    data-testid={`teacher-task-delete-open-${task.id}`}
                                                    variant="ghost"
                                                    size="sm"
                                                    type="button"
                                                    aria-label={`删除任务：${task.topic}`}
                                                    onClick={() => void openDeleteDialog(task)}
                                                    className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive-muted"
                                                    title="删除任务"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredTasks.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 rounded-control bg-card border border-border flex items-center justify-center">
                                                    <Search className="w-5 h-5 text-muted-foreground" />
                                                </div>
                                                <p>暂无符合条件的数据</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <TaskPublishDialog
                open={showPublishModal}
                onOpenChange={setShowPublishModal}
                availableTopics={availableTopics}
                availableClasses={availableClasses}
                disabledClassIds={publishedClassIdsForTopic}
                selectedTopicId={selectedTopicId}
                onSelectedTopicIdChange={setSelectedTopicId}
                selectedClassIds={selectedClassIds}
                onToggleClass={toggleClass}
                deadline={deadline}
                onDeadlineChange={setDeadline}
                onPublish={handlePublish}
                publishing={publishing}
                publishError={publishError}
                loading={optionsLoading}
                loadError={optionsError}
                onRetry={() => void loadPublishOptions()}
            />

            <TaskExtendDialog
                open={showExtendModal}
                onOpenChange={setShowExtendModal}
                selectedTask={selectedTask}
                extendDeadline={extendDeadline}
                onExtendDeadlineChange={setExtendDeadline}
                onConfirm={handleExtendDeadline}
            />

            <AlertDialog open={taskToDelete !== null} onOpenChange={(open) => { if (!open) { setTaskToDelete(null); setDeleteImpact(null); } }}>
                <AlertDialogContent className="bg-card border-border text-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">删除任务？</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            {taskToDelete
                                ? `将永久删除「${taskToDelete.topic}」在「${taskToDelete.className}」的任务，以及全部学生实验进度、提交、成绩和抽样记录。此操作不可恢复；再次发布会创建全新的空任务。`
                                : null}
                            {taskToDelete && deleteImpact?.loading && (
                                <span className="mt-2 block">正在统计将被删除的实验与成绩…</span>
                            )}
                            {taskToDelete && !deleteImpact?.loading && deleteImpact?.summary && (
                                <span data-testid="teacher-task-delete-impact" className="mt-2 block font-medium text-destructive">
                                    {deleteImpact.summary}
                                </span>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            取消
                        </AlertDialogCancel>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={deleteSubmitting || deleteImpact?.loading}
                            data-testid="teacher-task-delete-confirm"
                            onClick={() => void confirmDeleteTask()}
                        >
                            {deleteSubmitting ? "删除中…" : !deleteImpact?.loading && !deleteImpact?.impact ? "重试加载" : "永久删除"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

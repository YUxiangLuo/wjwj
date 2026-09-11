import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useState, useEffect, useMemo } from "react";
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
import { ClipboardList, CalendarDays, CheckCircle2, AlertTriangle, Search, Clock, Plus, BarChart3, Trash2 } from "lucide-react";
import { teacherApi, type Task, type Topic, type TeacherClass } from "../api-client";
import { describeCascadeImpact } from "@/lib/deletion-impact-copy";
import { TaskExtendDialog } from "../components/TaskExtendDialog";
import { TaskPublishDialog } from "../components/TaskPublishDialog";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { localWallClockToUtcIso } from "@/lib/datetime";
import { formatDateTimeDisplay } from "@/utils/format";
import { IconTile } from "@/components/IconTile";
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
    const [tasks, setTasks] = useState<Task[]>([]);
    const { loading, error: loadError, run } = useAsyncLoad("任务列表加载失败");
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [showExtendModal, setShowExtendModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [extendDeadline, setExtendDeadline] = useState("");
    const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);
    const [deleteImpact, setDeleteImpact] = useState<{
        loading: boolean;
        requiresConfirmation: boolean;
        summary: string | null;
    } | null>(null);

    // Data for modal
    const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
    const [availableClasses, setAvailableClasses] = useState<TeacherClass[]>([]);

    // Form state
    const [selectedTopicId, setSelectedTopicId] = useState<string>("");
    const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
    const [deadline, setDeadline] = useState("");
    const [classFilter, setClassFilter] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadTasks();
    }, []);

    // Load form data when modal opens；静默拉取任务列表以更新「已发布班级」禁用状态
    useEffect(() => {
        if (showPublishModal) {
            void loadTasks();
            Promise.all([
                teacherApi.getTopics(),
                teacherApi.getClasses()
            ]).then(([topicsRes, classesRes]) => {
                if (topicsRes.success && topicsRes.data) setAvailableTopics(topicsRes.data.filter(t => t.status === 1)); // Only show published topics
                if (classesRes.success && classesRes.data) setAvailableClasses(classesRes.data);
            });
        }
    }, [showPublishModal]);

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
        if (!selectedTopicId || selectedClassIds.length === 0) {
            toast.error("请选择实验模板和班级");
            return;
        }

        const res = await teacherApi.createTask({
            topicId: Number(selectedTopicId),
            classIds: selectedClassIds,
            deadline: localWallClockToUtcIso(deadline) ?? undefined,
        });

        if (res.success) {
            setShowPublishModal(false);
            loadTasks();
            // Reset form
            setSelectedTopicId("");
            setSelectedClassIds([]);
            setDeadline("");
        } else {
            toast.error("发布失败: " + res.error?.message);
        }
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
            });
        } else {
            // Unknown impact: let the server decide and report on confirm.
            setDeleteImpact({ loading: false, requiresConfirmation: false, summary: null });
        }
    }

    async function confirmDeleteTask() {
        if (!taskToDelete) return;
        setDeleteSubmitting(true);
        try {
            const res = await teacherApi.deleteTask(taskToDelete.id, {
                confirm: deleteImpact?.requiresConfirmation === true,
            });
            if (res.success) {
                toast.success("任务已删除");
                setTaskToDelete(null);
                setDeleteImpact(null);
                await loadTasks();
            } else if (res.error?.code === "SUBMISSIONS_EXIST") {
                // Keep the dialog open so the next click is an explicit confirmation.
                setDeleteImpact({
                    loading: false,
                    requiresConfirmation: true,
                    summary: res.error.message,
                });
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
            <p className="text-label text-muted-foreground">将实验模板分配到班级，并跟踪提交与批改进度。</p>

            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">实验任务总数</p>
                            <p className="text-page-title font-bold text-foreground mt-1">{loading || loadError ? "-" : summary.total}</p>
                        </div>
                        <IconTile intent="info">
                            <ClipboardList className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">待批改</p>
                            <p className="text-page-title font-bold text-foreground mt-1">{loading || loadError ? "-" : summary.pendingTotal}</p>
                        </div>
                        <IconTile intent="destructive">
                            <AlertTriangle className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">已完成</p>
                            <p className="text-page-title font-bold text-foreground mt-1">{loading || loadError ? "-" : summary.completedTotal}</p>
                        </div>
                        <IconTile intent="success">
                            <CheckCircle2 className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">应交人次</p>
                            <p className="text-page-title font-bold text-foreground mt-1">{loading || loadError ? "-" : summary.expectedCount}</p>
                            <p className="mt-1 text-meta text-muted-foreground">按任务覆盖班级学生数累计，非实际提交数</p>
                        </div>
                        <IconTile intent="warning">
                            <CalendarDays className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <CardTitle className="text-body text-foreground">实验任务列表</CardTitle>
                        <p className="text-meta text-muted-foreground mt-1">共 {filteredTasks.length} 条数据</p>
                    </div>
                    <div className="flex gap-3 flex-row w-auto">
                        <div className="relative w-56">
                            <Label htmlFor="teacher-task-search" className="sr-only">搜索实验模板</Label>
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="teacher-task-search"
                                data-testid="teacher-task-search"
                                placeholder="搜索实验模板"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-card border-input text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <Select value={classFilter} onValueChange={setClassFilter}>
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
                    {loadError ? <RequestError message={loadError} onRetry={() => void loadTasks()} /> : loading ? <div role="status" aria-live="polite" className="text-center py-12 text-muted-foreground">加载中...</div> : (
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
                                                    <Link to={`/task/${task.id}/progress`}>
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
                                                    <Link to="/grading">批改</Link>
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
                            disabled={deleteSubmitting}
                            data-testid="teacher-task-delete-confirm"
                            onClick={() => void confirmDeleteTask()}
                        >
                            {deleteSubmitting ? "删除中…" : "永久删除"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

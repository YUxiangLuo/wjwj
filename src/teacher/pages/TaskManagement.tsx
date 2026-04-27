import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClipboardList, CalendarDays, CheckCircle2, AlertTriangle, Search, Clock, Plus, BarChart3, Trash2, PenLine } from "lucide-react";
import { teacherApi, type Task, type Topic, type TeacherClass } from "../api-client";
import { TaskExtendDialog } from "../components/TaskExtendDialog";
import { TaskPublishDialog } from "../components/TaskPublishDialog";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { localWallClockToUtcIso } from "@/lib/datetime";

export function TaskManagement() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [showExtendModal, setShowExtendModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [extendDeadline, setExtendDeadline] = useState("");
    const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

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
            void teacherApi.getTasks().then((res) => {
                if (res.success && res.data) setTasks(res.data);
            });
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
        setLoading(true);
        const res = await teacherApi.getTasks();
        if (res.success && res.data) {
            setTasks(res.data);
        }
        setLoading(false);
    }

    async function handlePublish() {
        if (!selectedTopicId || selectedClassIds.length === 0) {
            toast.error("请选择课题和班级");
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

    async function confirmDeleteTask() {
        if (!taskToDelete) return;
        setDeleteSubmitting(true);
        try {
            const res = await teacherApi.deleteTask(taskToDelete.id);
            if (res.success) {
                toast.success("任务已删除");
                setTaskToDelete(null);
                await loadTasks();
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
        const totalSubmissions = tasks.reduce((sum, task) => sum + task.total, 0);
        return { total, pendingTotal, completedTotal, totalSubmissions };
    }, [tasks]);

    const filteredTasks = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return tasks.filter((task) => {
            const matchesClass = classFilter === "all" || task.className === classFilter;
            const matchesKeyword = !keyword || task.topic.toLowerCase().includes(keyword);
            return matchesClass && matchesKeyword;
        });
    }, [tasks, classFilter, searchTerm]);

    const formatTaskDate = (value?: string | null, fallback = "-") =>
        value ? new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : fallback;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-foreground">任务管理</h2>
                <p className="text-sm text-muted-foreground mt-1">管理发布任务与批改进度。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">任务总数</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                            <ClipboardList className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">待批改</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.pendingTotal}</p>
                        </div>
                        <div className="w-10 h-10 bg-destructive/10 text-destructive flex items-center justify-center border border-destructive/20">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">已完成</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.completedTotal}</p>
                        </div>
                        <div className="w-10 h-10 bg-success/10 text-success flex items-center justify-center border border-success/20">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">总提交数</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.totalSubmissions}</p>
                        </div>
                        <div className="w-10 h-10 bg-warning/10 text-warning flex items-center justify-center border border-warning/20">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
                    <div>
                        <CardTitle className="text-base text-foreground">任务列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {filteredTasks.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <SearchInput
                            className="sm:w-56"
                            data-testid="teacher-task-search"
                            placeholder="搜索课题"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Select value={classFilter} onValueChange={setClassFilter}>
                            <SelectTrigger data-testid="teacher-task-class-filter" className="sm:w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="all">全部班级</SelectItem>
                                    {Array.from(new Set(tasks.map((task) => task.className))).map((name) => (
                                        <SelectItem key={name} value={name}>{name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Button data-testid="teacher-task-publish-open" onClick={() => setShowPublishModal(true)}>
                            <Plus data-icon="inline-start" /> 发布任务
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="px-0 pt-0">
                    {loading ? <div className="text-center py-12 text-muted-foreground">加载中...</div> : (
                        <Table className="min-w-[860px]">
                            <TableHeader>
                                <TableRow className="border-border hover:bg-muted/50">
                                    <TableHead className="w-[260px] pl-8 text-muted-foreground">课题</TableHead>
                                    <TableHead className="w-[150px] text-muted-foreground">班级</TableHead>
                                    <TableHead className="w-[110px] text-muted-foreground">截止时间</TableHead>
                                    <TableHead className="w-[150px] text-muted-foreground">完成进度</TableHead>
                                    <TableHead className="w-[80px] text-muted-foreground">待批改</TableHead>
                                    <TableHead className="w-[210px] pr-8 text-right text-muted-foreground">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTasks.map((task) => (
                                    <TableRow data-testid={`teacher-task-row-${task.id}`} key={task.id} className="border-border hover:bg-accent transition-colors">
                                        <TableCell className="pl-8 text-foreground">
                                            <div className="flex max-w-[240px] flex-col gap-1">
                                                <span className="truncate font-medium">{task.topic}</span>
                                                <span className="text-xs text-muted-foreground">发布于 {formatTaskDate(task.publishedAt)}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-foreground">
                                            <span className="block max-w-[140px] truncate">{task.className}</span>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{formatTaskDate(task.deadline, "无")}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress value={task.total > 0 ? (task.completed / task.total) * 100 : 0} className="h-1.5 w-24 bg-muted [&>div]:bg-success" />
                                                <span className="text-xs text-muted-foreground">{task.completed}/{task.total}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {task.pending && task.pending > 0 ? (
                                                <Badge variant="destructive">
                                                    {task.pending}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="pr-8 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button variant="success" size="xs" asChild>
                                                    <Link to={`/task/${task.id}/progress`}>
                                                        <BarChart3 data-icon="inline-start" />
                                                        进度
                                                    </Link>
                                                </Button>
                                                <Button
                                                    data-testid={`teacher-task-extend-open-${task.id}`}
                                                    variant="ghost"
                                                    size="xs"
                                                    onClick={() => {
                                                        setSelectedTask(task);
                                                        setExtendDeadline("");
                                                        setShowExtendModal(true);
                                                    }}
                                                >
                                                    <Clock data-icon="inline-start" />
                                                    延时
                                                </Button>
                                                <Button variant="ghost" size="xs" asChild>
                                                    <Link to="/grading">
                                                        <PenLine data-icon="inline-start" />
                                                        批改
                                                    </Link>
                                                </Button>
                                                <Button
                                                    data-testid={`teacher-task-delete-open-${task.id}`}
                                                    variant="destructive"
                                                    size="icon-xs"
                                                    type="button"
                                                    onClick={() => setTaskToDelete(task)}
                                                    title="删除任务"
                                                >
                                                    <Trash2 />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredTasks.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                                            <Empty className="py-0">
                                                <EmptyHeader>
                                                    <EmptyMedia variant="icon">
                                                        <Search />
                                                    </EmptyMedia>
                                                    <EmptyTitle>暂无符合条件的数据</EmptyTitle>
                                                </EmptyHeader>
                                            </Empty>
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

            <AlertDialog open={taskToDelete !== null} onOpenChange={(open) => { if (!open) setTaskToDelete(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">删除任务？</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            {taskToDelete
                                ? `将取消「${taskToDelete.topic}」在「${taskToDelete.className}」的任务发布：学生端与批改中均不再显示。需要再次布置同一课题时，可在「发布任务」中重新向该班级发布。`
                                : null}
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
                            {deleteSubmitting ? "删除中…" : "删除"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

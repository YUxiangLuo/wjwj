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
import { TaskExtendDialog } from "../components/TaskExtendDialog";
import { TaskPublishDialog } from "../components/TaskPublishDialog";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { localWallClockToUtcIso } from "@/lib/datetime";
import { formatDateTimeDisplay } from "@/utils/format";
import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

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
        const expectedCount = tasks.reduce((sum, task) => sum + task.total, 0);
        return { total, pendingTotal, completedTotal, expectedCount };
    }, [tasks]);

    const filteredTasks = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return tasks.filter((task) => {
            const matchesClass = classFilter === "all" || task.className === classFilter;
            const matchesKeyword = !keyword || task.topic.toLowerCase().includes(keyword);
            return matchesClass && matchesKeyword;
        });
    }, [tasks, classFilter, searchTerm]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-foreground">任务管理</h2>
                <p className="text-sm text-muted-foreground mt-1">管理发布任务与批改进度。</p>
            </div>

            <div className="grid grid-cols-4 gap-4">
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">任务总数</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <IconTile intent="info">
                            <ClipboardList className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">待批改</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.pendingTotal}</p>
                        </div>
                        <IconTile intent="destructive">
                            <AlertTriangle className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">已完成</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.completedTotal}</p>
                        </div>
                        <IconTile intent="success">
                            <CheckCircle2 className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">应交人次</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.expectedCount}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">按任务覆盖班级学生数累计，非实际提交数</p>
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
                        <CardTitle className="text-base text-foreground">任务列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {filteredTasks.length} 条数据</p>
                    </div>
                    <div className="flex gap-3 flex-row w-auto">
                        <div className="relative w-56">
                            <Label htmlFor="teacher-task-search" className="sr-only">搜索课题</Label>
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="teacher-task-search"
                                data-testid="teacher-task-search"
                                placeholder="搜索课题"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <Select value={classFilter} onValueChange={setClassFilter}>
                            <SelectTrigger aria-label="按班级筛选任务" data-testid="teacher-task-class-filter" className="bg-background border-border text-foreground w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部班级</SelectItem>
                                {Array.from(new Set(tasks.map((task) => task.className))).map((name) => (
                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button data-testid="teacher-task-publish-open" onClick={() => setShowPublishModal(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
                            <Plus className="w-4 h-4 mr-1" /> 发布任务
                        </Button>
                    </div>
                </PageHeader>
                <CardContent className="pt-0">
                    {loading ? <div className="text-center py-12 text-muted-foreground">加载中...</div> : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border hover:bg-card/50">
                                    <TableHead className="text-muted-foreground">课题</TableHead>
                                    <TableHead className="text-muted-foreground">班级</TableHead>
                                    <TableHead className="text-muted-foreground">发布时间</TableHead>
                                    <TableHead className="text-muted-foreground">截止时间</TableHead>
                                    <TableHead className="text-muted-foreground">完成进度</TableHead>
                                    <TableHead className="text-muted-foreground">待批改</TableHead>
                                    <TableHead className="text-muted-foreground text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTasks.map((task) => (
                                    <TableRow data-testid={`teacher-task-row-${task.id}`} key={task.id} className="border-border hover:bg-muted/50 transition-colors">
                                        <TableCell className="font-medium text-foreground">{task.topic}</TableCell>
                                        <TableCell className="text-foreground/90">{task.className}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs">{formatDateTimeDisplay(task.publishedAt, "-")}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs">{task.deadline ? `${formatDateTimeDisplay(task.deadline)}（UTC+8）` : "无"}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress aria-label={`${task.topic}完成进度`} value={task.total > 0 ? (task.completed / task.total) * 100 : 0} className="w-20 h-1.5 bg-muted [&>div]:bg-success" />
                                                <span className="text-xs text-muted-foreground">{task.completed}/{task.total}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {task.pending && task.pending > 0 ? (
                                                <StatusBadge intent="destructive">
                                                    {task.pending}
                                                </StatusBadge>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button variant="ghost" size="sm" asChild className="h-8 text-muted-foreground hover:text-success hover:bg-success/10">
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
                                                    className="h-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                >
                                                    <Clock className="w-3.5 h-3.5 mr-1" />
                                                    延时
                                                </Button>
                                                <Button variant="ghost" size="sm" asChild className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                                    <Link to="/grading">批改</Link>
                                                </Button>
                                                <Button
                                                    data-testid={`teacher-task-delete-open-${task.id}`}
                                                    variant="ghost"
                                                    size="sm"
                                                    type="button"
                                                    aria-label={`删除任务：${task.topic}`}
                                                    onClick={() => setTaskToDelete(task)}
                                                    className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
                                                <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
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

            <AlertDialog open={taskToDelete !== null} onOpenChange={(open) => { if (!open) setTaskToDelete(null); }}>
                <AlertDialogContent className="bg-card border-border text-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">删除任务？</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            {taskToDelete
                                ? `将取消「${taskToDelete.topic}」在「${taskToDelete.className}」的任务发布：学生端与批改中均不再显示。需要再次布置同一课题时，可在「发布任务」中重新向该班级发布。`
                                : null}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-muted border-input text-foreground/90">
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

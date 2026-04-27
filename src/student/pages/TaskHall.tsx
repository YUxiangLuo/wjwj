import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    LayoutDashboard, FileText, FlaskConical, CheckCircle,
    ChevronRight, Clock, AlertCircle, Loader2, Trophy, BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RichTextContent } from "@/components/RichTextContent";
import { getRichTextPlainText } from "@/utils/rich-text";
import { announcementsApi, experimentApi, tasksApi, type StudentTask, type TaskStatus, type Announcement } from "../api-client";
import { clearReportDraft } from "../draft-sync";
import { parseDeadline, formatDateTimeDisplay } from "@/utils/format";
import { cn } from "@/lib/utils";

// Re-export types for compatibility
export type { TaskStatus, StudentTask };

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];
const ACTIVE_TASK_STATUSES: TaskStatus[] = ["not_started", "in_progress", "rejected"];
const statusConfig: Record<TaskStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    not_started: { label: "未开始", variant: "secondary" },
    in_progress: { label: "进行中", variant: "default" },
    submitted: { label: "已提交", variant: "outline" },
    grading: { label: "批改中", variant: "outline" },
    graded: { label: "已批改", variant: "default" },
    rejected: { label: "被驳回", variant: "destructive" },
};

function formatDateTime(value: string | null) {
    return formatDateTimeDisplay(value, "无");
}

function getRemainingMs(deadline: string | null): number | null {
    const end = parseDeadline(deadline);
    if (!end) return null;
    return end.getTime() - Date.now();
}

function isTaskNotOpenYet(publishedAt: string) {
    const parsed = new Date(publishedAt);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed.getTime() > Date.now();
}

function isDeadlinePassed(deadline: string | null) {
    const remaining = getRemainingMs(deadline);
    if (remaining === null) return false;
    return remaining <= 0;
}

export function isTaskActionable(task: Pick<StudentTask, "status" | "deadline" | "publishedAt">) {
    return ACTIVE_TASK_STATUSES.includes(task.status)
        && !isDeadlinePassed(task.deadline)
        && !isTaskNotOpenYet(task.publishedAt);
}

export function isTaskOngoing(task: Pick<StudentTask, "status" | "deadline" | "publishedAt">) {
    return (task.status === "in_progress" || task.status === "rejected") && isTaskActionable(task);
}

export function getNextActionableTask(tasks: StudentTask[]) {
    return tasks.find(isTaskActionable) ?? null;
}

function DeadlineDisplay({ deadline, status, notOpenYet }: { deadline: string | null; status: TaskStatus; notOpenYet: boolean }) {
    if (!deadline) return null;
    if (status === "graded") return null;
    if (notOpenYet) {
        return <span className="text-sm text-cyan-800">尚未开放</span>;
    }

    const remainingMs = getRemainingMs(deadline);
    if (remainingMs === null) return null;
    if (remainingMs <= 0) {
        return <span className="text-sm text-slate-500">已截止</span>;
    }

    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;

    if (remainingMs <= dayMs) {
        const hours = Math.floor(remainingMs / hourMs);
        const minutes = Math.floor((remainingMs % hourMs) / minuteMs);
        return (
            <span className="flex items-center gap-1 text-sm font-medium text-destructive">
                <AlertCircle className="size-3.5" />
                还剩 {hours} 小时 {minutes} 分钟
            </span>
        );
    }

    if (remainingMs <= 7 * dayMs) {
        const days = Math.floor(remainingMs / dayMs);
        const hours = Math.floor((remainingMs % dayMs) / hourMs);
        return (
            <span className="flex items-center gap-1 text-sm font-medium text-primary">
                <Clock className="size-3.5" />
                还剩 {days} 天 {hours} 小时
            </span>
        );
    }

    const days = Math.ceil(remainingMs / dayMs);
    return <span className="text-sm text-muted-foreground">还剩 {days} 天</span>;
}

interface TaskCardProps {
    task: StudentTask;
}

function TaskCard({ task }: TaskCardProps) {
    const navigate = useNavigate();
    const [showRestartConfirm, setShowRestartConfirm] = useState(false);
    const status = statusConfig[task.status];
    const deadlinePassed = isDeadlinePassed(task.deadline);
    const notOpenYet = isTaskNotOpenYet(task.publishedAt);

    const getActionButton = () => {
        if (notOpenYet) {
            return { text: "未开放", variant: "outline" as const };
        }
        switch (task.status) {
            case "not_started":
                return { text: "开始实验", variant: "default" as const };
            case "in_progress":
                return { text: "继续实验", variant: "default" as const };
            case "submitted":
            case "grading":
                return { text: "查看提交", variant: "outline" as const };
            case "graded":
                return { text: "查看成绩", variant: "outline" as const };
            case "rejected":
                return { text: "重新开始", variant: "destructive" as const };
        }
    };

    const action = getActionButton();
    const disabled = !isTaskActionable(task) && ACTIVE_TASK_STATUSES.includes(task.status);
    const showHistory = ["submitted", "grading", "graded", "rejected"].includes(task.status);
    const isRejected = task.status === "rejected";

    const handlePrimaryAction = async () => {
        if (disabled) return;
        if (isRejected) {
            setShowRestartConfirm(true);
            return;
        }
        navigate(`/task/${task.id}`);
    };

    return (
        <>
            <Card size="sm" className="transition-all hover:-translate-y-1 hover:shadow-md" data-testid={`student-task-card-${task.id}`}>
                <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                        <CardTitle className="line-clamp-1 text-lg normal-case tracking-normal">{task.name}</CardTitle>
                        <Badge variant={status.variant} className="whitespace-nowrap">{status.label}</Badge>
                    </div>
                    <CardDescription className="line-clamp-2">
                        {task.description ? getRichTextPlainText(task.description) : null}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                    {/* Progress */}
                    {task.status !== "graded" && task.status !== "rejected" && (
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">实验进度</span>
                                <span className="font-medium text-foreground">{task.progress}%</span>
                            </div>
                            <Progress value={task.progress} className="h-2" />
                            {task.currentStage > 0 && task.currentStage < 4 && (
                                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <span className="size-1.5 rounded-full bg-primary"></span>
                                    当前阶段：{stageNames[task.currentStage - 1]}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Score display */}
                    {task.status === "graded" && task.score !== undefined && (
                        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3">
                            <div className="rounded-full bg-primary/20 p-2 text-primary">
                                <Trophy className="size-5" />
                            </div>
                            <div>
                                <div className="text-xs font-bold uppercase tracking-wider text-primary/80">最终得分</div>
                                <span className="text-2xl font-bold text-primary">{task.score}</span>
                            </div>
                        </div>
                    )}

                    {/* Reject reason */}
                    {task.status === "rejected" && task.rejectReason && (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                            <div className="mb-1 flex items-center gap-2 font-semibold">
                                <AlertCircle className="size-3" /> 驳回理由
                            </div>
                            <div className="text-xs leading-relaxed opacity-90">{task.rejectReason}</div>
                        </div>
                    )}

                    <div className="mt-auto flex flex-col gap-4">
                        <Separator />

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                                <div>{notOpenYet ? "开放" : "发布"}：{formatDateTime(task.publishedAt)}</div>
                                <div>截止：{formatDateTime(task.deadline)}</div>
                            </div>
                            <DeadlineDisplay deadline={task.deadline} status={task.status} notOpenYet={notOpenYet} />
                        </div>

                        {/* Action button */}
                        <div className="flex gap-2">
                            <Button
                                className="w-full flex-1"
                                variant={action.variant}
                                disabled={disabled}
                                onClick={() => { void handlePrimaryAction(); }}
                                data-testid={`student-task-primary-${task.id}`}
                            >
                                {action.text}
                                <ChevronRight data-icon="inline-end" />
                            </Button>
                            {showHistory && (
                                <Link to={`/task/${task.id}/history`}>
                                    <Button variant="outline" size="icon" title="历史记录">
                                        <Clock />
                                    </Button>
                                </Link>
                            )}
                        </div>
                        {disabled && (
                            <div className="rounded-md bg-muted/50 px-4 py-2 text-center text-xs text-muted-foreground">
                                {notOpenYet ? "任务尚未开放，暂不可操作" : "已截止，无法继续操作"}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={showRestartConfirm} onOpenChange={setShowRestartConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认重新开始实验</AlertDialogTitle>
                        <AlertDialogDescription className="text-base leading-relaxed">
                            重新开始将<strong className="text-destructive">清空所有已有的实验数据</strong>，从问卷设计阶段重新开始。
                            <br />
                            确定继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={async () => {
                                const res = await experimentApi.reset(task.id, {
                                    resetToStage: 1,
                                    clearQuestionnaire: true,
                                });
                                if (res.success && res.data) {
                                    clearReportDraft(res.data.id);
                                    navigate(`/task/${task.id}/experiment`);
                                }
                            }}
                        >
                            确认重新开始
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

type FilterType = "all" | "in_progress" | "submitted" | "graded";

export function TaskHall() {
    const [tasks, setTasks] = useState<StudentTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [taskError, setTaskError] = useState(false);
    const [filter, setFilter] = useState<FilterType>("all");
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [showAnnouncements, setShowAnnouncements] = useState(false);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

    // 加载任务列表
    async function loadTasks() {
        setLoading(true);
        setTaskError(false);
        try {
            const res = await tasksApi.list();
            if (res.success && res.data) {
                setTasks(res.data);
            } else {
                setTaskError(true);
            }
        } catch (error) {
            console.error("Failed to load tasks:", error);
            setTaskError(true);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadTasks();
    }, []);

    useEffect(() => {
        async function loadAnnouncements() {
            try {
                const res = await announcementsApi.list();
                if (res.success && res.data) {
                    setAnnouncements(res.data);
                }
            } catch (error) {
                console.error("Failed to load announcements:", error);
            }
        }
        loadAnnouncements();
    }, []);

    const unreadAnnouncements = announcements.filter((a) => !a.isRead);
    const latestUnread = unreadAnnouncements[0] ?? null;

    const handleOpenAnnouncement = async (announcement: Announcement) => {
        setSelectedAnnouncement(announcement);
        if (!announcement.isRead) {
            await announcementsApi.markAsRead(announcement.id);
            setAnnouncements((prev) =>
                prev.map((a) => (a.id === announcement.id ? { ...a, isRead: true } : a))
            );
        }
    };

    const filteredTasks = tasks.filter(task => {
        if (filter === "all") return true;
        if (filter === "in_progress") {
            return isTaskOngoing(task);
        }
        if (filter === "submitted") return ["submitted", "grading"].includes(task.status);
        if (filter === "graded") return task.status === "graded";
        return true;
    });

    // Calculate stats
    const inProgressCount = tasks.filter(isTaskOngoing).length;
    const gradedCount = tasks.filter(t => t.status === "graded").length;
    const averageScore = tasks
        .filter(t => t.status === "graded" && t.score !== undefined)
        .reduce((acc, t, _, arr) => acc + (t.score || 0) / arr.length, 0);
    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="size-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            {latestUnread && (
                <div className="flex items-center justify-between gap-4 rounded-lg border border-primary/20 bg-primary/10 p-4">
                    <div className="flex items-center gap-4">
                        <div className="shrink-0 rounded-full bg-primary/20 p-2 text-primary">
                            <AlertCircle className="size-5" />
                        </div>
                        <div>
                            <div className="mb-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-primary">最新公告</div>
                            <div className="line-clamp-1 text-sm font-medium text-foreground">{latestUnread.title}</div>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setShowAnnouncements(true)}>
                        查看详情
                    </Button>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="student-stats-section">
                <Card size="sm" className="transition-colors hover:ring-foreground/10" data-testid="student-stat-in-progress">
                    <CardContent className="flex items-center gap-5">
                        <div className="rounded-lg bg-primary/10 p-4 text-primary transition-all duration-300 group-hover/card:bg-primary/20 group-hover/card:scale-110">
                            <FlaskConical className="size-6" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-foreground">{inProgressCount}</p>
                            <p className="text-sm text-muted-foreground">进行中的实验</p>
                        </div>
                    </CardContent>
                </Card>
                <Card size="sm" className="transition-colors hover:ring-foreground/10" data-testid="student-stat-graded">
                    <CardContent className="flex items-center gap-5">
                        <div className="rounded-lg bg-secondary p-4 text-secondary-foreground transition-all duration-300 group-hover/card:scale-110">
                            <CheckCircle className="size-6" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-foreground">{gradedCount}</p>
                            <p className="text-sm text-muted-foreground">已批改实验</p>
                        </div>
                    </CardContent>
                </Card>
                <Card size="sm" className="transition-colors hover:ring-foreground/10" data-testid="student-stat-average">
                    <CardContent className="flex items-center gap-5">
                        <div className="rounded-lg bg-accent p-4 text-accent-foreground transition-all duration-300 group-hover/card:scale-110">
                            <Trophy className="size-6" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-foreground">{averageScore.toFixed(0) || "-"}</p>
                            <p className="text-sm text-muted-foreground">平均得分</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Header */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <h3 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                        <LayoutDashboard className="size-5 text-primary" />
                        我的任务
                    </h3>
                    <div className="flex self-start rounded-lg border border-border bg-background p-1 sm:self-auto">
                        {[
                            { key: "all", label: "全部", testId: "student-filter-all" },
                            { key: "in_progress", label: "进行中", testId: "student-filter-in-progress" },
                            { key: "submitted", label: "已提交", testId: "student-filter-submitted" },
                            { key: "graded", label: "已批改", testId: "student-filter-graded" },
                        ].map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setFilter(item.key as typeof filter)}
                                data-testid={item.testId}
                                className={cn(
                                    "rounded-md px-4 py-1.5 text-sm font-medium transition-all",
                                    filter === item.key
                                        ? "bg-muted text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
                <Separator />
            </div>

            {/* Task Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 min-h-[300px]" data-testid="student-task-grid">
                {taskError ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 bg-red-50/30 dark:bg-red-950/20 rounded-3xl border border-dashed border-red-200 dark:border-red-800/50">
                        <div className="w-16 h-16 bg-red-50 dark:bg-red-950/40 rounded-full flex items-center justify-center mb-4 border border-red-200 dark:border-red-800/50">
                            <AlertCircle className="w-8 h-8 text-red-400 dark:text-red-500" />
                        </div>
                        <p className="text-lg text-slate-600 dark:text-slate-400 font-medium">任务加载失败</p>
                        <p className="text-sm text-slate-500 mt-1">请检查网络连接后重试</p>
                        <Button variant="outline" size="sm" className="mt-4" onClick={() => loadTasks()}>
                            重试
                        </Button>
                    </div>
                ) : filteredTasks.length > 0 ? (
                    filteredTasks.map(task => (
                        <TaskCard key={task.id} task={task} />
                    ))
                ) : (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 bg-slate-50/30 dark:bg-slate-900/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center mb-4 border border-slate-200 dark:border-slate-800">
                            <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-700" />
                        </div>
                        <p className="text-lg text-slate-600 dark:text-slate-400 font-medium">暂无相关任务</p>
                        <p className="text-sm text-slate-500 mt-1">当有新任务发布或状态变更时将出现在这里</p>
                    </div>
                )}
            </div>

            <Dialog open={showAnnouncements} onOpenChange={setShowAnnouncements}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold normal-case tracking-normal">
                            <AlertCircle className="size-5 text-primary" />
                            系统公告
                        </DialogTitle>
                        <DialogDescription>查看实验室最新通知与动态</DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 grid min-h-[400px] grid-cols-1 gap-6 md:grid-cols-2">
                        {/* List */}
                        <div className="custom-scrollbar flex max-h-[400px] flex-col gap-2 overflow-y-auto border-r border-border pr-2 md:pr-4">
                            {announcements.length === 0 && (
                                <div className="py-12 text-center text-sm italic text-muted-foreground">暂无公告</div>
                            )}
                            {announcements.map((announcement) => (
                                <button
                                    key={announcement.id}
                                    type="button"
                                    className={cn(
                                        "group w-full rounded-lg border p-4 text-left transition-all duration-200",
                                        selectedAnnouncement?.id === announcement.id
                                            ? "border-primary/30 bg-primary/10 ring-1 ring-primary/20"
                                            : "border-border bg-background/50 hover:bg-muted"
                                    )}
                                    onClick={() => handleOpenAnnouncement(announcement)}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div
                                            className={cn(
                                                "line-clamp-1 text-sm font-medium transition-colors group-hover:text-primary",
                                                !announcement.isRead ? "text-foreground" : "text-muted-foreground"
                                            )}
                                        >
                                            {announcement.title}
                                        </div>
                                        {!announcement.isRead && <span className="mt-1 size-2 shrink-0 rounded-full bg-destructive"></span>}
                                    </div>
                                    <div className="mt-2 font-mono text-xs text-muted-foreground opacity-70">
                                        {new Date(announcement.createdAt).toLocaleString("zh-CN", {
                                            timeZone: "Asia/Shanghai",
                                            month: "2-digit",
                                            day: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </div>
                                </button>
                            ))}
                        </div>
                        {/* Detail */}
                        <div className="custom-scrollbar max-h-[400px] overflow-y-auto pl-2 pr-2">
                            {selectedAnnouncement ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <h3 className="text-lg font-bold leading-tight text-foreground">{selectedAnnouncement.title}</h3>
                                        <div className="mt-2 inline-flex items-center gap-2 rounded bg-background/50 px-2 py-1 font-mono text-xs text-muted-foreground">
                                            <Clock className="size-3" />
                                            {new Date(selectedAnnouncement.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                                        </div>
                                    </div>
                                    <div className="h-px w-full bg-border" />
                                    <RichTextContent
                                        html={selectedAnnouncement.content}
                                        className="text-sm leading-relaxed text-foreground/80"
                                    />
                                </div>
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center space-y-3 text-muted-foreground opacity-50">
                                    <FileText className="size-12 stroke-1" />
                                    <p className="text-sm">请选择左侧公告查看详情</p>
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default TaskHall;

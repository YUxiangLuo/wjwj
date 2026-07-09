import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    LayoutDashboard, FileText, FlaskConical, CheckCircle,
    ChevronRight, Clock, AlertCircle, Loader2, Trophy, BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

// Re-export types for compatibility
export type { TaskStatus, StudentTask };

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];
const ACTIVE_TASK_STATUSES: TaskStatus[] = ["not_started", "in_progress", "rejected"];
const statusConfig: Record<TaskStatus, { label: string; intent: StatusBadgeIntent }> = {
    not_started: { label: "未开始", intent: "neutral" },
    in_progress: { label: "进行中", intent: "primary" },
    submitted: { label: "已提交", intent: "warning" },
    grading: { label: "批改中", intent: "warning" },
    graded: { label: "已批改", intent: "success" },
    rejected: { label: "被驳回", intent: "destructive" },
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
        return <span className="text-sm text-info">尚未开放</span>;
    }

    const remainingMs = getRemainingMs(deadline);
    if (remainingMs === null) return null;
    if (remainingMs <= 0) {
        return <span className="text-sm text-muted-foreground">已截止</span>;
    }

    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;

    if (remainingMs <= dayMs) {
        const hours = Math.floor(remainingMs / hourMs);
        const minutes = Math.floor((remainingMs % hourMs) / minuteMs);
        return (
            <span className="text-sm text-destructive font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                还剩 {hours} 小时 {minutes} 分钟
            </span>
        );
    }

    if (remainingMs <= 7 * dayMs) {
        const days = Math.floor(remainingMs / dayMs);
        const hours = Math.floor((remainingMs % dayMs) / hourMs);
        return (
            <span className="text-sm text-warning font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
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
            <Card className="rounded-2xl border-border bg-card/60 backdrop-blur-sm shadow-lg hover:shadow-primary/10 transition-all hover:-translate-y-1" data-testid={`student-task-card-${task.id}`}>
                <CardHeader className="pb-3 text-foreground">
                <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-lg line-clamp-1 text-foreground">{task.name}</CardTitle>
                    <StatusBadge intent={status.intent} className="whitespace-nowrap">{status.label}</StatusBadge>
                </div>
                <CardDescription className="line-clamp-2 text-muted-foreground">
                    {task.description ? getRichTextPlainText(task.description) : null}
                </CardDescription>
                </CardHeader>
                <CardContent>
                <div className="space-y-4">
                    {/* Progress */}
                    {task.status !== "graded" && task.status !== "rejected" && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">实验进度</span>
                                <span className="text-foreground/90 font-medium">{task.progress}%</span>
                            </div>
                            <Progress value={task.progress} className="h-2 bg-muted [&>div]:bg-primary" />
                            {task.currentStage > 0 && task.currentStage < 4 && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                                    当前阶段：{stageNames[task.currentStage - 1]}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Score display */}
                    {task.status === "graded" && task.score !== undefined && (
                        <div className="flex items-center gap-3 py-3 px-4 bg-success/10 rounded-lg border border-success/10">
                            <div className="p-2 bg-success/20 rounded-full">
                                <Trophy className="w-5 h-5 text-success" />
                            </div>
                            <div>
                                <div className="text-xs text-success/80 uppercase font-bold tracking-wider">最终得分</div>
                                <span className="font-bold text-2xl text-success">{task.score}</span>
                            </div>
                        </div>
                    )}

                    {/* Reject reason */}
                    {task.status === "rejected" && task.rejectReason && (
                        <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20 text-sm text-destructive">
                            <div className="font-semibold mb-1 flex items-center gap-2">
                                <AlertCircle className="w-3 h-3" /> 驳回理由
                            </div>
                            <div className="opacity-90 leading-relaxed text-xs">{task.rejectReason}</div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex justify-between items-center pt-3 border-t border-border">
                        <div className="text-xs text-muted-foreground space-y-0.5">
                            <div>{notOpenYet ? "开放" : "发布"}：{formatDateTime(task.publishedAt)}</div>
                            <div>截止：{formatDateTime(task.deadline)}</div>
                        </div>
                        <DeadlineDisplay deadline={task.deadline} status={task.status} notOpenYet={notOpenYet} />
                    </div>

                    {/* Action button */}
                    <div className="flex gap-2">
                        <Button
                            className={`flex-1 w-full ${action.variant === 'default' ? 'bg-primary hover:bg-primary text-primary-foreground hover:text-primary-foreground shadow-lg shadow-primary/20' : ''} ${action.variant === 'destructive' ? 'bg-destructive hover:bg-destructive text-destructive-foreground hover:text-primary-foreground' : ''} ${action.variant === 'outline' ? 'border-input text-foreground/90 hover:bg-muted hover:text-foreground' : ''}`}
                            variant="ghost"
                            disabled={disabled}
                            onClick={() => { void handlePrimaryAction(); }}
                            data-testid={`student-task-primary-${task.id}`}
                        >
                            {action.text}
                            <ChevronRight className="w-4 h-4 ml-1 opacity-70" />
                        </Button>
                        {showHistory && (
                            <Link to={`/task/${task.id}/history`}>
                                <Button variant="outline" size="icon" className="border-input text-muted-foreground hover:bg-muted hover:text-foreground" title="历史记录">
                                    <Clock className="w-4 h-4" />
                                </Button>
                            </Link>
                        )}
                    </div>
                    {disabled && (
                        <div className="px-4 py-2 text-xs text-muted-foreground text-center bg-muted/50 rounded-md">
                            {notOpenYet ? "任务尚未开放，暂不可操作" : "已截止，无法继续操作"}
                        </div>
                    )}
                </div>
                </CardContent>
            </Card>

            <AlertDialog open={showRestartConfirm} onOpenChange={setShowRestartConfirm}>
                <AlertDialogContent className="bg-card border-border text-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">确认重新开始实验</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground text-base leading-relaxed">
                            重新开始将<strong className="text-destructive">清空所有已有的实验数据</strong>，从问卷设计阶段重新开始。
                            <br />
                            确定继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-background border-border text-foreground/90 hover:bg-muted hover:text-foreground">取消</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive hover:bg-destructive text-destructive-foreground"
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
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {latestUnread && (
                <div className="rounded-xl border border-warning/20 bg-warning/10 p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-full bg-warning/20 text-warning shrink-0">
                            <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-sm text-warning font-medium font-mono tracking-wider uppercase text-[10px] mb-0.5">最新公告</div>
                            <div className="text-sm text-warning font-medium line-clamp-1">{latestUnread.title}</div>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" className="rounded-full text-warning hover:text-warning hover:bg-warning/10 shrink-0" onClick={() => setShowAnnouncements(true)}>
                        查看详情
                    </Button>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="student-stats-section">
                <Card className="rounded-2xl border-border bg-card/50 shadow-sm hover:border-input transition-colors group" data-testid="student-stat-in-progress">
                    <CardContent className="p-6 flex items-center gap-5">
                        <div className="p-4 bg-primary/10 rounded-2xl text-primary group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                            <FlaskConical className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-foreground group-hover:text-primary transition-colors">{inProgressCount}</p>
                            <p className="text-sm text-muted-foreground">进行中的实验</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="rounded-2xl border-border bg-card/50 shadow-sm hover:border-input transition-colors group" data-testid="student-stat-graded">
                    <CardContent className="p-6 flex items-center gap-5">
                        <div className="p-4 bg-success/10 rounded-2xl text-success group-hover:bg-success/20 group-hover:scale-110 transition-all duration-300">
                            <CheckCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-foreground group-hover:text-success transition-colors">{gradedCount}</p>
                            <p className="text-sm text-muted-foreground">已批改实验</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="rounded-2xl border-border bg-card/50 shadow-sm hover:border-input transition-colors group" data-testid="student-stat-average">
                    <CardContent className="p-6 flex items-center gap-5">
                        <div className="p-4 bg-auxiliary/10 rounded-2xl text-auxiliary group-hover:bg-auxiliary/20 group-hover:scale-110 transition-all duration-300">
                            <Trophy className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-foreground group-hover:text-auxiliary transition-colors">{averageScore.toFixed(0) || "-"}</p>
                            <p className="text-sm text-muted-foreground">平均得分</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
                <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <LayoutDashboard className="w-5 h-5 text-primary" />
                    我的任务
                </h3>
                <div className="flex p-1 bg-card border border-border rounded-lg self-start sm:self-auto">
                    <button
                        onClick={() => setFilter("all")}
                        data-testid="student-filter-all"
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === "all" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/90"}`}
                    >
                        全部
                    </button>
                    <button
                        onClick={() => setFilter("in_progress")}
                        data-testid="student-filter-in-progress"
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === "in_progress" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/90"}`}
                    >
                        进行中
                    </button>
                    <button
                        onClick={() => setFilter("submitted")}
                        data-testid="student-filter-submitted"
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === "submitted" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/90"}`}
                    >
                        已提交
                    </button>
                    <button
                        onClick={() => setFilter("graded")}
                        data-testid="student-filter-graded"
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === "graded" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/90"}`}
                    >
                        已批改
                    </button>
                </div>
            </div>

            {/* Task Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 min-h-[300px]" data-testid="student-task-grid">
                {taskError ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 bg-destructive/30 rounded-3xl border border-dashed border-destructive">
                        <div className="w-16 h-16 bg-destructive rounded-full flex items-center justify-center mb-4 border border-destructive">
                            <AlertCircle className="w-8 h-8 text-destructive" />
                        </div>
                        <p className="text-lg text-muted-foreground font-medium">任务加载失败</p>
                        <p className="text-sm text-muted-foreground mt-1">请检查网络连接后重试</p>
                        <Button variant="outline" size="sm" className="mt-4" onClick={() => loadTasks()}>
                            重试
                        </Button>
                    </div>
                ) : filteredTasks.length > 0 ? (
                    filteredTasks.map(task => (
                        <TaskCard key={task.id} task={task} />
                    ))
                ) : (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 bg-card/30 rounded-3xl border border-dashed border-border">
                        <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mb-4 border border-border">
                            <BookOpen className="w-8 h-8 text-muted-foreground dark:text-foreground/90" />
                        </div>
                        <p className="text-lg text-muted-foreground font-medium">暂无相关任务</p>
                        <p className="text-sm text-muted-foreground mt-1">当有新任务发布或状态变更时将出现在这里</p>
                    </div>
                )}
            </div>

            <Dialog open={showAnnouncements} onOpenChange={setShowAnnouncements}>
                <DialogContent className="max-w-2xl bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-foreground text-xl font-bold flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-primary" />
                            系统公告
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">查看实验室最新通知与动态</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 min-h-[400px]">
                        {/* List */}
                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar border-r border-border md:pr-4">
                            {announcements.length === 0 && (
                                <div className="text-sm text-muted-foreground text-center py-12 italic">暂无公告</div>
                            )}
                            {announcements.map((announcement) => (
                                <button
                                    key={announcement.id}
                                    className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group ${selectedAnnouncement?.id === announcement.id ? "bg-primary/20 border-primary/30 ring-1 ring-primary/20" : "bg-background/50 border-border hover:bg-muted hover:border-input"}`}
                                    onClick={() => handleOpenAnnouncement(announcement)}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div className={`text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors ${!announcement.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                                            {announcement.title}
                                        </div>
                                        {!announcement.isRead && <span className="w-2 h-2 rounded-full bg-destructive mt-1 shrink-0"></span>}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-2 font-mono opacity-70">
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
                        <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar pl-2">
                            {selectedAnnouncement ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <h3 className="text-lg font-bold text-foreground leading-tight">{selectedAnnouncement.title}</h3>
                                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground font-mono bg-background/50 inline-flex px-2 py-1 rounded">
                                            <Clock className="w-3 h-3" />
                                            {new Date(selectedAnnouncement.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                                        </div>
                                    </div>
                                    <div className="w-full h-px bg-muted" />
                                    <RichTextContent
                                        html={selectedAnnouncement.content}
                                        className="text-sm text-foreground/90 leading-relaxed"
                                    />
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3 opacity-50">
                                    <FileText className="w-12 h-12 stroke-1" />
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

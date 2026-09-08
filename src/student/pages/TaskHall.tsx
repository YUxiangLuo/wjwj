import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    LayoutDashboard, FileText,
    ChevronRight, Clock, AlertCircle, Trophy, BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextContent } from "@/components/RichTextContent";
import { LoadingStatus } from "@/components/LoadingStatus";
import { getRichTextPlainText } from "@/utils/rich-text";
import { announcementsApi, tasksApi } from "../api-client";
import type { StudentTask, Announcement } from "@/domain/experiment/student-contracts";
import type { TaskStatus } from "@/domain/experiment/types";
import { formatDateTimeDisplay, getRemainingDeadlineSummary, DAY_MS } from "@/utils/format";

// Re-export types for compatibility
export type { TaskStatus, StudentTask };

const stageNames = ["问卷预试", "样本量规划", "抽样执行", "分析与报告"];
const ACTIVE_TASK_STATUSES: TaskStatus[] = ["not_started", "in_progress", "rejected"];
const statusConfig: Record<TaskStatus, { label: string; intent: StatusBadgeIntent }> = {
    not_started: { label: "未开始", intent: "neutral" },
    in_progress: { label: "进行中", intent: "primary" },
    submitted: { label: "已提交", intent: "warning" },
    graded: { label: "已批改", intent: "success" },
    rejected: { label: "被驳回", intent: "destructive" },
};

function formatDateTime(value: string | null) {
    return formatDateTimeDisplay(value, "无");
}

function getRemainingMs(deadline: string | null): number | null {
    return getRemainingDeadlineSummary(deadline)?.remainingMs ?? null;
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
        return <span className="text-label text-info">尚未开放</span>;
    }

    const remaining = getRemainingDeadlineSummary(deadline);
    if (!remaining) return null;
    if (remaining.passed) {
        return <span className="text-label text-muted-foreground">已截止</span>;
    }

    if (remaining.remainingMs <= DAY_MS) {
        return (
            <span className="text-label text-destructive font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                还剩 {remaining.wholeHours} 小时 {remaining.leftoverMinutes} 分钟
            </span>
        );
    }

    if (remaining.remainingMs <= 7 * DAY_MS) {
        return (
            <span className="text-label text-warning font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                还剩 {remaining.wholeDays} 天 {remaining.leftoverHours} 小时
            </span>
        );
    }

    return <span className="text-label text-muted-foreground">还剩 {remaining.calendarDays} 天</span>;
}

interface TaskCardProps {
    task: StudentTask;
}

function TaskCard({ task }: TaskCardProps) {
    const navigate = useNavigate();
    const status = statusConfig[task.status];
    const notOpenYet = isTaskNotOpenYet(task.publishedAt);
    // A stable multiplicative hash varies nearby IDs without changing a topic's
    // decorative color across filtering, reloads or classes.
    const colorSeed = Math.imul(task.topicId, 0x9e3779b1) >>> 0;
    const colorTone = Math.floor((colorSeed / 0x100000000) * 6);

    const getActionButton = () => {
        if (notOpenYet) {
            return { text: "未开放", variant: "outline" as const };
        }
        switch (task.status) {
            case "not_started":
                if (isDeadlinePassed(task.deadline)) {
                    return { text: "已截止", variant: "outline" as const };
                }
                return { text: "开始实验", variant: "default" as const };
            case "in_progress":
                return { text: "继续实验", variant: "default" as const };
            case "submitted":
                return { text: "查看提交", variant: "outline" as const };
            case "graded":
                return { text: "查看成绩", variant: "outline" as const };
            case "rejected":
                return { text: "继续修改", variant: "destructive" as const };
        }
    };

    const action = getActionButton();
    const disabled = !isTaskActionable(task) && ACTIVE_TASK_STATUSES.includes(task.status);
    const showResult = task.status === "submitted" || task.status === "graded";

    const handlePrimaryAction = async () => {
        if (disabled) return;
        if (task.status === "submitted" || task.status === "graded") {
            navigate(`/task/${task.id}/result`);
        } else if (task.status === "rejected") {
            navigate(`/task/${task.id}/experiment`);
        } else {
            navigate(`/task/${task.id}`);
        }
    };

    return (
        <>
            <Card
                className="task-card rounded-surface border-(--task-card-border) border-t-4 border-t-(--task-card-accent) bg-(--task-card-surface) transition-none hover:border-(--task-card-accent)"
                data-task-tone={colorTone}
                data-testid={`student-task-card-${task.id}`}
            >
                <CardHeader className="pb-3 text-foreground">
                <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-subheading line-clamp-1 text-foreground">{task.name}</CardTitle>
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
                            <div className="flex justify-between text-label">
                                <span className="text-muted-foreground">实验进度</span>
                                <span className="text-foreground font-medium">{task.progress}%</span>
                            </div>
                            <Progress aria-label={`${task.name}实验进度`} value={task.progress} className="h-2 bg-muted [&>div]:bg-primary" />
                            {task.currentStage > 0 && task.currentStage < 4 && (
                                <p className="text-meta text-muted-foreground flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-circle bg-primary"></span>
                                    当前阶段：{stageNames[task.currentStage - 1]}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Score display */}
                    {task.status === "graded" && task.score !== undefined && (
                        <div className="flex items-center gap-3 py-3 px-4 bg-success-muted rounded-surface border border-success-border">
                            <div className="p-2 bg-success-muted rounded-control">
                                <Trophy className="w-5 h-5 text-success" />
                            </div>
                            <div>
                                <div className="text-meta text-success uppercase font-bold tracking-wider">最终得分</div>
                                <span className="font-bold text-page-title text-success">{task.score}</span>
                            </div>
                        </div>
                    )}

                    {/* Reject reason */}
                    {task.status === "rejected" && task.rejectReason && (
                        <div className="p-3 bg-destructive-muted rounded-surface border border-destructive-border text-label text-destructive">
                            <div className="font-semibold mb-1 flex items-center gap-2">
                                <AlertCircle className="w-3 h-3" /> 驳回理由
                            </div>
                            <div className="opacity-90 leading-relaxed text-meta">{task.rejectReason}</div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex justify-between items-center pt-3 border-t border-border">
                        <div className="text-meta text-muted-foreground space-y-0.5">
                            <div>{notOpenYet ? "开放" : "发布"}：{formatDateTime(task.publishedAt)}</div>
                            <div>截止：{formatDateTime(task.deadline)}</div>
                        </div>
                        <DeadlineDisplay deadline={task.deadline} status={task.status} notOpenYet={notOpenYet} />
                    </div>

                    {/* Action button */}
                    <div className="flex gap-2">
                        <Button
                            className={`flex-1 w-full ${action.variant === 'default' ? 'bg-primary hover:bg-primary-hover text-primary-foreground hover:text-primary-foreground ' : ''} ${action.variant === 'destructive' ? 'bg-destructive hover:bg-destructive-hover text-destructive-foreground hover:text-destructive-foreground' : ''} ${action.variant === 'outline' ? 'border-input text-foreground hover:bg-muted hover:text-foreground' : ''}`}
                            variant="ghost"
                            disabled={disabled}
                            onClick={() => { void handlePrimaryAction(); }}
                            data-testid={`student-task-primary-${task.id}`}
                        >
                            {action.text}
                            <ChevronRight className="w-4 h-4 ml-1 opacity-70" />
                        </Button>
                        {showResult && (
                            <Button asChild variant="outline" size="icon" className="border-input text-muted-foreground hover:bg-muted hover:text-foreground">
                                <Link to={`/task/${task.id}/result`} aria-label={`查看${task.name}结果`} title="查看结果">
                                    <Clock className="w-4 h-4" />
                                </Link>
                            </Button>
                        )}
                    </div>
                    {disabled && (
                        <div className="px-4 py-2 text-meta text-muted-foreground text-center bg-muted rounded-control">
                            {notOpenYet ? "任务尚未开放，暂不可操作" : "已截止，无法继续操作"}
                        </div>
                    )}
                </div>
                </CardContent>
            </Card>

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

    const latestAnnouncement = announcements[0] ?? null;

    const handleOpenAnnouncement = (announcement: Announcement) => {
        setSelectedAnnouncement(announcement);
    };

    const filteredTasks = tasks.filter(task => {
        if (filter === "all") return true;
        if (filter === "in_progress") {
            return isTaskOngoing(task);
        }
        if (filter === "submitted") return task.status === "submitted";
        if (filter === "graded") return task.status === "graded";
        return true;
    });

    if (loading) {
        return <LoadingStatus className="py-24" iconClassName="h-10 w-10" label="正在加载实验任务" />;
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-page-title font-bold text-foreground">任务大厅</h1>
                <p className="mt-1 text-label text-muted-foreground">查看实验任务、截止时间与学习进度（中国标准时间 UTC+8）。</p>
            </div>
            {latestAnnouncement && (
                <div className="rounded-surface border border-warning-border bg-warning-muted p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-control bg-warning-muted text-warning shrink-0">
                            <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-label text-warning font-medium font-mono tracking-wider uppercase text-meta mb-0.5">最新公告</div>
                            <div className="text-label text-warning font-medium line-clamp-1">{latestAnnouncement.title}</div>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" className="rounded-control text-warning hover:text-warning hover:bg-warning-muted shrink-0" onClick={() => setShowAnnouncements(true)}>
                        查看详情
                    </Button>
                </div>
            )}

            {/* Filter Header */}
            <div className="flex flex-row items-center justify-between gap-4 border-b border-border pb-4">
                <h2 className="text-section-title font-semibold text-foreground flex items-center gap-2">
                    <LayoutDashboard className="w-5 h-5 text-primary" />
                    我的任务
                </h2>
                <div className="flex p-1 bg-card border border-border rounded-surface self-auto">
                    <button
                        onClick={() => setFilter("all")}
                        data-testid="student-filter-all"
                        className={`px-4 py-1.5 text-label font-medium rounded-control transition-none ${filter === "all" ? "bg-muted text-foreground " : "text-muted-foreground hover:text-foreground"}`}
                    >
                        全部
                    </button>
                    <button
                        onClick={() => setFilter("in_progress")}
                        data-testid="student-filter-in-progress"
                        className={`px-4 py-1.5 text-label font-medium rounded-control transition-none ${filter === "in_progress" ? "bg-muted text-foreground " : "text-muted-foreground hover:text-foreground"}`}
                    >
                        进行中
                    </button>
                    <button
                        onClick={() => setFilter("submitted")}
                        data-testid="student-filter-submitted"
                        className={`px-4 py-1.5 text-label font-medium rounded-control transition-none ${filter === "submitted" ? "bg-muted text-foreground " : "text-muted-foreground hover:text-foreground"}`}
                    >
                        已提交
                    </button>
                    <button
                        onClick={() => setFilter("graded")}
                        data-testid="student-filter-graded"
                        className={`px-4 py-1.5 text-label font-medium rounded-control transition-none ${filter === "graded" ? "bg-muted text-foreground " : "text-muted-foreground hover:text-foreground"}`}
                    >
                        已批改
                    </button>
                </div>
            </div>

            {/* Task Grid */}
            <div className="grid grid-cols-3 gap-6 min-h-[300px]" data-testid="student-task-grid">
                {taskError ? (
                    <div className="col-span-full flex flex-col items-center justify-center rounded-surface border border-dashed border-destructive-border bg-destructive-muted py-20">
                        <div className="w-16 h-16 bg-destructive rounded-control flex items-center justify-center mb-4 border border-destructive">
                            <AlertCircle className="w-8 h-8 text-destructive-foreground" />
                        </div>
                        <p className="text-subheading text-muted-foreground font-medium">任务加载失败</p>
                        <p className="text-label text-muted-foreground mt-1">请检查网络连接后重试</p>
                        <Button variant="outline" size="sm" className="mt-4" onClick={() => loadTasks()}>
                            重试
                        </Button>
                    </div>
                ) : filteredTasks.length > 0 ? (
                    filteredTasks.map(task => (
                        <TaskCard key={task.id} task={task} />
                    ))
                ) : (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 bg-card rounded-surface border border-dashed border-border">
                        <div className="w-16 h-16 bg-card rounded-control flex items-center justify-center mb-4 border border-border">
                            <BookOpen className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="text-subheading text-muted-foreground font-medium">暂无相关任务</p>
                        <p className="text-label text-muted-foreground mt-1">当有新任务发布或状态变更时将出现在这里</p>
                    </div>
                )}
            </div>

            <Dialog open={showAnnouncements} onOpenChange={setShowAnnouncements}>
                <DialogContent className="max-w-2xl bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-foreground text-section-title font-bold flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-primary" />
                            系统公告
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">查看实验室最新通知与动态</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-6 mt-4 min-h-[400px]">
                        {/* List */}
                        <div
                            role="region"
                            tabIndex={0}
                            aria-label="公告列表"
                            className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar border-r border-border pr-4"
                        >
                            {announcements.length === 0 && (
                                <div className="text-label text-muted-foreground text-center py-12 italic">暂无公告</div>
                            )}
                            {announcements.map((announcement) => (
                                <button
                                    key={announcement.id}
                                    className={`w-full text-left p-4 rounded-surface border transition-none group ${selectedAnnouncement?.id === announcement.id ? "bg-primary-muted border-primary-border ring-1 ring-ring" : "bg-background border-border hover:bg-muted hover:border-input"}`}
                                    onClick={() => handleOpenAnnouncement(announcement)}
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="text-label font-medium line-clamp-1 text-foreground group-hover:text-primary transition-none">
                                            {announcement.title}
                                        </div>
                                    </div>
                                    <div className="text-meta text-muted-foreground mt-2 font-mono opacity-70">
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
                        <div
                            role="region"
                            tabIndex={0}
                            aria-label="公告详情"
                            className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar pl-2"
                        >
                            {selectedAnnouncement ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <h3 className="text-subheading font-bold text-foreground leading-tight">{selectedAnnouncement.title}</h3>
                                        <div className="flex items-center gap-2 mt-2 text-meta text-muted-foreground font-mono bg-background inline-flex px-2 py-1 rounded-control">
                                            <Clock className="w-3 h-3" />
                                            {new Date(selectedAnnouncement.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                                        </div>
                                    </div>
                                    <div className="w-full h-px bg-muted" />
                                    <RichTextContent
                                        html={selectedAnnouncement.content}
                                        className="text-label text-foreground leading-relaxed"
                                    />
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3 opacity-50">
                                    <FileText className="w-12 h-12 stroke-1" />
                                    <p className="text-label">请选择左侧公告查看详情</p>
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

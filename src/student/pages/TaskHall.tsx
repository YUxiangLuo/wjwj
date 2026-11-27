import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    FileText,
    ChevronRight, Clock, AlertCircle, Info, Trophy, BookOpen,
    BriefcaseBusiness, CheckCircle2, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextContent } from "@/components/RichTextContent";
import { LoadingStatus } from "@/components/LoadingStatus";
import { KpiStatCard } from "@/components/KpiStatCard";
import { IconTile } from "@/components/IconTile";
import { getRichTextPlainText } from "@/utils/rich-text";
import { announcementsApi, tasksApi } from "../api-client";
import type { StudentTask, Announcement } from "@/domain/experiment/student-contracts";
import type { TaskStatus } from "@/domain/experiment/types";
import { EXPERIMENT_STAGE_NAMES } from "@/lib/experiment-progress";
import { formatDateTimeDisplay, getRemainingDeadlineSummary, DAY_MS } from "@/utils/format";

// Re-export types for compatibility
export type { TaskStatus, StudentTask };

const stageNames = [...EXPERIMENT_STAGE_NAMES];
const ACTIVE_TASK_STATUSES: TaskStatus[] = ["not_started", "in_progress", "rejected"];
const statusConfig: Record<TaskStatus, { label: string; intent: StatusBadgeIntent }> = {
    not_started: { label: "待立项", intent: "neutral" },
    in_progress: { label: "调研进行中", intent: "primary" },
    submitted: { label: "已提交待评", intent: "warning" },
    graded: { label: "已批改结项", intent: "success" },
    rejected: { label: "退回重调", intent: "destructive" },
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
    return sortStudentHallTasks(tasks).find(isTaskActionable) ?? null;
}

function hallRank(task: Pick<StudentTask, "status" | "deadline" | "publishedAt">) {
    if (isTaskActionable(task)) {
        if (task.status === "in_progress" || task.status === "rejected") return 0;
        if (task.status === "not_started") return 1;
    }
    if (task.status === "submitted") return 2;
    if (task.status === "graded") return 3;
    if (isTaskNotOpenYet(task.publishedAt)) return 4;
    if (isDeadlinePassed(task.deadline)) return 5;
    return 6;
}

function deadlineSortKey(deadline: string | null) {
    if (!deadline) return Number.POSITIVE_INFINITY;
    const parsed = new Date(deadline).getTime();
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

export function compareStudentHallTasks(a: StudentTask, b: StudentTask) {
    const rankDiff = hallRank(a) - hallRank(b);
    if (rankDiff !== 0) return rankDiff;
    const aDeadline = deadlineSortKey(a.deadline);
    const bDeadline = deadlineSortKey(b.deadline);
    if (aDeadline !== bDeadline) return aDeadline < bDeadline ? -1 : 1;
    return a.id - b.id;
}

export function sortStudentHallTasks(tasks: StudentTask[]) {
    return [...tasks].sort(compareStudentHallTasks);
}

function DeadlineDisplay({ deadline, status, notOpenYet }: { deadline: string | null; status: TaskStatus; notOpenYet: boolean }) {
    if (!deadline) return null;
    if (status === "graded") return null;
    if (notOpenYet) {
        return <span className="text-meta font-medium text-muted-foreground">尚未开放</span>;
    }

    const remaining = getRemainingDeadlineSummary(deadline);
    if (!remaining) return null;
    if (remaining.passed) {
        return <span className="text-meta font-medium text-muted-foreground">已截止</span>;
    }

    if (remaining.remainingMs <= DAY_MS) {
        return (
            <span className="inline-flex items-center gap-1 text-meta font-medium text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                还剩 {remaining.wholeHours} 小时 {remaining.leftoverMinutes} 分钟
            </span>
        );
    }

    if (remaining.remainingMs <= 7 * DAY_MS) {
        return (
            <span className="inline-flex items-center gap-1 text-meta font-medium text-warning">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                还剩 {remaining.wholeDays} 天 {remaining.leftoverHours} 小时
            </span>
        );
    }

    return <span className="text-meta font-medium text-muted-foreground">还剩 {remaining.calendarDays} 天</span>;
}

interface TaskCardProps {
    task: StudentTask;
}

function TaskCard({ task }: TaskCardProps) {
    const navigate = useNavigate();
    const notOpenYet = isTaskNotOpenYet(task.publishedAt);
    const expired = isDeadlinePassed(task.deadline) && ACTIVE_TASK_STATUSES.includes(task.status);
    const status = expired
        ? { label: "已截止", intent: "neutral" as StatusBadgeIntent }
        : notOpenYet && ACTIVE_TASK_STATUSES.includes(task.status)
            ? { label: "未开放", intent: "neutral" as StatusBadgeIntent }
            : statusConfig[task.status];

    const getActionButton = (): {
        text: string;
        variant: "secondary" | "outline";
        className?: string;
    } => {
        if (notOpenYet && ACTIVE_TASK_STATUSES.includes(task.status)) {
            return { text: "未开放", variant: "outline" };
        }
        if (expired) {
            return { text: "已截止", variant: "outline" };
        }
        switch (task.status) {
            case "not_started":
                return { text: "开始立项调研", variant: "outline" };
            case "in_progress":
                return { text: "继续闭环实验", variant: "secondary" };
            case "submitted":
                return { text: "查看提交快照", variant: "outline" };
            case "graded":
                return { text: "查看成绩与评语", variant: "outline" };
            case "rejected":
                return {
                    text: "按意见重新调优",
                    variant: "outline",
                    className: "border-destructive-border text-destructive hover:border-destructive-border hover:bg-destructive-muted",
                };
        }
    };

    const action = getActionButton();
    const disabled = !isTaskActionable(task) && ACTIVE_TASK_STATUSES.includes(task.status);

    const handlePrimaryAction = async () => {
        if (disabled) return;
        if (task.status === "submitted" || task.status === "graded") {
            navigate(`/task/${task.id}/result`);
        } else if (task.status === "in_progress" || task.status === "rejected") {
            navigate(`/task/${task.id}/experiment`);
        } else {
            navigate(`/task/${task.id}`);
        }
    };

    const waveLabel = task.activeWaveNumber && task.activeWaveNumber >= 2
        ? `第 ${task.activeWaveNumber} 轮正式投`
        : "第 1 轮试投";

    return (
        <Card
            className="flex h-full flex-col gap-3.5 rounded-surface border border-border bg-card py-4 transition-none hover:border-primary-border"
            data-testid={`student-task-card-${task.id}`}
        >
            <CardHeader className="pb-0 text-foreground">
                <div className="flex items-start justify-between gap-2.5">
                    <CardTitle className="min-w-0 flex-1 text-subheading font-medium text-foreground">
                        <Link
                            to={`/task/${task.id}`}
                            title={task.name}
                            className="block rounded-control outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                            data-testid={`student-task-title-${task.id}`}
                        >
                            <span className="line-clamp-2 break-words">{task.name}</span>
                        </Link>
                    </CardTitle>
                    <StatusBadge intent={status.intent} className="whitespace-nowrap">{status.label}</StatusBadge>
                </div>
                <CardDescription className="line-clamp-2 text-muted-foreground">
                    {task.description ? getRichTextPlainText(task.description) : "围绕商业管理问题完成试投质检、抽样调优与统计推断闭环。"}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
                <div className="flex flex-1 flex-col gap-3.5">
                    {task.status !== "graded" && task.status !== "rejected" && (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-meta">
                                <span className="text-muted-foreground">闭环完成度</span>
                                <div className="flex items-center gap-2">
                                    {task.activeWaveNumber && task.activeWaveNumber >= 1 && task.status === "in_progress" && (
                                        <span className="rounded-pill bg-muted px-2.5 py-0.5 text-meta font-medium text-muted-foreground">
                                            {waveLabel}
                                        </span>
                                    )}
                                    <span className="font-medium tabular-nums text-foreground">{task.progress}%</span>
                                </div>
                            </div>
                            <Progress aria-label={`${task.name}实验进度`} value={task.progress} className="h-1.5 bg-muted [&>div]:bg-primary" />
                            {task.status === "in_progress" && task.currentStage > 0 && task.currentStage <= stageNames.length && (
                                <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
                                    <span className="h-1.5 w-1.5 rounded-circle bg-primary" aria-hidden="true" />
                                    阶段 {task.currentStage}/5：{stageNames[task.currentStage - 1]}
                                </p>
                            )}
                        </div>
                    )}

                    {task.status === "graded" && task.score !== undefined && (
                        <div className="flex items-center justify-between rounded-surface bg-muted px-3.5 py-2.5">
                            <span className="text-meta text-muted-foreground">综合结项评分</span>
                            <span className="text-section-title font-medium tabular-nums text-success">{task.score}</span>
                        </div>
                    )}

                    {task.status === "rejected" && task.rejectReason && (
                        <div className="rounded-surface border border-destructive-border bg-destructive-muted p-3 text-label text-destructive">
                            <div className="mb-1 flex items-center gap-1.5 text-meta font-medium">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> 教师退回意见
                            </div>
                            <div className="line-clamp-3 text-meta leading-relaxed">{task.rejectReason}</div>
                        </div>
                    )}

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3.5">
                        <div className="min-w-0 flex-1 space-y-0.5 tabular-nums">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                {disabled ? (
                                    <span className="text-meta font-medium text-muted-foreground">
                                        {notOpenYet ? "尚未开放，暂不可操作" : "已截止，无法继续操作"}
                                    </span>
                                ) : task.status === "graded" ? (
                                    <span className="text-meta text-muted-foreground">已结项归档</span>
                                ) : task.deadline ? (
                                    <DeadlineDisplay deadline={task.deadline} status={task.status} notOpenYet={notOpenYet} />
                                ) : (
                                    <span className="text-meta text-muted-foreground">长期开放</span>
                                )}
                            </div>
                            <div className="truncate text-meta text-muted-foreground">
                                {notOpenYet
                                    ? `开放：${formatDateTime(task.publishedAt)}`
                                    : task.deadline
                                        ? `截止：${formatDateTime(task.deadline)}`
                                        : `发布：${formatDateTime(task.publishedAt)}`}
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                            {task.status === "rejected" && (
                                <Button asChild variant="ghost" size="sm" className="px-2.5">
                                    <Link to={`/task/${task.id}/result`} aria-label={`查看${task.name}退回快照`}>
                                        批改详情
                                    </Link>
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant={action.variant}
                                className={action.className}
                                disabled={disabled}
                                onClick={() => { void handlePrimaryAction(); }}
                                data-testid={`student-task-primary-${task.id}`}
                            >
                                {action.text}
                                {!disabled && <ChevronRight className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
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

    const filteredTasks = sortStudentHallTasks(tasks.filter(task => {
        if (filter === "all") return true;
        if (filter === "in_progress") {
            return isTaskOngoing(task);
        }
        if (filter === "submitted") return task.status === "submitted";
        if (filter === "graded") return task.status === "graded";
        return true;
    }));

    const hallMetrics = useMemo(() => {
        const actionable = tasks.filter(isTaskActionable).length;
        const ongoing = tasks.filter(isTaskOngoing).length;
        const submitted = tasks.filter((t) => t.status === "submitted").length;
        const gradedTasks = tasks.filter((t) => t.status === "graded");
        const scored = gradedTasks.filter((t) => typeof t.score === "number" && Number.isFinite(t.score));
        const avgScore = scored.length > 0
            ? (scored.reduce((acc, item) => acc + (item.score ?? 0), 0) / scored.length).toFixed(1)
            : "—";
        return { actionable, ongoing, submitted, gradedCount: gradedTasks.length, avgScore };
    }, [tasks]);

    const spotlightTask = useMemo(() => getNextActionableTask(tasks), [tasks]);

    if (loading) {
        return <LoadingStatus className="py-24" iconClassName="h-10 w-10" label="正在加载商业统计实验任务" />;
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-page-title font-medium text-foreground">商业调研实验大厅</h1>
                    <p className="mt-1 text-label text-muted-foreground">
                        完整体验「商业问卷设计 → 首轮试投 → 回收质检诊断 → 抽样调优二轮投放 → 商务决策报告」五阶段闭环（UTC+8）
                    </p>
                </div>
                {latestAnnouncement && (
                    <div className="flex items-center gap-2.5 rounded-pill border border-border bg-muted py-1.5 pr-2 pl-3.5">
                        <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span className="max-w-xs truncate text-meta font-medium text-foreground">{latestAnnouncement.title}</span>
                        {announcements.length > 1 && (
                            <span className="rounded-pill bg-card px-2 py-0.5 text-meta tabular-nums text-muted-foreground">
                                共 {announcements.length} 条
                            </span>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-meta font-medium text-primary hover:bg-primary-muted hover:text-primary"
                            onClick={() => {
                                setSelectedAnnouncement(latestAnnouncement);
                                setShowAnnouncements(true);
                            }}
                        >
                            查看公告
                        </Button>
                    </div>
                )}
            </div>

            {tasks.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3.5" data-testid="student-hall-kpis">
                    <KpiStatCard
                        label="可执行调研课题"
                        value={hallMetrics.actionable}
                        hint={hallMetrics.ongoing > 0 ? `其中 ${hallMetrics.ongoing} 项正在推进` : "点击课题卡片立项启动"}
                        icon={BriefcaseBusiness}
                        intent="neutral"
                    />
                    <KpiStatCard
                        label="待教师批改"
                        value={hallMetrics.submitted}
                        hint="已完成多轮投放并冻结快照"
                        icon={Layers}
                        intent="neutral"
                    />
                    <KpiStatCard
                        label="已获评结项"
                        value={hallMetrics.gradedCount}
                        hint="可随时复盘历史实验快照"
                        icon={CheckCircle2}
                        intent="neutral"
                    />
                    <KpiStatCard
                        label="已结项平均分"
                        value={hallMetrics.avgScore}
                        hint="综合问卷、抽样闭环与报告"
                        icon={Trophy}
                        intent="neutral"
                    />
                </div>
            )}

            {spotlightTask && (
                <section
                    aria-label="当前优先推进课题"
                    className={`flex flex-wrap items-center justify-between gap-5 rounded-surface border px-5 py-4 ${
                        spotlightTask.status === "rejected"
                            ? "border-destructive-border bg-card"
                            : "border-border bg-muted"
                    }`}
                    data-testid="student-hall-spotlight"
                >
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            {spotlightTask.status === "rejected" ? (
                                <StatusBadge intent="destructive">需按退回意见重调</StatusBadge>
                            ) : (
                                <span className="rounded-pill bg-accent px-3 py-0.5 text-meta font-medium text-accent-foreground">
                                    推荐优先推进
                                </span>
                            )}
                            {(spotlightTask.status === "in_progress" || spotlightTask.status === "rejected") && spotlightTask.currentStage >= 1 && spotlightTask.currentStage <= 5 && (
                                <span className={`text-meta font-medium ${spotlightTask.status === "rejected" ? "text-destructive" : "text-muted-foreground"}`}>
                                    当前位于第 {spotlightTask.currentStage} 阶段 · {stageNames[spotlightTask.currentStage - 1]}
                                </span>
                            )}
                        </div>
                        <h2 className="text-section-title font-medium text-foreground">{spotlightTask.name}</h2>
                        {spotlightTask.status === "rejected" && spotlightTask.rejectReason ? (
                            <p className="text-label leading-relaxed text-destructive" data-testid="student-hall-spotlight-rejection">
                                <span className="font-medium">教师退回意见：</span>
                                {spotlightTask.rejectReason}
                            </p>
                        ) : (
                            <p className="line-clamp-2 text-label text-muted-foreground">
                                {spotlightTask.description
                                    ? getRichTextPlainText(spotlightTask.description)
                                    : "从立项任务书出发设计商业问卷并开展首轮试投，根据回收质检偏差调优二轮正式抽样策略。"}
                            </p>
                        )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                        <Button asChild variant="outline">
                            <Link to={`/task/${spotlightTask.id}`}>课题任务书</Link>
                        </Button>
                        {spotlightTask.status === "rejected" && (
                            <Button asChild variant="outline">
                                <Link to={`/task/${spotlightTask.id}/result`}>查看批改详情</Link>
                            </Button>
                        )}
                        <Button asChild variant="default">
                            <Link to={spotlightTask.status === "not_started" ? `/task/${spotlightTask.id}` : `/task/${spotlightTask.id}/experiment`}>
                                {spotlightTask.status === "not_started"
                                    ? "查看并启动调研"
                                    : spotlightTask.status === "rejected"
                                        ? "按意见重新调优"
                                        : "继续实验工作台"}
                                <ChevronRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                </section>
            )}

            {/* Filter Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
                <h2 className="text-section-title font-medium text-foreground">
                    全部商业统计课题
                </h2>
                <div className="flex rounded-pill border border-border bg-muted p-1">
                    <button
                        type="button"
                        onClick={() => setFilter("all")}
                        data-testid="student-filter-all"
                        aria-pressed={filter === "all"}
                        className={`rounded-pill px-4 py-1.5 text-label font-medium transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === "all" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        全部 <span className="text-meta tabular-nums">({tasks.length})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilter("in_progress")}
                        data-testid="student-filter-in-progress"
                        aria-pressed={filter === "in_progress"}
                        className={`rounded-pill px-4 py-1.5 text-label font-medium transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === "in_progress" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        进行中 <span className="text-meta tabular-nums">({hallMetrics.ongoing})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilter("submitted")}
                        data-testid="student-filter-submitted"
                        aria-pressed={filter === "submitted"}
                        className={`rounded-pill px-4 py-1.5 text-label font-medium transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === "submitted" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        已提交 <span className="text-meta tabular-nums">({hallMetrics.submitted})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilter("graded")}
                        data-testid="student-filter-graded"
                        aria-pressed={filter === "graded"}
                        className={`rounded-pill px-4 py-1.5 text-label font-medium transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === "graded" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        已批改 <span className="text-meta tabular-nums">({hallMetrics.gradedCount})</span>
                    </button>
                </div>
            </div>

            {/* Task Grid */}
            <div className="grid min-h-[280px] grid-cols-[repeat(auto-fill,minmax(min(100%,21rem),1fr))] gap-5" data-testid="student-task-grid">
                {taskError ? (
                    <div className="col-span-full flex flex-col items-center justify-center rounded-surface border border-destructive-border bg-card py-16">
                        <IconTile intent="destructive" className="mb-3">
                            <AlertCircle className="h-5 w-5" aria-hidden="true" />
                        </IconTile>
                        <p className="text-subheading font-medium text-foreground">任务加载失败</p>
                        <p className="mt-1 text-label text-muted-foreground">请检查网络连接后重试</p>
                        <Button variant="outline" size="sm" className="mt-4" onClick={() => loadTasks()}>
                            重试
                        </Button>
                    </div>
                ) : filteredTasks.length > 0 ? (
                    filteredTasks.map(task => (
                        <TaskCard key={task.id} task={task} />
                    ))
                ) : (
                    <div className="col-span-full flex flex-col items-center justify-center rounded-surface border border-dashed border-border bg-card py-16">
                        <IconTile intent="neutral" className="mb-3">
                            <BookOpen className="h-5 w-5" aria-hidden="true" />
                        </IconTile>
                        <p className="text-subheading font-medium text-foreground">
                            {filter === "all" ? "暂无相关任务" : "当前筛选条件下暂无课题"}
                        </p>
                        <p className="mt-1 text-label text-muted-foreground">
                            {filter === "all" ? "新任务或状态变更会显示在这里" : "可切换回全部课题查看其他待立项或已开放任务"}
                        </p>
                        {filter !== "all" && tasks.length > 0 && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-4"
                                onClick={() => setFilter("all")}
                                data-testid="student-filter-reset"
                            >
                                查看全部课题（{tasks.length}）
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <Dialog open={showAnnouncements} onOpenChange={setShowAnnouncements}>
                <DialogContent className="max-w-2xl border-border bg-card text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-section-title font-medium text-foreground">
                            系统公告
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">实验室通知与实验学习指引（共 {announcements.length} 条）</DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 grid min-h-[380px] grid-cols-2 gap-5">
                        <div
                            role="region"
                            tabIndex={0}
                            aria-label="公告列表"
                            className="custom-scrollbar max-h-[380px] space-y-2 overflow-y-auto rounded-control border-r border-border p-1 pr-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {announcements.length === 0 && (
                                <div className="py-12 text-center text-label text-muted-foreground">暂无公告</div>
                            )}
                            {announcements.map((announcement) => {
                                const isSelected = selectedAnnouncement?.id === announcement.id;
                                return (
                                    <button
                                        key={announcement.id}
                                        type="button"
                                        className={`w-full rounded-surface border p-3.5 text-left transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                            isSelected
                                                ? "border-transparent bg-accent text-accent-foreground"
                                                : "border-border bg-card text-foreground hover:bg-muted"
                                        }`}
                                        onClick={() => handleOpenAnnouncement(announcement)}
                                    >
                                        <div className="line-clamp-2 text-label font-medium">
                                            {announcement.title}
                                        </div>
                                        <div className={`mt-1.5 text-meta tabular-nums ${isSelected ? "text-accent-foreground" : "text-muted-foreground"}`}>
                                            {new Date(announcement.createdAt).toLocaleString("zh-CN", {
                                                timeZone: "Asia/Shanghai",
                                                month: "2-digit",
                                                day: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div
                            role="region"
                            tabIndex={0}
                            aria-label="公告详情"
                            className="custom-scrollbar max-h-[380px] overflow-y-auto rounded-control pr-2 pl-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {selectedAnnouncement ? (
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-subheading font-medium leading-snug text-foreground">{selectedAnnouncement.title}</h3>
                                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-muted px-2.5 py-0.5 text-meta tabular-nums text-muted-foreground">
                                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                            {new Date(selectedAnnouncement.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                                        </div>
                                    </div>
                                    <div className="h-px w-full bg-border" />
                                    <RichTextContent
                                        html={selectedAnnouncement.content}
                                        className="text-label leading-relaxed text-foreground"
                                    />
                                </div>
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center space-y-2 text-muted-foreground">
                                    <FileText className="h-10 w-10 stroke-1" aria-hidden="true" />
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

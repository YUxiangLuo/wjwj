import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
    LayoutDashboard, FileText, FlaskConical, CheckCircle,
    ChevronRight, Clock, AlertCircle, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { tasksApi, announcementsApi, type StudentTask, type TaskStatus, type Announcement } from "../api-client";

// Re-export types for compatibility
export type { TaskStatus, StudentTask };

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];

const statusConfig: Record<TaskStatus, { label: string; color: string }> = {
    not_started: { label: "未开始", color: "bg-slate-100 text-slate-700" },
    in_progress: { label: "进行中", color: "bg-blue-100 text-blue-700" },
    submitted: { label: "已提交", color: "bg-amber-100 text-amber-700" },
    grading: { label: "批改中", color: "bg-orange-100 text-orange-700" },
    graded: { label: "已批改", color: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "被驳回", color: "bg-red-100 text-red-700" },
};

function parseDeadline(deadline: string | null): Date | null {
    if (!deadline) return null;
    const withTime = deadline.includes("T") ? deadline : `${deadline}T23:59:00`;
    const parsed = new Date(withTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRemainingMs(deadline: string | null): number | null {
    const end = parseDeadline(deadline);
    if (!end) return null;
    return end.getTime() - Date.now();
}

function isDeadlinePassed(deadline: string | null) {
    const remaining = getRemainingMs(deadline);
    if (remaining === null) return false;
    return remaining <= 0;
}

function DeadlineDisplay({ deadline, status }: { deadline: string | null; status: TaskStatus }) {
    if (!deadline) return null;
    if (status === "graded") return null;

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
            <span className="text-sm text-red-500 font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                还剩 {hours} 小时 {minutes} 分钟
            </span>
        );
    }

    if (remainingMs <= 7 * dayMs) {
        const days = Math.floor(remainingMs / dayMs);
        const hours = Math.floor((remainingMs % dayMs) / hourMs);
        return (
            <span className="text-sm text-amber-600 font-medium flex items-center gap-1">
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
    const status = statusConfig[task.status];
    const deadlinePassed = isDeadlinePassed(task.deadline);

    const getActionButton = () => {
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
    const disabled = deadlinePassed && ["not_started", "in_progress", "rejected"].includes(task.status);
    const showHistory = ["submitted", "grading", "graded", "rejected"].includes(task.status);

    return (
        <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-lg line-clamp-1">{task.name}</CardTitle>
                    <Badge className={status.color}>{status.label}</Badge>
                </div>
                <CardDescription className="line-clamp-2">
                    {task.description}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {/* Progress */}
                    {task.status !== "graded" && task.status !== "rejected" && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">实验进度</span>
                                <span>{task.progress}%</span>
                            </div>
                            <Progress value={task.progress} className="h-2" />
                            {task.currentStage > 0 && task.currentStage < 4 && (
                                <p className="text-xs text-muted-foreground">
                                    当前阶段：{stageNames[task.currentStage - 1]}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Score display */}
                    {task.status === "graded" && task.score !== undefined && (
                        <div className="flex items-center gap-2 py-2">
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                            <span className="font-medium text-lg">{task.score} 分</span>
                        </div>
                    )}

                    {/* Reject reason */}
                    {task.status === "rejected" && task.rejectReason && (
                        <div className="p-2 bg-red-50 rounded text-sm text-red-700 line-clamp-2">
                            驳回理由：{task.rejectReason}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-sm text-muted-foreground">
                            截止：{task.deadline || "无"}
                        </span>
                        <DeadlineDisplay deadline={task.deadline} status={task.status} />
                    </div>

                    {/* Action button */}
                    <Link to={`/task/${task.id}`} className={`w-full ${disabled ? "pointer-events-none" : ""}`}>
                        <Button
                            className="w-full"
                            variant={action.variant}
                            disabled={disabled}
                        >
                            {action.text}
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </Link>
                    {showHistory && (
                        <Link to={`/task/${task.id}/history`} className="w-full">
                            <Button className="w-full" variant="outline" size="sm">
                                历史记录
                            </Button>
                        </Link>
                    )}
                    {disabled && (
                        <div className="text-xs text-muted-foreground text-center">已截止，无法继续操作</div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

type FilterType = "all" | "in_progress" | "completed";

export function TaskHall() {
    const [tasks, setTasks] = useState<StudentTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>("all");
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [showAnnouncements, setShowAnnouncements] = useState(false);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

    // 加载任务列表
    useEffect(() => {
        async function loadTasks() {
            setLoading(true);
            try {
                const res = await tasksApi.list();
                if (res.success && res.data) {
                    setTasks(res.data);
                }
            } catch (error) {
                console.error("Failed to load tasks:", error);
            } finally {
                setLoading(false);
            }
        }
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
            return ["not_started", "in_progress", "submitted", "grading", "rejected"].includes(task.status);
        }
        if (filter === "completed") return task.status === "graded";
        return true;
    });

    // Calculate stats
    const inProgressCount = tasks.filter(t =>
        ["not_started", "in_progress", "submitted", "grading", "rejected"].includes(t.status)
    ).length;
    const completedCount = tasks.filter(t => t.status === "graded").length;
    const averageScore = tasks
        .filter(t => t.status === "graded" && t.score !== undefined)
        .reduce((acc, t, _, arr) => acc + (t.score || 0) / arr.length, 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {latestUnread && (
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="py-4 flex items-center justify-between gap-4">
                        <div>
                            <div className="text-sm text-amber-700 font-medium">最新公告</div>
                            <div className="text-sm text-amber-800 mt-1 line-clamp-1">{latestUnread.title}</div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setShowAnnouncements(true)}>
                            查看全部 ({unreadAnnouncements.length})
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-100 rounded-lg">
                                <FlaskConical className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{inProgressCount}</p>
                                <p className="text-sm text-muted-foreground">进行中的实验</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-100 rounded-lg">
                                <CheckCircle className="w-6 h-6 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{completedCount}</p>
                                <p className="text-sm text-muted-foreground">已完成实验</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-amber-100 rounded-lg">
                                <FileText className="w-6 h-6 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{averageScore.toFixed(0) || "-"}</p>
                                <p className="text-sm text-muted-foreground">平均得分</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Header */}
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">我的任务</h3>
                <div className="flex gap-2">
                    <Button
                        variant={filter === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilter("all")}
                    >
                        全部 ({tasks.length})
                    </Button>
                    <Button
                        variant={filter === "in_progress" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilter("in_progress")}
                    >
                        进行中 ({inProgressCount})
                    </Button>
                    <Button
                        variant={filter === "completed" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilter("completed")}
                    >
                        已完成 ({completedCount})
                    </Button>
                </div>
            </div>

            {/* Task Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTasks.map(task => (
                    <TaskCard key={task.id} task={task} />
                ))}
            </div>

            {/* Empty State */}
            {filteredTasks.length === 0 && (
                <div className="text-center py-12">
                    <LayoutDashboard className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                    <p className="text-muted-foreground">暂无任务</p>
                </div>
            )}

            <Dialog open={showAnnouncements} onOpenChange={setShowAnnouncements}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>公告</DialogTitle>
                        <DialogDescription>查看最新系统公告</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                            {announcements.length === 0 && (
                                <div className="text-sm text-muted-foreground text-center py-8">暂无公告</div>
                            )}
                            {announcements.map((announcement) => (
                                <button
                                    key={announcement.id}
                                    className={`w-full text-left p-3 rounded-lg border transition-colors ${announcement.isRead ? "bg-white" : "bg-amber-50"}`}
                                    onClick={() => handleOpenAnnouncement(announcement)}
                                >
                                    <div className="text-sm font-medium line-clamp-1">
                                        {announcement.title}
                                        {!announcement.isRead && <span className="ml-2 text-xs text-amber-600">未读</span>}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        {new Date(announcement.createdAt).toLocaleString("zh-CN", {
                                            month: "2-digit",
                                            day: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <div className="border rounded-lg p-4 max-h-[60vh] overflow-y-auto">
                            {selectedAnnouncement ? (
                                <div className="space-y-3">
                                    <div className="text-base font-semibold">{selectedAnnouncement.title}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {new Date(selectedAnnouncement.createdAt).toLocaleString("zh-CN", {
                                            year: "numeric",
                                            month: "2-digit",
                                            day: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </div>
                                    <div className="text-sm text-muted-foreground whitespace-pre-line">
                                        {selectedAnnouncement.content}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground text-center py-12">请选择一条公告查看详情</div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default TaskHall;

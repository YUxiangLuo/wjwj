import { useState } from "react";
import {
    LayoutDashboard, FileText, FlaskConical, CheckCircle,
    ChevronRight, Clock, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// Types
export type TaskStatus = "not_started" | "in_progress" | "submitted" | "grading" | "graded" | "rejected";

export interface StudentTask {
    id: number;
    topicId: number;
    name: string;
    description: string;
    publishedAt: string;
    deadline: string | null;
    status: TaskStatus;
    progress: number;
    currentStage: number;
    score?: number;
    rejectReason?: string;
}

// Mock data
const mockTasks: StudentTask[] = [
    {
        id: 1,
        topicId: 101,
        name: "消费者行为调研",
        description: "通过问卷调查了解消费者的购物决策过程和影响因素，分析不同人群的消费偏好差异。",
        publishedAt: "2024-03-01",
        deadline: "2024-04-15",
        status: "in_progress",
        progress: 50,
        currentStage: 2,
    },
    {
        id: 2,
        topicId: 102,
        name: "医疗可及性调查",
        description: "研究不同地区居民获取医疗服务的便利程度，包括就医距离、等待时间等因素。",
        publishedAt: "2024-03-10",
        deadline: "2024-04-20",
        status: "not_started",
        progress: 0,
        currentStage: 0,
    },
    {
        id: 3,
        topicId: 103,
        name: "教育资源分布研究",
        description: "调查城乡教育资源配置差异及其对学生发展的影响，为教育公平政策提供数据支持。",
        publishedAt: "2024-02-15",
        deadline: "2024-03-30",
        status: "graded",
        progress: 100,
        currentStage: 4,
        score: 87,
    },
    {
        id: 4,
        topicId: 104,
        name: "居民出行方式调查",
        description: "分析城市居民日常出行方式选择及影响因素。",
        publishedAt: "2024-03-15",
        deadline: "2024-04-25",
        status: "submitted",
        progress: 100,
        currentStage: 4,
    },
    {
        id: 5,
        topicId: 105,
        name: "环境意识调查",
        description: "调查公众对环境问题的认知和态度。",
        publishedAt: "2024-02-20",
        deadline: "2024-03-25",
        status: "rejected",
        progress: 100,
        currentStage: 4,
        rejectReason: "报告分析不够深入，缺少对抽样方法的比较分析。",
    },
];

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];

const statusConfig: Record<TaskStatus, { label: string; color: string }> = {
    not_started: { label: "未开始", color: "bg-slate-100 text-slate-700" },
    in_progress: { label: "进行中", color: "bg-blue-100 text-blue-700" },
    submitted: { label: "已提交", color: "bg-amber-100 text-amber-700" },
    grading: { label: "批改中", color: "bg-orange-100 text-orange-700" },
    graded: { label: "已批改", color: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "被驳回", color: "bg-red-100 text-red-700" },
};

function getDaysRemaining(deadline: string | null): number | null {
    if (!deadline) return null;
    const now = new Date();
    const end = new Date(deadline);
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
}

function DeadlineDisplay({ deadline, status }: { deadline: string | null; status: TaskStatus }) {
    if (!deadline) return null;
    if (status === "graded") return null;

    const daysRemaining = getDaysRemaining(deadline);
    if (daysRemaining === null) return null;

    if (daysRemaining <= 0) {
        return <span className="text-sm text-slate-500">已截止</span>;
    }

    if (daysRemaining <= 1) {
        return (
            <span className="text-sm text-red-500 font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                还剩 {daysRemaining * 24} 小时
            </span>
        );
    }

    if (daysRemaining <= 7) {
        return (
            <span className="text-sm text-amber-600 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                还剩 {daysRemaining} 天
            </span>
        );
    }

    return <span className="text-sm text-muted-foreground">还剩 {daysRemaining} 天</span>;
}

interface TaskCardProps {
    task: StudentTask;
    onSelect: (task: StudentTask) => void;
}

function TaskCard({ task, onSelect }: TaskCardProps) {
    const status = statusConfig[task.status];

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
                    <Button
                        className="w-full"
                        variant={action.variant}
                        onClick={() => onSelect(task)}
                    >
                        {action.text}
                        <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

type FilterType = "all" | "in_progress" | "completed";

interface TaskHallProps {
    onSelectTask: (task: StudentTask) => void;
}

export function TaskHall({ onSelectTask }: TaskHallProps) {
    const [filter, setFilter] = useState<FilterType>("all");

    const filteredTasks = mockTasks.filter(task => {
        if (filter === "all") return true;
        if (filter === "in_progress") {
            return ["not_started", "in_progress", "submitted", "grading", "rejected"].includes(task.status);
        }
        if (filter === "completed") return task.status === "graded";
        return true;
    });

    // Calculate stats
    const inProgressCount = mockTasks.filter(t =>
        ["not_started", "in_progress", "submitted", "grading", "rejected"].includes(t.status)
    ).length;
    const completedCount = mockTasks.filter(t => t.status === "graded").length;
    const averageScore = mockTasks
        .filter(t => t.status === "graded" && t.score !== undefined)
        .reduce((acc, t, _, arr) => acc + (t.score || 0) / arr.length, 0);

    return (
        <div className="space-y-6">
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
                        全部 ({mockTasks.length})
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
                    <TaskCard key={task.id} task={task} onSelect={onSelectTask} />
                ))}
            </div>

            {/* Empty State */}
            {filteredTasks.length === 0 && (
                <div className="text-center py-12">
                    <LayoutDashboard className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                    <p className="text-muted-foreground">暂无任务</p>
                </div>
            )}
        </div>
    );
}

export default TaskHall;

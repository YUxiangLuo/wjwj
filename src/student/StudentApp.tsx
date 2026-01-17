import { useState } from "react";
import {
    LayoutDashboard, FileText, FlaskConical, CheckCircle,
    Bell, User, LogOut, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import "./student.css";

// Types
type TaskStatus = "not_started" | "in_progress" | "submitted" | "grading" | "graded" | "rejected";

interface Task {
    id: number;
    name: string;
    description: string;
    deadline: string;
    status: TaskStatus;
    progress: number;
    stage: number;
    score?: number;
}

// Mock data for tasks
const mockTasks: Task[] = [
    {
        id: 1,
        name: "消费者行为调研",
        description: "通过问卷调查了解消费者的购物决策过程和影响因素...",
        deadline: "2024-04-15",
        status: "in_progress",
        progress: 50,
        stage: 2,
    },
    {
        id: 2,
        name: "医疗可及性调查",
        description: "研究不同地区居民获取医疗服务的便利程度...",
        deadline: "2024-04-20",
        status: "not_started",
        progress: 0,
        stage: 0,
    },
    {
        id: 3,
        name: "教育资源分布研究",
        description: "调查城乡教育资源配置差异及其对学生发展的影响...",
        deadline: "2024-03-30",
        status: "graded",
        progress: 100,
        stage: 4,
        score: 87,
    },
];

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];

const statusConfig = {
    not_started: { label: "未开始", color: "bg-slate-100 text-slate-700" },
    in_progress: { label: "进行中", color: "bg-blue-100 text-blue-700" },
    submitted: { label: "已提交", color: "bg-amber-100 text-amber-700" },
    grading: { label: "批改中", color: "bg-orange-100 text-orange-700" },
    graded: { label: "已批改", color: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "被驳回", color: "bg-red-100 text-red-700" },
};

function getDaysRemaining(deadline: string) {
    const now = new Date();
    const end = new Date(deadline);
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
}

function TaskCard({ task }: { task: Task }) {
    const daysRemaining = getDaysRemaining(task.deadline);
    const status = statusConfig[task.status];

    return (
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{task.name}</CardTitle>
                    <Badge className={status.color}>{status.label}</Badge>
                </div>
                <CardDescription className="line-clamp-2">
                    {task.description}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {task.status !== "graded" && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">实验进度</span>
                                <span>{task.progress}%</span>
                            </div>
                            <Progress value={task.progress} className="h-2" />
                            {task.stage > 0 && task.stage < 4 && (
                                <p className="text-xs text-muted-foreground">
                                    当前阶段：{stageNames[task.stage - 1]}
                                </p>
                            )}
                        </div>
                    )}

                    {task.status === "graded" && (
                        <div className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-emerald-500" />
                            <span className="font-medium">得分：{task.score} 分</span>
                        </div>
                    )}

                    <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-sm text-muted-foreground">
                            截止：{task.deadline}
                        </span>
                        {daysRemaining > 0 ? (
                            <span className={`text-sm ${daysRemaining <= 3 ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                                还剩 {daysRemaining} 天
                            </span>
                        ) : task.status !== "graded" && (
                            <span className="text-sm text-slate-500">已截止</span>
                        )}
                    </div>

                    <Button className="w-full" variant={task.status === "graded" ? "outline" : "default"}>
                        {task.status === "not_started" && "开始实验"}
                        {task.status === "in_progress" && "继续实验"}
                        {task.status === "submitted" && "查看提交"}
                        {task.status === "grading" && "查看提交"}
                        {task.status === "graded" && "查看成绩"}
                        {task.status === "rejected" && "重新开始"}
                        <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

export function StudentApp() {
    const [filter, setFilter] = useState<"all" | "in_progress" | "completed">("all");

    const filteredTasks = mockTasks.filter(task => {
        if (filter === "all") return true;
        if (filter === "in_progress") return ["not_started", "in_progress", "submitted", "grading", "rejected"].includes(task.status);
        if (filter === "completed") return task.status === "graded";
        return true;
    });

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-semibold text-slate-800">抽样统计虚拟仿真系统</h1>
                        <p className="text-sm text-muted-foreground">学生端</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="w-5 h-5" />
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                                2
                            </span>
                        </Button>
                        <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                                <AvatarFallback className="bg-primary/10 text-primary text-sm">张</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">张明</span>
                        </div>
                        <Button variant="ghost" size="icon">
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
                {/* Welcome Section */}
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-slate-800">你好，张明 👋</h2>
                    <p className="text-muted-foreground mt-1">欢迎回来，继续你的实验之旅吧</p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-100 rounded-lg">
                                    <FlaskConical className="w-6 h-6 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">2</p>
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
                                    <p className="text-2xl font-bold">1</p>
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
                                    <p className="text-2xl font-bold">87</p>
                                    <p className="text-sm text-muted-foreground">平均得分</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Task List Header */}
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-semibold">我的任务</h3>
                    <div className="flex gap-2">
                        <Button
                            variant={filter === "all" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setFilter("all")}
                        >
                            全部
                        </Button>
                        <Button
                            variant={filter === "in_progress" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setFilter("in_progress")}
                        >
                            进行中
                        </Button>
                        <Button
                            variant={filter === "completed" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setFilter("completed")}
                        >
                            已完成
                        </Button>
                    </div>
                </div>

                {/* Task Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredTasks.map(task => (
                        <TaskCard key={task.id} task={task} />
                    ))}
                </div>

                {filteredTasks.length === 0 && (
                    <div className="text-center py-12">
                        <LayoutDashboard className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                        <p className="text-muted-foreground">暂无任务</p>
                    </div>
                )}
            </main>
        </div>
    );
}

export default StudentApp;

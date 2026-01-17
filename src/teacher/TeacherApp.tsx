import { useState } from "react";
import {
    LayoutDashboard, School, BookOpen, ClipboardList, PenLine, Users, Download, Bell, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "./teacher.css";

const menuItems = [
    { id: "dashboard", label: "首页概览", icon: LayoutDashboard },
    { id: "class", label: "班级管理", icon: School },
    { id: "topic", label: "课题管理", icon: BookOpen },
    { id: "task", label: "任务管理", icon: ClipboardList },
    { id: "grading", label: "作业批改", icon: PenLine, badge: 12 },
    { id: "assistant", label: "助教管理", icon: Users },
    { id: "export", label: "成绩导出", icon: Download },
];

const pageTitles: Record<string, string> = {
    dashboard: "首页概览",
    class: "班级管理",
    topic: "课题管理",
    task: "任务管理",
    grading: "作业批改",
    assistant: "助教管理",
    export: "成绩导出",
};

function Dashboard() {
    const stats = [
        { label: "我的班级", value: 3, icon: School, color: "bg-blue-500" },
        { label: "我的课题", value: 5, icon: BookOpen, color: "bg-emerald-500" },
        { label: "待批改作业", value: 12, icon: PenLine, color: "bg-destructive", highlight: true },
        { label: "进行中任务", value: 4, icon: ClipboardList, color: "bg-amber-500" },
    ];

    const recentSubmissions = [
        { student: "张明", class: "统计学2024-1班", topic: "消费者调研", time: "10分钟前" },
        { student: "李华", class: "统计学2024-1班", topic: "消费者调研", time: "25分钟前" },
        { student: "王芳", class: "统计学2024-2班", topic: "市场分析", time: "1小时前" },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={stat.label} className={`cursor-pointer hover:shadow-md transition-shadow ${stat.highlight ? "ring-2 ring-destructive/20" : ""}`}>
                            <CardContent className="pt-5">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm text-muted-foreground">{stat.label}</span>
                                    <span className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center text-white`}>
                                        <Icon className="w-5 h-5" />
                                    </span>
                                </div>
                                <div className={`text-3xl font-bold ${stat.highlight ? "text-destructive" : "text-foreground"}`}>{stat.value}</div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">快捷入口</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-3">
                    <Button variant="destructive">
                        <PenLine className="w-4 h-4" />
                        进入批改
                        <Badge variant="secondary" className="ml-2 bg-white/20">12</Badge>
                    </Button>
                    <Button>+ 创建新课题</Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">最近提交</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {recentSubmissions.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <div className="flex items-center gap-3">
                                <Avatar className="w-8 h-8">
                                    <AvatarFallback className="bg-accent text-accent-foreground text-sm">{item.student[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="text-sm font-medium text-foreground">{item.student}</div>
                                    <div className="text-xs text-muted-foreground">{item.class} · {item.topic}</div>
                                </div>
                            </div>
                            <span className="text-xs text-muted-foreground">{item.time}</span>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

function ClassManagement() {
    const classes = [
        { id: 1, name: "统计学2024-1班", semester: "2024-Spring", studentCount: 45, createdAt: "2024-02-01" },
        { id: 2, name: "统计学2024-2班", semester: "2024-Spring", studentCount: 42, createdAt: "2024-02-01" },
        { id: 3, name: "统计学2024-3班", semester: "2024-Spring", studentCount: 38, createdAt: "2024-02-15" },
    ];

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">班级列表</CardTitle>
                <Select defaultValue="2024-Spring">
                    <SelectTrigger className="w-36">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="2024-Spring">2024-Spring</SelectItem>
                        <SelectItem value="2023-Fall">2023-Fall</SelectItem>
                    </SelectContent>
                </Select>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>班级名称</TableHead>
                            <TableHead>学期</TableHead>
                            <TableHead>学生人数</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead>操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {classes.map((cls) => (
                            <TableRow key={cls.id}>
                                <TableCell className="font-medium">{cls.name}</TableCell>
                                <TableCell>{cls.semester}</TableCell>
                                <TableCell>{cls.studentCount}人</TableCell>
                                <TableCell className="text-muted-foreground">{cls.createdAt}</TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" className="text-primary">管理学生</Button>
                                        <Button variant="ghost" size="sm">查看详情</Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

function TopicManagement() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const topics = [
        { id: 1, name: "消费者行为调研", status: "published", dataRows: 10000, attachments: 3, createdAt: "2024-03-01" },
        { id: 2, name: "市场竞争分析", status: "published", dataRows: 8500, attachments: 2, createdAt: "2024-03-10" },
        { id: 3, name: "用户满意度调查", status: "draft", dataRows: 0, attachments: 0, createdAt: "2024-03-15" },
    ];

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">课题列表</CardTitle>
                <div className="flex gap-3">
                    <Select defaultValue="all">
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部状态</SelectItem>
                            <SelectItem value="draft">草稿</SelectItem>
                            <SelectItem value="published">已发布</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button onClick={() => setShowCreateModal(true)}>+ 创建课题</Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {topics.map((topic) => (
                    <div key={topic.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                                <BookOpen className="w-5 h-5 text-primary" />
                                <div>
                                    <h4 className="font-medium text-foreground">{topic.name}</h4>
                                    <div className="text-xs text-muted-foreground mt-1">创建于 {topic.createdAt}</div>
                                </div>
                            </div>
                            {topic.status === "published" ? (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">已发布</Badge>
                            ) : (
                                <Badge variant="secondary">草稿</Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                            <span>数据行数：{topic.dataRows > 0 ? topic.dataRows.toLocaleString() : "未上传"}</span>
                            <span>附件：{topic.attachments}个</span>
                        </div>
                        <div className="flex gap-2">
                            {topic.status === "draft" ? (
                                <>
                                    <Button variant="ghost" size="sm" className="text-primary">编辑</Button>
                                    <Button variant="ghost" size="sm" className="text-emerald-600">发布</Button>
                                    <Button variant="ghost" size="sm" className="text-destructive">删除</Button>
                                </>
                            ) : (
                                <>
                                    <Button variant="ghost" size="sm" className="text-primary">查看</Button>
                                    <Button variant="ghost" size="sm">编辑</Button>
                                    <Button variant="ghost" size="sm" className="text-blue-500">复制</Button>
                                    <Button variant="ghost" size="sm" className="text-destructive">删除</Button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </CardContent>

            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>创建新课题</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex items-center gap-2 mb-6">
                            {["基本信息", "上传数据", "字段映射", "辅助资料", "推荐题目", "评分权重"].map((step, idx) => (
                                <div key={step} className="flex items-center">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${idx === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                                        {idx + 1}
                                    </div>
                                    <span className={`text-xs ml-1 ${idx === 0 ? "text-primary font-medium" : "text-muted-foreground"}`}>{step}</span>
                                    {idx < 5 && <span className="mx-2 text-muted-foreground">→</span>}
                                </div>
                            ))}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="topicName">课题名称</Label>
                            <Input id="topicName" placeholder="请输入课题名称" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="topicDesc">背景描述</Label>
                            <Textarea id="topicDesc" placeholder="请输入课题背景描述" className="min-h-32 resize-none" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateModal(false)}>取消</Button>
                        <Button variant="outline">保存草稿</Button>
                        <Button>下一步</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

function TaskManagement() {
    const [showPublishModal, setShowPublishModal] = useState(false);
    const tasks = [
        { id: 1, topic: "消费者行为调研", class: "统计学2024-1班", publishedAt: "2024-03-01", deadline: "2024-03-31", completed: 32, total: 45, pending: 8 },
        { id: 2, topic: "消费者行为调研", class: "统计学2024-2班", publishedAt: "2024-03-01", deadline: "2024-03-31", completed: 28, total: 42, pending: 5 },
        { id: 3, topic: "市场竞争分析", class: "统计学2024-3班", publishedAt: "2024-03-10", deadline: "2024-04-10", completed: 15, total: 38, pending: 3 },
    ];

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">任务列表</CardTitle>
                <Button onClick={() => setShowPublishModal(true)}>+ 发布任务</Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>课题</TableHead>
                            <TableHead>班级</TableHead>
                            <TableHead>发布时间</TableHead>
                            <TableHead>截止时间</TableHead>
                            <TableHead>完成进度</TableHead>
                            <TableHead>待批改</TableHead>
                            <TableHead>操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tasks.map((task) => (
                            <TableRow key={task.id}>
                                <TableCell className="font-medium">{task.topic}</TableCell>
                                <TableCell>{task.class}</TableCell>
                                <TableCell className="text-muted-foreground">{task.publishedAt}</TableCell>
                                <TableCell className="text-muted-foreground">{task.deadline}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Progress value={(task.completed / task.total) * 100} className="w-16 h-2" />
                                        <span className="text-xs text-muted-foreground">{task.completed}/{task.total}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={task.pending > 0 ? "destructive" : "secondary"} className={task.pending > 0 ? "" : "bg-emerald-100 text-emerald-700"}>
                                        {task.pending}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" className="text-primary">查看进度</Button>
                                        <Button variant="ghost" size="sm">延长时间</Button>
                                        <Button variant="ghost" size="sm" className="text-destructive">进入批改</Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>

            <Dialog open={showPublishModal} onOpenChange={setShowPublishModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>发布任务</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>选择课题</Label>
                            <Select defaultValue="topic1">
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="topic1">消费者行为调研</SelectItem>
                                    <SelectItem value="topic2">市场竞争分析</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>选择班级</Label>
                            <div className="space-y-2">
                                {["统计学2024-1班", "统计学2024-2班", "统计学2024-3班"].map((cls) => (
                                    <label key={cls} className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" className="rounded border-input" /> {cls}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deadline">截止时间（可选）</Label>
                            <Input id="deadline" type="datetime-local" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPublishModal(false)}>取消</Button>
                        <Button>确认发布</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

function GradingManagement() {
    const submissions = [
        { id: 1, studentId: "2024001", name: "张明", topic: "消费者行为调研", class: "统计学2024-1班", submittedAt: "2024-03-15 14:30", status: "pending" },
        { id: 2, studentId: "2024002", name: "李华", topic: "消费者行为调研", class: "统计学2024-1班", submittedAt: "2024-03-15 10:20", status: "draft" },
        { id: 3, studentId: "2024003", name: "王芳", topic: "消费者行为调研", class: "统计学2024-2班", submittedAt: "2024-03-14 16:45", status: "graded", score: 85 },
        { id: 4, studentId: "2024004", name: "刘强", topic: "市场竞争分析", class: "统计学2024-3班", submittedAt: "2024-03-13 09:10", status: "rejected" },
    ];

    const getStatusBadge = (status: string, score?: number) => {
        switch (status) {
            case "pending": return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">待批改</Badge>;
            case "draft": return <Badge variant="secondary">批改草稿</Badge>;
            case "graded": return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">已批改 ({score}分)</Badge>;
            case "rejected": return <Badge variant="destructive">已驳回</Badge>;
            default: return null;
        }
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">作业批改</CardTitle>
                <div className="flex gap-3">
                    <Select defaultValue="all-class">
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all-class">全部班级</SelectItem>
                            <SelectItem value="class1">统计学2024-1班</SelectItem>
                            <SelectItem value="class2">统计学2024-2班</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select defaultValue="all-status">
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all-status">全部状态</SelectItem>
                            <SelectItem value="pending">待批改</SelectItem>
                            <SelectItem value="draft">批改草稿</SelectItem>
                            <SelectItem value="graded">已批改</SelectItem>
                            <SelectItem value="rejected">已驳回</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {submissions.map((sub) => (
                    <div key={sub.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <Avatar className="w-10 h-10">
                                    <AvatarFallback className="bg-accent text-accent-foreground">{sub.name[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-foreground">{sub.name}</span>
                                        <span className="text-xs text-muted-foreground">({sub.studentId})</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">{sub.class} · {sub.topic}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                {getStatusBadge(sub.status, sub.score)}
                                <div className="text-xs text-muted-foreground mt-1">{sub.submittedAt}</div>
                            </div>
                        </div>
                        <div className="flex justify-end mt-3">
                            {sub.status === "pending" && <Button size="sm">开始批改</Button>}
                            {sub.status === "draft" && <Button size="sm" className="bg-amber-500 hover:bg-amber-600">继续批改</Button>}
                            {(sub.status === "graded" || sub.status === "rejected") && <Button variant="outline" size="sm">查看详情</Button>}
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

function PlaceholderPage({ name }: { name: string }) {
    return (
        <Card className="flex flex-col items-center justify-center h-96">
            <CardContent className="text-center text-muted-foreground pt-6">
                <Settings className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <div className="text-lg">{name}页面开发中...</div>
            </CardContent>
        </Card>
    );
}

export function TeacherApp() {
    const [activePage, setActivePage] = useState("dashboard");

    const renderPage = () => {
        switch (activePage) {
            case "dashboard": return <Dashboard />;
            case "class": return <ClassManagement />;
            case "topic": return <TopicManagement />;
            case "task": return <TaskManagement />;
            case "grading": return <GradingManagement />;
            default: return <PlaceholderPage name={pageTitles[activePage] ?? activePage} />;
        }
    };

    return (
        <div className="flex min-h-screen bg-muted/40">
            <aside className="w-60 bg-slate-800 text-white flex flex-col shrink-0">
                <div className="p-6 border-b border-white/10">
                    <h1 className="text-lg font-semibold">抽样统计系统</h1>
                    <p className="text-xs text-white/70 mt-1">教师端</p>
                </div>

                <nav className="flex-1 py-4 overflow-y-auto">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <Button
                                key={item.id}
                                variant="ghost"
                                onClick={() => setActivePage(item.id)}
                                className={`w-full justify-start gap-3 px-6 py-3 h-auto rounded-none text-sm font-normal
                                    ${activePage === item.id
                                        ? "bg-primary/20 text-primary border-l-[3px] border-primary hover:bg-primary/30 hover:text-primary"
                                        : "text-white/70 hover:bg-white/10 hover:text-white border-l-[3px] border-transparent"
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{item.label}</span>
                                {item.badge && (
                                    <Badge variant="destructive" className="ml-auto text-xs px-2 py-0.5">{item.badge}</Badge>
                                )}
                            </Button>
                        );
                    })}
                </nav>

                <Separator className="bg-white/10" />

                <div className="p-4">
                    <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-primary text-primary-foreground text-sm">张</AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="text-sm font-medium">张老师</div>
                            <div className="text-xs text-white/70">T001</div>
                        </div>
                    </div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-background px-8 py-4 border-b flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-foreground">{pageTitles[activePage]}</h2>
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="sm" className="relative">
                            <Bell className="w-5 h-5" />
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-white text-xs rounded-full flex items-center justify-center">2</span>
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}
                        </span>
                    </div>
                </header>
                <div className="flex-1 p-8 overflow-y-auto">{renderPage()}</div>
            </main>
        </div>
    );
}

import { useState } from "react";
import {
    LayoutDashboard, Calendar, Users, GraduationCap, School, UserCheck,
    Activity, Megaphone, Settings, LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { SemesterManagement } from "./pages/SemesterManagement";
import { TeacherManagement } from "./pages/TeacherManagement";
import { ClassManagement } from "./pages/ClassManagement";
import { AssistantManagement } from "./pages/AssistantManagement";
import { StudentManagement } from "./pages/StudentManagement";
import { AnnouncementManagement } from "./pages/AnnouncementManagement";
import { SystemMonitor } from "./pages/SystemMonitor";
import { SystemSettings } from "./pages/SystemSettings";

const menuItems = [
    { id: "dashboard", label: "首页概览", icon: LayoutDashboard },
    { id: "semester", label: "学期管理", icon: Calendar },
    { id: "teacher", label: "教师管理", icon: Users },
    { id: "assistant", label: "助教管理", icon: UserCheck },
    { id: "class", label: "班级管理", icon: School },
    { id: "student", label: "学生管理", icon: GraduationCap },
    { id: "monitor", label: "系统监控", icon: Activity },
    { id: "announcement", label: "公告管理", icon: Megaphone },
    { id: "settings", label: "系统设置", icon: Settings },
];

const pageTitles: Record<string, string> = {
    dashboard: "首页概览",
    semester: "学期管理",
    teacher: "教师管理",
    assistant: "助教管理",
    class: "班级管理",
    student: "学生管理",
    monitor: "系统监控",
    announcement: "公告管理",
    settings: "系统设置",
};

const mockStats = {
    currentSemester: "2024-Spring",
    teacherCount: 12,
    classCount: 8,
    studentCount: 320,
    assistantCount: 6,
    todayActiveUsers: 45,
    todayLogins: 128,
    pendingItems: 3,
};

const mockMetrics = { cpu: 35, memory: 62, disk: 48 };

const mockAnnouncements = [
    { id: 1, title: "系统维护通知：本周六凌晨2点进行例行维护", date: "2024-03-15" },
    { id: 2, title: "新学期开始，请各位教师及时发布任务", date: "2024-03-01" },
    { id: 3, title: "欢迎使用抽样统计虚拟仿真系统V3.0", date: "2024-02-20" },
];

function StatCard({ icon: Icon, value, label, colorClass }: {
    icon: React.ComponentType<{ className?: string }>;
    value: string | number;
    label: string;
    colorClass: string
}) {
    return (
        <Card>
            <CardContent className="pt-6">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${colorClass}`}>
                    <Icon className="w-6 h-6" />
                </div>
                <div className="text-2xl font-bold text-foreground">{value}</div>
                <div className="text-sm text-muted-foreground">{label}</div>
            </CardContent>
        </Card>
    );
}

function StatusBar({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="p-4 bg-muted rounded-lg">
            <div className="text-xs text-muted-foreground mb-2">{label}</div>
            <Progress value={value} className={`h-2 mb-2 ${color}`} />
            <div className="text-sm font-semibold text-foreground">{value}%</div>
        </div>
    );
}

function Dashboard() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={Calendar} value={mockStats.currentSemester} label="当前学期" colorClass="bg-primary/10 text-primary" />
                <StatCard icon={Users} value={mockStats.teacherCount} label="教师总数" colorClass="bg-emerald-50 text-emerald-600" />
                <StatCard icon={School} value={mockStats.classCount} label="班级总数" colorClass="bg-secondary text-secondary-foreground" />
                <StatCard icon={GraduationCap} value={mockStats.studentCount} label="学生总数" colorClass="bg-amber-50 text-amber-600" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon={UserCheck} value={mockStats.assistantCount} label="助教总数" colorClass="bg-rose-50 text-rose-600" />
                <StatCard icon={Users} value={mockStats.todayActiveUsers} label="今日活跃用户" colorClass="bg-primary/10 text-primary" />
                <StatCard icon={LogOut} value={mockStats.todayLogins} label="今日登录次数" colorClass="bg-blue-50 text-blue-600" />
                <StatCard icon={Activity} value={mockStats.pendingItems} label="待处理事项" colorClass="bg-orange-50 text-orange-600" />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">系统状态</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                        <StatusBar
                            label="CPU 使用率"
                            value={mockMetrics.cpu}
                            color={mockMetrics.cpu > 90 ? "[&>div]:bg-destructive" : mockMetrics.cpu > 70 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}
                        />
                        <StatusBar
                            label="内存使用率"
                            value={mockMetrics.memory}
                            color={mockMetrics.memory > 90 ? "[&>div]:bg-destructive" : mockMetrics.memory > 75 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}
                        />
                        <StatusBar
                            label="磁盘使用率"
                            value={mockMetrics.disk}
                            color={mockMetrics.disk > 95 ? "[&>div]:bg-destructive" : mockMetrics.disk > 80 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">最近公告</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {mockAnnouncements.map((item) => (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                            <span className="text-sm text-foreground">{item.title}</span>
                            <span className="text-xs text-muted-foreground">{item.date}</span>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
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

export function AdminApp() {
    const [activePage, setActivePage] = useState("dashboard");

    const renderPage = () => {
        switch (activePage) {
            case "dashboard": return <Dashboard />;
            case "semester": return <SemesterManagement />;
            case "teacher": return <TeacherManagement />;
            case "assistant": return <AssistantManagement />;
            case "class": return <ClassManagement />;
            case "student": return <StudentManagement />;
            case "monitor": return <SystemMonitor />;
            case "announcement": return <AnnouncementManagement />;
            case "settings": return <SystemSettings />;
            default: return <PlaceholderPage name={pageTitles[activePage] ?? activePage} />;
        }
    };

    return (
        <div className="flex min-h-screen bg-muted/40">
            {/* Sidebar */}
            <aside className="w-60 bg-slate-800 text-white flex flex-col shrink-0">
                <div className="p-6 border-b border-white/10">
                    <h1 className="text-lg font-semibold">抽样统计系统</h1>
                    <p className="text-xs text-white/70 mt-1">管理后台</p>
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
                                        ? "bg-primary/20 text-primary border-l-[3px] border-primary"
                                        : "text-white/70 hover:bg-white/10 hover:text-white border-l-[3px] border-transparent"
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{item.label}</span>
                            </Button>
                        );
                    })}
                </nav>

                <Separator className="bg-white/10" />

                <div className="p-4">
                    <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-white/20 text-white text-sm">管</AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="text-sm font-medium">管理员</div>
                            <div className="text-xs text-white/70">Administrator</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-background px-8 py-4 border-b flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-foreground">{pageTitles[activePage]}</h2>
                    <span className="text-sm text-muted-foreground">
                        {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
                    </span>
                </header>
                <div className="flex-1 p-8 overflow-y-auto">{renderPage()}</div>
            </main>
        </div>
    );
}

export default AdminApp;

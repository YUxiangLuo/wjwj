import { useState } from "react";
import {
    LayoutDashboard, Calendar, Users, GraduationCap, School, UserCheck,
    Activity, Megaphone, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Dashboard } from "./pages/Dashboard";
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
                                        ? "bg-primary/20 text-primary border-l-[3px] border-primary hover:bg-primary/30 hover:text-primary"
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

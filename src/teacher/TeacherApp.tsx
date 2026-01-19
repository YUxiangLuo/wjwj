import {
    LayoutDashboard, School, BookOpen, ClipboardList, PenLine, Users, Download, Bell
} from "lucide-react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import "./teacher.css";

import { Dashboard } from "./pages/Dashboard";
import { ClassManagement } from "./pages/ClassManagement";
import { StudentManagement } from "./pages/StudentManagement";
import { TopicManagement } from "./pages/TopicManagement";
import { TaskManagement } from "./pages/TaskManagement";
import { GradingManagement } from "./pages/GradingManagement";
import { GradingDetail } from "./pages/GradingDetail";
import { AssistantManagement } from "./pages/AssistantManagement";
import { GradeExport } from "./pages/GradeExport";

const menuItems = [
    { path: "/", label: "首页概览", icon: LayoutDashboard },
    { path: "/class", label: "班级管理", icon: School },
    { path: "/topic", label: "课题管理", icon: BookOpen },
    { path: "/task", label: "任务管理", icon: ClipboardList },
    { path: "/grading", label: "作业批改", icon: PenLine, badge: 12 },
    { path: "/assistant", label: "助教管理", icon: Users },
    { path: "/export", label: "成绩导出", icon: Download },
];

const pageTitles: Record<string, string> = {
    "/": "首页概览",
    "/class": "班级管理",
    "/topic": "课题管理",
    "/task": "任务管理",
    "/grading": "作业批改",
    "/assistant": "助教管理",
    "/export": "成绩导出",
};

export function TeacherApp() {
    const location = useLocation();
    const currentPath = location.pathname;
    // Get base path for title (e.g., /class/1/students -> /class)
    const basePath = "/" + (currentPath.split("/")[1] || "");
    const pageTitle = pageTitles[basePath] ?? "教师端";

    // Additional logic for dynamic titles could go here if needed

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
                        const isActive = item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path);
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-6 py-3 text-sm font-normal border-l-[3px] transition-colors
                                    ${isActive
                                        ? "bg-primary/20 text-primary border-primary"
                                        : "text-white/70 hover:bg-white/10 hover:text-white border-transparent"
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{item.label}</span>
                                {item.badge && (
                                    <Badge variant="destructive" className="ml-auto text-xs px-2 py-0.5">{item.badge}</Badge>
                                )}
                            </NavLink>
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
                    <h2 className="text-xl font-semibold text-foreground">{pageTitle}</h2>
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
                <div className="flex-1 p-8 overflow-y-auto">
                    <Routes>
                        <Route index element={<Dashboard />} />
                        <Route path="class" element={<ClassManagement />} />
                        <Route path="class/:classId/students" element={<StudentManagement />} />
                        <Route path="topic" element={<TopicManagement />} />
                        <Route path="task" element={<TaskManagement />} />
                        <Route path="grading" element={<GradingManagement />} />
                        <Route path="grading/:submissionId" element={<GradingDetail />} />
                        <Route path="assistant" element={<AssistantManagement />} />
                        <Route path="export" element={<GradeExport />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </div>
            </main>
        </div>
    );
}

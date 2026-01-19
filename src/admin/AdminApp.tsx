import { useState, useEffect } from "react";
import {
    LayoutDashboard, Calendar, Users, GraduationCap, School, UserCheck,
    Activity, Megaphone, Settings, Bell, LogOut
} from "lucide-react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dashboard } from "./pages/Dashboard";
import { systemApi } from "./api-client";
import { SemesterManagement } from "./pages/SemesterManagement";
import { TeacherManagement } from "./pages/TeacherManagement";
import { ClassManagement } from "./pages/ClassManagement";
import { AssistantManagement } from "./pages/AssistantManagement";
import { StudentManagement } from "./pages/StudentManagement";
import { AnnouncementManagement } from "./pages/AnnouncementManagement";
import { SystemMonitor } from "./pages/SystemMonitor";
import { SystemSettings } from "./pages/SystemSettings";

const menuItems = [
    { path: "/", label: "首页概览", icon: LayoutDashboard },
    { path: "/semester", label: "学期管理", icon: Calendar },
    { path: "/teacher", label: "教师管理", icon: Users },
    { path: "/assistant", label: "助教管理", icon: UserCheck },
    { path: "/class", label: "班级管理", icon: School },
    { path: "/student", label: "学生管理", icon: GraduationCap },
    { path: "/monitor", label: "系统监控", icon: Activity },
    { path: "/announcement", label: "公告管理", icon: Megaphone },
    { path: "/settings", label: "系统设置", icon: Settings },
];

const pageTitles: Record<string, string> = {
    "/": "首页概览",
    "/semester": "学期管理",
    "/teacher": "教师管理",
    "/assistant": "助教管理",
    "/class": "班级管理",
    "/student": "学生管理",
    "/monitor": "系统监控",
    "/announcement": "公告管理",
    "/settings": "系统设置",
};

export function AdminApp() {
    const location = useLocation();
    const navigate = useNavigate();
    const currentPath = location.pathname;
    const pageTitle = pageTitles[currentPath] ?? "管理后台";
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        // Initial fetch
        fetchNotifications();

        // Poll every minute
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, []);

    const fetchNotifications = async () => {
        try {
            const res = await systemApi.getNotifications();
            if (res.success && res.data) {
                setUnreadCount(res.data.count);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleLogout = () => {
        // Clear auth data if needed
        window.location.href = "/";
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
                            <NavLink
                                key={item.path}
                                to={item.path}
                                end={item.path === "/"}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-6 py-3 text-sm font-normal border-l-[3px] transition-colors
                                    ${isActive
                                        ? "bg-primary/20 text-primary border-primary"
                                        : "text-white/70 hover:bg-white/10 hover:text-white border-transparent"
                                    }`
                                }
                            >
                                <Icon className="w-4 h-4" />
                                <span>{item.label}</span>
                            </NavLink>
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
                    <h2 className="text-xl font-semibold text-foreground">{pageTitle}</h2>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground mr-2">
                            {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
                        </span>
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="w-5 h-5 text-muted-foreground" />
                            {unreadCount > 0 && (
                                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
                            )}
                        </Button>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" title="退出登录">
                                    <LogOut className="w-5 h-5 text-muted-foreground" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>确认退出登录?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        您确定要退出当前账号吗？
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleLogout}>退出</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </header>
                <div className="flex-1 p-8 overflow-y-auto">
                    <Routes>
                        <Route index element={<Dashboard />} />
                        <Route path="semester" element={<SemesterManagement />} />
                        <Route path="teacher" element={<TeacherManagement />} />
                        <Route path="assistant" element={<AssistantManagement />} />
                        <Route path="class" element={<ClassManagement />} />
                        <Route path="student" element={<StudentManagement />} />
                        <Route path="monitor" element={<SystemMonitor />} />
                        <Route path="announcement" element={<AnnouncementManagement />} />
                        <Route path="settings" element={<SystemSettings />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </div>
            </main>
        </div>
    );
}

export default AdminApp;

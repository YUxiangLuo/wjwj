import { useState } from "react";
import "./admin.css";
import { SemesterManagement } from "./pages/SemesterManagement";
import { TeacherManagement } from "./pages/TeacherManagement";
import { ClassManagement } from "./pages/ClassManagement";
import { AssistantManagement } from "./pages/AssistantManagement";
import { StudentManagement } from "./pages/StudentManagement";
import { AnnouncementManagement } from "./pages/AnnouncementManagement";
import { SystemMonitor } from "./pages/SystemMonitor";
import { SystemSettings } from "./pages/SystemSettings";

// Menu items for sidebar
const menuItems = [
    { id: "dashboard", label: "首页概览", icon: "📊" },
    { id: "semester", label: "学期管理", icon: "📅" },
    { id: "teacher", label: "教师管理", icon: "👨‍🏫" },
    { id: "assistant", label: "助教管理", icon: "👥" },
    { id: "class", label: "班级管理", icon: "🏫" },
    { id: "student", label: "学生管理", icon: "🎓" },
    { id: "monitor", label: "系统监控", icon: "📈" },
    { id: "announcement", label: "公告管理", icon: "📢" },
    { id: "settings", label: "系统设置", icon: "⚙️" },
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

// Mock data
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

// Stat Card Component
function StatCard({ icon, value, label, colorClass }: { icon: string; value: string | number; label: string; colorClass: string }) {
    return (
        <div className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl mb-4 ${colorClass}`}>
                {icon}
            </div>
            <div className="text-2xl font-bold text-slate-800">{value}</div>
            <div className="text-sm text-slate-500">{label}</div>
        </div>
    );
}

// System Status Bar
function StatusBar({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="p-4 bg-slate-50 rounded-lg">
            <div className="text-xs text-slate-500 mb-2">{label}</div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
            </div>
            <div className="text-sm font-semibold text-slate-800">{value}%</div>
        </div>
    );
}

// Dashboard Component
function Dashboard() {
    return (
        <div className="space-y-6">
            {/* Stats Row 1 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon="📅" value={mockStats.currentSemester} label="当前学期" colorClass="bg-teal-50 text-teal-600" />
                <StatCard icon="👨‍🏫" value={mockStats.teacherCount} label="教师总数" colorClass="bg-emerald-50 text-emerald-600" />
                <StatCard icon="🏫" value={mockStats.classCount} label="班级总数" colorClass="bg-slate-100 text-slate-600" />
                <StatCard icon="🎓" value={mockStats.studentCount} label="学生总数" colorClass="bg-amber-50 text-amber-600" />
            </div>

            {/* Stats Row 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon="👥" value={mockStats.assistantCount} label="助教总数" colorClass="bg-rose-50 text-rose-600" />
                <StatCard icon="👤" value={mockStats.todayActiveUsers} label="今日活跃用户" colorClass="bg-teal-50 text-teal-600" />
                <StatCard icon="🔑" value={mockStats.todayLogins} label="今日登录次数" colorClass="bg-blue-50 text-blue-600" />
                <StatCard icon="⏳" value={mockStats.pendingItems} label="待处理事项" colorClass="bg-orange-50 text-orange-600" />
            </div>

            {/* System Status */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">系统状态</h3>
                <div className="grid grid-cols-3 gap-4">
                    <StatusBar label="CPU 使用率" value={mockMetrics.cpu} color={mockMetrics.cpu > 90 ? "bg-red-500" : mockMetrics.cpu > 70 ? "bg-amber-500" : "bg-emerald-500"} />
                    <StatusBar label="内存使用率" value={mockMetrics.memory} color={mockMetrics.memory > 90 ? "bg-red-500" : mockMetrics.memory > 75 ? "bg-amber-500" : "bg-emerald-500"} />
                    <StatusBar label="磁盘使用率" value={mockMetrics.disk} color={mockMetrics.disk > 95 ? "bg-red-500" : mockMetrics.disk > 80 ? "bg-amber-500" : "bg-emerald-500"} />
                </div>
            </div>

            {/* Recent Announcements */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">最近公告</h3>
                <div className="space-y-3">
                    {mockAnnouncements.map((item) => (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                            <span className="text-sm text-slate-700">{item.title}</span>
                            <span className="text-xs text-slate-500">{item.date}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Placeholder page
function PlaceholderPage({ name }: { name: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-96 bg-white rounded-xl text-slate-500">
            <div className="text-6xl mb-4">🚧</div>
            <div className="text-lg">{name}页面开发中...</div>
        </div>
    );
}

// Main Admin App
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
        <div className="flex min-h-screen bg-slate-100">
            {/* Sidebar */}
            <aside className="w-60 bg-slate-800 text-white flex flex-col shrink-0">
                <div className="p-6 border-b border-white/10">
                    <h1 className="text-lg font-semibold">抽样统计系统</h1>
                    <p className="text-xs text-white/70 mt-1">管理后台</p>
                </div>

                <nav className="flex-1 py-4 overflow-y-auto">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActivePage(item.id)}
                            className={`w-full flex items-center gap-3 px-6 py-3 text-sm transition-colors
                ${activePage === item.id
                                    ? "bg-teal-600/20 text-teal-400 border-l-[3px] border-teal-500"
                                    : "text-white/70 hover:bg-white/10 hover:text-white border-l-[3px] border-transparent"
                                }`}
                        >
                            <span className="text-base">{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm">管</div>
                        <div>
                            <div className="text-sm font-medium">管理员</div>
                            <div className="text-xs text-white/70">Administrator</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white px-8 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-slate-800">{pageTitles[activePage]}</h2>
                    <span className="text-sm text-slate-500">
                        {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
                    </span>
                </header>
                <div className="flex-1 p-8 overflow-y-auto">{renderPage()}</div>
            </main>
        </div>
    );
}

export default AdminApp;

import { useState } from "react";
import "./admin.css";

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

// Page titles
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

// Mock statistics data
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

// Mock system metrics
const mockMetrics = {
    cpu: 35,
    memory: 62,
    disk: 48,
};

// Mock announcements
const mockAnnouncements = [
    { id: 1, title: "系统维护通知：本周六凌晨2点进行例行维护", date: "2024-03-15" },
    { id: 2, title: "新学期开始，请各位教师及时发布任务", date: "2024-03-01" },
    { id: 3, title: "欢迎使用抽样统计虚拟仿真系统V3.0", date: "2024-02-20" },
];

// Dashboard Component
function Dashboard() {
    return (
        <div>
            {/* Stats Row 1 */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon blue">📅</div>
                    <div className="stat-value">{mockStats.currentSemester}</div>
                    <div className="stat-label">当前学期</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green">👨‍🏫</div>
                    <div className="stat-value">{mockStats.teacherCount}</div>
                    <div className="stat-label">教师总数</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon purple">🏫</div>
                    <div className="stat-value">{mockStats.classCount}</div>
                    <div className="stat-label">班级总数</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon orange">🎓</div>
                    <div className="stat-value">{mockStats.studentCount}</div>
                    <div className="stat-label">学生总数</div>
                </div>
            </div>

            {/* Stats Row 2 */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon pink">👥</div>
                    <div className="stat-value">{mockStats.assistantCount}</div>
                    <div className="stat-label">助教总数</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon cyan">👤</div>
                    <div className="stat-value">{mockStats.todayActiveUsers}</div>
                    <div className="stat-label">今日活跃用户</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon blue">🔑</div>
                    <div className="stat-value">{mockStats.todayLogins}</div>
                    <div className="stat-label">今日登录次数</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon orange">⏳</div>
                    <div className="stat-value">{mockStats.pendingItems}</div>
                    <div className="stat-label">待处理事项</div>
                </div>
            </div>

            {/* System Status */}
            <div className="section-card">
                <div className="section-header">
                    <h3 className="section-title">系统状态</h3>
                </div>
                <div className="system-grid">
                    <div className="system-item">
                        <div className="system-label">CPU 使用率</div>
                        <div className="system-bar">
                            <div
                                className={`system-bar-fill ${mockMetrics.cpu > 90 ? "danger" : mockMetrics.cpu > 70 ? "warning" : "normal"}`}
                                style={{ width: `${mockMetrics.cpu}%` }}
                            />
                        </div>
                        <div className="system-value">{mockMetrics.cpu}%</div>
                    </div>
                    <div className="system-item">
                        <div className="system-label">内存使用率</div>
                        <div className="system-bar">
                            <div
                                className={`system-bar-fill ${mockMetrics.memory > 90 ? "danger" : mockMetrics.memory > 75 ? "warning" : "normal"}`}
                                style={{ width: `${mockMetrics.memory}%` }}
                            />
                        </div>
                        <div className="system-value">{mockMetrics.memory}%</div>
                    </div>
                    <div className="system-item">
                        <div className="system-label">磁盘使用率</div>
                        <div className="system-bar">
                            <div
                                className={`system-bar-fill ${mockMetrics.disk > 95 ? "danger" : mockMetrics.disk > 80 ? "warning" : "normal"}`}
                                style={{ width: `${mockMetrics.disk}%` }}
                            />
                        </div>
                        <div className="system-value">{mockMetrics.disk}%</div>
                    </div>
                </div>
            </div>

            {/* Recent Announcements */}
            <div className="section-card">
                <div className="section-header">
                    <h3 className="section-title">最近公告</h3>
                </div>
                <div className="announcement-list">
                    {mockAnnouncements.map((item) => (
                        <div key={item.id} className="announcement-item">
                            <span className="announcement-title">{item.title}</span>
                            <span className="announcement-date">{item.date}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Placeholder page for other menus
function PlaceholderPage({ name }: { name: string }) {
    return (
        <div className="page-placeholder">
            <div className="page-placeholder-icon">🚧</div>
            <div className="page-placeholder-text">{name}页面开发中...</div>
        </div>
    );
}

// Main Admin App
export function AdminApp() {
    const [activePage, setActivePage] = useState("dashboard");

    const renderPage = () => {
        switch (activePage) {
            case "dashboard":
                return <Dashboard />;
            default:
                return <PlaceholderPage name={pageTitles[activePage]} />;
        }
    };

    return (
        <div className="admin-layout">
            {/* Sidebar */}
            <aside className="admin-sidebar">
                <div className="sidebar-header">
                    <h1 className="sidebar-title">抽样统计系统</h1>
                    <p className="sidebar-subtitle">管理后台</p>
                </div>

                <nav className="sidebar-nav">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            className={`nav-item ${activePage === item.id ? "active" : ""}`}
                            onClick={() => setActivePage(item.id)}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar">管</div>
                        <div>
                            <div className="user-name">管理员</div>
                            <div className="user-role">Administrator</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main">
                <header className="admin-header">
                    <h2 className="page-title">{pageTitles[activePage]}</h2>
                    <div className="header-actions">
                        <span style={{ fontSize: "0.875rem", color: "hsl(220 10% 50%)" }}>
                            {new Date().toLocaleDateString("zh-CN", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                                weekday: "long",
                            })}
                        </span>
                    </div>
                </header>

                <div className="admin-content">{renderPage()}</div>
            </main>
        </div>
    );
}

export default AdminApp;

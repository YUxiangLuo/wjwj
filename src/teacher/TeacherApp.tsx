import { useState } from "react";
import "./teacher.css";

// Menu items for teacher sidebar
const menuItems = [
    { id: "dashboard", label: "首页概览", icon: "📊" },
    { id: "class", label: "班级管理", icon: "🏫" },
    { id: "topic", label: "课题管理", icon: "📚" },
    { id: "task", label: "任务管理", icon: "📋" },
    { id: "grading", label: "作业批改", icon: "✏️" },
    { id: "assistant", label: "助教管理", icon: "👥" },
    { id: "export", label: "成绩导出", icon: "📥" },
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

// Dashboard Component
function Dashboard() {
    const stats = [
        { label: "我的班级", value: 3, icon: "🏫", color: "bg-blue-500" },
        { label: "我的课题", value: 5, icon: "📚", color: "bg-emerald-500" },
        { label: "待批改作业", value: 12, icon: "✏️", color: "bg-red-500", highlight: true },
        { label: "进行中任务", value: 4, icon: "📋", color: "bg-amber-500" },
    ];

    const recentSubmissions = [
        { student: "张明", class: "统计学2024-1班", topic: "消费者调研", time: "10分钟前" },
        { student: "李华", class: "统计学2024-1班", topic: "消费者调研", time: "25分钟前" },
        { student: "王芳", class: "统计学2024-2班", topic: "市场分析", time: "1小时前" },
    ];

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => (
                    <div key={stat.label} className={`bg-white rounded-xl p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${stat.highlight ? "ring-2 ring-red-200" : ""}`}>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-slate-500">{stat.label}</span>
                            <span className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center text-white text-lg`}>
                                {stat.icon}
                            </span>
                        </div>
                        <div className={`text-3xl font-bold ${stat.highlight ? "text-red-600" : "text-slate-800"}`}>{stat.value}</div>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">快捷入口</h3>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors flex items-center gap-2">
                        ✏️ 进入批改
                        <span className="bg-white/20 px-2 py-0.5 rounded text-xs">12</span>
                    </button>
                    <button className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors">
                        + 创建新课题
                    </button>
                </div>
            </div>

            {/* Recent Submissions */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">最近提交</h3>
                <div className="space-y-3">
                    {recentSubmissions.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center text-teal-700 text-sm font-medium">
                                    {item.student[0]}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-slate-800">{item.student}</div>
                                    <div className="text-xs text-slate-500">{item.class} · {item.topic}</div>
                                </div>
                            </div>
                            <span className="text-xs text-slate-400">{item.time}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Class Management Component
function ClassManagement() {
    const classes = [
        { id: 1, name: "统计学2024-1班", semester: "2024-Spring", studentCount: 45, createdAt: "2024-02-01" },
        { id: 2, name: "统计学2024-2班", semester: "2024-Spring", studentCount: 42, createdAt: "2024-02-01" },
        { id: 3, name: "统计学2024-3班", semester: "2024-Spring", studentCount: 38, createdAt: "2024-02-15" },
    ];

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-semibold text-slate-800">班级列表</h3>
                <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                    <option>2024-Spring</option>
                    <option>2023-Fall</option>
                </select>
            </div>

            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50">
                        <th className="text-left p-3 text-slate-600 font-medium">班级名称</th>
                        <th className="text-left p-3 text-slate-600 font-medium">学期</th>
                        <th className="text-left p-3 text-slate-600 font-medium">学生人数</th>
                        <th className="text-left p-3 text-slate-600 font-medium">创建时间</th>
                        <th className="text-left p-3 text-slate-600 font-medium">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {classes.map((cls) => (
                        <tr key={cls.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-800">{cls.name}</td>
                            <td className="p-3 text-slate-600">{cls.semester}</td>
                            <td className="p-3 text-slate-700">{cls.studentCount}人</td>
                            <td className="p-3 text-slate-500">{cls.createdAt}</td>
                            <td className="p-3">
                                <div className="flex gap-2">
                                    <button className="text-teal-600 hover:text-teal-700 text-sm">管理学生</button>
                                    <button className="text-slate-500 hover:text-slate-700 text-sm">查看详情</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Topic Management Component
function TopicManagement() {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const topics = [
        { id: 1, name: "消费者行为调研", status: "published", dataRows: 10000, attachments: 3, createdAt: "2024-03-01" },
        { id: 2, name: "市场竞争分析", status: "published", dataRows: 8500, attachments: 2, createdAt: "2024-03-10" },
        { id: 3, name: "用户满意度调查", status: "draft", dataRows: 0, attachments: 0, createdAt: "2024-03-15" },
    ];

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-semibold text-slate-800">课题列表</h3>
                <div className="flex gap-3">
                    <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                        <option>全部状态</option>
                        <option>草稿</option>
                        <option>已发布</option>
                    </select>
                    <button onClick={() => setShowCreateModal(true)} className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors">
                        + 创建课题
                    </button>
                </div>
            </div>

            <div className="grid gap-4">
                {topics.map((topic) => (
                    <div key={topic.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">📊</span>
                                <div>
                                    <h4 className="font-medium text-slate-800">{topic.name}</h4>
                                    <div className="text-xs text-slate-500 mt-1">
                                        创建于 {topic.createdAt}
                                    </div>
                                </div>
                            </div>
                            {topic.status === "published" ? (
                                <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-100 text-emerald-700">已发布</span>
                            ) : (
                                <span className="px-2 py-1 text-xs font-medium rounded bg-slate-100 text-slate-600">草稿</span>
                            )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
                            <span>数据行数：{topic.dataRows > 0 ? topic.dataRows.toLocaleString() : "未上传"}</span>
                            <span>附件：{topic.attachments}个</span>
                        </div>
                        <div className="flex gap-2">
                            {topic.status === "draft" ? (
                                <>
                                    <button className="text-teal-600 hover:text-teal-700 text-sm">编辑</button>
                                    <button className="text-emerald-600 hover:text-emerald-700 text-sm">发布</button>
                                    <button className="text-red-500 hover:text-red-600 text-sm">删除</button>
                                </>
                            ) : (
                                <>
                                    <button className="text-teal-600 hover:text-teal-700 text-sm">查看</button>
                                    <button className="text-slate-500 hover:text-slate-700 text-sm">编辑</button>
                                    <button className="text-blue-500 hover:text-blue-600 text-sm">复制</button>
                                    <button className="text-red-500 hover:text-red-600 text-sm">删除</button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-800 mb-6">创建新课题</h3>
                        <div className="space-y-4">
                            {/* Stepper */}
                            <div className="flex items-center gap-2 mb-6">
                                {["基本信息", "上传数据", "字段映射", "辅助资料", "推荐题目", "评分权重"].map((step, idx) => (
                                    <div key={step} className="flex items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${idx === 0 ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                                            {idx + 1}
                                        </div>
                                        <span className={`text-xs ml-1 ${idx === 0 ? "text-teal-600 font-medium" : "text-slate-400"}`}>{step}</span>
                                        {idx < 5 && <span className="mx-2 text-slate-300">→</span>}
                                    </div>
                                ))}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">课题名称</label>
                                <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500" placeholder="请输入课题名称" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">背景描述</label>
                                <textarea className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 h-32 resize-none" placeholder="请输入课题背景描述" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
                            <button className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">保存草稿</button>
                            <button className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">下一步</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Task Management Component
function TaskManagement() {
    const [showPublishModal, setShowPublishModal] = useState(false);
    const tasks = [
        { id: 1, topic: "消费者行为调研", class: "统计学2024-1班", publishedAt: "2024-03-01", deadline: "2024-03-31", progress: "32/45", pending: 8 },
        { id: 2, topic: "消费者行为调研", class: "统计学2024-2班", publishedAt: "2024-03-01", deadline: "2024-03-31", progress: "28/42", pending: 5 },
        { id: 3, topic: "市场竞争分析", class: "统计学2024-3班", publishedAt: "2024-03-10", deadline: "2024-04-10", progress: "15/38", pending: 3 },
    ];

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-semibold text-slate-800">任务列表</h3>
                <button onClick={() => setShowPublishModal(true)} className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors">
                    + 发布任务
                </button>
            </div>

            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50">
                        <th className="text-left p-3 text-slate-600 font-medium">课题</th>
                        <th className="text-left p-3 text-slate-600 font-medium">班级</th>
                        <th className="text-left p-3 text-slate-600 font-medium">发布时间</th>
                        <th className="text-left p-3 text-slate-600 font-medium">截止时间</th>
                        <th className="text-left p-3 text-slate-600 font-medium">完成进度</th>
                        <th className="text-left p-3 text-slate-600 font-medium">待批改</th>
                        <th className="text-left p-3 text-slate-600 font-medium">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {tasks.map((task) => (
                        <tr key={task.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-800">{task.topic}</td>
                            <td className="p-3 text-slate-600">{task.class}</td>
                            <td className="p-3 text-slate-500">{task.publishedAt}</td>
                            <td className="p-3 text-slate-500">{task.deadline}</td>
                            <td className="p-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(parseInt(task.progress.split("/")[0] ?? "0") / parseInt(task.progress.split("/")[1] ?? "1")) * 100}%` }} />
                                    </div>
                                    <span className="text-xs text-slate-600">{task.progress}</span>
                                </div>
                            </td>
                            <td className="p-3">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${task.pending > 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
                                    {task.pending}
                                </span>
                            </td>
                            <td className="p-3">
                                <div className="flex gap-2">
                                    <button className="text-teal-600 hover:text-teal-700 text-sm">查看进度</button>
                                    <button className="text-slate-500 hover:text-slate-700 text-sm">延长时间</button>
                                    <button className="text-red-500 hover:text-red-600 text-sm">进入批改</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {showPublishModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowPublishModal(false)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-800 mb-6">发布任务</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">选择课题</label>
                                <select className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                                    <option>消费者行为调研</option>
                                    <option>市场竞争分析</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">选择班级</label>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" className="rounded" /> 统计学2024-1班
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" className="rounded" /> 统计学2024-2班
                                    </label>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" className="rounded" /> 统计学2024-3班
                                    </label>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">截止时间（可选）</label>
                                <input type="datetime-local" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowPublishModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
                            <button className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">确认发布</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Grading Component
function GradingManagement() {
    const submissions = [
        { id: 1, studentId: "2024001", name: "张明", topic: "消费者行为调研", class: "统计学2024-1班", submittedAt: "2024-03-15 14:30", status: "pending" },
        { id: 2, studentId: "2024002", name: "李华", topic: "消费者行为调研", class: "统计学2024-1班", submittedAt: "2024-03-15 10:20", status: "draft" },
        { id: 3, studentId: "2024003", name: "王芳", topic: "消费者行为调研", class: "统计学2024-2班", submittedAt: "2024-03-14 16:45", status: "graded", score: 85 },
        { id: 4, studentId: "2024004", name: "刘强", topic: "市场竞争分析", class: "统计学2024-3班", submittedAt: "2024-03-13 09:10", status: "rejected" },
    ];

    const getStatusBadge = (status: string, score?: number) => {
        switch (status) {
            case "pending": return <span className="px-2 py-1 text-xs font-medium rounded bg-amber-100 text-amber-700">待批改</span>;
            case "draft": return <span className="px-2 py-1 text-xs font-medium rounded bg-slate-100 text-slate-600">批改草稿</span>;
            case "graded": return <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-100 text-emerald-700">已批改 ({score}分)</span>;
            case "rejected": return <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-600">已驳回</span>;
            default: return null;
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-semibold text-slate-800">作业批改</h3>
                <div className="flex gap-3">
                    <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                        <option>全部班级</option>
                        <option>统计学2024-1班</option>
                        <option>统计学2024-2班</option>
                    </select>
                    <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                        <option>全部状态</option>
                        <option>待批改</option>
                        <option>批改草稿</option>
                        <option>已批改</option>
                        <option>已驳回</option>
                    </select>
                </div>
            </div>

            <div className="space-y-3">
                {submissions.map((sub) => (
                    <div key={sub.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-700 font-medium">
                                    {sub.name[0]}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-slate-800">{sub.name}</span>
                                        <span className="text-xs text-slate-500">({sub.studentId})</span>
                                    </div>
                                    <div className="text-xs text-slate-500">{sub.class} · {sub.topic}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                {getStatusBadge(sub.status, sub.status === "graded" ? 85 : undefined)}
                                <div className="text-xs text-slate-400 mt-1">{sub.submittedAt}</div>
                            </div>
                        </div>
                        <div className="flex justify-end mt-3">
                            {sub.status === "pending" && (
                                <button className="px-4 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">开始批改</button>
                            )}
                            {sub.status === "draft" && (
                                <button className="px-4 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600">继续批改</button>
                            )}
                            {(sub.status === "graded" || sub.status === "rejected") && (
                                <button className="px-4 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">查看详情</button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Placeholder for other pages
function PlaceholderPage({ name }: { name: string }) {
    return (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="text-4xl mb-4">🚧</div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">{name}</h2>
            <p className="text-slate-500">此页面正在开发中...</p>
        </div>
    );
}

// Main Teacher App
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
        <div className="flex min-h-screen bg-slate-100">
            {/* Sidebar */}
            <aside className="w-60 bg-slate-800 text-white flex flex-col shrink-0">
                <div className="p-6 border-b border-white/10">
                    <h1 className="text-lg font-semibold">抽样统计系统</h1>
                    <p className="text-xs text-white/70 mt-1">教师端</p>
                </div>

                <nav className="flex-1 p-4">
                    <ul className="space-y-1">
                        {menuItems.map((item) => (
                            <li key={item.id}>
                                <button
                                    onClick={() => setActivePage(item.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${activePage === item.id
                                        ? "bg-teal-600 text-white"
                                        : "text-white/80 hover:bg-white/10"
                                        }`}
                                >
                                    <span>{item.icon}</span>
                                    <span>{item.label}</span>
                                    {item.id === "grading" && (
                                        <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">12</span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="p-4 border-t border-white/10">
                    <div className="flex items-center gap-3 text-sm">
                        <div className="w-8 h-8 bg-teal-600 rounded-full flex items-center justify-center">张</div>
                        <div>
                            <div className="font-medium">张老师</div>
                            <div className="text-xs text-white/60">T001</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col">
                <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-slate-800">{pageTitles[activePage]}</h2>
                    <div className="flex items-center gap-4">
                        <button className="relative text-slate-500 hover:text-slate-700">
                            🔔
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">2</span>
                        </button>
                        <span className="text-sm text-slate-500">2024年3月17日</span>
                    </div>
                </header>

                <div className="flex-1 p-6 overflow-auto">
                    {renderPage()}
                </div>
            </main>
        </div>
    );
}

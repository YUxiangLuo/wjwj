import { useState } from "react";

const mockAnnouncements = [
    { id: 1, title: "系统维护通知：本周六凌晨2点进行例行维护", content: "为保障系统稳定运行，我们将于本周六凌晨2点进行例行维护...", isPublished: true, createdAt: "2024-03-15 10:00" },
    { id: 2, title: "新学期开始，请各位教师及时发布任务", content: "2024年春季学期已正式开始，请各位教师尽快完成班级设置...", isPublished: true, createdAt: "2024-03-01 09:00" },
    { id: 3, title: "欢迎使用抽样统计虚拟仿真系统V3.0", content: "系统已升级至V3.0版本，新增多项功能...", isPublished: true, createdAt: "2024-02-20 14:30" },
    { id: 4, title: "期末考试安排通知（草稿）", content: "本学期期末考试时间安排如下...", isPublished: false, createdAt: "2024-03-10 16:00" },
];

interface Announcement {
    id: number;
    title: string;
    content: string;
    isPublished: boolean;
    createdAt: string;
}

export function AnnouncementManagement() {
    const [announcements, setAnnouncements] = useState<Announcement[]>(mockAnnouncements);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newAnnouncement, setNewAnnouncement] = useState({ title: "", content: "" });

    const handleAddAnnouncement = (publish: boolean) => {
        if (!newAnnouncement.title.trim()) return;
        const announcement: Announcement = {
            id: Date.now(),
            title: newAnnouncement.title,
            content: newAnnouncement.content,
            isPublished: publish,
            createdAt: new Date().toLocaleString("zh-CN"),
        };
        setAnnouncements([announcement, ...announcements]);
        setNewAnnouncement({ title: "", content: "" });
        setShowAddModal(false);
    };

    const handleTogglePublish = (id: number) => {
        setAnnouncements(announcements.map((a) => (a.id === id ? { ...a, isPublished: !a.isPublished } : a)));
    };

    const handleDelete = (announcement: Announcement) => {
        if (confirm(`确定删除公告「${announcement.title}」吗？`)) {
            setAnnouncements(announcements.filter((a) => a.id !== announcement.id));
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-semibold text-slate-800">公告列表</h3>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
                >
                    + 发布公告
                </button>
            </div>

            <div className="space-y-4">
                {announcements.map((announcement) => (
                    <div key={announcement.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <h4 className="font-medium text-slate-800">{announcement.title}</h4>
                                {announcement.isPublished ? (
                                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-emerald-100 text-emerald-700">已发布</span>
                                ) : (
                                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700">草稿</span>
                                )}
                            </div>
                            <span className="text-xs text-slate-500">{announcement.createdAt}</span>
                        </div>
                        <p className="text-sm text-slate-600 mb-3 line-clamp-2">{announcement.content}</p>
                        <div className="flex gap-3">
                            <button className="text-teal-600 hover:text-teal-700 text-sm">编辑</button>
                            <button
                                onClick={() => handleTogglePublish(announcement.id)}
                                className={`text-sm ${announcement.isPublished ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}`}
                            >
                                {announcement.isPublished ? "撤回" : "发布"}
                            </button>
                            <button onClick={() => handleDelete(announcement)} className="text-red-500 hover:text-red-600 text-sm">
                                删除
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {announcements.length === 0 && <div className="text-center py-12 text-slate-500">暂无公告</div>}

            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-800 mb-6">发布公告</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">标题</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    placeholder="请输入公告标题"
                                    value={newAnnouncement.title}
                                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">内容</label>
                                <textarea
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 h-32 resize-none"
                                    placeholder="请输入公告内容"
                                    value={newAnnouncement.content}
                                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                                取消
                            </button>
                            <button onClick={() => handleAddAnnouncement(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                                保存草稿
                            </button>
                            <button onClick={() => handleAddAnnouncement(true)} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
                                立即发布
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

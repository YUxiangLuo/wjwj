import { useState } from "react";

const mockAssistants = [
    { id: 1, account: "A001", name: "小明", teacherId: "T001", teacherName: "张三", status: 1, createdAt: "2024-02-15" },
    { id: 2, account: "A002", name: "小红", teacherId: "T001", teacherName: "张三", status: 1, createdAt: "2024-02-15" },
    { id: 3, account: "A003", name: "小刚", teacherId: "T002", teacherName: "李四", status: 0, createdAt: "2024-02-20" },
];

const mockTeachers = [
    { id: "T001", name: "张三" },
    { id: "T002", name: "李四" },
    { id: "T004", name: "赵六" },
];

interface Assistant {
    id: number;
    account: string;
    name: string;
    teacherId: string;
    teacherName: string;
    status: number;
    createdAt: string;
}

export function AssistantManagement() {
    const [assistants, setAssistants] = useState<Assistant[]>(mockAssistants);
    const [showAddModal, setShowAddModal] = useState(false);
    const [filterTeacher, setFilterTeacher] = useState("");
    const [newAssistant, setNewAssistant] = useState({ account: "", name: "", teacherId: mockTeachers[0]?.id ?? "" });

    const filteredAssistants = assistants.filter((a) => {
        if (filterTeacher && a.teacherId !== filterTeacher) return false;
        return true;
    });

    const handleAddAssistant = () => {
        if (!newAssistant.account.trim() || !newAssistant.name.trim()) return;
        const teacher = mockTeachers.find(t => t.id === newAssistant.teacherId);
        const assistant: Assistant = {
            id: Date.now(),
            account: newAssistant.account,
            name: newAssistant.name,
            teacherId: newAssistant.teacherId,
            teacherName: teacher?.name ?? "",
            status: 1,
            createdAt: new Date().toISOString().split("T")[0] ?? "",
        };
        setAssistants([...assistants, assistant]);
        setNewAssistant({ account: "", name: "", teacherId: mockTeachers[0]?.id ?? "" });
        setShowAddModal(false);
    };

    const handleToggleStatus = (id: number) => {
        setAssistants(assistants.map((a) => (a.id === id ? { ...a, status: a.status === 1 ? 0 : 1 } : a)));
    };

    const handleDelete = (assistant: Assistant) => {
        if (confirm(`确定删除助教「${assistant.name}」吗？`)) {
            setAssistants(assistants.filter((a) => a.id !== assistant.id));
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-semibold text-slate-800">助教列表</h3>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
                >
                    + 添加助教
                </button>
            </div>

            <div className="flex gap-3 mb-4">
                <select
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    value={filterTeacher}
                    onChange={(e) => setFilterTeacher(e.target.value)}
                >
                    <option value="">全部教师</option>
                    {mockTeachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
            </div>

            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50">
                        <th className="text-left p-3 text-slate-600 font-medium">账号</th>
                        <th className="text-left p-3 text-slate-600 font-medium">姓名</th>
                        <th className="text-left p-3 text-slate-600 font-medium">所属教师</th>
                        <th className="text-left p-3 text-slate-600 font-medium">状态</th>
                        <th className="text-left p-3 text-slate-600 font-medium">创建时间</th>
                        <th className="text-left p-3 text-slate-600 font-medium">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredAssistants.map((assistant) => (
                        <tr key={assistant.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-800">{assistant.account}</td>
                            <td className="p-3 text-slate-700">{assistant.name}</td>
                            <td className="p-3 text-slate-600">{assistant.teacherName}</td>
                            <td className="p-3">
                                {assistant.status === 1 ? (
                                    <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-100 text-emerald-700">正常</span>
                                ) : (
                                    <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-600">已停用</span>
                                )}
                            </td>
                            <td className="p-3 text-slate-500">{assistant.createdAt}</td>
                            <td className="p-3">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleToggleStatus(assistant.id)}
                                        className={`text-sm ${assistant.status === 1 ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}`}
                                    >
                                        {assistant.status === 1 ? "停用" : "启用"}
                                    </button>
                                    <button onClick={() => handleDelete(assistant)} className="text-red-500 hover:text-red-600 text-sm">
                                        删除
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {filteredAssistants.length === 0 && <div className="text-center py-12 text-slate-500">暂无数据</div>}

            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-800 mb-6">添加助教</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">账号</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    placeholder="请输入账号"
                                    value={newAssistant.account}
                                    onChange={(e) => setNewAssistant({ ...newAssistant, account: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">姓名</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    placeholder="请输入姓名"
                                    value={newAssistant.name}
                                    onChange={(e) => setNewAssistant({ ...newAssistant, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">所属教师</label>
                                <select
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                                    value={newAssistant.teacherId}
                                    onChange={(e) => setNewAssistant({ ...newAssistant, teacherId: e.target.value })}
                                >
                                    {mockTeachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                            <p className="text-xs text-slate-500">初始密码为账号</p>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                                取消
                            </button>
                            <button onClick={handleAddAssistant} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
                                确认添加
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

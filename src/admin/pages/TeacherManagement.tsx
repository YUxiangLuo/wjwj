import { useState } from "react";

const mockTeachers = [
    { id: 1, employeeId: "T001", name: "张三", status: 1, classCount: 3, lastLogin: "2024-03-15 10:30", createdAt: "2023-09-01" },
    { id: 2, employeeId: "T002", name: "李四", status: 1, classCount: 2, lastLogin: "2024-03-14 14:20", createdAt: "2023-09-01" },
    { id: 3, employeeId: "T003", name: "王五", status: 0, classCount: 0, lastLogin: "2024-01-10 09:00", createdAt: "2023-09-15" },
    { id: 4, employeeId: "T004", name: "赵六", status: 1, classCount: 3, lastLogin: "2024-03-15 08:45", createdAt: "2024-01-01" },
];

interface Teacher {
    id: number;
    employeeId: string;
    name: string;
    status: number;
    classCount: number;
    lastLogin: string;
    createdAt: string;
}

export function TeacherManagement() {
    const [teachers, setTeachers] = useState<Teacher[]>(mockTeachers);
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [newTeacher, setNewTeacher] = useState({ employeeId: "", name: "" });

    const filteredTeachers = teachers.filter(
        (t) => t.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) || t.name.includes(searchTerm)
    );

    const handleAddTeacher = () => {
        if (!newTeacher.employeeId.trim() || !newTeacher.name.trim()) return;
        const teacher: Teacher = {
            id: Date.now(),
            employeeId: newTeacher.employeeId,
            name: newTeacher.name,
            status: 1,
            classCount: 0,
            lastLogin: "-",
            createdAt: new Date().toISOString().split("T")[0] ?? "",
        };
        setTeachers([...teachers, teacher]);
        setNewTeacher({ employeeId: "", name: "" });
        setShowAddModal(false);
    };

    const handleToggleStatus = (id: number) => {
        setTeachers(teachers.map((t) => (t.id === id ? { ...t, status: t.status === 1 ? 0 : 1 } : t)));
    };

    const handleResetPassword = (teacher: Teacher) => {
        if (confirm(`确定重置教师「${teacher.name}」的密码吗？\n\n密码将重置为工号，下次登录需要修改密码。`)) {
            alert(`密码已重置为：${teacher.employeeId}`);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-semibold text-slate-800">教师列表</h3>
                <div className="flex gap-3">
                    <input
                        type="text"
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-52 focus:outline-none focus:border-teal-500"
                        placeholder="搜索工号或姓名..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
                    >
                        + 添加教师
                    </button>
                </div>
            </div>

            {/* Table */}
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50">
                        <th className="text-left p-3 text-slate-600 font-medium">工号</th>
                        <th className="text-left p-3 text-slate-600 font-medium">姓名</th>
                        <th className="text-left p-3 text-slate-600 font-medium">状态</th>
                        <th className="text-left p-3 text-slate-600 font-medium">班级数</th>
                        <th className="text-left p-3 text-slate-600 font-medium">最后登录</th>
                        <th className="text-left p-3 text-slate-600 font-medium">创建时间</th>
                        <th className="text-left p-3 text-slate-600 font-medium">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredTeachers.map((teacher) => (
                        <tr key={teacher.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-800">{teacher.employeeId}</td>
                            <td className="p-3 text-slate-700">{teacher.name}</td>
                            <td className="p-3">
                                {teacher.status === 1 ? (
                                    <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-100 text-emerald-700">正常</span>
                                ) : (
                                    <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-600">已停用</span>
                                )}
                            </td>
                            <td className="p-3 text-slate-600">{teacher.classCount}</td>
                            <td className="p-3 text-slate-500">{teacher.lastLogin}</td>
                            <td className="p-3 text-slate-500">{teacher.createdAt}</td>
                            <td className="p-3">
                                <div className="flex gap-2">
                                    <button onClick={() => handleResetPassword(teacher)} className="text-teal-600 hover:text-teal-700 text-sm">
                                        重置密码
                                    </button>
                                    <button
                                        onClick={() => handleToggleStatus(teacher.id)}
                                        className={`text-sm ${teacher.status === 1 ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}`}
                                    >
                                        {teacher.status === 1 ? "停用" : "启用"}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {filteredTeachers.length === 0 && <div className="text-center py-12 text-slate-500">暂无数据</div>}

            {/* Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-800 mb-6">添加教师</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">工号</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    placeholder="请输入工号"
                                    value={newTeacher.employeeId}
                                    onChange={(e) => setNewTeacher({ ...newTeacher, employeeId: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">姓名</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    placeholder="请输入姓名"
                                    value={newTeacher.name}
                                    onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                                />
                            </div>
                            <p className="text-xs text-slate-500">初始密码为工号</p>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                                取消
                            </button>
                            <button onClick={handleAddTeacher} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
                                确认添加
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

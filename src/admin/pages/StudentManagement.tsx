import { useState } from "react";

const mockStudents = [
    { id: 1, studentId: "2024001", name: "张明", className: "统计学2024-1班", status: 1, progress: 75, lastActive: "2024-03-15 14:30" },
    { id: 2, studentId: "2024002", name: "李华", className: "统计学2024-1班", status: 1, progress: 60, lastActive: "2024-03-15 10:20" },
    { id: 3, studentId: "2024003", name: "王芳", className: "统计学2024-2班", status: 1, progress: 90, lastActive: "2024-03-14 16:45" },
    { id: 4, studentId: "2024004", name: "刘强", className: "统计学2024-2班", status: 0, progress: 30, lastActive: "2024-02-28 09:10" },
];

const mockClasses = ["统计学2024-1班", "统计学2024-2班", "统计学2024-3班"];

interface Student {
    id: number;
    studentId: string;
    name: string;
    className: string;
    status: number;
    progress: number;
    lastActive: string;
}

export function StudentManagement() {
    const [students, setStudents] = useState<Student[]>(mockStudents);
    const [filterClass, setFilterClass] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    const filteredStudents = students.filter((s) => {
        if (filterClass && s.className !== filterClass) return false;
        if (searchTerm && !s.studentId.includes(searchTerm) && !s.name.includes(searchTerm)) return false;
        return true;
    });

    const handleResetPassword = (student: Student) => {
        if (confirm(`确定重置学生「${student.name}」的密码吗？\n\n密码将重置为学号。`)) {
            alert(`密码已重置为：${student.studentId}`);
        }
    };

    const handleToggleStatus = (id: number) => {
        setStudents(students.map((s) => (s.id === id ? { ...s, status: s.status === 1 ? 0 : 1 } : s)));
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-semibold text-slate-800">学生列表</h3>
                <div className="flex gap-3">
                    <input
                        type="text"
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-52 focus:outline-none focus:border-teal-500"
                        placeholder="搜索学号或姓名..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex gap-3 mb-4">
                <select
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                >
                    <option value="">全部班级</option>
                    {mockClasses.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50">
                        <th className="text-left p-3 text-slate-600 font-medium">学号</th>
                        <th className="text-left p-3 text-slate-600 font-medium">姓名</th>
                        <th className="text-left p-3 text-slate-600 font-medium">班级</th>
                        <th className="text-left p-3 text-slate-600 font-medium">状态</th>
                        <th className="text-left p-3 text-slate-600 font-medium">实验进度</th>
                        <th className="text-left p-3 text-slate-600 font-medium">最后活跃</th>
                        <th className="text-left p-3 text-slate-600 font-medium">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredStudents.map((student) => (
                        <tr key={student.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-800">{student.studentId}</td>
                            <td className="p-3 text-slate-700">{student.name}</td>
                            <td className="p-3 text-slate-600">{student.className}</td>
                            <td className="p-3">
                                {student.status === 1 ? (
                                    <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-100 text-emerald-700">正常</span>
                                ) : (
                                    <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-600">已停用</span>
                                )}
                            </td>
                            <td className="p-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${student.progress >= 80 ? "bg-emerald-500" : student.progress >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                            style={{ width: `${student.progress}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-slate-500">{student.progress}%</span>
                                </div>
                            </td>
                            <td className="p-3 text-slate-500">{student.lastActive}</td>
                            <td className="p-3">
                                <div className="flex gap-2">
                                    <button onClick={() => handleResetPassword(student)} className="text-teal-600 hover:text-teal-700 text-sm">
                                        重置密码
                                    </button>
                                    <button
                                        onClick={() => handleToggleStatus(student.id)}
                                        className={`text-sm ${student.status === 1 ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}`}
                                    >
                                        {student.status === 1 ? "停用" : "启用"}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {filteredStudents.length === 0 && <div className="text-center py-12 text-slate-500">暂无数据</div>}
        </div>
    );
}

import { useState } from "react";

const mockClasses = [
    { id: 1, name: "统计学2024-1班", semester: "2024-Spring", teacher: "张三", studentCount: 45, createdAt: "2024-02-15" },
    { id: 2, name: "统计学2024-2班", semester: "2024-Spring", teacher: "张三", studentCount: 42, createdAt: "2024-02-15" },
    { id: 3, name: "统计学2024-3班", semester: "2024-Spring", teacher: "李四", studentCount: 48, createdAt: "2024-02-16" },
    { id: 4, name: "数据分析班", semester: "2024-Spring", teacher: "赵六", studentCount: 35, createdAt: "2024-03-01" },
];

const mockSemesters = ["2024-Spring", "2023-Fall", "2023-Spring"];
const mockTeachers = ["张三", "李四", "赵六"];

interface Class {
    id: number;
    name: string;
    semester: string;
    teacher: string;
    studentCount: number;
    createdAt: string;
}

export function ClassManagement() {
    const [classes, setClasses] = useState<Class[]>(mockClasses);
    const [showAddModal, setShowAddModal] = useState(false);
    const [filterSemester, setFilterSemester] = useState("");
    const [filterTeacher, setFilterTeacher] = useState("");
    const [newClass, setNewClass] = useState({ name: "", semester: mockSemesters[0] ?? "", teacher: mockTeachers[0] ?? "" });

    const filteredClasses = classes.filter((c) => {
        if (filterSemester && c.semester !== filterSemester) return false;
        if (filterTeacher && c.teacher !== filterTeacher) return false;
        return true;
    });

    const handleAddClass = () => {
        if (!newClass.name.trim()) return;
        const cls: Class = {
            id: Date.now(),
            name: newClass.name,
            semester: newClass.semester ?? "",
            teacher: newClass.teacher ?? "",
            studentCount: 0,
            createdAt: new Date().toISOString().split("T")[0] ?? "",
        };
        setClasses([...classes, cls]);
        setNewClass({ name: "", semester: mockSemesters[0] ?? "", teacher: mockTeachers[0] ?? "" });
        setShowAddModal(false);
    };

    const handleDelete = (cls: Class) => {
        const message = cls.studentCount > 0
            ? `确定删除班级「${cls.name}」吗？\n\n⚠️ 警告：该班级有 ${cls.studentCount} 名学生\n\n删除后：\n- 班级内的学生将无法继续实验\n- 历史实验数据和成绩将被保留`
            : `确定删除班级「${cls.name}」吗？`;
        if (confirm(message)) {
            setClasses(classes.filter((c) => c.id !== cls.id));
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-semibold text-slate-800">班级列表</h3>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
                >
                    + 创建班级
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-4">
                <select
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    value={filterSemester}
                    onChange={(e) => setFilterSemester(e.target.value)}
                >
                    <option value="">全部学期</option>
                    {mockSemesters.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    value={filterTeacher}
                    onChange={(e) => setFilterTeacher(e.target.value)}
                >
                    <option value="">全部教师</option>
                    {mockTeachers.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

            {/* Table */}
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50">
                        <th className="text-left p-3 text-slate-600 font-medium">班级名称</th>
                        <th className="text-left p-3 text-slate-600 font-medium">学期</th>
                        <th className="text-left p-3 text-slate-600 font-medium">授课教师</th>
                        <th className="text-left p-3 text-slate-600 font-medium">学生人数</th>
                        <th className="text-left p-3 text-slate-600 font-medium">创建时间</th>
                        <th className="text-left p-3 text-slate-600 font-medium">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredClasses.map((cls) => (
                        <tr key={cls.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-800">{cls.name}</td>
                            <td className="p-3">
                                <span className="px-2 py-1 text-xs font-medium rounded bg-teal-100 text-teal-700">{cls.semester}</span>
                            </td>
                            <td className="p-3 text-slate-700">{cls.teacher}</td>
                            <td className="p-3 text-slate-600">{cls.studentCount}</td>
                            <td className="p-3 text-slate-500">{cls.createdAt}</td>
                            <td className="p-3">
                                <div className="flex gap-2">
                                    <button className="text-teal-600 hover:text-teal-700 text-sm">查看学生</button>
                                    <button className="text-teal-600 hover:text-teal-700 text-sm">编辑</button>
                                    <button onClick={() => handleDelete(cls)} className="text-red-500 hover:text-red-600 text-sm">删除</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {filteredClasses.length === 0 && <div className="text-center py-12 text-slate-500">暂无数据</div>}

            {/* Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-800 mb-6">创建班级</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">班级名称</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    placeholder="请输入班级名称"
                                    value={newClass.name}
                                    onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">所属学期</label>
                                <select
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                                    value={newClass.semester}
                                    onChange={(e) => setNewClass({ ...newClass, semester: e.target.value })}
                                >
                                    {mockSemesters.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">授课教师</label>
                                <select
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                                    value={newClass.teacher}
                                    onChange={(e) => setNewClass({ ...newClass, teacher: e.target.value })}
                                >
                                    {mockTeachers.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                                取消
                            </button>
                            <button onClick={handleAddClass} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
                                确认创建
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

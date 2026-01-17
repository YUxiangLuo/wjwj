import { useState } from "react";

const mockSemesters = [
    { id: 1, name: "2024-Spring", isCurrent: true, classCount: 8, createdAt: "2024-02-01" },
    { id: 2, name: "2023-Fall", isCurrent: false, classCount: 6, createdAt: "2023-09-01" },
    { id: 3, name: "2023-Spring", isCurrent: false, classCount: 5, createdAt: "2023-02-01" },
];

interface Semester {
    id: number;
    name: string;
    isCurrent: boolean;
    classCount: number;
    createdAt: string;
}

export function SemesterManagement() {
    const [semesters, setSemesters] = useState<Semester[]>(mockSemesters);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newSemesterName, setNewSemesterName] = useState("");
    const [setAsCurrent, setSetAsCurrent] = useState(false);

    const handleAddSemester = () => {
        if (!newSemesterName.trim()) return;
        const newSemester: Semester = {
            id: Date.now(),
            name: newSemesterName,
            isCurrent: setAsCurrent,
            classCount: 0,
            createdAt: new Date().toISOString().split("T")[0] ?? "",
        };
        if (setAsCurrent) {
            setSemesters(semesters.map(s => ({ ...s, isCurrent: false })).concat(newSemester));
        } else {
            setSemesters([...semesters, newSemester]);
        }
        setNewSemesterName("");
        setSetAsCurrent(false);
        setShowAddModal(false);
    };

    const handleSetCurrent = (id: number) => {
        setSemesters(semesters.map(s => ({ ...s, isCurrent: s.id === id })));
    };

    const handleDelete = (id: number) => {
        const semester = semesters.find(s => s.id === id);
        if (semester?.classCount && semester.classCount > 0) {
            alert("该学期下有班级，无法删除");
            return;
        }
        if (confirm(`确定删除学期「${semester?.name}」吗？`)) {
            setSemesters(semesters.filter(s => s.id !== id));
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-semibold text-slate-800">学期列表</h3>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
                >
                    + 创建学期
                </button>
            </div>

            {/* Table */}
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50">
                        <th className="text-left p-3 text-slate-600 font-medium">学期名称</th>
                        <th className="text-left p-3 text-slate-600 font-medium">状态</th>
                        <th className="text-left p-3 text-slate-600 font-medium">班级数量</th>
                        <th className="text-left p-3 text-slate-600 font-medium">创建时间</th>
                        <th className="text-left p-3 text-slate-600 font-medium">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {semesters.map((semester) => (
                        <tr key={semester.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-800">{semester.name}</td>
                            <td className="p-3">
                                {semester.isCurrent ? (
                                    <span className="px-2 py-1 text-xs font-medium rounded bg-emerald-100 text-emerald-700">当前学期</span>
                                ) : (
                                    <span className="px-2 py-1 text-xs font-medium rounded bg-slate-100 text-slate-600">历史学期</span>
                                )}
                            </td>
                            <td className="p-3 text-slate-600">{semester.classCount}</td>
                            <td className="p-3 text-slate-500">{semester.createdAt}</td>
                            <td className="p-3">
                                <div className="flex gap-2">
                                    {!semester.isCurrent && (
                                        <button onClick={() => handleSetCurrent(semester.id)} className="text-teal-600 hover:text-teal-700 text-sm">
                                            设为当前
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(semester.id)} className="text-red-500 hover:text-red-600 text-sm">
                                        删除
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-slate-800 mb-6">创建学期</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">学期名称</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                    placeholder="例如：2024-Fall"
                                    value={newSemesterName}
                                    onChange={(e) => setNewSemesterName(e.target.value)}
                                />
                                <p className="text-xs text-slate-500 mt-1">格式：YYYY-Spring 或 YYYY-Fall</p>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={setAsCurrent} onChange={(e) => setSetAsCurrent(e.target.checked)} className="w-4 h-4" />
                                设为当前学期
                            </label>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                                取消
                            </button>
                            <button onClick={handleAddSemester} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
                                确认创建
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

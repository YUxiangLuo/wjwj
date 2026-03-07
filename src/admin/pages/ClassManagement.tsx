import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Users, Pencil, Loader2, School, CalendarDays, UserCircle2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classApi, semesterApi, teacherApi, type Class, type Semester, type Teacher } from "../api-client";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function ClassManagement() {
    const navigate = useNavigate();
    const { confirm, dialog } = useConfirmDialog();
    const [classes, setClasses] = useState<Class[]>([]);
    const [semesters, setSemesters] = useState<Semester[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [filterSemester, setFilterSemester] = useState("all");
    const [filterTeacher, setFilterTeacher] = useState("all");
    const [newClass, setNewClass] = useState({ name: "", semesterId: "", teacherId: "" });
    const [editingClass, setEditingClass] = useState<Class | null>(null);
    const [editForm, setEditForm] = useState({ name: "", teacherId: "" });
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadClasses();
    }, [filterSemester, filterTeacher]);

    async function loadInitialData() {
        try {
            const [semestersRes, teachersRes] = await Promise.all([
                semesterApi.list(),
                teacherApi.list(),
            ]);

            if (semestersRes.success && semestersRes.data) {
                setSemesters(semestersRes.data);
                const firstSemester = semestersRes.data[0];
                if (firstSemester) {
                    setNewClass(prev => ({ ...prev, semesterId: String(firstSemester.id) }));
                }
            }

            if (teachersRes.success && teachersRes.data) {
                const activeTeachers = teachersRes.data.filter(t => t.status === 1);
                setTeachers(activeTeachers);
                const firstTeacher = activeTeachers[0];
                if (firstTeacher) {
                    setNewClass(prev => ({ ...prev, teacherId: String(firstTeacher.id) }));
                }
            }
        } catch (error) {
            console.error("Failed to load initial data:", error);
        }

        loadClasses();
    }

    async function loadClasses() {
        setLoading(true);
        try {
            const res = await classApi.list({
                semesterId: filterSemester,
                teacherId: filterTeacher,
            });
            if (res.success && res.data) {
                setClasses(res.data);
            }
        } catch (error) {
            console.error("Failed to load classes:", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddClass() {
        if (!newClass.name.trim() || !newClass.semesterId || !newClass.teacherId) return;

        setSubmitting(true);
        try {
            const res = await classApi.create({
                name: newClass.name.trim(),
                semesterId: parseInt(newClass.semesterId),
                teacherId: parseInt(newClass.teacherId),
            });

            if (res.success) {
                setNewClass({ name: "", semesterId: newClass.semesterId, teacherId: newClass.teacherId });
                setShowAddModal(false);
                loadClasses();
            } else {
                toast.error(res.error?.message ?? "创建失败");
            }
        } catch (error) {
            console.error("Failed to create class:", error);
            toast.error("创建失败");
        } finally {
            setSubmitting(false);
        }
    }

    function openEditModal(cls: Class) {
        setEditingClass(cls);
        setEditForm({ name: cls.name, teacherId: String(cls.teacherId) });
        setShowEditModal(true);
    }

    async function handleEditClass() {
        if (!editingClass || !editForm.name.trim()) return;

        const teacherChanged = editForm.teacherId !== String(editingClass.teacherId);

        if (teacherChanged) {
            const newTeacher = teachers.find((t) => t.id === parseInt(editForm.teacherId));
            const shouldReassign = await confirm({
                title: `更换班级「${editingClass.name}」的授课教师`,
                description: `将授课教师调整为「${newTeacher?.name ?? "未选择"}」后：\n- 原教师将无法管理该班级\n- 新教师将获得该班级的管理权限`,
                confirmLabel: "确认更换",
            });
            if (!shouldReassign) {
                return;
            }
        }

        setSubmitting(true);
        try {
            const res = await classApi.update(editingClass.id, {
                name: editForm.name.trim(),
                teacherId: parseInt(editForm.teacherId),
            });

            if (res.success) {
                setShowEditModal(false);
                setEditingClass(null);
                loadClasses();
            } else {
                toast.error(res.error?.message ?? "更新失败");
            }
        } catch (error) {
            console.error("Failed to update class:", error);
            toast.error("更新失败");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDelete(cls: Class) {
        const description = cls.studentCount > 0
            ? `该班级当前有 ${cls.studentCount} 名学生。\n\n删除后：\n- 班级内的学生将无法继续实验\n- 历史实验数据和成绩将被保留`
            : "删除后该班级将从列表中移除，且无法恢复。";

        const shouldDelete = await confirm({
            title: `删除班级「${cls.name}」`,
            description,
            confirmLabel: "删除班级",
            tone: "destructive",
        });
        if (!shouldDelete) {
            return;
        }

        try {
            const res = await classApi.delete(cls.id);
            if (res.success) {
                loadClasses();
            } else {
                toast.error(res.error?.message ?? "删除失败");
            }
        } catch (error) {
            console.error("Failed to delete class:", error);
            toast.error("删除失败");
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("zh-CN");
    };

    const summary = useMemo(() => {
        const total = classes.length;
        const studentTotal = classes.reduce((sum, cls) => sum + cls.studentCount, 0);
        const currentSemesterName = semesters.find((s) => s.isCurrent)?.name ?? "暂无";
        const teacherCount = new Set(classes.map((cls) => cls.teacherId)).size;
        return { total, studentTotal, currentSemesterName, teacherCount };
    }, [classes, semesters]);

    const filteredClasses = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return classes.filter((cls) => {
            if (!keyword) return true;
            return (
                cls.name.toLowerCase().includes(keyword) ||
                (cls.semesterName?.toLowerCase() ?? "").includes(keyword) ||
                (cls.teacherName?.toLowerCase() ?? "").includes(keyword)
            );
        });
    }, [classes, searchTerm]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-100">班级管理</h2>
                    <p className="text-sm text-slate-400 mt-1">管理班级、授课教师与学生规模。</p>
                </div>
                <Button data-testid="class-create-open" onClick={() => setShowAddModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
                    <Plus className="w-4 h-4 mr-1" />
                    创建班级
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Classes</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <School className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Students</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{loading ? "-" : summary.studentTotal}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Current Term</p>
                            <p className="text-sm font-bold text-slate-100 mt-2">{loading ? "-" : summary.currentSemesterName}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Teachers</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{loading ? "-" : summary.teacherCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center border border-purple-500/20">
                            <UserCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-800 bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-base text-slate-100">班级列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredClasses.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <Input
                            placeholder="搜索班级 / 学期 / 教师"
                            data-testid="class-search-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500 sm:w-64 focus:border-indigo-500/50"
                        />
                        <Select value={filterSemester} onValueChange={setFilterSemester}>
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200 sm:w-36">
                                <SelectValue placeholder="全部学期" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                <SelectItem value="all">全部学期</SelectItem>
                                {semesters.map((s) => (
                                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200 sm:w-36">
                                <SelectValue placeholder="全部教师" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                <SelectItem value="all">全部教师</SelectItem>
                                {teachers.map((t) => (
                                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-800 hover:bg-slate-900/50">
                                    <TableHead className="text-slate-400">班级名称</TableHead>
                                    <TableHead className="text-slate-400">学期</TableHead>
                                    <TableHead className="text-slate-400">授课教师</TableHead>
                                    <TableHead className="text-slate-400">学生人数</TableHead>
                                    <TableHead className="text-slate-400">创建时间</TableHead>
                                    <TableHead className="text-slate-400 text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredClasses.map((cls) => (
                                    <TableRow key={cls.id} className="border-slate-800 hover:bg-slate-800/50 transition-colors">
                                        <TableCell className="font-medium text-slate-200">{cls.name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                                                {cls.semesterName}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-300">{cls.teacherName}</TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300">
                                                {cls.studentCount}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-slate-500 text-xs">{formatDate(cls.createdAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => navigate(`/student?classId=${cls.id}`)}
                                                    className="h-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-500/10"
                                                >
                                                    <Users className="w-3.5 h-3.5 mr-1" />
                                                    学生
                                                </Button>
                                                <Button data-testid={`class-edit-open-${cls.id}`} variant="ghost" size="sm" onClick={() => openEditModal(cls)} className="h-8 text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10">
                                                    <Pencil className="w-3.5 h-3.5 mr-1" />
                                                    编辑
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    data-testid={`class-delete-${cls.id}`}
                                                    onClick={() => handleDelete(cls)}
                                                    className="h-8 text-slate-400 hover:text-rose-600 hover:bg-rose-500/10"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                                                    删除
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredClasses.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-16 text-slate-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                                                    <Search className="w-5 h-5 text-slate-500" />
                                                </div>
                                                <p>暂无符合条件的数据</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* 创建班级弹窗 */}
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">创建班级</DialogTitle>
                        <DialogDescription className="text-slate-400">为指定学期和教师创建一个新的教学班级。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="className" className="text-slate-300">班级名称</Label>
                            <Input
                                id="className"
                                data-testid="class-create-name"
                                placeholder="请输入班级名称"
                                value={newClass.name}
                                onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                                className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500 focus:border-indigo-500/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-300">所属学期</Label>
                            <Select value={newClass.semesterId} onValueChange={(v) => setNewClass({ ...newClass, semesterId: v })}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200">
                                    <SelectValue placeholder="选择学期" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                    {semesters.map((s) => (
                                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-300">授课教师</Label>
                            <Select value={newClass.teacherId} onValueChange={(v) => setNewClass({ ...newClass, teacherId: v })}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200">
                                    <SelectValue placeholder="选择教师" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                    {teachers.map((t) => (
                                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowAddModal(false)} disabled={submitting} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">
                            取消
                        </Button>
                        <Button
                            data-testid="class-create-submit"
                            onClick={handleAddClass}
                            disabled={submitting || !newClass.name.trim() || !newClass.semesterId || !newClass.teacherId}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            确认创建
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 编辑班级弹窗 */}
            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">编辑班级</DialogTitle>
                        <DialogDescription className="text-slate-400">更新班级名称或重新分配授课教师。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="editClassName" className="text-slate-300">班级名称</Label>
                            <Input
                                id="editClassName"
                                data-testid="class-edit-name"
                                placeholder="请输入班级名称"
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500 focus:border-indigo-500/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-300">所属学期</Label>
                            <Input value={editingClass?.semesterName ?? ""} disabled className="bg-slate-900 border-slate-800 text-slate-400" />
                            <p className="text-xs text-slate-500">学期不可更改</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-300">授课教师</Label>
                            <Select value={editForm.teacherId} onValueChange={(v) => setEditForm({ ...editForm, teacherId: v })}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200">
                                    <SelectValue placeholder="选择教师" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                    {teachers.map((t) => (
                                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowEditModal(false)} disabled={submitting} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">
                            取消
                        </Button>
                        <Button
                            data-testid="class-edit-submit"
                            onClick={handleEditClass}
                            disabled={submitting || !editForm.name.trim()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {dialog}
        </div>
    );
}

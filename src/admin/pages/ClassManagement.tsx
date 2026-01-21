import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Users, Pencil, Loader2, School, CalendarDays, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classApi, semesterApi, teacherApi, type Class, type Semester, type Teacher } from "../api-client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function ClassManagement() {
    const navigate = useNavigate();
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
                // 默认选中第一个学期
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
            const newTeacher = teachers.find(t => t.id === parseInt(editForm.teacherId));
            if (!confirm(`确定将班级「${editingClass.name}」的授课教师更换为「${newTeacher?.name}」吗？\n\n更换后：\n- 原教师将无法管理该班级\n- 新教师将获得该班级的管理权限`)) {
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
        const message = cls.studentCount > 0
            ? `确定删除班级「${cls.name}」吗？\n\n⚠️ 警告：该班级有 ${cls.studentCount} 名学生\n\n删除后：\n- 班级内的学生将无法继续实验\n- 历史实验数据和成绩将被保留`
            : `确定删除班级「${cls.name}」吗？`;

        if (!confirm(message)) {
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
                cls.semesterName.toLowerCase().includes(keyword) ||
                cls.teacherName.toLowerCase().includes(keyword)
            );
        });
    }, [classes, searchTerm]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">班级管理</h2>
                    <p className="text-sm text-slate-500 mt-1">管理班级、授课教师与学生规模。</p>
                </div>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4" />
                    创建班级
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">班级总数</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <School className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">学生总数</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.studentTotal}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">当前学期</p>
                            <p className="text-sm font-medium text-slate-900">{loading ? "-" : summary.currentSemesterName}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">授课教师</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.teacherCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                            <UserCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <CardTitle className="text-base">班级列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredClasses.length} 条</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <Input
                            placeholder="搜索班级 / 学期 / 教师"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="sm:w-64"
                        />
                        <Select value={filterSemester} onValueChange={setFilterSemester}>
                            <SelectTrigger className="sm:w-40">
                                <SelectValue placeholder="全部学期" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部学期</SelectItem>
                                {semesters.map((s) => (
                                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                            <SelectTrigger className="sm:w-40">
                                <SelectValue placeholder="全部教师" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部教师</SelectItem>
                                {teachers.map((t) => (
                                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>班级名称</TableHead>
                                    <TableHead>学期</TableHead>
                                    <TableHead>授课教师</TableHead>
                                    <TableHead>学生人数</TableHead>
                                    <TableHead>创建时间</TableHead>
                                    <TableHead>操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredClasses.map((cls) => (
                                    <TableRow key={cls.id}>
                                        <TableCell className="font-medium text-slate-900">{cls.name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-100">
                                                {cls.semesterName}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{cls.teacherName}</TableCell>
                                        <TableCell>{cls.studentCount}</TableCell>
                                        <TableCell className="text-slate-500">{formatDate(cls.createdAt)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => navigate(`/student?classId=${cls.id}`)}
                                                >
                                                    <Users className="w-3 h-3 mr-1" />
                                                    查看学生
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => openEditModal(cls)}>
                                                    <Pencil className="w-3 h-3 mr-1" />
                                                    编辑
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(cls)}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="w-3 h-3 mr-1" />
                                                    删除
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredClasses.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                                            暂无符合条件的数据
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
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>创建班级</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="className">班级名称</Label>
                            <Input
                                id="className"
                                placeholder="请输入班级名称"
                                value={newClass.name}
                                onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>所属学期</Label>
                            <Select value={newClass.semesterId} onValueChange={(v) => setNewClass({ ...newClass, semesterId: v })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择学期" />
                                </SelectTrigger>
                                <SelectContent>
                                    {semesters.map((s) => (
                                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>授课教师</Label>
                            <Select value={newClass.teacherId} onValueChange={(v) => setNewClass({ ...newClass, teacherId: v })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择教师" />
                                </SelectTrigger>
                                <SelectContent>
                                    {teachers.map((t) => (
                                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={submitting}>
                            取消
                        </Button>
                        <Button
                            onClick={handleAddClass}
                            disabled={submitting || !newClass.name.trim() || !newClass.semesterId || !newClass.teacherId}
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            确认创建
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 编辑班级弹窗 */}
            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>编辑班级</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="editClassName">班级名称</Label>
                            <Input
                                id="editClassName"
                                placeholder="请输入班级名称"
                                value={editForm.name}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>所属学期</Label>
                            <Input value={editingClass?.semesterName ?? ""} disabled />
                            <p className="text-xs text-muted-foreground">学期不可更改</p>
                        </div>
                        <div className="space-y-2">
                            <Label>授课教师</Label>
                            <Select value={editForm.teacherId} onValueChange={(v) => setEditForm({ ...editForm, teacherId: v })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择教师" />
                                </SelectTrigger>
                                <SelectContent>
                                    {teachers.map((t) => (
                                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={submitting}>
                            取消
                        </Button>
                        <Button
                            onClick={handleEditClass}
                            disabled={submitting || !editForm.name.trim()}
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

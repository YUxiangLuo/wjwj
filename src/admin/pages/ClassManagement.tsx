import { useState, useEffect } from "react";
import { Plus, Trash2, Users, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classApi, semesterApi, teacherApi, type Class, type Semester, type Teacher } from "../api-client";

export function ClassManagement() {
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
                if (semestersRes.data.length > 0) {
                    setNewClass(prev => ({ ...prev, semesterId: String(semestersRes.data![0].id) }));
                }
            }

            if (teachersRes.success && teachersRes.data) {
                const activeTeachers = teachersRes.data.filter(t => t.status === 1);
                setTeachers(activeTeachers);
                if (activeTeachers.length > 0) {
                    setNewClass(prev => ({ ...prev, teacherId: String(activeTeachers[0].id) }));
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
                alert(res.error?.message ?? "创建失败");
            }
        } catch (error) {
            console.error("Failed to create class:", error);
            alert("创建失败");
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
                alert(res.error?.message ?? "更新失败");
            }
        } catch (error) {
            console.error("Failed to update class:", error);
            alert("更新失败");
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
                alert(res.error?.message ?? "删除失败");
            }
        } catch (error) {
            console.error("Failed to delete class:", error);
            alert("删除失败");
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("zh-CN");
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">班级列表</CardTitle>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4" />
                    创建班级
                </Button>
            </CardHeader>
            <CardContent>
                <div className="flex gap-3 mb-4">
                    <Select value={filterSemester} onValueChange={setFilterSemester}>
                        <SelectTrigger className="w-40">
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
                        <SelectTrigger className="w-40">
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
                            {classes.map((cls) => (
                                <TableRow key={cls.id}>
                                    <TableCell className="font-medium">{cls.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                            {cls.semesterName}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{cls.teacherName}</TableCell>
                                    <TableCell>{cls.studentCount}</TableCell>
                                    <TableCell className="text-muted-foreground">{formatDate(cls.createdAt)}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="sm">
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
                            {classes.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                        暂无数据
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

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
        </Card>
    );
}

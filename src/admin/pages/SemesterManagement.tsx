import { useState, useEffect } from "react";
import { Plus, Trash2, Star, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { semesterApi, type Semester } from "../api-client";
import { toast } from "sonner";

export function SemesterManagement() {
    const [semesters, setSemesters] = useState<Semester[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [newSemesterName, setNewSemesterName] = useState("");
    const [setAsCurrent, setSetAsCurrent] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingSemester, setEditingSemester] = useState<Semester | null>(null);
    const [editName, setEditName] = useState("");

    useEffect(() => {
        loadSemesters();
    }, []);

    async function loadSemesters() {
        setLoading(true);
        try {
            const res = await semesterApi.list();
            if (res.success && res.data) {
                setSemesters(res.data);
            }
        } catch (error) {
            console.error("Failed to load semesters:", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddSemester() {
        if (!newSemesterName.trim()) return;

        setSubmitting(true);
        try {
            const res = await semesterApi.create({
                name: newSemesterName.trim(),
                setAsCurrent,
            });

            if (res.success) {
                setNewSemesterName("");
                setSetAsCurrent(false);
                setShowAddModal(false);
                loadSemesters();
            } else {
                toast.error(res.error?.message ?? "创建失败");
            }
        } catch (error) {
            console.error("Failed to create semester:", error);
            toast.error("创建失败");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleSetCurrent(id: number) {
        try {
            const res = await semesterApi.setCurrent(id);
            if (res.success) {
                loadSemesters();
            } else {
                toast.error(res.error?.message ?? "设置失败");
            }
        } catch (error) {
            console.error("Failed to set current semester:", error);
            toast.error("设置失败");
        }
    }

    function openEdit(semester: Semester) {
        setEditingSemester(semester);
        setEditName(semester.name);
        setShowEditModal(true);
    }

    async function handleEditSemester() {
        if (!editingSemester || !editName.trim()) return;

        setSubmitting(true);
        try {
            const res = await semesterApi.update(editingSemester.id, { name: editName.trim() });
            if (res.success) {
                setShowEditModal(false);
                setEditingSemester(null);
                loadSemesters();
            } else {
                toast.error(res.error?.message ?? "更新失败");
            }
        } catch (error) {
            console.error("Failed to update semester:", error);
            toast.error("更新失败");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDelete(semester: Semester) {
        if (semester.classCount > 0) {
            toast.error("该学期下有班级，无法删除");
            return;
        }

        if (!confirm(`确定删除学期「${semester.name}」吗？`)) {
            return;
        }

        try {
            const res = await semesterApi.delete(semester.id);
            if (res.success) {
                loadSemesters();
            } else {
                toast.error(res.error?.message ?? "删除失败");
            }
        } catch (error) {
            console.error("Failed to delete semester:", error);
            toast.error("删除失败");
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("zh-CN");
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">学期列表</CardTitle>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4" />
                    创建学期
                </Button>
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
                                <TableHead>学期名称</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>班级数量</TableHead>
                                <TableHead>创建时间</TableHead>
                                <TableHead>操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {semesters.map((semester) => (
                                <TableRow key={semester.id}>
                                    <TableCell className="font-medium">{semester.name}</TableCell>
                                    <TableCell>
                                        {semester.isCurrent ? (
                                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">当前学期</Badge>
                                        ) : (
                                            <Badge variant="secondary">历史学期</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>{semester.classCount}</TableCell>
                                    <TableCell className="text-muted-foreground">{formatDate(semester.createdAt)}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            {!semester.isCurrent && (
                                                <Button variant="ghost" size="sm" onClick={() => handleSetCurrent(semester.id)}>
                                                    <Star className="w-3 h-3 mr-1" />
                                                    设为当前
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="sm" onClick={() => openEdit(semester)}>
                                                <Pencil className="w-3 h-3 mr-1" />
                                                编辑
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(semester)}
                                                className="text-destructive hover:text-destructive"
                                                disabled={semester.classCount > 0}
                                            >
                                                <Trash2 className="w-3 h-3 mr-1" />
                                                删除
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {semesters.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                        暂无数据
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>创建学期</DialogTitle>
                        <DialogDescription>创建一个新的学期用于组织班级和教学任务</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="semesterName">学期名称</Label>
                            <Input
                                id="semesterName"
                                placeholder="例如：2024-Fall"
                                value={newSemesterName}
                                onChange={(e) => setNewSemesterName(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">格式：YYYY-Spring 或 YYYY-Fall</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch
                                id="setAsCurrent"
                                checked={setAsCurrent}
                                onCheckedChange={setSetAsCurrent}
                            />
                            <Label htmlFor="setAsCurrent" className="cursor-pointer">设为当前学期</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={submitting}>
                            取消
                        </Button>
                        <Button onClick={handleAddSemester} disabled={submitting || !newSemesterName.trim()}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            确认创建
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>编辑学期</DialogTitle>
                        <DialogDescription>修改学期名称</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="editSemesterName">学期名称</Label>
                            <Input
                                id="editSemesterName"
                                placeholder="例如：2024-Fall"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={submitting}>
                            取消
                        </Button>
                        <Button onClick={handleEditSemester} disabled={submitting || !editName.trim()}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

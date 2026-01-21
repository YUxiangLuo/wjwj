import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Star, Loader2, Pencil, CalendarDays, School, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "current" | "history">("all");

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

    const summary = useMemo(() => {
        const total = semesters.length;
        const current = semesters.find((item) => item.isCurrent);
        const history = total - (current ? 1 : 0);
        const withClasses = semesters.filter((item) => item.classCount > 0).length;
        return {
            total,
            currentName: current?.name ?? "暂无",
            history,
            withClasses,
        };
    }, [semesters]);

    const filteredSemesters = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return semesters.filter((semester) => {
            const matchesKeyword = !keyword || semester.name.toLowerCase().includes(keyword);
            const matchesStatus =
                statusFilter === "all" ||
                (statusFilter === "current" ? semester.isCurrent : !semester.isCurrent);
            return matchesKeyword && matchesStatus;
        });
    }, [semesters, searchTerm, statusFilter]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">学期管理</h2>
                    <p className="text-sm text-slate-500 mt-1">维护学期信息并标记当前学期。</p>
                </div>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4" />
                    创建学期
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">学期总数</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">当前学期</p>
                            <p className="text-sm font-medium text-slate-900">{loading ? "-" : summary.currentName}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Star className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">历史学期</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.history}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                            <CheckCircle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">含班级学期</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.withClasses}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                            <School className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <CardTitle className="text-base">学期列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredSemesters.length} 条</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <Input
                            placeholder="搜索学期名称"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="sm:w-64"
                        />
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "current" | "history")}>
                            <SelectTrigger className="sm:w-36">
                                <SelectValue placeholder="状态筛选" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="current">当前学期</SelectItem>
                                <SelectItem value="history">历史学期</SelectItem>
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
                                    <TableHead>学期名称</TableHead>
                                    <TableHead>状态</TableHead>
                                    <TableHead>班级数量</TableHead>
                                    <TableHead>创建时间</TableHead>
                                    <TableHead>操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredSemesters.map((semester) => (
                                    <TableRow key={semester.id}>
                                        <TableCell className="font-medium text-slate-900">{semester.name}</TableCell>
                                        <TableCell>
                                            {semester.isCurrent ? (
                                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">当前学期</Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-slate-100 text-slate-600">历史学期</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>{semester.classCount}</TableCell>
                                        <TableCell className="text-slate-500">{formatDate(semester.createdAt)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-2">
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
                                {filteredSemesters.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                                            暂无符合条件的数据
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

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
        </div>
    );
}

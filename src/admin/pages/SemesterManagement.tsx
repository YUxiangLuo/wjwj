import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Star, Loader2, Pencil, CalendarDays, School, CheckCircle, Search } from "lucide-react";
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
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { toast } from "sonner";

export function SemesterManagement() {
    const { confirm, dialog } = useConfirmDialog();
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

        // Warn if format doesn't match recommended pattern
        const formatRegex = /^\d{4}-(Spring|Fall)$/;
        if (!formatRegex.test(newSemesterName.trim())) {
            const shouldContinue = await confirm({
                title: "学期名称不符合推荐格式",
                description: "建议使用 YYYY-Spring 或 YYYY-Fall。\n继续创建后不会影响系统功能，但会降低列表可读性。",
                confirmLabel: "继续创建",
            });
            if (!shouldContinue) {
                return;
            }
        }

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

        const shouldDelete = await confirm({
            title: `删除学期「${semester.name}」`,
            description: "删除后该学期将从列表中移除，且无法恢复。",
            confirmLabel: "删除学期",
            tone: "destructive",
        });
        if (!shouldDelete) {
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
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">学期管理</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">维护学期信息并标记当前学期。</p>
                </div>
                <Button data-testid="semester-create-open" onClick={() => setShowAddModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
                    <Plus className="w-4 h-4 mr-1" />
                    创建学期
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Semesters</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Current Semester</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-2">{loading ? "-" : summary.currentName}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                            <Star className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">History</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{loading ? "-" : summary.history}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center border border-slate-300 dark:border-slate-700">
                            <CheckCircle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">With Classes</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{loading ? "-" : summary.withClasses}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center border border-purple-500/20">
                            <School className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-base text-slate-900 dark:text-slate-100">学期列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredSemesters.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <Input
                            placeholder="搜索学期名称..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 sm:w-64 focus:border-indigo-500/50 focus:ring-indigo-500/20"
                        />
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "current" | "history")}>
                            <SelectTrigger className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:w-36 focus:ring-indigo-500/20">
                                <SelectValue placeholder="状态筛选" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="current">当前学期</SelectItem>
                                <SelectItem value="history">历史学期</SelectItem>
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
                                <TableRow className="border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                                    <TableHead className="text-slate-600 dark:text-slate-400">学期名称</TableHead>
                                    <TableHead className="text-slate-600 dark:text-slate-400">状态</TableHead>
                                    <TableHead className="text-slate-600 dark:text-slate-400">班级数量</TableHead>
                                    <TableHead className="text-slate-600 dark:text-slate-400">创建时间</TableHead>
                                    <TableHead className="text-slate-600 dark:text-slate-400 text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredSemesters.map((semester) => (
                                    <TableRow key={semester.id} className="border-slate-200 dark:border-slate-800 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors">
                                        <TableCell className="font-medium text-slate-800 dark:text-slate-200">{semester.name}</TableCell>
                                        <TableCell>
                                            {semester.isCurrent ? (
                                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20">当前学期</Badge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700">历史学期</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-slate-700 dark:text-slate-300">
                                            <div className="flex items-center gap-2">
                                                <School className="w-3.5 h-3.5 text-slate-500" />
                                                {semester.classCount}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-slate-500">{formatDate(semester.createdAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {!semester.isCurrent && (
                                                    <Button data-testid={`semester-set-current-${semester.id}`} variant="ghost" size="sm" onClick={() => handleSetCurrent(semester.id)} className="text-slate-600 dark:text-slate-400 hover:text-emerald-600 hover:bg-emerald-500/10 h-8">
                                                        <Star className="w-3.5 h-3.5 mr-1.5" />
                                                        设为当前
                                                    </Button>
                                                )}
                                                <Button data-testid={`semester-edit-open-${semester.id}`} variant="ghost" size="sm" onClick={() => openEdit(semester)} className="text-slate-600 dark:text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10 h-8">
                                                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                                                    编辑
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    data-testid={`semester-delete-${semester.id}`}
                                                    onClick={() => handleDelete(semester)}
                                                    className="text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 h-8"
                                                    disabled={semester.classCount > 0}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                                    删除
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredSemesters.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-16 text-slate-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
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

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 dark:text-slate-100">创建学期</DialogTitle>
                        <DialogDescription className="text-slate-600 dark:text-slate-400">创建一个新的学期用于组织班级和教学任务</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="semesterName" className="text-slate-700 dark:text-slate-300">学期名称</Label>
                            <Input
                                id="semesterName"
                                data-testid="semester-create-name"
                                placeholder="例如：2024-Fall"
                                value={newSemesterName}
                                onChange={(e) => setNewSemesterName(e.target.value)}
                                className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:border-indigo-500/50"
                            />
                            <p className="text-xs text-slate-500">建议格式：YYYY-Spring 或 YYYY-Fall</p>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50">
                            <div className="space-y-0.5">
                                <Label htmlFor="setAsCurrent" className="text-base text-slate-800 dark:text-slate-200 cursor-pointer">设为当前学期</Label>
                                <p className="text-xs text-slate-500">创建后立即生效为默认学期</p>
                            </div>
                            <Switch
                                id="setAsCurrent"
                                checked={setAsCurrent}
                                onCheckedChange={setSetAsCurrent}
                                className="data-[state=checked]:bg-indigo-600"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowAddModal(false)} disabled={submitting} className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800">
                            取消
                        </Button>
                        <Button data-testid="semester-create-submit" onClick={handleAddSemester} disabled={submitting || !newSemesterName.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            确认创建
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 dark:text-slate-100">编辑学期</DialogTitle>
                        <DialogDescription className="text-slate-600 dark:text-slate-400">修改学期名称</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="editSemesterName" className="text-slate-700 dark:text-slate-300">学期名称</Label>
                            <Input
                                id="editSemesterName"
                                data-testid="semester-edit-name"
                                placeholder="例如：2024-Fall"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:border-indigo-500/50"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowEditModal(false)} disabled={submitting} className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800">
                            取消
                        </Button>
                        <Button data-testid="semester-edit-submit" onClick={handleEditSemester} disabled={submitting || !editName.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
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

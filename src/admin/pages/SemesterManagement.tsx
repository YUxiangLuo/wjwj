import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
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
import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingStatus } from "@/components/LoadingStatus";

export function isRecommendedSemesterName(value: string) {
    return /^\d{4}-\d{4}-[12]$/.test(value.trim());
}

export function SemesterManagement() {
    const { confirm, dialog } = useConfirmDialog();
    const [semesters, setSemesters] = useState<Semester[]>([]);
    const { loading, error: loadError, run } = useAsyncLoad("学期列表加载失败");
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
        return run(async () => requireApiData(await semesterApi.list(), "学期列表加载失败"), setSemesters);
    }

    async function handleAddSemester() {
        if (!newSemesterName.trim()) return;

        // Keep the recommendation aligned with the academic-year names used by
        // the dashboard and the default teaching data.
        if (!isRecommendedSemesterName(newSemesterName)) {
            const shouldContinue = await confirm({
                title: "学期名称不符合推荐格式",
                description: "建议使用 YYYY-YYYY-1 或 YYYY-YYYY-2（例如 2026-2027-1）。\n继续创建后不会影响系统功能，但会降低列表可读性。",
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
        return new Date(dateStr).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
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
            <PageHeader border={false}>
                <div>
                    <h2 className="text-subheading font-semibold text-foreground">学期管理</h2>
                    <p className="text-label text-muted-foreground mt-1">维护学期信息并标记当前学期。</p>
                </div>
                <Button data-testid="semester-create-open" onClick={() => setShowAddModal(true)} className="bg-primary hover:bg-primary-hover text-primary-foreground ">
                    <Plus className="w-4 h-4 mr-1" />
                    创建学期
                </Button>
            </PageHeader>

            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">学期总数</p>
                            <p className="text-page-title font-bold text-foreground mt-1">{loading || loadError ? "-" : summary.total}</p>
                        </div>
                        <IconTile intent="info">
                            <CalendarDays className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">当前学期</p>
                            <p className="text-label font-bold text-foreground mt-2">{loading || loadError ? "-" : summary.currentName}</p>
                        </div>
                        <IconTile intent="success">
                            <Star className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">历史学期</p>
                            <p className="text-page-title font-bold text-foreground mt-1">{loading || loadError ? "-" : summary.history}</p>
                        </div>
                        <div className="w-10 h-10 rounded-surface bg-muted text-muted-foreground flex items-center justify-center border border-input">
                            <CheckCircle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">已建班学期</p>
                            <p className="text-page-title font-bold text-foreground mt-1">{loading || loadError ? "-" : summary.withClasses}</p>
                        </div>
                        <IconTile intent="auxiliary">
                            <School className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <CardTitle className="text-body text-foreground">学期列表</CardTitle>
                        <p className="text-meta text-muted-foreground mt-1">共 {filteredSemesters.length} 条数据</p>
                    </div>
                    <div className="flex gap-3 flex-row w-auto">
                        <Input
                            placeholder="搜索学期名称..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-card border-input text-foreground placeholder:text-muted-foreground w-64 focus:border-ring focus:ring-ring"
                        />
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "current" | "history")}>
                            <SelectTrigger aria-label="按学期状态筛选" className="bg-card border-input text-foreground w-36 focus:ring-ring">
                                <SelectValue placeholder="状态筛选" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="current">当前学期</SelectItem>
                                <SelectItem value="history">历史学期</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </PageHeader>
                <CardContent className="pt-0">
                    {loadError ? <RequestError message={loadError} onRetry={() => void loadSemesters()} /> : loading ? (
                        <LoadingStatus className="py-12" iconClassName="text-muted-foreground" label="正在加载学期列表" />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border">
                                    <TableHead className="text-muted-foreground">学期名称</TableHead>
                                    <TableHead className="text-muted-foreground">状态</TableHead>
                                    <TableHead className="text-muted-foreground">班级数量</TableHead>
                                    <TableHead className="text-muted-foreground">创建时间</TableHead>
                                    <TableHead className="text-muted-foreground text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredSemesters.map((semester) => (
                                    <TableRow key={semester.id} className="border-border hover:bg-muted transition-none">
                                        <TableCell className="font-medium text-foreground">{semester.name}</TableCell>
                                        <TableCell>
                                            {semester.isCurrent ? (
                                                <StatusBadge intent="success">当前学期</StatusBadge>
                                            ) : (
                                                <Badge variant="secondary" className="bg-muted text-muted-foreground">历史学期</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-foreground">
                                            <div className="flex items-center gap-2">
                                                <School className="w-3.5 h-3.5 text-muted-foreground" />
                                                {semester.classCount}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{formatDate(semester.createdAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {!semester.isCurrent && (
                                                    <Button data-testid={`semester-set-current-${semester.id}`} variant="ghost" size="sm" onClick={() => handleSetCurrent(semester.id)} className="text-muted-foreground hover:text-success hover:bg-success-muted h-8">
                                                        <Star className="w-3.5 h-3.5 mr-1.5" />
                                                        设为当前
                                                    </Button>
                                                )}
                                                <Button data-testid={`semester-edit-open-${semester.id}`} variant="ghost" size="sm" onClick={() => openEdit(semester)} className="text-muted-foreground hover:text-primary hover:bg-primary-muted h-8">
                                                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                                                    编辑
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    data-testid={`semester-delete-${semester.id}`}
                                                    onClick={() => handleDelete(semester)}
                                                    className="text-muted-foreground hover:text-destructive hover:bg-destructive-muted h-8"
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
                                        <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 rounded-control bg-card border border-border flex items-center justify-center">
                                                    <Search className="w-5 h-5 text-muted-foreground" />
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
                <DialogContent className="bg-card border-border text-foreground max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">创建学期</DialogTitle>
                        <DialogDescription className="text-muted-foreground">创建一个新的学期用于组织班级和教学任务</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="semesterName" className="text-foreground">学期名称</Label>
                            <Input
                                id="semesterName"
                                data-testid="semester-create-name"
                                placeholder="例如：2024-Fall"
                                value={newSemesterName}
                                onChange={(e) => setNewSemesterName(e.target.value)}
                                className="bg-card border-input text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                            <p className="text-meta text-muted-foreground">建议格式：YYYY-YYYY-1 或 YYYY-YYYY-2（例如 2026-2027-1）</p>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-surface border border-border bg-background">
                            <div className="space-y-0.5">
                                <Label htmlFor="setAsCurrent" className="text-body text-foreground cursor-pointer">设为当前学期</Label>
                                <p className="text-meta text-muted-foreground">创建后立即生效为默认学期</p>
                            </div>
                            <Switch
                                id="setAsCurrent"
                                checked={setAsCurrent}
                                onCheckedChange={setSetAsCurrent}
                                className="data-[state=checked]:bg-primary"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowAddModal(false)} disabled={submitting} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            取消
                        </Button>
                        <Button data-testid="semester-create-submit" onClick={handleAddSemester} disabled={submitting || !newSemesterName.trim()} className="bg-primary hover:bg-primary-hover text-primary-foreground">
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            确认创建
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="bg-card border-border text-foreground max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">编辑学期</DialogTitle>
                        <DialogDescription className="text-muted-foreground">修改学期名称</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="editSemesterName" className="text-foreground">学期名称</Label>
                            <Input
                                id="editSemesterName"
                                data-testid="semester-edit-name"
                                placeholder="例如：2024-Fall"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-card border-input text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowEditModal(false)} disabled={submitting} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            取消
                        </Button>
                        <Button data-testid="semester-edit-submit" onClick={handleEditSemester} disabled={submitting || !editName.trim()} className="bg-primary hover:bg-primary-hover text-primary-foreground">
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

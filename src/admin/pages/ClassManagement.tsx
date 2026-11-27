import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Users, Pencil, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classApi, semesterApi, teacherApi, type Class, type Semester, type Teacher } from "../api-client";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingStatus } from "@/components/LoadingStatus";

export function ClassManagement() {
    const navigate = useNavigate();
    const { confirm, dialog } = useConfirmDialog();
    const [classes, setClasses] = useState<Class[]>([]);
    const [semesters, setSemesters] = useState<Semester[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const { loading, error: loadError, run } = useAsyncLoad("班级列表加载失败");
    const optionsLoad = useAsyncLoad("班级选项加载失败");
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [filterSemester, setFilterSemester] = useState("all");
    const [filterTeacher, setFilterTeacher] = useState("all");
    const [newClass, setNewClass] = useState({ name: "", semesterId: "", teacherId: "" });
    const [editingClass, setEditingClass] = useState<Class | null>(null);
    const [editForm, setEditForm] = useState({ name: "" });
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        void loadInitialData();
    }, []);

    useEffect(() => {
        void loadClasses();
    }, [filterSemester, filterTeacher]);

    function getDefaultSelection(semesterList = semesters, teacherList = teachers) {
        const defaultSemester = semesterList.find((semester) => semester.isCurrent === 1) ?? semesterList[0];
        return {
            semesterId: String(defaultSemester?.id ?? ""),
            teacherId: String(teacherList[0]?.id ?? ""),
        };
    }

    async function loadInitialData() {
        await optionsLoad.run(async () => {
            const [semestersRes, teachersRes] = await Promise.all([semesterApi.list(), teacherApi.list()]);
            return { semesters: requireApiData(semestersRes, "学期选项加载失败"), teachers: requireApiData(teachersRes, "教师选项加载失败") };
        }, ({ semesters: nextSemesters, teachers: nextTeachers }) => {
            setSemesters(nextSemesters);
            setTeachers(nextTeachers);
            const defaults = getDefaultSelection(nextSemesters, nextTeachers);
            setNewClass((previous) => ({
                ...previous,
                semesterId: previous.semesterId || defaults.semesterId,
                teacherId: previous.teacherId || defaults.teacherId,
            }));
        });
    }

    async function loadClasses() {
        return run(async () => requireApiData(await classApi.list({ semesterId: filterSemester, teacherId: filterTeacher }), "班级列表加载失败"), setClasses);
    }

    function openAddModal() {
        const defaults = getDefaultSelection();
        setNewClass((previous) => ({
            name: "",
            semesterId: previous.semesterId || defaults.semesterId,
            teacherId: previous.teacherId || defaults.teacherId,
        }));
        setShowAddModal(true);
    }

    function handleAddModalOpenChange(open: boolean) {
        if (submitting) return;
        if (!open) {
            setNewClass((previous) => ({ ...previous, name: "" }));
        }
        setShowAddModal(open);
    }

    async function handleAddClass() {
        if (!newClass.name.trim() || !newClass.semesterId || !newClass.teacherId || submitting) return;

        setSubmitting(true);
        try {
            const res = await classApi.create({
                name: newClass.name.trim(),
                semesterId: parseInt(newClass.semesterId, 10),
                teacherId: parseInt(newClass.teacherId, 10),
            });

            if (res.success) {
                setNewClass({ name: "", semesterId: newClass.semesterId, teacherId: newClass.teacherId });
                setShowAddModal(false);
                toast.success("班级已创建");
                void loadClasses();
            } else {
                toast.error(res.error?.message ?? "创建失败");
            }
        } finally {
            setSubmitting(false);
        }
    }

    function openEditModal(cls: Class) {
        setEditingClass(cls);
        setEditForm({ name: cls.name });
        setShowEditModal(true);
    }

    async function handleEditClass() {
        if (!editingClass || !editForm.name.trim() || submitting) return;

        setSubmitting(true);
        try {
            const res = await classApi.update(editingClass.id, { name: editForm.name.trim() });

            if (res.success) {
                setShowEditModal(false);
                setEditingClass(null);
                toast.success("班级名称已更新");
                void loadClasses();
            } else {
                toast.error(res.error?.message ?? "更新失败");
            }
        } finally {
            setSubmitting(false);
        }
    }

    function deleteBlockers(cls: Class) {
        if (cls.deleteBlockers) return cls.deleteBlockers;
        const fallback: string[] = [];
        if (cls.studentCount > 0) fallback.push(`${cls.studentCount} 名学生`);
        if ((cls.taskCount ?? 0) > 0) fallback.push(`${cls.taskCount} 个任务`);
        return fallback;
    }

    async function handleDelete(cls: Class) {
        // The list already knows why a class cannot be deleted; keep the server
        // check as the authority but never open a doomed confirmation.
        if (deleteBlockers(cls).length > 0) {
            toast.error(`该班级已有 ${deleteBlockers(cls).join("、")}，无法删除`);
            return;
        }

        const shouldDelete = await confirm({
            title: `删除班级「${cls.name}」`,
            description: "仅没有任何学生记录和历史任务的空班级可以删除。删除后无法恢复。",
            confirmLabel: "删除班级",
            tone: "destructive",
        });
        if (!shouldDelete) {
            return;
        }

        const res = await classApi.delete(cls.id);
        if (res.success) {
            toast.success("班级已删除");
            void loadClasses();
        } else {
            toast.error(res.error?.message ?? "删除失败");
            if (res.error?.code === "CLASS_IN_USE") void loadClasses();
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
    };

    const summary = useMemo(() => {
        const total = classes.length;
        const studentTotal = classes.reduce((sum, cls) => sum + cls.studentCount, 0);
        const currentSemesterName = semesters.find((s) => s.isCurrent)?.name ?? "暂无";
        const teacherCount = new Set(classes.map((cls) => cls.teacherId)).size;
        return { total, studentTotal, currentSemesterName, teacherCount };
    }, [classes, semesters]);

    const hasFilters = Boolean(searchTerm.trim()) || filterSemester !== "all" || filterTeacher !== "all";

    const clearFilters = () => {
        setSearchTerm("");
        setFilterSemester("all");
        setFilterTeacher("all");
    };

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
        <div className="space-y-4">
            {optionsLoad.error && <RequestError message={optionsLoad.error} onRetry={() => void loadInitialData()} />}
            <PageHeader border={false}>
                <div>
                    <h2 className="text-subheading font-medium text-foreground">班级管理</h2>
                    <p className="mt-0.5 text-label text-muted-foreground">按教学学期与授课教师维护班级建制，查看学生规模与实验任务关联。</p>
                </div>
                <Button data-testid="class-create-open" onClick={openAddModal}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    创建班级
                </Button>
            </PageHeader>

            <section
                aria-labelledby="class-list-heading"
                className="overflow-hidden rounded-surface border border-border bg-card"
            >
                <dl aria-label="班级概览" className="grid grid-cols-4 divide-x divide-border border-b border-border bg-muted px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-2 pr-3">
                        <dt className="text-meta text-muted-foreground">班级总数</dt>
                        <dd className="text-label font-medium tabular-nums text-foreground">{loading || loadError ? "-" : summary.total}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 px-3">
                        <dt className="text-meta text-muted-foreground">学生总数</dt>
                        <dd className="text-label font-medium tabular-nums text-foreground">{loading || loadError ? "-" : summary.studentTotal}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 px-3">
                        <dt className="text-meta text-muted-foreground">当前学期</dt>
                        <dd className="truncate text-label font-medium tabular-nums text-foreground">{loading || loadError ? "-" : summary.currentSemesterName}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 pl-3">
                        <dt className="text-meta text-muted-foreground">授课教师</dt>
                        <dd className="text-label font-medium tabular-nums text-foreground">{loading || loadError ? "-" : summary.teacherCount}</dd>
                    </div>
                </dl>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="flex items-baseline gap-2.5">
                        <h3 id="class-list-heading" className="text-body font-medium text-foreground">班级列表</h3>
                        <span className="text-meta tabular-nums text-muted-foreground">
                            {loading || loadError ? "共 - 条数据" : `共 ${filteredClasses.length} 条数据`}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            placeholder="搜索班级 / 学期 / 教师"
                            aria-label="搜索班级、学期或教师"
                            data-testid="class-search-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-48"
                        />
                        <Select value={filterSemester} onValueChange={setFilterSemester}>
                            <SelectTrigger aria-label="按学期筛选班级" data-testid="class-filter-semester" className="w-36">
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
                            <SelectTrigger aria-label="按教师筛选班级" data-testid="class-filter-teacher" className="w-32">
                                <SelectValue placeholder="全部教师" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部教师</SelectItem>
                                {teachers.map((t) => (
                                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {hasFilters && (
                            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                                清除筛选
                            </Button>
                        )}
                    </div>
                </div>

                {loadError ? (
                    <div className="p-4">
                        <RequestError message={loadError} onRetry={() => void loadClasses()} />
                    </div>
                ) : loading ? (
                    <LoadingStatus className="py-12" iconClassName="text-muted-foreground" label="正在加载班级列表" />
                ) : (
                    <Table aria-label="班级列表">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="px-4">班级名称</TableHead>
                                <TableHead className="px-4">学期</TableHead>
                                <TableHead className="px-4">授课教师</TableHead>
                                <TableHead className="px-4">规模</TableHead>
                                <TableHead className="px-4 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredClasses.map((cls) => {
                                const blockers = deleteBlockers(cls);
                                return (
                                    <TableRow key={cls.id} data-testid={`class-row-${cls.id}`} className="hover:bg-muted">
                                        <TableCell className="px-4 py-2">
                                            <div className="font-medium text-foreground">{cls.name}</div>
                                            <div className="text-meta tabular-nums text-muted-foreground">创建于 {formatDate(cls.createdAt)}</div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <StatusBadge intent="neutral">
                                                {cls.semesterName}
                                            </StatusBadge>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-foreground">{cls.teacherName}</TableCell>
                                        <TableCell className="px-4 py-2 tabular-nums">
                                            <span className="inline-flex items-center gap-1 rounded-control bg-muted px-2 py-0.5 text-meta font-medium text-foreground">
                                                <span>{cls.studentCount} 人</span>
                                                {(cls.taskCount ?? 0) > 0 && (
                                                    <span className="text-muted-foreground">· {cls.taskCount} 任务</span>
                                                )}
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => navigate(`/student?classId=${cls.id}`)}
                                                    className="h-8 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                >
                                                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                                                    学生
                                                </Button>
                                                <Button
                                                    data-testid={`class-edit-open-${cls.id}`}
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openEditModal(cls)}
                                                    className="h-8 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                                    编辑
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    data-testid={`class-delete-${cls.id}`}
                                                    onClick={() => void handleDelete(cls)}
                                                    disabled={blockers.length > 0}
                                                    title={blockers.length > 0 ? `已有 ${blockers.join("、")}，无法删除` : "删除班级"}
                                                    className="h-8 px-2 text-muted-foreground hover:bg-destructive-muted hover:text-destructive"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                    删除
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {filteredClasses.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2.5">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-surface bg-muted text-muted-foreground">
                                                <Search className="h-5 w-5" aria-hidden="true" />
                                            </div>
                                            <p className="font-medium text-foreground">
                                                {hasFilters ? "未找到符合筛选条件的班级" : "暂无符合条件的数据"}
                                            </p>
                                            {hasFilters && (
                                                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                                                    清除筛选
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </section>

            {/* 创建班级弹窗 */}
            <Dialog open={showAddModal} onOpenChange={handleAddModalOpenChange}>
                <DialogContent showCloseButton={!submitting}>
                    <form onSubmit={(event) => { event.preventDefault(); void handleAddClass(); }} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>创建班级</DialogTitle>
                            <DialogDescription>为指定学期和教师创建一个新的教学班级。</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-1">
                            <div className="space-y-2">
                                <Label htmlFor="className">班级名称</Label>
                                <Input
                                    id="className"
                                    data-testid="class-create-name"
                                    placeholder="例如：2026级商务统计3班"
                                    value={newClass.name}
                                    maxLength={100}
                                    disabled={submitting}
                                    onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="classCreateSemester">所属学期</Label>
                                <Select value={newClass.semesterId} onValueChange={(v) => setNewClass({ ...newClass, semesterId: v })} disabled={submitting}>
                                    <SelectTrigger id="classCreateSemester" aria-label="新建班级所属学期" data-testid="class-create-semester" className="w-full">
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
                                <Label htmlFor="classCreateTeacher">授课教师</Label>
                                <Select value={newClass.teacherId} onValueChange={(v) => setNewClass({ ...newClass, teacherId: v })} disabled={submitting}>
                                    <SelectTrigger id="classCreateTeacher" aria-label="新建班级授课教师" data-testid="class-create-teacher" className="w-full">
                                        <SelectValue placeholder="选择教师" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {teachers.map((t) => (
                                            <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <p className="rounded-surface border border-border bg-muted px-3.5 py-2.5 text-meta text-muted-foreground">
                                班级创建后，所属学期与授课教师将固定归属；学生名册导入与日常维护由对应授课教师在教师端执行。
                            </p>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => handleAddModalOpenChange(false)} disabled={submitting}>
                                取消
                            </Button>
                            <Button
                                type="submit"
                                data-testid="class-create-submit"
                                disabled={submitting || !newClass.name.trim() || !newClass.semesterId || !newClass.teacherId}
                            >
                                {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                确认创建
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* 编辑班级弹窗 */}
            <Dialog open={showEditModal} onOpenChange={(open) => { if (!submitting) { setShowEditModal(open); if (!open) setEditingClass(null); } }}>
                <DialogContent showCloseButton={!submitting}>
                    <form onSubmit={(event) => { event.preventDefault(); void handleEditClass(); }} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>编辑班级</DialogTitle>
                            <DialogDescription>更新班级名称。学期与授课教师创建后不可变更。</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-1">
                            <div className="space-y-2">
                                <Label htmlFor="editClassName">班级名称</Label>
                                <Input
                                    id="editClassName"
                                    data-testid="class-edit-name"
                                    placeholder="请输入班级名称"
                                    value={editForm.name}
                                    maxLength={100}
                                    disabled={submitting}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2 rounded-surface border border-border bg-muted px-3.5 py-3">
                                <dl className="grid grid-cols-2 gap-3">
                                    <div>
                                        <dt className="text-meta text-muted-foreground">所属学期</dt>
                                        <dd className="mt-0.5 text-label font-medium text-foreground">{editingClass?.semesterName || "-"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-meta text-muted-foreground">授课教师</dt>
                                        <dd className="mt-0.5 text-label font-medium text-foreground">{editingClass?.teacherName || "-"}</dd>
                                    </div>
                                </dl>
                                <p className="border-t border-border pt-2 text-meta text-muted-foreground">
                                    学期与授课教师归属信息在建班后不可更改。
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => { setShowEditModal(false); setEditingClass(null); }} disabled={submitting}>
                                取消
                            </Button>
                            <Button
                                type="submit"
                                data-testid="class-edit-submit"
                                disabled={submitting || !editForm.name.trim()}
                            >
                                {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                保存
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            {dialog}
        </div>
    );
}

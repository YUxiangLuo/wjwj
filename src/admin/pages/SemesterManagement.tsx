import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, Star, Loader2, Pencil, School, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { semesterApi, type Semester } from "../api-client";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingStatus } from "@/components/LoadingStatus";

export function isRecommendedSemesterName(value: string) {
    return /^\d{4}-\d{4}-[12]$/.test(value.trim());
}

export function formatSemesterDeleteBlockerTitle(blockers: readonly string[]) {
    if (blockers.length === 0) return "删除学期";
    const isCurrent = blockers.includes("当前学期");
    const rest = blockers.filter((item) => item !== "当前学期");
    if (isCurrent && rest.length > 0) {
        return `该学期为当前学期且含 ${rest.join("、")}，无法删除`;
    }
    if (isCurrent) {
        return "该学期为当前学期，无法删除";
    }
    return `该学期含 ${rest.join("、")}，无法删除`;
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
    const [settingCurrentId, setSettingCurrentId] = useState<number | null>(null);
    const [editingSemester, setEditingSemester] = useState<Semester | null>(null);
    const [editName, setEditName] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "current" | "history">("all");
    const createSemesterBtnRef = useRef<HTMLButtonElement>(null);
    const addNameInputRef = useRef<HTMLInputElement>(null);
    const wasSubmittingRef = useRef(false);

    useEffect(() => {
        void loadSemesters();
    }, []);

    useEffect(() => {
        const wasSubmitting = wasSubmittingRef.current;
        wasSubmittingRef.current = submitting;
        if (wasSubmitting && !submitting && showAddModal) {
            requestAnimationFrame(() => {
                if (addNameInputRef.current?.isConnected && !addNameInputRef.current.disabled) {
                    addNameInputRef.current.focus();
                }
            });
        }
    }, [submitting, showAddModal]);

    async function loadSemesters() {
        return run(async () => requireApiData(await semesterApi.list(), "学期列表加载失败"), setSemesters);
    }

    function openAddModal() {
        setNewSemesterName("");
        setSetAsCurrent(false);
        setShowAddModal(true);
    }

    function handleAddModalOpenChange(open: boolean) {
        if (submitting) return;
        if (!open) {
            setNewSemesterName("");
            setSetAsCurrent(false);
        }
        setShowAddModal(open);
    }

    async function handleAddSemester() {
        if (!newSemesterName.trim() || submitting) return;

        // Keep the recommendation aligned with the academic-year names used by
        // the dashboard and the default teaching data.
        if (!isRecommendedSemesterName(newSemesterName)) {
            const shouldContinue = await confirm({
                title: "学期名称不符合推荐格式",
                description: "建议使用 YYYY-YYYY-1 或 YYYY-YYYY-2（例如 2026-2027-1）。\n继续创建不影响系统功能，但学期名称可能不易辨识。",
                confirmLabel: "继续创建",
                fallbackFocusRef: addNameInputRef,
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
                toast.success(setAsCurrent ? "学期已创建并设为当前学期" : "学期已创建");
                void loadSemesters();
            } else {
                toast.error(res.error?.message ?? "创建失败");
            }
        } finally {
            setSubmitting(false);
        }
    }

    async function handleSetCurrent(semester: Semester) {
        if (settingCurrentId !== null) return;
        setSettingCurrentId(semester.id);
        try {
            const res = await semesterApi.setCurrent(semester.id);
            if (res.success) {
                toast.success(`已将「${semester.name}」设为当前学期`);
                void loadSemesters();
            } else {
                toast.error(res.error?.message ?? "设置失败");
            }
        } finally {
            setSettingCurrentId(null);
        }
    }

    function openEdit(semester: Semester) {
        setEditingSemester(semester);
        setEditName(semester.name);
        setShowEditModal(true);
    }

    async function handleEditSemester() {
        if (!editingSemester || !editName.trim() || submitting) return;

        setSubmitting(true);
        try {
            const res = await semesterApi.update(editingSemester.id, { name: editName.trim() });
            if (res.success) {
                setShowEditModal(false);
                setEditingSemester(null);
                toast.success("学期名称已更新");
                void loadSemesters();
            } else {
                toast.error(res.error?.message ?? "更新失败");
            }
        } finally {
            setSubmitting(false);
        }
    }

    function deleteBlockers(semester: Semester) {
        if (semester.deleteBlockers) return semester.deleteBlockers;
        const fallback: string[] = [];
        if (semester.isCurrent === 1) fallback.push("当前学期");
        if (semester.classCount > 0) fallback.push(`${semester.classCount} 个班级`);
        return fallback;
    }

    async function handleDelete(semester: Semester) {
        if (deleteBlockers(semester).length > 0) return;

        const shouldDelete = await confirm({
            title: `删除学期「${semester.name}」`,
            description: "删除后该学期将从列表中移除，且无法恢复。",
            confirmLabel: "删除学期",
            tone: "destructive",
            fallbackFocusRef: createSemesterBtnRef,
        });
        if (!shouldDelete) {
            return;
        }

        const res = await semesterApi.delete(semester.id);
        if (res.success) {
            toast.success("学期已删除");
            void loadSemesters();
        } else {
            toast.error(res.error?.message ?? "删除失败");
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

    const hasFilters = Boolean(searchTerm.trim()) || statusFilter !== "all";

    const clearFilters = () => {
        setSearchTerm("");
        setStatusFilter("all");
    };

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
        <div className="space-y-4">
            <PageHeader border={false}>
                <div>
                    <h2 className="text-subheading font-medium text-foreground">学期管理</h2>
                    <p className="mt-0.5 text-label text-muted-foreground">维护教学学年学期档案，指定全平台默认活跃学期。</p>
                </div>
                <Button ref={createSemesterBtnRef} type="button" data-testid="semester-create-open" onClick={openAddModal}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    创建学期
                </Button>
            </PageHeader>

            <section
                aria-labelledby="semester-list-heading"
                className="overflow-hidden rounded-surface border border-border bg-card"
            >
                <dl aria-label="学期概览" className="grid grid-cols-4 divide-x divide-border border-b border-border bg-muted px-4 py-2.5">
                    {([
                        ["学期总数", summary.total],
                        ["当前学期", summary.currentName],
                        ["历史学期", summary.history],
                        ["已建班学期", summary.withClasses],
                    ] as const).map(([label, value]) => (
                        <div key={label} className="flex items-baseline justify-between gap-2 px-3 first:pl-0 last:pr-0">
                            <dt className="text-meta text-muted-foreground">{label}</dt>
                            <dd className="truncate text-label font-medium tabular-nums text-foreground">
                                {loading || loadError ? "-" : value}
                            </dd>
                        </div>
                    ))}
                </dl>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="flex items-baseline gap-2.5">
                        <h3 id="semester-list-heading" className="text-body font-medium text-foreground">学期列表</h3>
                        <span className="text-meta tabular-nums text-muted-foreground">
                            {loading || loadError ? "共 - 条数据" : `共 ${filteredSemesters.length} 条数据`}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            placeholder="搜索学期名称..."
                            aria-label="搜索学期名称"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-52"
                        />
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "current" | "history")}>
                            <SelectTrigger aria-label="按学期状态筛选" className="w-36">
                                <SelectValue placeholder="状态筛选" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="current">当前学期</SelectItem>
                                <SelectItem value="history">历史学期</SelectItem>
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
                        <RequestError message={loadError} onRetry={() => void loadSemesters()} />
                    </div>
                ) : loading ? (
                    <LoadingStatus className="py-12" iconClassName="text-muted-foreground" label="正在加载学期列表" />
                ) : (
                    <Table aria-label="学期列表">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="px-4">学期名称</TableHead>
                                <TableHead className="px-4">状态</TableHead>
                                <TableHead className="px-4">班级数量</TableHead>
                                <TableHead className="px-4">创建时间</TableHead>
                                <TableHead className="px-4 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredSemesters.map((semester) => {
                                const blockers = deleteBlockers(semester);
                                return (
                                    <TableRow key={semester.id} className="hover:bg-muted">
                                        <TableCell className="px-4 font-medium text-foreground">{semester.name}</TableCell>
                                        <TableCell className="px-4">
                                            {semester.isCurrent ? (
                                                <StatusBadge intent="success">当前学期</StatusBadge>
                                            ) : (
                                                <StatusBadge intent="neutral">历史学期</StatusBadge>
                                            )}
                                        </TableCell>
                                        <TableCell className="px-4 tabular-nums text-foreground">
                                            <div className="flex items-center gap-1.5">
                                                <School className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                                                {semester.classCount}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 tabular-nums text-muted-foreground">{formatDate(semester.createdAt)}</TableCell>
                                        <TableCell className="px-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {!semester.isCurrent && (
                                                    <Button
                                                        type="button"
                                                        data-testid={`semester-set-current-${semester.id}`}
                                                        variant="secondary"
                                                        size="sm"
                                                        disabled={settingCurrentId !== null}
                                                        onClick={() => void handleSetCurrent(semester)}
                                                        className="h-8 px-3"
                                                    >
                                                        <Star className="h-3.5 w-3.5" aria-hidden="true" />
                                                        设为当前
                                                    </Button>
                                                )}
                                                <Button
                                                    type="button"
                                                    data-testid={`semester-edit-open-${semester.id}`}
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openEdit(semester)}
                                                    className="h-8 px-2.5"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                                    编辑
                                                </Button>
                                                <span
                                                    className="inline-flex"
                                                    title={formatSemesterDeleteBlockerTitle(blockers)}
                                                >
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        data-testid={`semester-delete-${semester.id}`}
                                                        onClick={() => void handleDelete(semester)}
                                                        className="h-8 px-2.5 text-destructive hover:bg-destructive-muted hover:text-destructive"
                                                        disabled={blockers.length > 0}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                        删除
                                                    </Button>
                                                </span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {filteredSemesters.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2.5">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-surface bg-muted text-muted-foreground">
                                                <Search className="h-5 w-5" aria-hidden="true" />
                                            </div>
                                            <p className="font-medium text-foreground">
                                                {hasFilters ? "未找到符合筛选条件的学期" : "暂无符合条件的数据"}
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

            <Dialog open={showAddModal} onOpenChange={handleAddModalOpenChange}>
                <DialogContent showCloseButton={!submitting}>
                    <form onSubmit={(event) => { event.preventDefault(); void handleAddSemester(); }} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>创建学期</DialogTitle>
                            <DialogDescription>用于组织班级和教学任务，名称限 1–20 个字符。</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-1">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="semesterName">学期名称</Label>
                                    <span className="text-meta tabular-nums text-muted-foreground">{newSemesterName.trim().length}/20</span>
                                </div>
                                <Input
                                    ref={addNameInputRef}
                                    id="semesterName"
                                    data-testid="semester-create-name"
                                    placeholder="例如：2026-2027-1"
                                    maxLength={20}
                                    disabled={submitting}
                                    value={newSemesterName}
                                    onChange={(e) => setNewSemesterName(e.target.value)}
                                />
                                <p className={newSemesterName.trim() && isRecommendedSemesterName(newSemesterName) ? "text-meta text-success" : "text-meta text-muted-foreground"}>
                                    {newSemesterName.trim() && isRecommendedSemesterName(newSemesterName)
                                        ? "✓ 符合推荐学年学期格式"
                                        : "建议格式：YYYY-YYYY-1 或 YYYY-YYYY-2（例如 2026-2027-1）"}
                                </p>
                            </div>
                            <div className="flex items-center justify-between rounded-surface border border-border bg-muted px-3.5 py-3">
                                <div className="space-y-0.5">
                                    <Label htmlFor="setAsCurrent" className="cursor-pointer text-body font-medium text-foreground">设为当前学期</Label>
                                    <p className="text-meta text-muted-foreground">创建后立即切换为默认教学学期</p>
                                </div>
                                <Switch
                                    id="setAsCurrent"
                                    disabled={submitting}
                                    checked={setAsCurrent}
                                    onCheckedChange={setSetAsCurrent}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => handleAddModalOpenChange(false)} disabled={submitting}>
                                取消
                            </Button>
                            <Button type="submit" data-testid="semester-create-submit" disabled={submitting || !newSemesterName.trim()}>
                                {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                确认创建
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={showEditModal} onOpenChange={(open) => { if (!submitting) { setShowEditModal(open); if (!open) setEditingSemester(null); } }}>
                <DialogContent showCloseButton={!submitting}>
                    <form onSubmit={(event) => { event.preventDefault(); void handleEditSemester(); }} className="space-y-4">
                        <DialogHeader>
                            <DialogTitle>编辑学期</DialogTitle>
                            <DialogDescription>修改学期名称（1–20 个字符）。</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-1">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="editSemesterName">学期名称</Label>
                                    <span className="text-meta tabular-nums text-muted-foreground">{editName.trim().length}/20</span>
                                </div>
                                <Input
                                    id="editSemesterName"
                                    data-testid="semester-edit-name"
                                    placeholder="例如：2026-2027-1"
                                    maxLength={20}
                                    disabled={submitting}
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                />
                            </div>
                            <p className="rounded-surface border border-border bg-muted px-3.5 py-2.5 text-meta text-muted-foreground">
                                建议格式：YYYY-YYYY-1 或 YYYY-YYYY-2（例如 2026-2027-1），修改名称不会改变已关联班级的归属关系。
                            </p>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => { setShowEditModal(false); setEditingSemester(null); }} disabled={submitting}>
                                取消
                            </Button>
                            <Button type="submit" data-testid="semester-edit-submit" disabled={submitting || !editName.trim()}>
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

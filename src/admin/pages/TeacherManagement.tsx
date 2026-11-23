import { RequestError } from "@/components/RequestError";
import { PageHeader } from "@/components/PageHeader";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingStatus } from "@/components/LoadingStatus";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { teacherApi, type Teacher } from "../api-client";

export function TeacherManagement() {
    const [rows, setRows] = useState<Teacher[]>([]);
    const { loading, error: loadError, run } = useAsyncLoad("教师列表加载失败");
    const [search, setSearch] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [editing, setEditing] = useState<Teacher | null>(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ employeeId: "", name: "" });
    const [saving, setSaving] = useState(false);
    const { confirm, dialog } = useConfirmDialog();
    const pending = useRef(false);
    const resetPending = useRef(false);
    const [resetting, setResetting] = useState(false);
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const resetPassword = async (teacher: Teacher) => {
        if (resetPending.current) return;
        resetPending.current = true;
        setResetting(true);
        try {
            if (!await confirm({
                title: "重置教师密码？",
                description: `将把 ${teacher.name}（${teacher.employeeId}）的密码重置为工号，原密码将失效，全部登录会话将失效，教师需要重新登录。`,
                confirmLabel: "确认重置",
                tone: "destructive",
            }) || !mounted.current) return;
            const response = await teacherApi.resetPassword(teacher.id);
            if (!mounted.current) return;
            if (response.success) toast.success("密码已重置为工号");
            else toast.error(response.error?.message ?? "重置失败，请重试");
        } catch {
            if (mounted.current) toast.error("重置失败，请重试");
        } finally {
            resetPending.current = false;
            if (mounted.current) setResetting(false);
        }
    };

    const closeEditor = () => {
        if (pending.current) return;
        setCreating(false);
        setEditing(null);
        setForm({ employeeId: "", name: "" });
    };

    function deleteBlockers(row: Teacher) {
        if (row.deleteBlockers) return row.deleteBlockers;
        const fallback: string[] = [];
        if (row.classCount > 0) fallback.push(`${row.classCount} 个班级`);
        if ((row.topicCount ?? 0) > 0) fallback.push(`${row.topicCount} 个实验模板`);
        return fallback;
    }

    async function handleDelete(row: Teacher) {
        if (deleteBlockers(row).length > 0) {
            toast.error(`该教师仍有 ${deleteBlockers(row).join("、")}，请先删除后再移除账号`);
            return;
        }
        const shouldDelete = await confirm({
            title: `删除教师「${row.name}」`,
            description: `将永久删除工号 ${row.employeeId} 的账号与全部登录会话，保留该教师作为操作者的审计记录。此操作不可恢复。`,
            confirmLabel: "永久删除",
            tone: "destructive",
        });
        if (!shouldDelete) return;
        const response = await teacherApi.delete(row.id);
        if (response.success) {
            toast.success("教师已删除");
            void load(appliedSearch);
        } else {
            toast.error(response.error?.message ?? "删除失败");
        }
    }

    const load = async (keyword = appliedSearch) => {
        const normalized = keyword.trim();
        setAppliedSearch(normalized);
        return run(async () => requireApiData(await teacherApi.list(normalized || undefined), "教师列表加载失败"), setRows);
    };

    useEffect(() => {
        void load("");
    }, []);

    const applySearch = () => {
        void load(search);
    };

    const clearSearch = () => {
        setSearch("");
        void load("");
    };

    const save = async () => {
        if (pending.current) return;
        pending.current = true;
        setSaving(true);
        try {
            const response = editing
                ? await teacherApi.update(editing.id, { name: form.name.trim() })
                : await teacherApi.create({ employeeId: form.employeeId.trim(), name: form.name.trim() });
            if (!mounted.current) return;
            if (!response.success) {
                toast.error(response.error?.message ?? "保存失败");
                return;
            }
            setEditing(null);
            setCreating(false);
            setForm({ employeeId: "", name: "" });
            if (!editing) {
                toast.success("教师已创建，初始密码与工号相同");
            } else {
                toast.success("保存成功");
            }
            void load(appliedSearch);
        } finally {
            pending.current = false;
            if (mounted.current) setSaving(false);
        }
    };

    const summary = useMemo(() => {
        const total = rows.length;
        const classTotal = rows.reduce((sum, item) => sum + item.classCount, 0);
        const topicTotal = rows.reduce((sum, item) => sum + (item.topicCount ?? 0), 0);
        return { total, classTotal, topicTotal };
    }, [rows]);

    const formatDate = (dateStr: string) => {
        const parsed = new Date(dateStr);
        return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
    };

    return (
        <div className="space-y-5">
            <PageHeader border={false}>
                <div>
                    <h2 className="text-subheading font-semibold text-foreground">教师管理</h2>
                    <p className="mt-1 text-label text-muted-foreground">新建及重置后的登录密码默认与教师工号相同，教师登录后可自行修改密码。</p>
                </div>
                <Button onClick={() => { setEditing(null); setCreating(true); setForm({ employeeId: "", name: "" }); }}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    新增教师
                </Button>
            </PageHeader>

            <dl aria-label="教师概览" className="grid grid-cols-3 gap-4 border-b border-border pb-4">
                <div>
                    <dt className="text-meta text-muted-foreground">{appliedSearch ? "当前匹配教师" : "在册教师"}</dt>
                    <dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.total}</dd>
                </div>
                <div>
                    <dt className="text-meta text-muted-foreground">关联教学班级</dt>
                    <dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.classTotal}</dd>
                </div>
                <div>
                    <dt className="text-meta text-muted-foreground">创建实验模板</dt>
                    <dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.topicTotal}</dd>
                </div>
            </dl>

            <Card>
                <PageHeader as={CardHeader} className="flex-wrap">
                    <div>
                        <CardTitle className="text-body text-foreground">教师列表</CardTitle>
                        <p className="mt-1 text-meta text-muted-foreground">
                            {loading || loadError ? "共 - 位教师" : `共 ${rows.length} 位教师`}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onKeyDown={(event) => event.key === "Enter" && applySearch()}
                            placeholder="搜索工号或姓名"
                            aria-label="搜索教师工号或姓名"
                            className="w-56 border-input bg-card"
                        />
                        <IconButton aria-label="搜索教师" title="搜索教师" variant="outline" onClick={applySearch}>
                            <Search className="h-4 w-4" />
                        </IconButton>
                        {appliedSearch && (
                            <Button type="button" variant="ghost" size="sm" onClick={clearSearch}>
                                清除搜索
                            </Button>
                        )}
                    </div>
                </PageHeader>
                <CardContent className="pt-0">
                    {loadError ? <RequestError message={loadError} onRetry={() => void load(appliedSearch)} /> : loading ? (
                        <LoadingStatus className="py-12" label="正在加载教师列表" />
                    ) : (
                        <Table aria-label="教师列表">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="px-3">工号</TableHead>
                                    <TableHead className="px-3">姓名</TableHead>
                                    <TableHead className="px-3">班级数</TableHead>
                                    <TableHead className="px-3">实验模板</TableHead>
                                    <TableHead className="px-3">创建时间</TableHead>
                                    <TableHead className="px-3 text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="py-12 text-center">
                                            <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                                <Search className="h-6 w-6" aria-hidden="true" />
                                                <p className="text-foreground">
                                                    {appliedSearch ? `未找到与“${appliedSearch}”匹配的教师` : "暂无教师数据"}
                                                </p>
                                                {appliedSearch && (
                                                    <Button type="button" variant="outline" size="sm" onClick={clearSearch}>
                                                        清除搜索
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : rows.map((row) => {
                                    const blockers = deleteBlockers(row);
                                    return (
                                        <TableRow key={row.id} className="hover:bg-muted">
                                            <TableCell className="px-3 font-mono">{row.employeeId}</TableCell>
                                            <TableCell className="px-3 font-medium text-foreground">{row.name}</TableCell>
                                            <TableCell className="px-3 tabular-nums">{row.classCount}</TableCell>
                                            <TableCell className="px-3 tabular-nums">{row.topicCount ?? 0}</TableCell>
                                            <TableCell className="px-3 tabular-nums text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                                            <TableCell className="px-3">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 px-2"
                                                        onClick={() => {
                                                            setCreating(false);
                                                            setEditing(row);
                                                            setForm({ employeeId: row.employeeId, name: row.name });
                                                        }}
                                                    >
                                                        <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />编辑
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 px-2"
                                                        disabled={resetting}
                                                        onClick={() => void resetPassword(row)}
                                                    >
                                                        <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />重置密码
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 px-2 text-muted-foreground hover:bg-destructive-muted hover:text-destructive"
                                                        data-testid={`admin-teacher-delete-${row.id}`}
                                                        disabled={blockers.length > 0}
                                                        title={blockers.length > 0 ? `仍有 ${blockers.join("、")}，无法删除` : "删除教师"}
                                                        onClick={() => void handleDelete(row)}
                                                    >
                                                        <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />删除
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={creating || editing !== null} onOpenChange={(open) => { if (!open) closeEditor(); }}>
                <DialogContent showCloseButton={!saving}>
                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (!saving && form.name.trim() && (editing || form.employeeId.trim())) {
                                void save();
                            }
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{editing ? "编辑教师" : "新增教师"}</DialogTitle>
                            <DialogDescription>
                                {editing
                                    ? "修改教师姓名。工号作为登录凭证标识，创建后不可变更。"
                                    : "填写工号和姓名以创建教师账号，创建后初始密码与工号相同。"}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-1">
                            <div className="space-y-2">
                                <Label htmlFor="admin-teacher-employee-id">工号</Label>
                                <Input
                                    id="admin-teacher-employee-id"
                                    placeholder="例如：T004"
                                    maxLength={50}
                                    value={form.employeeId}
                                    disabled={saving || !!editing}
                                    onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="admin-teacher-name">姓名</Label>
                                <Input
                                    id="admin-teacher-name"
                                    placeholder="请输入教师姓名"
                                    maxLength={100}
                                    disabled={saving}
                                    value={form.name}
                                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" disabled={saving} onClick={closeEditor}>取消</Button>
                            <Button
                                type="submit"
                                aria-busy={saving}
                                disabled={saving || !form.name.trim() || (!editing && !form.employeeId.trim())}
                            >
                                {saving ? "保存中..." : "保存"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            {dialog}
        </div>
    );
}

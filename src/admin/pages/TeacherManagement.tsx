import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useEffect, useRef, useState } from "react";
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
    const [editing, setEditing] = useState<Teacher | null>(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ employeeId: "", name: "" });
    const [saving, setSaving] = useState(false);
    const { confirm, dialog } = useConfirmDialog();
    const pending = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const closeEditor = () => {
        if (pending.current) return;
        setCreating(false);
        setEditing(null);
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
            void load();
        } else {
            toast.error(response.error?.message ?? "删除失败");
        }
    }

    const load = async (keyword = search) => {
        return run(async () => requireApiData(await teacherApi.list(keyword.trim() || undefined), "教师列表加载失败"), setRows);
    };
    useEffect(() => { void load(""); }, []);
    const save = async () => {
        if (pending.current) return;
        pending.current = true;
        setSaving(true);
        const response = editing
            ? await teacherApi.update(editing.id, { name: form.name.trim() })
            : await teacherApi.create({ employeeId: form.employeeId.trim(), name: form.name.trim() });
        if (!mounted.current) return;
        pending.current = false;
        setSaving(false);
        if (!response.success) return toast.error(response.error?.message ?? "保存失败");
        setEditing(null); setCreating(false); setForm({ employeeId: "", name: "" });
        if (!editing) {
            toast.success("教师已创建，初始密码与工号相同");
        } else {
            toast.success("保存成功");
        }
        void load();
    };
    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>教师管理</CardTitle><p className="mt-1 text-label text-muted-foreground">新建及重置后的登录密码与教师工号相同，教师也可主动修改密码。</p></div><Button onClick={() => { setCreating(true); setForm({ employeeId: "", name: "" }); }}><Plus className="mr-2 h-4 w-4" />新增教师</Button></CardHeader>
            <CardContent>
                <div className="mb-4 flex max-w-md gap-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="搜索工号或姓名" aria-label="搜索教师工号或姓名" /><IconButton aria-label="搜索教师" title="搜索教师" variant="outline" onClick={() => void load()}><Search className="h-4 w-4" /></IconButton></div>
                {loadError ? <RequestError message={loadError} onRetry={() => void load()} /> : loading ? <LoadingStatus className="py-12" label="正在加载教师列表" /> : (
                    <Table aria-label="教师列表"><TableHeader><TableRow><TableHead>工号</TableHead><TableHead>姓名</TableHead><TableHead>班级数</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{rows.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="py-12 text-center"><div className="flex flex-col items-center gap-3 text-muted-foreground"><Search className="h-6 w-6" /><p>{search.trim() ? `未找到与“${search.trim()}”匹配的教师` : "暂无教师数据"}</p>{search.trim() && <Button variant="outline" size="sm" onClick={() => { setSearch(""); void load(""); }}>清除搜索</Button>}</div></TableCell></TableRow>
                    ) : rows.map((row) => (
                        <TableRow key={row.id}><TableCell className="font-mono">{row.employeeId}</TableCell><TableCell>{row.name}</TableCell><TableCell>{row.classCount}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditing(row); setForm({ employeeId: row.employeeId, name: row.name }); }}><Pencil className="mr-1 h-4 w-4" />编辑</Button><Button variant="ghost" size="sm" onClick={async () => { const response = await teacherApi.resetPassword(row.id); response.success ? toast.success("密码已重置为工号") : toast.error(response.error?.message); }}><RotateCcw className="mr-1 h-4 w-4" />重置密码</Button><Button variant="ghost" size="sm" data-testid={`admin-teacher-delete-${row.id}`} disabled={deleteBlockers(row).length > 0} title={deleteBlockers(row).length > 0 ? `仍有 ${deleteBlockers(row).join("、")}，无法删除` : "删除教师"} onClick={() => void handleDelete(row)}><Trash2 className="mr-1 h-4 w-4" />删除</Button></div></TableCell></TableRow>
                    ))}</TableBody></Table>
                )}
            </CardContent>
            <Dialog open={creating || editing !== null} onOpenChange={(open) => { if (!open) closeEditor(); }}><DialogContent showCloseButton={!saving}><DialogHeader><DialogTitle>{editing ? "编辑教师" : "新增教师"}</DialogTitle><DialogDescription>{editing ? "修改教师姓名。工号创建后不可变更。" : "填写工号和姓名以创建教师账号。"}</DialogDescription></DialogHeader><div className="space-y-4"><div><Label htmlFor="admin-teacher-employee-id">工号</Label><Input id="admin-teacher-employee-id" value={form.employeeId} disabled={saving || !!editing} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} /></div><div><Label htmlFor="admin-teacher-name">姓名</Label><Input id="admin-teacher-name" disabled={saving} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div></div><DialogFooter><Button variant="outline" disabled={saving} onClick={closeEditor}>取消</Button><Button aria-busy={saving} disabled={saving || !form.name.trim() || (!editing && !form.employeeId.trim())} onClick={() => void save()}>{saving ? "保存中..." : "保存"}</Button></DialogFooter></DialogContent></Dialog>
            {dialog}
        </Card>
    );
}

import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingStatus } from "@/components/LoadingStatus";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { teacherApi, type Teacher } from "../api-client";

export function TeacherManagement() {
    const [rows, setRows] = useState<Teacher[]>([]);
    const { loading, error: loadError, run } = useAsyncLoad("教师列表加载失败");
    const [search, setSearch] = useState("");
    const [editing, setEditing] = useState<Teacher | null>(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ employeeId: "", name: "" });
    const [saving, setSaving] = useState(false);
    const pending = useRef(false);
    const editorVersion = useRef(0);
    const statusRequests = useRef(new Set<number>());
    const [pendingStatuses, setPendingStatuses] = useState(new Set<number>());
    const mounted = useRef(true);
    const closeEditor = () => {
        editorVersion.current++;
        pending.current = false;
        setSaving(false);
        setCreating(false);
        setEditing(null);
    };
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; editorVersion.current++; }; }, []);
    const updateStatus = async (row: Teacher) => {
        if (statusRequests.current.has(row.id)) return;
        statusRequests.current.add(row.id);
        setPendingStatuses(new Set(statusRequests.current));
        try {
            const response = await teacherApi.updateStatus(row.id, row.status === 1 ? 0 : 1);
            if (!mounted.current) return;
            if (response.success) void load();
            else toast.error(response.error?.message ?? "状态更新失败，请重试");
        } finally {
            statusRequests.current.delete(row.id);
            if (mounted.current) setPendingStatuses(new Set(statusRequests.current));
        }
    };
    const load = async (keyword = search) => {
        return run(async () => requireApiData(await teacherApi.list(keyword.trim() || undefined), "教师列表加载失败"), setRows);
    };
    useEffect(() => { void load(""); }, []);
    const save = async () => {
        if (pending.current) return;
        pending.current = true;
        setSaving(true);
        const version = editorVersion.current;
        const response = editing
            ? await teacherApi.update(editing.id, { name: form.name.trim() })
            : await teacherApi.create({ employeeId: form.employeeId.trim(), name: form.name.trim() });
        if (version !== editorVersion.current) return;
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
                <div className="mb-4 flex max-w-md gap-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="搜索工号或姓名" /><IconButton aria-label="搜索教师" title="搜索教师" variant="outline" onClick={() => void load()}><Search className="h-4 w-4" /></IconButton></div>
                {loadError ? <RequestError message={loadError} onRetry={() => void load()} /> : loading ? <LoadingStatus className="py-12" label="正在加载教师列表" /> : (
                    <Table><TableHeader><TableRow><TableHead>工号</TableHead><TableHead>姓名</TableHead><TableHead>班级数</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{rows.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="py-12 text-center"><div className="flex flex-col items-center gap-3 text-muted-foreground"><Search className="h-6 w-6" /><p>{search.trim() ? `未找到与“${search.trim()}”匹配的教师` : "暂无教师数据"}</p>{search.trim() && <Button variant="outline" size="sm" onClick={() => { setSearch(""); void load(""); }}>清除搜索</Button>}</div></TableCell></TableRow>
                    ) : rows.map((row) => (
                        <TableRow key={row.id}><TableCell className="font-mono">{row.employeeId}</TableCell><TableCell>{row.name}</TableCell><TableCell>{row.classCount}</TableCell><TableCell><StatusBadge intent={row.status === 1 ? "success" : "neutral"}>{row.status === 1 ? "正常" : "停用"}</StatusBadge></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditing(row); setForm({ employeeId: row.employeeId, name: row.name }); }}><Pencil className="mr-1 h-4 w-4" />编辑</Button><Button variant="ghost" size="sm" onClick={async () => { const response = await teacherApi.resetPassword(row.id); response.success ? toast.success("密码已重置为工号") : toast.error(response.error?.message); }}><RotateCcw className="mr-1 h-4 w-4" />重置密码</Button><Button variant="ghost" size="sm" className={row.status === 1 ? "text-destructive hover:bg-destructive-muted hover:text-destructive" : "text-success hover:bg-success-muted hover:text-success"} disabled={pendingStatuses.has(row.id)} aria-busy={pendingStatuses.has(row.id)} onClick={() => void updateStatus(row)}>{pendingStatuses.has(row.id) ? "更新中..." : row.status === 1 ? "停用" : "启用"}</Button></div></TableCell></TableRow>
                    ))}</TableBody></Table>
                )}
            </CardContent>
            <Dialog open={creating || editing !== null} onOpenChange={(open) => { if (!open) closeEditor(); }}><DialogContent><DialogHeader><DialogTitle>{editing ? "编辑教师" : "新增教师"}</DialogTitle><DialogDescription>{editing ? "修改教师姓名。工号创建后不可变更。" : "填写工号和姓名以创建教师账号。"}</DialogDescription></DialogHeader><div className="space-y-4"><div><Label htmlFor="admin-teacher-employee-id">工号</Label><Input id="admin-teacher-employee-id" value={form.employeeId} disabled={saving || !!editing} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} /></div><div><Label htmlFor="admin-teacher-name">姓名</Label><Input id="admin-teacher-name" disabled={saving} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={closeEditor}>取消</Button><Button aria-busy={saving} disabled={saving || !form.name.trim() || (!editing && !form.employeeId.trim())} onClick={() => void save()}>{saving ? "保存中..." : "保存"}</Button></DialogFooter></DialogContent></Dialog>
        </Card>
    );
}

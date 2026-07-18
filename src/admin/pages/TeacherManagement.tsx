import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { teacherApi, type Teacher } from "../api-client";

export function TeacherManagement() {
    const [rows, setRows] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [editing, setEditing] = useState<Teacher | null>(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ employeeId: "", name: "" });
    const load = async () => {
        setLoading(true);
        const response = await teacherApi.list(search.trim() || undefined);
        if (response.success && response.data) setRows(response.data);
        setLoading(false);
    };
    useEffect(() => { void load(); }, []);
    const save = async () => {
        const response = editing
            ? await teacherApi.update(editing.id, { name: form.name.trim() })
            : await teacherApi.create({ employeeId: form.employeeId.trim(), name: form.name.trim() });
        if (!response.success) return toast.error(response.error?.message ?? "保存失败");
        setEditing(null); setCreating(false); setForm({ employeeId: "", name: "" }); toast.success("保存成功"); void load();
    };
    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>教师管理</CardTitle><p className="mt-1 text-sm text-muted-foreground">教师初始密码为工号，首次登录或重置后必须修改密码。</p></div><Button onClick={() => { setCreating(true); setForm({ employeeId: "", name: "" }); }}><Plus className="mr-2 h-4 w-4" />新增教师</Button></CardHeader>
            <CardContent>
                <div className="mb-4 flex max-w-md gap-2"><Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="搜索工号或姓名" /><Button variant="outline" onClick={() => void load()}><Search className="h-4 w-4" /></Button></div>
                {loading ? <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
                    <Table><TableHeader><TableRow><TableHead>工号</TableHead><TableHead>姓名</TableHead><TableHead>班级数</TableHead><TableHead>状态</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => (
                        <TableRow key={row.id}><TableCell className="font-mono">{row.employeeId}</TableCell><TableCell>{row.name}</TableCell><TableCell>{row.classCount}</TableCell><TableCell><StatusBadge intent={row.status === 1 ? "success" : "neutral"}>{row.status === 1 ? "正常" : "停用"}</StatusBadge></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => { setEditing(row); setForm({ employeeId: row.employeeId, name: row.name }); }}><Pencil className="mr-1 h-4 w-4" />编辑</Button><Button variant="ghost" size="sm" onClick={async () => { const response = await teacherApi.resetPassword(row.id); response.success ? toast.success("密码已重置为工号，下次登录必须修改") : toast.error(response.error?.message); }}><RotateCcw className="mr-1 h-4 w-4" />重置密码</Button><Button variant="ghost" size="sm" className={row.status === 1 ? "text-destructive" : "text-success"} onClick={async () => { const response = await teacherApi.updateStatus(row.id, row.status === 1 ? 0 : 1); if (response.success) void load(); }}>{row.status === 1 ? "停用" : "启用"}</Button></div></TableCell></TableRow>
                    ))}</TableBody></Table>
                )}
            </CardContent>
            <Dialog open={creating || editing !== null} onOpenChange={(open) => { if (!open) { setCreating(false); setEditing(null); } }}><DialogContent><DialogHeader><DialogTitle>{editing ? "编辑教师" : "新增教师"}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>工号</Label><Input value={form.employeeId} disabled={!!editing} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} /></div><div><Label>姓名</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => { setCreating(false); setEditing(null); }}>取消</Button><Button disabled={!form.name.trim() || (!editing && !form.employeeId.trim())} onClick={() => void save()}>保存</Button></DialogFooter></DialogContent></Dialog>
        </Card>
    );
}

import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, RotateCcw, Search } from "lucide-react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classApi, studentApi, type Class, type Student, type StudentExperiment } from "../api-client";

export function StudentManagement() {
    const location = useLocation();
    const requestedClassId = useMemo(() => {
        const value = new URLSearchParams(location.search).get("classId");
        return value && /^[1-9]\d*$/.test(value) ? value : "all";
    }, [location.search]);
    const [students, setStudents] = useState<Student[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);
    const [classId, setClassId] = useState(requestedClassId);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Student | null>(null);
    const [experiments, setExperiments] = useState<StudentExperiment[]>([]);
    const load = async () => {
        setLoading(true);
        const response = await studentApi.list({ classId, search: search.trim() || undefined });
        if (response.success && response.data) setStudents(response.data);
        setLoading(false);
    };
    useEffect(() => { void classApi.list().then((response) => response.data && setClasses(response.data)); }, []);
    useEffect(() => { setClassId(requestedClassId); }, [requestedClassId]);
    useEffect(() => { void load(); }, [classId]);
    const filtered = useMemo(() => students.filter((item) => status === "all" || (status === "active" ? item.status === 1 : item.status === 0)), [students, status]);
    const openExperiments = async (item: Student) => {
        setSelected(item); setExperiments([]);
        const response = await studentApi.getExperiments(item.id);
        if (response.success && response.data) setExperiments(response.data);
    };
    return (
        <Card>
            <CardHeader><CardTitle>学生管理</CardTitle><p className="text-sm text-muted-foreground">查看学生状态与实验进度，支持停用账号和重置密码。</p></CardHeader>
            <CardContent>
                <div className="mb-4 flex flex-wrap gap-2"><Input className="max-w-xs" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="搜索学号或姓名" /><Button variant="outline" onClick={() => void load()}><Search className="h-4 w-4" /></Button><Select value={classId} onValueChange={setClassId}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部班级</SelectItem>{classes.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="active">正常</SelectItem><SelectItem value="disabled">已停用</SelectItem></SelectContent></Select></div>
                {loading ? <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : <Table><TableHeader><TableRow><TableHead>学号</TableHead><TableHead>姓名</TableHead><TableHead>班级</TableHead><TableHead>状态</TableHead><TableHead>实验进度</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>{filtered.map((item) => <TableRow key={item.id}><TableCell className="font-mono">{item.studentId}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.className ?? "-"}</TableCell><TableCell><StatusBadge intent={item.status === 1 ? "success" : "neutral"}>{item.status === 1 ? "正常" : "停用"}</StatusBadge></TableCell><TableCell><div className="flex items-center gap-2"><Progress value={item.progress} className="h-1.5 w-24" /><span className="text-xs text-muted-foreground">{item.progress}%</span></div></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => void openExperiments(item)}><Eye className="mr-1 h-4 w-4" />实验</Button><Button variant="ghost" size="sm" onClick={async () => { const response = await studentApi.resetPassword(item.id); response.success ? toast.success("密码已重置为学号") : toast.error(response.error?.message); }}><RotateCcw className="mr-1 h-4 w-4" />重置密码</Button><Button variant="ghost" size="sm" className={item.status === 1 ? "text-destructive" : "text-success"} onClick={async () => { const response = await studentApi.updateStatus(item.id, item.status === 1 ? 0 : 1); if (response.success) void load(); }}>{item.status === 1 ? "停用" : "启用"}</Button></div></TableCell></TableRow>)}</TableBody></Table>}
            </CardContent>
            <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{selected?.name} 的实验记录</DialogTitle></DialogHeader><Table><TableHeader><TableRow><TableHead>任务</TableHead><TableHead>阶段</TableHead><TableHead>状态</TableHead><TableHead>进度</TableHead><TableHead>成绩</TableHead></TableRow></TableHeader><TableBody>{experiments.map((item) => <TableRow key={item.id}><TableCell>{item.taskName ?? "未命名任务"}</TableCell><TableCell>第 {item.currentStage} 阶段</TableCell><TableCell>{item.statusText}</TableCell><TableCell>{item.progress}%</TableCell><TableCell>{item.score ?? "-"}</TableCell></TableRow>)}{!experiments.length && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">暂无实验记录</TableCell></TableRow>}</TableBody></Table></DialogContent></Dialog>
        </Card>
    );
}

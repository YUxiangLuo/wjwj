import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { teacherApi, type TaskProgressData } from "../api-client";

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
    not_started: { label: "未开始", color: "text-slate-400", bgColor: "bg-slate-500/10", borderColor: "border-slate-500/20" },
    stage1: { label: "问卷设计", color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/20" },
    stage2: { label: "样本规划", color: "text-cyan-400", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/20" },
    stage3: { label: "抽样执行", color: "text-violet-400", bgColor: "bg-violet-500/10", borderColor: "border-violet-500/20" },
    stage4: { label: "分析报告", color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/20" },
    submitted: { label: "已提交", color: "text-yellow-400", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/20" },
    graded: { label: "已批改", color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
    rejected: { label: "已驳回", color: "text-rose-400", bgColor: "bg-rose-500/10", borderColor: "border-rose-500/20" },
};

const PROGRESS_COLORS: Record<string, string> = {
    not_started: "bg-slate-600",
    stage1: "bg-blue-500",
    stage2: "bg-cyan-500",
    stage3: "bg-violet-500",
    stage4: "bg-amber-500",
    submitted: "bg-yellow-500",
    graded: "bg-emerald-500",
    rejected: "bg-rose-500",
};

export function TaskProgressDetail() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<TaskProgressData | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        if (!taskId) return;
        loadProgress(Number(taskId));
    }, [taskId]);

    async function loadProgress(id: number) {
        setLoading(true);
        const res = await teacherApi.getTaskProgress(id);
        if (res.success && res.data) {
            setData(res.data);
        }
        setLoading(false);
    }

    const filteredStudents = useMemo(() => {
        if (!data) return [];
        const keyword = searchTerm.trim().toLowerCase();
        if (!keyword) return data.students;
        return data.students.filter(
            (s) => s.studentId.toLowerCase().includes(keyword) || s.name.toLowerCase().includes(keyword)
        );
    }, [data, searchTerm]);

    const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

    if (loading) return <div className="p-12 text-center text-slate-500">加载中...</div>;
    if (!data) return <div className="p-12 text-center text-slate-500">未找到任务</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-800" onClick={() => navigate("/task")}>
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    返回列表
                </Button>
                <div className="h-6 w-px bg-slate-800"></div>
                <div>
                    <h2 className="text-lg font-semibold text-slate-100">{data.task.topicName}</h2>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{data.task.className}</span>
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {data.task.deadline ? `截止: ${new Date(data.task.deadline).toLocaleString("zh-CN")}` : "无截止时间"}
                        </span>
                        <span>{total} 名学生</span>
                    </div>
                </div>
            </div>

            {/* Status count cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
                {(Object.keys(STATUS_CONFIG) as string[]).map((key) => {
                    const cfg = STATUS_CONFIG[key];
                    const count = data.counts[key as keyof typeof data.counts] ?? 0;
                    return (
                        <Card key={key} className={`border-slate-800 bg-slate-900 shadow-sm ${count > 0 ? "hover:border-slate-700" : ""} transition-colors`}>
                            <CardContent className="p-3 text-center">
                                <p className="text-xs text-slate-500 mb-1">{cfg.label}</p>
                                <p className={`text-xl font-bold ${count > 0 ? cfg.color : "text-slate-700"}`}>{count}</p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Progress bar */}
            {total > 0 && (
                <div className="flex h-3 rounded-full overflow-hidden bg-slate-800">
                    {(Object.keys(PROGRESS_COLORS) as string[]).map((key) => {
                        const count = data.counts[key as keyof typeof data.counts] ?? 0;
                        if (count === 0) return null;
                        const pct = (count / total) * 100;
                        return (
                            <div
                                key={key}
                                className={`${PROGRESS_COLORS[key]} transition-all duration-500`}
                                style={{ width: `${pct}%` }}
                                title={`${STATUS_CONFIG[key].label}: ${count}`}
                            />
                        );
                    })}
                </div>
            )}

            {/* Student list */}
            <Card className="border-slate-800 bg-slate-900 shadow-sm">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200">学生列表</span>
                    <div className="relative w-56">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <Input
                            placeholder="搜索学号/姓名"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 h-8 text-sm"
                        />
                    </div>
                </div>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-800 hover:bg-slate-900/50">
                                <TableHead className="text-slate-400">学号</TableHead>
                                <TableHead className="text-slate-400">姓名</TableHead>
                                <TableHead className="text-slate-400">状态</TableHead>
                                <TableHead className="text-slate-400">当前阶段</TableHead>
                                <TableHead className="text-slate-400">最近活动</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredStudents.map((s) => {
                                const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.not_started;
                                return (
                                    <TableRow key={s.studentId} className="border-slate-800 hover:bg-slate-800/50 transition-colors">
                                        <TableCell className="font-mono text-slate-300 text-sm">{s.studentId}</TableCell>
                                        <TableCell className="text-slate-200">{s.name}</TableCell>
                                        <TableCell>
                                            <Badge className={`${cfg.bgColor} ${cfg.color} ${cfg.borderColor}`}>
                                                {cfg.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-500 text-sm">
                                            {s.stage !== null ? `阶段 ${s.stage}` : "-"}
                                        </TableCell>
                                        <TableCell className="text-slate-500 text-xs">
                                            {s.lastActivity ? new Date(s.lastActivity).toLocaleString("zh-CN") : "-"}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {filteredStudents.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-slate-500">
                                        暂无数据
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

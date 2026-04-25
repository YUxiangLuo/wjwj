import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Clock, Search, FileEdit, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { teacherApi, type TaskProgressData } from "../api-client";

const STATUS_CONFIG = {
    not_started: { label: "未开始", color: "text-muted-foreground", bgColor: "bg-muted/10", borderColor: "border-muted/20" },
    stage1: { label: "问卷设计", color: "text-primary", bgColor: "bg-primary/10", borderColor: "border-primary/20" },
    stage2: { label: "样本规划", color: "text-cyan-600", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/20" },
    stage3: { label: "抽样执行", color: "text-chart-3", bgColor: "bg-chart-3/10", borderColor: "border-chart-3/20" },
    stage4: { label: "分析报告", color: "text-amber-600", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/20" },
    submitted: { label: "已提交", color: "text-yellow-600 dark:text-yellow-400", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/20" },
    graded: { label: "已批改", color: "text-emerald-600", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
    rejected: { label: "已驳回", color: "text-destructive", bgColor: "bg-destructive/10", borderColor: "border-destructive/20" },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;
const STATUS_KEYS = Object.keys(STATUS_CONFIG) as StatusKey[];

const PROGRESS_COLORS: Record<StatusKey, string> = {
    not_started: "bg-muted-foreground/50",
    stage1: "bg-primary",
    stage2: "bg-cyan-500",
    stage3: "bg-chart-3",
    stage4: "bg-amber-500",
    submitted: "bg-yellow-500",
    graded: "bg-emerald-500",
    rejected: "bg-destructive",
};

const RING_COLORS: Record<StatusKey, string> = {
    not_started: "var(--muted-foreground)",
    stage1: "var(--primary)",
    stage2: "var(--color-cyan-500)",
    stage3: "var(--chart-3)",
    stage4: "var(--color-amber-500)",
    submitted: "var(--color-yellow-500)",
    graded: "var(--color-emerald-500)",
    rejected: "var(--destructive)",
};

const CHART_SIZE = 160;
const CHART_CENTER = CHART_SIZE / 2;
const RING_RADIUS = 65;
const RING_STROKE = 14;

const STATUSES_WITH_SUBMISSION: StatusKey[] = ["submitted", "graded", "rejected"];

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

    if (loading) return <div className="p-12 text-center text-muted-foreground">加载中...</div>;
    if (!data) return <div className="p-12 text-center text-muted-foreground">未找到任务</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-accent" onClick={() => navigate("/task")}>
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    返回列表
                </Button>
                <div className="h-6 w-px bg-border"></div>
                <div>
                    <h2 className="text-lg font-semibold text-foreground">{data.task.topicName}</h2>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{data.task.className}</span>
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {data.task.deadline ? `截止: ${new Date(data.task.deadline).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}` : "无截止时间"}
                        </span>
                        <span>{total} 名学生</span>
                    </div>
                </div>
            </div>

            {/* Status count cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
                {STATUS_KEYS.map((key) => {
                    const cfg = STATUS_CONFIG[key];
                    const count = data.counts[key];
                    return (
                        <Card key={key} className={`border-border bg-card ${count > 0 ? "hover:border-border" : ""} transition-colors`}>
                            <CardContent className="p-3 text-center">
                                <p className="text-xs text-muted-foreground mb-1">{cfg.label}</p>
                                <p className={`text-xl font-bold ${count > 0 ? cfg.color : "text-muted-foreground/40"}`}>{count}</p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Ring chart + Progress bar */}
            {total > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Ring chart */}
                    <Card className="border-border bg-card">
                        <CardContent className="p-6 flex flex-col items-center">
                            <svg width={CHART_SIZE} height={CHART_SIZE} viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`} className="mb-4">
                                {(() => {
                                    const circumference = 2 * Math.PI * RING_RADIUS;
                                    let offset = 0;
                                    const segments: React.ReactNode[] = [];

                                    STATUS_KEYS.forEach((key) => {
                                        const count = data.counts[key];
                                        if (count === 0) return;
                                        const pct = count / total;
                                        const length = pct * circumference;
                                        segments.push(
                                            <circle
                                                key={key}
                                                cx={CHART_CENTER}
                                                cy={CHART_CENTER}
                                                r={RING_RADIUS}
                                                fill="none"
                                                stroke={RING_COLORS[key]}
                                                strokeWidth={RING_STROKE}
                                                strokeDasharray={`${length} ${circumference - length}`}
                                                strokeDashoffset={-offset}
                                                transform={`rotate(-90 ${CHART_CENTER} ${CHART_CENTER})`}
                                                className="transition-all duration-500"
                                            />
                                        );
                                        offset += length;
                                    });

                                    return (
                                        <>
                                            <circle cx={CHART_CENTER} cy={CHART_CENTER} r={RING_RADIUS} fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth={RING_STROKE} />
                                            {segments}
                                            <text x={CHART_CENTER} y={CHART_CENTER - 8} textAnchor="middle" className="fill-foreground text-2xl font-bold" fontSize="28">{total}</text>
                                            <text x={CHART_CENTER} y={CHART_CENTER + 14} textAnchor="middle" className="fill-muted-foreground text-xs" fontSize="12">总人数</text>
                                        </>
                                    );
                                })()}
                            </svg>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                {STATUS_KEYS.map((key) => {
                                    const cfg = STATUS_CONFIG[key];
                                    const count = data.counts[key];
                                    if (count === 0) return null;
                                    return (
                                        <div key={key} className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RING_COLORS[key] }} />
                                            <span className="text-muted-foreground">{cfg.label}</span>
                                            <span className={`font-medium ${cfg.color}`}>{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Distribution bar (now wider, takes 2 cols) */}
                    <Card className="border-border bg-card lg:col-span-2">
                        <CardContent className="p-6 flex flex-col justify-center h-full gap-4">
                            <span className="text-sm font-medium text-foreground">各阶段分布</span>
                            <div className="flex h-4 rounded-full overflow-hidden bg-muted">
                                {STATUS_KEYS.map((key) => {
                                    const count = data.counts[key];
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
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {STATUS_KEYS.map((key) => {
                                    const cfg = STATUS_CONFIG[key];
                                    const count = data.counts[key];
                                    return (
                                        <div key={key} className="flex items-center gap-2 text-xs">
                                            <span className={`w-2 h-2 rounded-full ${PROGRESS_COLORS[key]}`} />
                                            <span className="text-muted-foreground">{cfg.label}</span>
                                            <span className={`font-medium ${cfg.color}`}>{count}</span>
                                            <span className="text-muted-foreground">({total > 0 ? Math.round((count / total) * 100) : 0}%)</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Student list */}
            <Card className="border-border bg-card">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">学生列表</span>
                    <div className="relative w-56">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="搜索学号/姓名"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 bg-background dark:bg-card border-border text-foreground placeholder:text-muted-foreground h-8 text-sm"
                        />
                    </div>
                </div>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-muted/50">
                                <TableHead className="text-muted-foreground">学号</TableHead>
                                <TableHead className="text-muted-foreground">姓名</TableHead>
                                <TableHead className="text-muted-foreground">状态</TableHead>
                                <TableHead className="text-muted-foreground">当前阶段</TableHead>
                                <TableHead className="text-muted-foreground">最近活动</TableHead>
                                <TableHead className="text-muted-foreground text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredStudents.map((s) => {
                                const cfg = STATUS_CONFIG[s.status as StatusKey] ?? STATUS_CONFIG.not_started;
                                return (
                                    <TableRow key={s.studentId} className="border-border hover:bg-accent transition-colors">
                                        <TableCell className="font-mono text-foreground text-sm">{s.studentId}</TableCell>
                                        <TableCell className="text-foreground">{s.name}</TableCell>
                                        <TableCell>
                                            <Badge className={`${cfg.bgColor} ${cfg.color} ${cfg.borderColor}`}>
                                                {cfg.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-sm">
                                            {s.stage !== null ? `阶段 ${s.stage}` : "-"}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {s.lastActivity ? new Date(s.lastActivity).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "-"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {STATUSES_WITH_SUBMISSION.includes(s.status as StatusKey) && s.submissionId ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10"
                                                    onClick={() => navigate(`/grading/${s.submissionId}`)}
                                                >
                                                    {s.status === "submitted" ? (
                                                        <><FileEdit className="w-3 h-3 mr-1" />进入批改</>
                                                    ) : (
                                                        <><Eye className="w-3 h-3 mr-1" />查看详情</>
                                                    )}
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {filteredStudents.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
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

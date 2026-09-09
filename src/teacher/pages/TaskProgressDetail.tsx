import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Clock, Search, FileEdit, Eye } from "lucide-react";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeDisplay } from "@/utils/format";
import { teacherApi, type TaskProgressData } from "../api-client";

const STATUS_CONFIG = {
    not_started: { label: "未开始", color: "text-muted-foreground", intent: "neutral" },
    stage1: { label: "问卷设计", color: "text-info", intent: "info" },
    stage2: { label: "样本规划", color: "text-info", intent: "info" },
    stage3: { label: "抽样执行", color: "text-auxiliary", intent: "auxiliary" },
    stage4: { label: "分析报告", color: "text-warning", intent: "warning" },
    submitted: { label: "已提交", color: "text-warning", intent: "warning" },
    graded: { label: "已批改", color: "text-success", intent: "success" },
    rejected: { label: "已驳回", color: "text-destructive", intent: "destructive" },
} as const;

type StatusConfig = { label: string; color: string; intent: StatusBadgeIntent };

type StatusKey = keyof typeof STATUS_CONFIG;
const STATUS_KEYS = Object.keys(STATUS_CONFIG) as StatusKey[];

const PROGRESS_COLORS: Record<StatusKey, string> = {
    not_started: "bg-chart-1",
    stage1: "bg-chart-2",
    stage2: "bg-chart-3",
    stage3: "bg-chart-4",
    stage4: "bg-chart-5",
    submitted: "bg-chart-6",
    graded: "bg-chart-7",
    rejected: "bg-chart-8",
};

const RING_COLORS: Record<StatusKey, string> = {
    not_started: "var(--chart-1)",
    stage1: "var(--chart-2)",
    stage2: "var(--chart-3)",
    stage3: "var(--chart-4)",
    stage4: "var(--chart-5)",
    submitted: "var(--chart-6)",
    graded: "var(--chart-7)",
    rejected: "var(--chart-8)",
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
    const { loading, error: loadError, run, cancel } = useAsyncLoad("任务进度加载失败");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        if (Number.isInteger(Number(taskId)) && Number(taskId) > 0) void loadProgress(Number(taskId));
        return cancel;
    }, [taskId]);

    async function loadProgress(id: number) {
        return run(async () => requireApiData(await teacherApi.getTaskProgress(id), "任务进度加载失败"), setData);
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

    if (!Number.isInteger(Number(taskId)) || Number(taskId) <= 0) return <p>无效的任务编号</p>;
    if (loadError) return <RequestError message={loadError} onRetry={() => void loadProgress(Number(taskId))} />;
    if (loading) return <div role="status" aria-live="polite" className="p-12 text-center text-muted-foreground">加载中...</div>;
    if (!data) return <div className="p-12 text-center text-muted-foreground">未找到任务</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => navigate("/task")}>
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    返回列表
                </Button>
                <div className="h-6 w-px bg-muted"></div>
                <div>
                    <h2 className="text-subheading font-semibold text-foreground">{data.task.topicName}</h2>
                    <div className="flex items-center gap-3 text-meta text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{data.task.className}</span>
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {data.task.deadline ? `截止：${formatDateTimeDisplay(data.task.deadline)}（UTC+8）` : "无截止时间"}
                        </span>
                        <span>{total} 名学生</span>
                    </div>
                </div>
            </div>

            {/* Status count cards */}
            <div className="grid grid-cols-8 gap-3">
                {STATUS_KEYS.map((key) => {
                    const cfg = STATUS_CONFIG[key];
                    const count = data.counts[key];
                    return (
                        <Card key={key} className="border-border bg-card">
                            <CardContent className="p-3 text-center">
                                <p className="text-meta text-muted-foreground mb-1">{cfg.label}</p>
                                <p className={`text-section-title font-bold ${count > 0 ? cfg.color : "text-muted-foreground"}`}>{count}</p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Ring chart + Progress bar */}
            {total > 0 && (
                <div className="grid grid-cols-3 gap-6">
                    {/* Ring chart */}
                    <Card>
                        <CardContent className="p-6 flex flex-col items-center">
                            <svg role="img" aria-label="学生实验状态分布环形图" width={CHART_SIZE} height={CHART_SIZE} viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`} className="mb-4">
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
                                                className="transition-colors duration-500"
                                            />
                                        );
                                        offset += length;
                                    });

                                    return (
                                        <>
                                            <circle cx={CHART_CENTER} cy={CHART_CENTER} r={RING_RADIUS} fill="none" stroke="rgb(30,41,59)" strokeWidth={RING_STROKE} />
                                            {segments}
                                            <text x={CHART_CENTER} y={CHART_CENTER - 8} textAnchor="middle" className="fill-foreground text-page-title font-bold" fontSize="28">{total}</text>
                                            <text x={CHART_CENTER} y={CHART_CENTER + 14} textAnchor="middle" className="fill-muted-foreground text-meta" fontSize="12">总人数</text>
                                        </>
                                    );
                                })()}
                            </svg>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-meta">
                                {STATUS_KEYS.map((key) => {
                                    const cfg = STATUS_CONFIG[key];
                                    const count = data.counts[key];
                                    if (count === 0) return null;
                                    return (
                                        <div key={key} className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-circle" style={{ backgroundColor: RING_COLORS[key] }} />
                                            <span className="text-muted-foreground">{cfg.label}</span>
                                            <span className={`font-medium ${cfg.color}`}>{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Distribution bar (now wider, takes 2 cols) */}
                    <Card className="border-border bg-card col-span-2">
                        <CardContent className="p-6 flex flex-col justify-center h-full gap-4">
                            <span className="text-label font-medium text-foreground">各阶段分布</span>
                            <div className="flex h-4 rounded-control overflow-hidden bg-muted">
                                {STATUS_KEYS.map((key) => {
                                    const count = data.counts[key];
                                    if (count === 0) return null;
                                    const pct = (count / total) * 100;
                                    return (
                                        <div
                                            key={key}
                                            className={`${PROGRESS_COLORS[key]} transition-[width] duration-500`}
                                            style={{ width: `${pct}%` }}
                                            title={`${STATUS_CONFIG[key].label}: ${count}`}
                                        />
                                    );
                                })}
                            </div>
                            <div className="grid grid-cols-4 gap-3">
                                {STATUS_KEYS.map((key) => {
                                    const cfg = STATUS_CONFIG[key];
                                    const count = data.counts[key];
                                    return (
                                        <div key={key} className="flex items-center gap-2 text-meta">
                                            <span className={`w-2 h-2 rounded-circle ${PROGRESS_COLORS[key]}`} />
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
            <Card>
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <span className="text-label font-medium text-foreground">学生列表</span>
                    <div className="relative w-56">
                        <Label htmlFor="teacher-progress-search" className="sr-only">搜索学号或姓名</Label>
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="teacher-progress-search"
                            placeholder="搜索学号/姓名"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 bg-card border-input text-foreground placeholder:text-muted-foreground h-8 text-label"
                        />
                    </div>
                </div>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border">
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
                                const cfg: StatusConfig = STATUS_CONFIG[s.status as StatusKey] ?? STATUS_CONFIG.not_started;
                                return (
                                    <TableRow key={s.studentId} className="border-border hover:bg-muted transition-none">
                                        <TableCell className="font-mono text-foreground text-label">{s.studentId}</TableCell>
                                        <TableCell className="text-foreground">{s.name}</TableCell>
                                        <TableCell>
                                            <StatusBadge intent={cfg.intent}>
                                                {cfg.label}
                                            </StatusBadge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-label">
                                            {s.stage !== null ? `阶段 ${s.stage}` : "-"}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-meta">
                                            {s.lastActivity ? `${formatDateTimeDisplay(s.lastActivity)}（UTC+8）` : "-"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {STATUSES_WITH_SUBMISSION.includes(s.status as StatusKey) && s.submissionId ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-meta text-primary hover:text-primary hover:bg-primary-muted"
                                                    onClick={() => navigate(`/grading/${s.submissionId}`)}
                                                >
                                                    {s.status === "submitted" ? (
                                                        <><FileEdit className="w-3 h-3 mr-1" />进入批改</>
                                                    ) : (
                                                        <><Eye className="w-3 h-3 mr-1" />查看详情</>
                                                    )}
                                                </Button>
                                            ) : (
                                                <span className="text-meta text-muted-foreground">-</span>
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

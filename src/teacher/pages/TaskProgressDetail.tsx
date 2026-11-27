import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Users, Clock, Search, FileEdit, Eye } from "lucide-react";
import {
    TaskProgressExecutiveCharts,
    type TaskProgressFilterValue,
    type TaskProgressStatusKey,
} from "@/components/charts/PortalAnalyticsCharts";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeDisplay } from "@/utils/format";
import { teacherApi, type TaskProgressData } from "../api-client";

const STATUS_CONFIG = {
    not_started: { label: "未开始", intent: "neutral" },
    stage1: { label: "商业问卷设计", intent: "info" },
    stage2: { label: "首轮试投发放", intent: "info" },
    stage3: { label: "回收质检与诊断", intent: "auxiliary" },
    stage4: { label: "调整思路与二轮投放", intent: "primary" },
    stage5: { label: "商务分析与决策报告", intent: "warning" },
    submitted: { label: "已提交", intent: "warning" },
    graded: { label: "已批改", intent: "success" },
    rejected: { label: "已驳回", intent: "destructive" },
} as const;

type StatusConfig = { label: string; intent: StatusBadgeIntent };

type StatusKey = TaskProgressStatusKey;

const STATUSES_WITH_SUBMISSION: StatusKey[] = ["submitted", "graded", "rejected"];
const IN_PROGRESS_STATUSES: StatusKey[] = ["stage1", "stage2", "stage3", "stage4", "stage5"];

export function TaskProgressDetail() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const { search } = useLocation();
    const [data, setData] = useState<TaskProgressData | null>(null);
    const { loading, error: loadError, run, cancel } = useAsyncLoad("任务进度加载失败");
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<TaskProgressFilterValue>("all");
    const [distributionOpen, setDistributionOpen] = useState(false);

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
        return data.students.filter((s) => {
            const matchesKeyword = !keyword || s.studentId.toLowerCase().includes(keyword) || s.name.toLowerCase().includes(keyword);
            const matchesStatus = statusFilter === "all"
                || (statusFilter === "in_progress" ? IN_PROGRESS_STATUSES.includes(s.status as StatusKey) : s.status === statusFilter);
            return matchesKeyword && matchesStatus;
        });
    }, [data, searchTerm, statusFilter]);

    const total = data ? Object.values(data.counts).reduce<number>((a, b) => a + (b ?? 0), 0) : 0;

    if (!Number.isInteger(Number(taskId)) || Number(taskId) <= 0) return <p>无效的任务编号</p>;
    if (loadError) return <RequestError message={loadError} onRetry={() => void loadProgress(Number(taskId))} />;
    if (loading) return <div role="status" aria-live="polite" className="p-12 text-center text-muted-foreground">加载中...</div>;
    if (!data) return <div className="p-12 text-center text-muted-foreground">未找到任务</div>;

    const ppsUnavailable = data.ppsUnavailable;

    return (
        <div className="space-y-4">
            {ppsUnavailable && ppsUnavailable.count > 0 && (
                <div
                    role="status"
                    data-testid="teacher-progress-pps-unavailable"
                    className="rounded-surface border border-warning-border bg-warning-muted px-4 py-3 text-label text-warning"
                >
                    <p className="font-medium">有 {ppsUnavailable.count} 名学生的 PPS 因总体数据不可用而被跳过</p>
                    <p className="mt-1">
                        该任务的总体没有每一行都为正数的非目标数值列，学生的 PPS 按“不适用”处理（{ppsUnavailable.students.map((item) => item.name).join("、")}）。
                        模板发布后不可修改；如需真正执行 PPS，请更换总体数据或复制为新模板后重新发布。
                    </p>
                </div>
            )}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => navigate(`/task${search}`)}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    返回列表
                </Button>
                <div className="h-5 w-px bg-border" aria-hidden="true" />
                <div>
                    <h2 className="text-subheading font-medium text-foreground">{data.task.topicName}</h2>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-meta text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{data.task.className}</span>
                        <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {data.task.deadline ? `截止：${formatDateTimeDisplay(data.task.deadline)}（UTC+8）` : "无截止时间"}
                        </span>
                        <span className="tabular-nums">{total} 名学生</span>
                    </div>
                </div>
            </div>

            {/* Executive BI Status Donut + 5-Stage Pipeline Bar */}
            {total > 0 && (
                <div className="rounded-surface border border-border bg-muted px-4 py-2.5" data-testid="teacher-progress-distribution">
                    <Button variant="ghost" size="sm" aria-expanded={distributionOpen} aria-controls="teacher-progress-charts" onClick={() => setDistributionOpen(open => !open)}>
                        {distributionOpen ? "收起阶段分布" : "查看阶段分布"} · {total} 名学生
                    </Button>
                    {distributionOpen && (
                        <TaskProgressExecutiveCharts
                            counts={data.counts}
                            statusFilter={statusFilter}
                            onSelectStatusFilter={setStatusFilter}
                        />
                    )}
                </div>
            )}

            {/* Student list */}
            <Card className="gap-0 overflow-hidden border-border bg-card py-0" data-testid="teacher-progress-students">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                    <span className="text-section-title font-medium text-foreground">
                        学生列表
                        {(searchTerm || statusFilter !== "all") && (
                            <span className="ml-2 text-meta font-normal text-muted-foreground">（匹配 {filteredStudents.length} / {data.students.length} 人）</span>
                        )}
                    </span>
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="relative w-52">
                            <Label htmlFor="teacher-progress-search" className="sr-only">搜索学号或姓名</Label>
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="teacher-progress-search"
                                placeholder="搜索学号/姓名"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-9 bg-card pl-9 text-label"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskProgressFilterValue)}>
                            <SelectTrigger aria-label="按实验状态筛选学生" className="h-9 w-48 bg-card text-label">
                                <SelectValue placeholder="全部状态" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="not_started">未开始</SelectItem>
                                <SelectItem value="in_progress">实训进行中</SelectItem>
                                <SelectItem value="stage1">阶段 1 · 商业问卷设计</SelectItem>
                                <SelectItem value="stage2">阶段 2 · 首轮试投发放</SelectItem>
                                <SelectItem value="stage3">阶段 3 · 回收质检与诊断</SelectItem>
                                <SelectItem value="stage4">阶段 4 · 调整思路与二轮投放</SelectItem>
                                <SelectItem value="stage5">阶段 5 · 商务分析与决策报告</SelectItem>
                                <SelectItem value="submitted">已提交待批改</SelectItem>
                                <SelectItem value="graded">已批改</SelectItem>
                                <SelectItem value="rejected">已驳回</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <CardContent className="p-0">
                    <Table aria-label="任务学生进度">
                        <TableHeader>
                            <TableRow className="border-border">
                                <TableHead className="text-muted-foreground">学号</TableHead>
                                <TableHead className="text-muted-foreground">姓名</TableHead>
                                <TableHead className="text-muted-foreground">状态</TableHead>
                                <TableHead className="text-muted-foreground">当前阶段</TableHead>
                                <TableHead className="text-muted-foreground">最近活动 (UTC+8)</TableHead>
                                <TableHead className="text-right text-muted-foreground">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredStudents.map((s) => {
                                const cfg: StatusConfig = STATUS_CONFIG[s.status as StatusKey] ?? STATUS_CONFIG.not_started;
                                return (
                                    <TableRow key={s.studentId} className="border-border transition-none hover:bg-muted">
                                        <TableCell className="font-mono text-label text-foreground">{s.studentId}</TableCell>
                                        <TableCell className="font-medium text-foreground">{s.name}</TableCell>
                                        <TableCell>
                                            <StatusBadge intent={cfg.intent}>
                                                {cfg.label}
                                            </StatusBadge>
                                        </TableCell>
                                        <TableCell className="text-label tabular-nums text-muted-foreground">
                                            {s.stage !== null ? `阶段 ${s.stage}` : "-"}
                                        </TableCell>
                                        <TableCell className="text-meta tabular-nums text-muted-foreground">
                                            {s.lastActivity ? formatDateTimeDisplay(s.lastActivity) : "-"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {STATUSES_WITH_SUBMISSION.includes(s.status as StatusKey) && s.submissionId ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 text-meta text-primary hover:bg-primary-muted hover:text-primary"
                                                    onClick={() => navigate(`/grading/${s.submissionId}`)}
                                                >
                                                    {s.status === "submitted" ? (
                                                        <><FileEdit className="mr-1 h-3.5 w-3.5" />进入批改</>
                                                    ) : (
                                                        <><Eye className="mr-1 h-3.5 w-3.5" />查看详情</>
                                                    )}
                                                </Button>
                                            ) : s.status === "not_started" ? (
                                                <span className="text-meta text-muted-foreground">-</span>
                                            ) : (
                                                <span className="text-meta text-muted-foreground">进行中，提交后可批改</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {filteredStudents.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="whitespace-normal py-12 text-center text-muted-foreground">
                                        <div className="space-y-2">
                                            <p>暂无数据</p>
                                            {(searchTerm || statusFilter !== "all") && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSearchTerm("");
                                                        setStatusFilter("all");
                                                    }}
                                                >
                                                    清空搜索与筛选
                                                </Button>
                                            )}
                                        </div>
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

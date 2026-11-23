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
    not_started: { label: "未开始", color: "text-muted-foreground", intent: "neutral" },
    stage1: { label: "商业问卷设计", color: "text-info", intent: "info" },
    stage2: { label: "首轮试投发放", color: "text-info", intent: "info" },
    stage3: { label: "回收质检与诊断", color: "text-auxiliary-strong", intent: "auxiliary" },
    stage4: { label: "调整思路与二轮投放", color: "text-primary", intent: "primary" },
    stage5: { label: "商务分析与决策报告", color: "text-warning", intent: "warning" },
    submitted: { label: "已提交", color: "text-warning", intent: "warning" },
    graded: { label: "已批改", color: "text-success", intent: "success" },
    rejected: { label: "已驳回", color: "text-destructive", intent: "destructive" },
} as const;

type StatusConfig = { label: string; color: string; intent: StatusBadgeIntent };

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
        <div className="space-y-6">
            {ppsUnavailable && ppsUnavailable.count > 0 && (
                <div
                    role="status"
                    data-testid="teacher-progress-pps-unavailable"
                    className="rounded-surface border border-warning-border bg-warning-muted p-4 text-label text-warning"
                >
                    <p className="font-medium">有 {ppsUnavailable.count} 名学生的 PPS 因总体数据不可用而被跳过</p>
                    <p className="mt-1">
                        该任务的总体没有每一行都为正数的非目标数值列，学生的 PPS 按“不适用”处理（{ppsUnavailable.students.map((item) => item.name).join("、")}）。
                        模板发布后不可修改；如需真正执行 PPS，请更换总体数据或复制为新模板后重新发布。
                    </p>
                </div>
            )}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => navigate(`/task${search}`)}>
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
                        <span className="tabular-nums">{total} 名学生</span>
                    </div>
                </div>
            </div>

            {/* Executive BI Status Donut + 5-Stage Pipeline Bar */}
            {total > 0 && (
                <div className="rounded-surface bg-muted p-4" data-testid="teacher-progress-distribution">
                    <Button variant="ghost" aria-expanded={distributionOpen} aria-controls="teacher-progress-charts" onClick={() => setDistributionOpen(open => !open)}>
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
            <Card data-testid="teacher-progress-students">
                <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
                    <span className="text-label font-medium text-foreground">
                        学生列表
                        {(searchTerm || statusFilter !== "all") && (
                            <span className="ml-2 text-meta font-normal text-muted-foreground">（匹配 {filteredStudents.length} / {data.students.length} 人）</span>
                        )}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-52">
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
                        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskProgressFilterValue)}>
                            <SelectTrigger aria-label="按实验状态筛选学生" className="h-8 w-44 bg-card text-label">
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
                <CardContent className="pt-0">
                    <Table aria-label="任务学生进度">
                        <TableHeader>
                            <TableRow className="border-border">
                                <TableHead className="text-muted-foreground">学号</TableHead>
                                <TableHead className="text-muted-foreground">姓名</TableHead>
                                <TableHead className="text-muted-foreground">状态</TableHead>
                                <TableHead className="text-muted-foreground">当前阶段</TableHead>
                                <TableHead className="text-muted-foreground">最近活动 (UTC+8)</TableHead>
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
                                        <TableCell className="text-muted-foreground text-label tabular-nums">
                                            {s.stage !== null ? `阶段 ${s.stage}` : "-"}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-meta tabular-nums">
                                            {s.lastActivity ? formatDateTimeDisplay(s.lastActivity) : "-"}
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
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground whitespace-normal">
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

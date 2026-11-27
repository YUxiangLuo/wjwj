import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Users, CheckCircle2, Layers, Search, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { teacherApi, downloadTeacherFile, type GradeAnalytics, type GradeExportPreviewItem, type TeacherClass, type Topic } from "../api-client";
import { toast } from "sonner";
import { formatLocalDateStamp } from "@/utils/format";
import { KpiStatCard } from "@/components/KpiStatCard";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
    GradeRubricRadarBarCard,
    GradeScoreHistogramCard,
    GradeSubmissionFunnelCard,
} from "@/components/charts/PortalAnalyticsCharts";

export function GradeExport() {
    const [classes, setClasses] = useState<TeacherClass[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [preview, setPreview] = useState<GradeExportPreviewItem[]>([]);
    const [analytics, setAnalytics] = useState<GradeAnalytics | null>(null);
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [semesterFilter, setSemesterFilter] = useState<string>("all");
    const [classFilter, setClassFilter] = useState<string>("all");
    const [topicFilter, setTopicFilter] = useState<string>("all");
    const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
    const [exporting, setExporting] = useState(false);
    const previewRequestId = useRef(0);

    useEffect(() => {
        void loadFilters();
    }, []);

    useEffect(() => {
        const requestId = ++previewRequestId.current;
        void loadPreview(requestId);
        return () => {
            if (previewRequestId.current === requestId) previewRequestId.current += 1;
        };
    }, [semesterFilter, classFilter, topicFilter]);

    const semesters = useMemo(() => {
        const values = classes.map((c) => c.semester).filter(Boolean) as string[];
        return Array.from(new Set(values)).sort();
    }, [classes]);

    const filteredClasses = useMemo(() => {
        if (semesterFilter === "all") return classes;
        return classes.filter((c) => c.semester === semesterFilter);
    }, [classes, semesterFilter]);

    const selectedCount = selectedTaskIds.length;

    async function loadFilters() {
        const [classesRes, topicsRes] = await Promise.all([
            teacherApi.getClasses(),
            teacherApi.getTopics()
        ]);
        if (classesRes.success && classesRes.data) setClasses(classesRes.data);
        if (topicsRes.success && topicsRes.data) {
            setTopics(topicsRes.data.filter((topic) => topic.status === 1));
        }
    }

    async function loadPreview(requestId: number, resetSelection = true) {
        setLoading(true);
        setAnalyticsError(null);
        setPreviewError(null);
        const params = { semester: semesterFilter, classId: classFilter, topicId: topicFilter };
        const [previewRes, analyticsRes] = await Promise.all([
            teacherApi.getGradeExportPreview(params),
            teacherApi.getGradeAnalytics(params),
        ]);
        if (requestId !== previewRequestId.current) return;
        if (previewRes.success && previewRes.data) {
            setPreview(previewRes.data);
            setPreviewError(null);
        } else {
            setPreview([]);
            setPreviewError(previewRes.error?.code === "NETWORK_ERROR"
                ? "导出任务加载失败，请检查网络后重试"
                : previewRes.error?.message ?? "导出任务加载失败，请稍后重试");
        }
        if (analyticsRes.success && analyticsRes.data) {
            setAnalytics(analyticsRes.data);
            setAnalyticsError(null);
        } else {
            setAnalytics(null);
            setAnalyticsError(analyticsRes.error?.code === "NETWORK_ERROR"
                ? "成绩分析加载失败，请检查网络后重试"
                : analyticsRes.error?.message ?? "成绩分析加载失败，请稍后重试");
        }
        setLoading(false);
        if (resetSelection) setSelectedTaskIds([]);
    }

    function retryPreview() {
        const requestId = ++previewRequestId.current;
        void loadPreview(requestId, false);
    }

    function toggleTask(taskId: number) {
        setSelectedTaskIds(prev => prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]);
    }

    async function exportExcel(taskId?: number) {
        const ids = taskId ? [taskId] : selectedTaskIds;
        if (ids.length === 0 || exporting) return;

        const search = new URLSearchParams();
        if (semesterFilter !== "all") {
            search.set("semester", semesterFilter);
        }
        if (classFilter !== "all") {
            search.set("classId", classFilter);
        }
        if (topicFilter !== "all") {
            search.set("topicId", topicFilter);
        }
        if (ids.length === 1) {
            search.set("taskId", String(ids[0]));
        } else {
            search.set("taskIds", ids.join(","));
        }

        setExporting(true);
        try {
            await downloadTeacherFile(`/api/teacher/grade-export/excel?${search.toString()}`, `grade-export-${formatLocalDateStamp()}.xlsx`);
        } catch {
            toast.error("导出失败");
        } finally {
            setExporting(false);
        }
    }

    const analyticsContent = (
        <section aria-label="成绩统计参考" className="space-y-4">
            <div className="grid grid-cols-4 gap-3.5">
                <KpiStatCard
                    label="应交人次"
                    value={loading || !analytics ? "-" : analytics.funnel.total}
                    hint="按学生-任务人次统计"
                    icon={Layers}
                    intent="neutral"
                />
                <KpiStatCard
                    label="已批改人次"
                    value={loading || !analytics ? "-" : analytics.funnel.graded}
                    hint="已完成评分归档"
                    icon={CheckCircle2}
                    intent="neutral"
                />
                <KpiStatCard
                    label="总分均值"
                    value={loading ? "-" : analytics?.scores.average?.toFixed(1) ?? "-"}
                    hint="仅统计已批改成绩"
                    icon={Users}
                    intent="neutral"
                />
                <KpiStatCard
                    label="总分中位数"
                    value={loading ? "-" : analytics?.scores.median?.toFixed(1) ?? "-"}
                    hint="已批改成绩中位水平"
                    icon={FileSpreadsheet}
                    intent="neutral"
                />
            </div>

            {analyticsError && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3 text-label text-destructive">
                    <span>{analyticsError}</span>
                    <Button type="button" variant="outline" size="sm" onClick={retryPreview} disabled={loading} className="shrink-0 border-destructive-border bg-card text-destructive hover:bg-destructive-muted hover:text-destructive">
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />重试分析
                    </Button>
                </div>
            )}

            {loading ? (
                <Card className="border-border bg-card"><CardContent role="status" aria-live="polite" className="py-12 text-center text-label text-muted-foreground">正在加载成绩分析…</CardContent></Card>
            ) : analytics ? (
                <>
                    <div className="grid grid-cols-2 gap-4" data-testid="teacher-grade-analytics">
                        <GradeSubmissionFunnelCard funnel={analytics.funnel} />
                        <GradeScoreHistogramCard scores={analytics.scores} />
                    </div>

                    <GradeRubricRadarBarCard scores={analytics.scores} />
                </>
            ) : null}

        </section>
    );

    return (
        <div className="space-y-5">
            <p className="text-label text-muted-foreground">按学期、班级和实验模板分析学生任务人次，并支持单项与批量导出。</p>
            <Card className="gap-0 overflow-hidden border-border bg-card py-0" data-testid="teacher-export-list">
                <PageHeader as={CardHeader} className="flex-wrap border-b border-border px-5 py-4 [.border-b]:pb-4">
                    <div>
                        <CardTitle className="text-section-title font-medium text-foreground">导出列表</CardTitle>
                        <p className="mt-0.5 text-meta text-muted-foreground">{previewError ? "导出任务加载失败" : `共 ${preview.length} 条数据`}</p>
                    </div>
                    <div className="flex w-auto flex-row flex-wrap items-center gap-3">
                        <Select value={semesterFilter} onValueChange={(v) => { setSemesterFilter(v); setClassFilter("all"); }}>
                            <SelectTrigger aria-label="按学期筛选导出任务" data-testid="teacher-export-semester-filter" className="w-40 bg-card">
                                <SelectValue placeholder="全部学期" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部学期</SelectItem>
                                {semesters.map((s) => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={classFilter} onValueChange={setClassFilter}>
                            <SelectTrigger aria-label="按班级筛选导出任务" data-testid="teacher-export-class-filter" className="w-40 bg-card">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部班级</SelectItem>
                                {filteredClasses.map((cls) => (
                                    <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={topicFilter} onValueChange={setTopicFilter}>
                            <SelectTrigger aria-label="按实验模板筛选导出任务" data-testid="teacher-export-topic-filter" className="w-40 bg-card">
                                <SelectValue placeholder="全部实验模板" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部实验模板</SelectItem>
                                {topics.map((t) => (
                                    <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            data-testid="teacher-export-batch"
                            disabled={selectedCount === 0 || exporting}
                            onClick={() => exportExcel()}
                        >
                            <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                            批量导出 ({selectedCount})
                        </Button>
                    </div>
                </PageHeader>
                <CardContent className="p-0">
                    <Table aria-label="导出列表">
                        <TableHeader>
                            <TableRow className="border-border">
                                <TableHead className="w-12 text-center text-muted-foreground">
                                    <span className="sr-only">选择任务</span>
                                    <input
                                        aria-label="选择全部导出任务"
                                        data-testid="teacher-export-check-all"
                                        type="checkbox"
                                        disabled={loading || preview.length === 0}
                                        className="h-4 w-4 accent-primary disabled:cursor-not-allowed"
                                        checked={selectedTaskIds.length > 0 && selectedTaskIds.length === preview.length}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedTaskIds(preview.map(p => p.taskId));
                                            } else {
                                                setSelectedTaskIds([]);
                                            }
                                        }}
                                    />
                                </TableHead>
                                <TableHead className="text-muted-foreground">实验模板</TableHead>
                                <TableHead className="text-muted-foreground">班级</TableHead>
                                <TableHead className="text-muted-foreground">批改进度</TableHead>
                                <TableHead className="text-muted-foreground">平均分</TableHead>
                                <TableHead className="text-right text-muted-foreground">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground"><span role="status" aria-live="polite">加载中...</span></TableCell>
                                </TableRow>
                            ) : previewError ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-12 text-center text-destructive" role="alert">{previewError}</TableCell>
                                </TableRow>
                            ) : preview.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="whitespace-normal py-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <Search className="h-6 w-6 text-muted-foreground" />
                                            <p>暂无符合条件的数据</p>
                                            {(semesterFilter !== "all" || classFilter !== "all" || topicFilter !== "all") && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="mt-1"
                                                    onClick={() => {
                                                        setSemesterFilter("all");
                                                        setClassFilter("all");
                                                        setTopicFilter("all");
                                                    }}
                                                >
                                                    重置筛选条件
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : preview.map((task) => (
                                <TableRow data-testid={`teacher-export-row-${task.taskId}`} key={task.taskId} className="border-border transition-none hover:bg-muted">
                                    <TableCell className="text-center">
                                        <input
                                            aria-label={`选择导出任务：${task.topic}，${task.className}`}
                                            data-testid={`teacher-export-check-${task.taskId}`}
                                            type="checkbox"
                                            className="h-4 w-4 accent-primary"
                                            checked={selectedTaskIds.includes(task.taskId)}
                                            onChange={() => toggleTask(task.taskId)}
                                        />
                                    </TableCell>
                                    <TableCell className="min-w-[11rem] whitespace-normal font-medium leading-snug text-foreground">{task.topic}</TableCell>
                                    <TableCell className="min-w-[7.5rem] whitespace-normal text-foreground">{task.className}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 whitespace-nowrap">
                                            <Progress aria-label={`${task.topic}批改进度`} value={task.total > 0 ? Math.round((task.graded / task.total) * 100) : 0} className="h-1.5 w-16" />
                                            <span className="text-meta tabular-nums text-muted-foreground">{task.graded}/{task.total}</span>
                                            {task.graded === task.total && task.total > 0 && (
                                                <StatusBadge intent="success">已完成</StatusBadge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap font-mono font-medium tabular-nums text-foreground">{task.graded > 0 ? task.avgScore.toFixed(1) : "-"}</TableCell>
                                    <TableCell className="whitespace-nowrap text-right">
                                        <Button
                                            data-testid={`teacher-export-single-${task.taskId}`}
                                            variant="ghost"
                                            size="sm"
                                            disabled={exporting}
                                            className="h-8 px-2.5 text-primary hover:bg-primary-muted hover:text-primary"
                                            onClick={() => exportExcel(task.taskId)}
                                        >
                                            <Download className="mr-1 h-3.5 w-3.5" />
                                            {exporting ? "导出中…" : "导出"}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            {analyticsContent}
        </div>
    );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Users, CheckCircle2, Layers, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { teacherApi, type GradeAnalytics, type GradeExportPreviewItem, type TeacherClass, type Topic } from "../api-client";
import { toast } from "sonner";
import { formatLocalDateStamp } from "@/utils/format";
import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { downloadTeacherFile } from "../api-client";

function MetricBars({
    title,
    description,
    items,
    valueSuffix = "",
}: {
    title: string;
    description: string;
    items: Array<{ label: string; value: number | null; color: string }>;
    valueSuffix?: string;
}) {
    const max = Math.max(1, ...items.map((item) => item.value ?? 0));
    return (
        <Card>
            <CardHeader className="border-b border-border pb-4"><CardTitle className="text-body text-foreground">{title}</CardTitle><p className="mt-1 text-meta text-muted-foreground">{description}</p></CardHeader>
            <CardContent className="space-y-3 pt-5" role="list">
                {items.map((item) => (
                    <div key={item.label} role="listitem" className="grid grid-cols-[7rem_1fr_5rem] items-center gap-3">
                        <span className="text-label text-foreground">{item.label}</span>
                        <div className="h-3 overflow-hidden rounded-control bg-muted"><div className="h-full rounded-control" style={{ width: `${(item.value ?? 0) / max * 100}%`, backgroundColor: item.color }} /></div>
                        <span className="text-right text-label font-mono text-muted-foreground">{item.value === null ? "—" : `${item.value.toFixed(valueSuffix ? 1 : 0)}${valueSuffix}`}</span>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

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
        loadFilters();
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

    async function loadPreview(requestId: number) {
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
        setSelectedTaskIds([]);
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

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-subheading font-semibold text-foreground">成绩分析与导出</h2>
                <p className="text-label text-muted-foreground mt-1">按学期、班级和实验模板分析学生任务人次，并支持单项与批量导出。</p>
            </div>

            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">应交人次</p>
                            <p className="text-page-title font-semibold text-foreground mt-1">{loading || !analytics ? "-" : analytics.funnel.total}</p>
                            <p className="mt-1 text-meta text-muted-foreground">按学生-任务人次统计</p>
                        </div>
                        <IconTile intent="info">
                            <Layers className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">已批改人次</p>
                            <p className="text-page-title font-semibold text-foreground mt-1">{loading || !analytics ? "-" : analytics.funnel.graded}</p>
                        </div>
                        <IconTile intent="success">
                            <CheckCircle2 className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">总分均值</p>
                            <p className="text-page-title font-semibold text-foreground mt-1">{loading ? "-" : analytics?.scores.average?.toFixed(1) ?? "-"}</p>
                            <p className="mt-1 text-meta text-muted-foreground">仅统计已批改成绩</p>
                        </div>
                        <IconTile intent="warning">
                            <Users className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">总分中位数</p>
                            <p className="text-page-title font-semibold text-foreground mt-1">{loading ? "-" : analytics?.scores.median?.toFixed(1) ?? "-"}</p>
                        </div>
                        <IconTile intent="auxiliary">
                            <FileSpreadsheet className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
            </div>

            {analyticsError && <p role="alert" className="rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3 text-label text-destructive">{analyticsError}</p>}

            {loading ? (
                <Card><CardContent role="status" aria-live="polite" className="py-12 text-center text-label text-muted-foreground">正在加载成绩分析…</CardContent></Card>
            ) : analytics ? (
                <>
                    <div className="grid grid-cols-2 gap-4" data-testid="teacher-grade-analytics">
                        <MetricBars
                            title="学生任务状态漏斗"
                            description="同一学生参与多个实验任务时按多个人次计算。"
                            items={[
                                { label: "未开始", value: analytics.funnel.notStarted, color: "var(--chart-1)" },
                                { label: "进行中", value: analytics.funnel.inProgress, color: "var(--chart-2)" },
                                { label: "待批改", value: analytics.funnel.pendingGrading, color: "var(--chart-3)" },
                                { label: "已批改", value: analytics.funnel.graded, color: "var(--chart-4)" },
                                { label: "已驳回", value: analytics.funnel.rejected, color: "var(--chart-5)" },
                            ]}
                        />
                        <MetricBars
                            title="已批改总分分布"
                            description={`共 ${analytics.scores.count} 个已批改成绩。`}
                            items={analytics.scores.bands.map((item, index) => ({ label: item.label, value: item.count, color: `var(--chart-${index + 1})` }))}
                        />
                    </div>

                    <MetricBars
                        title="分项平均分"
                        description="仅统计已批改记录中的问卷设计、实验过程和实验报告分项。"
                        valueSuffix=" 分"
                        items={[
                            { label: "问卷设计", value: analytics.scores.componentAverages.questionnaire, color: "var(--chart-2)" },
                            { label: "实验过程", value: analytics.scores.componentAverages.process, color: "var(--chart-3)" },
                            { label: "实验报告", value: analytics.scores.componentAverages.report, color: "var(--chart-4)" },
                        ]}
                    />
                </>
            ) : null}

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <CardTitle className="text-body text-foreground">导出列表</CardTitle>
                        <p className="text-meta text-muted-foreground mt-1">{previewError ? "导出任务加载失败" : `共 ${preview.length} 条数据`}</p>
                    </div>
                    <div className="flex gap-3 flex-row w-auto flex-wrap">
                        <Select value={semesterFilter} onValueChange={(v) => { setSemesterFilter(v); setClassFilter("all"); }}>
                            <SelectTrigger aria-label="按学期筛选导出任务" data-testid="teacher-export-semester-filter" className="bg-card border-input text-foreground w-40">
                                <SelectValue placeholder="全部学期" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部学期</SelectItem>
                                {semesters.map((s) => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={classFilter} onValueChange={setClassFilter}>
                            <SelectTrigger aria-label="按班级筛选导出任务" data-testid="teacher-export-class-filter" className="bg-card border-input text-foreground w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部班级</SelectItem>
                                {filteredClasses.map((cls) => (
                                    <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={topicFilter} onValueChange={setTopicFilter}>
                            <SelectTrigger aria-label="按实验模板筛选导出任务" data-testid="teacher-export-topic-filter" className="bg-card border-input text-foreground w-40">
                                <SelectValue placeholder="全部实验模板" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部实验模板</SelectItem>
                                {topics.map((t) => (
                                    <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            data-testid="teacher-export-batch"
                            variant="outline"
                            disabled={selectedCount === 0 || exporting}
                            onClick={() => exportExcel()}
                            className="border-primary bg-primary-muted text-primary hover:bg-primary-hover hover:text-primary-foreground disabled:bg-muted disabled:text-muted-foreground disabled:border-border disabled:cursor-not-allowed"
                        >
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            批量导出 ({selectedCount})
                        </Button>
                    </div>
                </PageHeader>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border">
                                <TableHead className="w-12 text-center text-muted-foreground">
                                    <span className="sr-only">选择任务</span>
                                    <input
                                        aria-label="选择全部导出任务"
                                        data-testid="teacher-export-check-all"
                                        type="checkbox"
                                        className="rounded-control border-input bg-card text-primary focus:ring-ring w-4 h-4 cursor-pointer"
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
                                <TableHead className="text-muted-foreground text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground"><span role="status" aria-live="polite">加载中...</span></TableCell>
                                </TableRow>
                            ) : previewError ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-destructive" role="alert">{previewError}</TableCell>
                                </TableRow>
                            ) : preview.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-12 h-12 rounded-control bg-card border border-border flex items-center justify-center">
                                                <Search className="w-6 h-6 text-muted-foreground" />
                                            </div>
                                            <p>暂无符合条件的数据</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : preview.map((task) => (
                                <TableRow data-testid={`teacher-export-row-${task.taskId}`} key={task.taskId} className="border-border hover:bg-muted transition-none">
                                    <TableCell className="text-center">
                                        <input
                                            aria-label={`选择导出任务：${task.topic}，${task.className}`}
                                            data-testid={`teacher-export-check-${task.taskId}`}
                                            type="checkbox"
                                            className="rounded-control border-input bg-card text-primary focus:ring-ring w-4 h-4 cursor-pointer"
                                            checked={selectedTaskIds.includes(task.taskId)}
                                            onChange={() => toggleTask(task.taskId)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium text-foreground">{task.topic}</TableCell>
                                    <TableCell className="text-foreground">{task.className}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Progress aria-label={`${task.topic}批改进度`} value={task.total > 0 ? (task.graded / task.total) * 100 : 0} className="w-20 h-1.5 bg-muted [&>div]:bg-success" />
                                            <span className="text-meta text-muted-foreground">{task.graded}/{task.total}</span>
                                            {task.graded === task.total && task.total > 0 && (
                                                <StatusBadge intent="success" className="text-meta h-5">已完成</StatusBadge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium font-mono text-foreground">{task.graded > 0 ? task.avgScore.toFixed(1) : "-"}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            data-testid={`teacher-export-single-${task.taskId}`}
                                            variant="ghost"
                                            size="sm"
                                            disabled={exporting}
                                            className="h-8 text-muted-foreground hover:text-primary hover:bg-primary-muted"
                                            onClick={() => exportExcel(task.taskId)}
                                        >
                                            <Download className="w-3.5 h-3.5 mr-1" />
                                            {exporting ? "导出中…" : "导出"}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

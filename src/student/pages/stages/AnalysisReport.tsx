import { SamplingObservationNotice } from "../../components/SamplingObservationNotice";
import { DraftSaveStatus } from "../../components/DraftSaveStatus";
import { useState, useEffect, useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, FileText, Send, Loader2, Maximize2, AlertCircle, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StageActions } from "../../components/StageActions";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { useExperiment } from "../ExperimentLayout";
import { RichTextEditor } from "../../components/RichTextEditor";
import { experimentApi } from "../../api-client";
import type { AnalysisMetricsData } from "@/domain/experiment/analysis-types";
import {
    type MethodKey,
    type ChartSeries,
    type ChartRow,
    METHOD_META,
    POPULATION_SERIES,
    preferAnalysisField,
} from "./analysis-utils";
import { downloadChartAsSvg, sanitizeFileName } from "./chart-svg-export";
import { SamplePlanDecisionPanel, SamplingMethodParamsPanel } from "./analysis-params-panels";
import { TargetMetricsPanel, formatTargetEstimate, formatTargetMargin } from "../../components/TargetMetricsPanel";
import { chartScale } from "./chart-scale";
import { formatStatistic } from "@/utils/statistic-format";
import { studentFetch } from "../../api-client";
import {
    readExperimentDraft,
    useExperimentDraft,
} from "../../experiment/experiment-draft";
import { isCompletedSamplingResult, SAMPLING_METHODS, resolveSamplingPolicy } from "@/lib/sampling-policy";

interface AnalysisReportProps {
    onPrev: () => void;
    onSubmit: () => void;
}

type ZoomChartType = "mean" | "dist" | "error" | "represent" | null;
type AnalysisWorkspace = "overview" | "charts" | "records" | "report";

// ---------------------------------------------------------------------------
// ChartBars — horizontal bar chart component
// ---------------------------------------------------------------------------

function ChartBars({
    rows,
    series,
    unit = "",
    emptyMessage,
    heightClass = "h-72",
}: {
    rows: ChartRow[];
    series: ChartSeries[];
    unit?: string;
    emptyMessage: string;
    heightClass?: string;
}) {
    const scale = useMemo(() => {
        const values = rows.flatMap((row) => series.map((s) => row.values[s.key] ?? 0));
        return chartScale(values);
    }, [rows, series]);

    if (rows.length === 0) {
        return (
            <div className={`${heightClass} rounded-surface bg-background border border-border flex items-center justify-center text-muted-foreground text-label`}>
                {emptyMessage}
            </div>
        );
    }

    return (
        <div
            role="region"
            aria-label="图表数据，可滚动查看"
            tabIndex={0}
            className={`${heightClass} rounded-surface bg-background border border-border p-4 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
        >
            <div className="space-y-4">
                {rows.map((row) => (
                    <div key={row.label} className="rounded-surface border border-border bg-card p-3">
                        <div className="text-meta text-foreground font-medium mb-2">{row.label}</div>
                        <div className="space-y-2">
                            {series.map((s) => {
                                const value = row.values[s.key] ?? 0;
                                const widthPercent = Math.abs(value) / scale.range * 100;
                                const leftPercent = (Math.min(value, 0) - scale.min) / scale.range * 100;
                                return (
                                    <div key={`${row.label}-${s.key}`} className="flex items-center gap-2">
                                        <span className="w-20 text-meta text-muted-foreground shrink-0">{s.label}</span>
                                        <div className="relative h-3 flex-1 rounded-control bg-muted overflow-hidden">
                                            <div
                                                className="absolute h-full rounded-control"
                                                style={{
                                                    left: `${leftPercent}%`,
                                                    width: `${Math.max(0, Math.min(100, widthPercent))}%`,
                                                    backgroundColor: s.color,
                                                }}
                                            />
                                            <span className="absolute inset-y-0 border-l border-muted-foreground" style={{ left: `${-scale.min / scale.range * 100}%` }} />
                                        </div>
                                        <span className="w-20 text-right text-meta text-muted-foreground font-mono">
                                            {formatStatistic(value, 2)}{unit}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// ChartTabPanel — reusable tab content wrapper
// ---------------------------------------------------------------------------

function ChartTabPanel({
    description,
    rows,
    series,
    unit,
    emptyMessage,
    onZoom,
    onDownload,
    fieldSelector,
}: {
    description: string;
    rows: ChartRow[];
    series: ChartSeries[];
    unit?: string;
    emptyMessage: string;
    onZoom: () => void;
    onDownload: () => void;
    fieldSelector?: ReactNode;
}) {
    return (
        <div className="mt-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    {fieldSelector}
                    <Button aria-label="放大图表" title="放大图表" variant="outline" size="icon" disabled={rows.length === 0} onClick={onZoom}>
                        <Maximize2 className="w-4 h-4" />
                    </Button>
                    <Button aria-label="下载图表 SVG" title="下载图表 SVG" variant="outline" size="icon" disabled={rows.length === 0} onClick={onDownload}>
                        <Download className="w-4 h-4" />
                    </Button>
                </div>
            <ChartBars rows={rows} series={series} unit={unit} emptyMessage={emptyMessage} />
            <p className="text-meta leading-relaxed text-muted-foreground">{description}</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// FieldSelect — field selector dropdown
// ---------------------------------------------------------------------------

function FieldSelect({
    value,
    onChange,
    fields,
    placeholder,
}: {
    value: string;
    onChange: (v: string) => void;
    fields: string[];
    placeholder: string;
}) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger aria-label={placeholder} className="w-64 max-w-full bg-card border-input text-foreground">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent className="bg-card border-border text-foreground">
                {fields.map((field) => (
                    <SelectItem key={field} value={field}>{field}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalysisReport({ onPrev, onSubmit }: AnalysisReportProps) {
    const { experiment, populationSize, completeStage } = useExperiment();

    const restoredDraft = useMemo(() => readExperimentDraft<{ reportContent: string; workspace?: AnalysisWorkspace }>({
        experimentId: experiment?.id,
        experimentVersion: experiment?.version,
        stage: 4,
    }), [experiment?.id, experiment?.version]);
    const [reportContent, setReportContent] = useState(
        restoredDraft?.reportContent ?? experiment?.reportContent ?? "",
    );
    const [workspace, setWorkspace] = useState<AnalysisWorkspace>(restoredDraft?.workspace && ["overview", "charts", "records", "report"].includes(restoredDraft.workspace) ? restoredDraft.workspace : "overview");
    const reportDraft = useMemo(() => ({ reportContent, workspace }), [reportContent, workspace]);
    const clearDraft = useExperimentDraft({
        experimentId: experiment?.id,
        experimentVersion: experiment?.version,
        stage: 4,
        data: reportDraft,
        enabled: Boolean(experiment),
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [exportType, setExportType] = useState<MethodKey | "all">("all");
    const [exportOpen, setExportOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [zoomChart, setZoomChart] = useState<ZoomChartType>(null);
    const [analysisMetrics, setAnalysisMetrics] = useState<AnalysisMetricsData | null>(null);
    const [analysisMetricsError, setAnalysisMetricsError] = useState<string | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [metricsRetry, setMetricsRetry] = useState(0);
    const [selectedNumericField, setSelectedNumericField] = useState("");
    const [selectedCategoricalField, setSelectedCategoricalField] = useState("");
    const analysisTarget = experiment?.analysisTarget?.target;
    const [chartTab, setChartTab] = useState(analysisTarget?.kind === "proportion" ? "dist" : "mean");
    const samplingResultsKey = useMemo(
        () => JSON.stringify(experiment?.samplingResults ?? null),
        [experiment?.samplingResults],
    );
    const isPpsUnavailable = Boolean(experiment?.samplingResults?.pps?.unavailable);
    const samplingPolicy = useMemo(() => resolveSamplingPolicy(experiment?.samplingPolicy), [experiment?.samplingPolicy]);
    const isPpsDisabled = samplingPolicy.methods.pps === "disabled";
    const completedAnalysisMethods = useMemo<MethodKey[]>(() => SAMPLING_METHODS.filter((method) => (
        samplingPolicy.methods[method] !== "disabled"
        && isCompletedSamplingResult(experiment?.samplingResults?.[method])
    )), [experiment?.samplingResults, samplingPolicy]);
    const hasPpsCompleted = completedAnalysisMethods.includes("pps");

    const minLength = 100;
    const maxLength = 5000;
    const reportTextLength = useMemo(() => getRichTextPlainLength(reportContent), [reportContent]);
    const isValidLength = reportTextLength >= minLength && reportTextLength <= maxLength;

    // ---- Data derivation ----

    const numericFields = analysisMetrics?.numericFields ?? [];
    const categoricalFields = analysisMetrics?.categoricalFields ?? [];
    const reportedPpsMonteCarloReplicates = analysisMetrics?.ppsMonteCarloReplicates;
    const ppsMonteCarloReplicates = reportedPpsMonteCarloReplicates ?? 512;
    const ppsStandardErrorMode = analysisMetrics?.ppsStandardErrorMode
        ?? (typeof reportedPpsMonteCarloReplicates === "number" && reportedPpsMonteCarloReplicates > 0
            ? "monte_carlo"
            : null);
    const isPpsCensus = hasPpsCompleted && ppsStandardErrorMode === "census_exact";
    const ppsStandardErrorNotice = ppsStandardErrorMode === "census_exact"
        ? "PPS 本次为全体入样，每个单位的包含概率均为 1，设计标准误精确为 0；该结果未执行 Monte Carlo 重复抽样。"
        : ppsStandardErrorMode === "systematic_exact"
            ? "PPS 标准误通过遍历固定包含概率系统抽样的全部随机起点区间计算，不含有限次重复抽样的模拟误差；Hájek 比估计仍可能有偏，标准误不能保证正态区间覆盖。"
        : `PPS 标准误是 ${ppsMonteCarloReplicates} 次重复抽样的 Monte Carlo 估计（按 R−1 计算重复间标准差），仍有模拟误差。`;
    const ppsStandardErrorDescription = isPpsUnavailable
        ? "PPS 本任务按规则跳过，不计算设计标准误。"
        : ppsStandardErrorMode === "census_exact"
            ? "PPS 为全体入样，每个单位的包含概率均为 1，设计标准误精确为 0，未执行 Monte Carlo 重复抽样。"
            : ppsStandardErrorMode === "systematic_exact"
                ? "PPS 按全部随机起点区间及其概率计算 Hájek 比估计的设计标准误；比估计可能有偏。"
            : ppsStandardErrorMode === "monte_carlo"
                ? `PPS 为 ${ppsMonteCarloReplicates} 次重复抽样的 Monte Carlo 估计（重复间标准差使用 R−1），有限重复次数会带来模拟误差。`
                : analysisMetrics
                    ? "PPS 当前没有可计算设计标准误的完整数值字段。"
                    : "PPS 设计标准误的计算方式正在加载。";

    useEffect(() => {
        const preferred = analysisTarget?.kind === "mean" ? analysisTarget.field : "";
        setSelectedNumericField((current) => preferAnalysisField(numericFields, current, preferred));
    }, [analysisTarget, numericFields]);

    useEffect(() => {
        const preferred = analysisTarget?.kind === "proportion" ? analysisTarget.field : "";
        setSelectedCategoricalField((current) => preferAnalysisField(categoricalFields, current, preferred));
    }, [analysisTarget, categoricalFields]);

    useEffect(() => {
        if (exportType !== "all" && !completedAnalysisMethods.includes(exportType)) setExportType("all");
    }, [completedAnalysisMethods, exportType]);

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();

        async function loadAnalysisMetrics() {
            if (!experiment?.taskId) return;
            if (!cancelled) {
                setStatsLoading(true);
                setAnalysisMetricsError(null);
            }
            try {
                const res = await experimentApi.getAnalysisMetrics(experiment.taskId, controller.signal);
                if (cancelled) return;

                if (res.success && res.data) {
                    setAnalysisMetrics(res.data);
                    setAnalysisMetricsError(null);
                    return;
                }

                const message = res.error?.message
                    ? `分析指标加载失败：${res.error.message}`
                    : "分析指标加载失败，请重试加载";
                setAnalysisMetrics(null);
                setAnalysisMetricsError(message);
                toast.error(message);
            } catch (error) {
                if (cancelled) return;
                console.error("Failed to load analysis metrics:", error);
                setAnalysisMetrics(null);
                const message = "分析指标加载失败，请重试加载";
                setAnalysisMetricsError(message);
                toast.error(message);
            } finally {
                if (!cancelled) {
                    setStatsLoading(false);
                }
            }
        }

        void loadAnalysisMetrics();

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [experiment?.taskId, samplingResultsKey, metricsRetry]);

    // ---- Chart data (memoized) ----

    const meanRows = useMemo<ChartRow[]>(() => {
        const fieldMetrics = selectedNumericField ? analysisMetrics?.numeric[selectedNumericField] : null;
        if (!fieldMetrics) return [];

        return completedAnalysisMethods.reduce<ChartRow[]>((rows, method) => {
            const estimate = fieldMetrics.methods[method].estimate;
            if (estimate !== null) {
                rows.push({ label: METHOD_META[method].label, values: { value: estimate } });
            }
            return rows;
        }, []);
    }, [analysisMetrics, completedAnalysisMethods, selectedNumericField]);

    const errorRows = useMemo<ChartRow[]>(() => {
        const fieldMetrics = selectedNumericField ? analysisMetrics?.numeric[selectedNumericField] : null;
        if (!fieldMetrics) return [];

        return completedAnalysisMethods.reduce<ChartRow[]>((rows, method) => {
            const standardError = fieldMetrics.methods[method].standardError;
            if (standardError !== null) {
                rows.push({ label: METHOD_META[method].label, values: { value: standardError } });
            }
            return rows;
        }, []);
    }, [analysisMetrics, completedAnalysisMethods, selectedNumericField]);

    const distributionRows = useMemo(() => {
        const fieldMetrics = selectedCategoricalField ? analysisMetrics?.categorical[selectedCategoricalField] : null;
        if (!fieldMetrics) return [];

        const categories = Array.from(new Set([
            ...Object.keys(fieldMetrics.population),
            ...completedAnalysisMethods.flatMap((method) => Object.keys(fieldMetrics.methods[method])),
        ])).sort((left, right) => left.localeCompare(right, "zh-CN"));

        return categories.map((category) => ({
            label: category,
            values: Object.fromEntries([
                ...completedAnalysisMethods.map((method) => [method, fieldMetrics.methods[method][category] ?? 0]),
                ["population", fieldMetrics.population[category] ?? 0],
            ]) as Record<string, number>,
        }));
    }, [analysisMetrics, completedAnalysisMethods, selectedCategoricalField]);

    const representativenessRows = useMemo(() => {
        const rows: ChartRow[] = [];

        for (const field of numericFields) {
            const fieldMetrics = analysisMetrics?.numeric[field];
            if (!fieldMetrics || fieldMetrics.populationMean === 0) continue;

            const values: Record<string, number> = {};
            let hasValue = false;

            for (const method of completedAnalysisMethods) {
                const estimate = fieldMetrics.methods[method].estimate;
                if (estimate === null) continue;
                values[method] = Math.abs(estimate - fieldMetrics.populationMean) / Math.abs(fieldMetrics.populationMean) * 100;
                hasValue = true;
            }

            if (hasValue) {
                rows.push({ label: `${field}（均值偏差）`, values });
            }
        }

        for (const field of categoricalFields) {
            const fieldMetrics = analysisMetrics?.categorical[field];
            if (!fieldMetrics) continue;

            const values: Record<string, number> = {};
            let hasValue = false;

            for (const method of completedAnalysisMethods) {
                const representativeness = fieldMetrics.representativeness[method];
                if (representativeness === null) continue;
                values[method] = representativeness;
                hasValue = true;
            }

            if (hasValue) {
                rows.push({ label: `${field}（分布偏差）`, values });
            }
        }

        return rows;
    }, [analysisMetrics, categoricalFields, completedAnalysisMethods, numericFields]);

    // ---- Series ----

    const methodSeries = useMemo<ChartSeries[]>(() =>
        completedAnalysisMethods.map((key) => ({
            key, label: METHOD_META[key].label, color: METHOD_META[key].color,
        })),
    [completedAnalysisMethods]);

    const meanSeries = useMemo<ChartSeries[]>(() => [
        { key: "value", label: selectedNumericField ? `${selectedNumericField} 估计均值` : "估计均值", color: "var(--chart-2)" },
    ], [selectedNumericField]);

    const errorSeries = useMemo<ChartSeries[]>(() => [
        { key: "value", label: `${selectedNumericField || "字段"} 设计标准误`, color: "var(--chart-5)" },
    ], [selectedNumericField]);

    const distributionSeries = useMemo<ChartSeries[]>(() =>
        {
            const fieldMetrics = selectedCategoricalField ? analysisMetrics?.categorical[selectedCategoricalField] : null;
            if (!fieldMetrics) {
                return methodSeries;
            }

            const methodKeys = completedAnalysisMethods;

            return [
                ...methodKeys.map((key) => ({
                    key,
                    label: METHOD_META[key].label,
                    color: METHOD_META[key].color,
                })),
                POPULATION_SERIES,
            ];
        },
    [analysisMetrics, completedAnalysisMethods, methodSeries, selectedCategoricalField]);

    const representSeries = useMemo<ChartSeries[]>(() => {
        const availableMethodKeys = completedAnalysisMethods.filter((method) =>
            representativenessRows.some((row) => Object.prototype.hasOwnProperty.call(row.values, method))
        );

        return availableMethodKeys.map((key) => ({
            key,
            label: METHOD_META[key].label,
            color: METHOD_META[key].color,
        }));
    }, [completedAnalysisMethods, representativenessRows]);

    // ---- Chart config (shared by tabs, zoom dialog, and SVG download) ----

    const chartConfig = useMemo<Record<Exclude<ZoomChartType, null>, {
        title: string;
        rows: ChartRow[];
        series: ChartSeries[];
        unit?: string;
        emptyMessage: string;
        downloadFileName: string;
    }>>(() => ({
        mean: { title: "均值对比", rows: meanRows, series: meanSeries, emptyMessage: "暂无可用于均值分析的数值字段", downloadFileName: `mean_${sanitizeFileName(selectedNumericField)}.svg` },
        dist: { title: "分布对比", rows: distributionRows, series: distributionSeries, unit: "%", emptyMessage: "暂无可用于分布分析的分类字段", downloadFileName: `distribution_${sanitizeFileName(selectedCategoricalField)}.svg` },
        error: { title: "设计标准误", rows: errorRows, series: errorSeries, emptyMessage: "暂无可用于标准误分析的数值字段", downloadFileName: `error_${sanitizeFileName(selectedNumericField)}.svg` },
        represent: { title: "与已知总体的描述性偏差", rows: representativenessRows, series: representSeries, unit: "%", emptyMessage: "暂无可用于总体对照偏差分析的数据", downloadFileName: "population-deviation.svg" },
    }), [meanRows, meanSeries, distributionRows, distributionSeries, errorRows, errorSeries, representSeries, representativenessRows, selectedNumericField, selectedCategoricalField]);

    const activeZoom = zoomChart ? chartConfig[zoomChart] : null;

    // ---- Handlers ----

    const handleSubmit = async () => {
        if (!isValidLength || isSubmitting || clearDraft.status === "conflict") return;
        setIsSubmitting(true);
        try {
            if (clearDraft.save({ reportContent, workspace }) === "conflict") return;
            const success = await completeStage(4, { reportContent });
            if (!success) return;
            clearDraft.clear();
            onSubmit();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExport = async (type: MethodKey | "all") => {
        if (!experiment?.taskId || isExporting) return;
        setIsExporting(true);
        setExportError(null);
        try {
            const res = await studentFetch(`/api/student/tasks/${experiment.taskId}/export?type=${type}`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error("导出失败");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `sampling_${type}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export failed:", error);
            setExportError("数据导出失败，请检查网络后重试。报告草稿已保留。");
        } finally {
            setIsExporting(false);
        }
    };

    const downloadChart = (type: Exclude<ZoomChartType, null>) => {
        const cfg = chartConfig[type];
        if (cfg.rows.length === 0) return;
        downloadChartAsSvg({
            title: cfg.title,
            rows: cfg.rows,
            series: cfg.series,
            fileName: cfg.downloadFileName,
            unit: cfg.unit,
        });
    };

    // ---- Render ----
    const target = analysisMetrics?.target;
    const switchWorkspace = (value: string) => setWorkspace(value as AnalysisWorkspace);

    return <div className="min-w-0 space-y-5" data-testid="student-stage-analysis-report">
        <Tabs value={workspace} onValueChange={switchWorkspace} className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <TabsList aria-label="分析与报告工作区" className="flex h-auto flex-wrap gap-1 rounded-surface border border-border bg-card p-1" data-testid="student-analysis-workspace-tabs">
                    <TabsTrigger value="overview" className="min-h-11 px-4" data-testid="student-analysis-workspace-overview">研究结果</TabsTrigger>
                    <TabsTrigger value="charts" className="min-h-11 px-4" data-testid="student-analysis-section-tab-charts">图表探索</TabsTrigger>
                    <TabsTrigger value="records" className="min-h-11 px-4" data-testid="student-analysis-workspace-records">规划与抽样记录</TabsTrigger>
                    <TabsTrigger value="report" className="min-h-11 gap-2 px-4" data-testid="student-analysis-workspace-report"><FileText className="h-4 w-4"/>撰写报告</TabsTrigger>
                </TabsList>
                <Button type="button" variant="outline" onClick={() => setExportOpen(true)}><Download className="mr-2 h-4 w-4"/>导出数据</Button>
            </div>

            {analysisMetricsError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-4 text-label text-destructive" data-testid="student-analysis-metrics-error">
                <AlertCircle className="h-4 w-4 shrink-0"/><span className="min-w-0 flex-1">{analysisMetricsError}。报告草稿仍可继续编辑。</span>
                <Button type="button" variant="outline" disabled={statsLoading} data-testid="student-analysis-metrics-retry" onClick={() => setMetricsRetry(value => value + 1)}>重试加载</Button>
            </div>}
            {statsLoading && <p role="status" className="flex items-center gap-2 text-label text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>正在计算分析指标，你可以先整理报告。</p>}
            {(analysisMetrics?.excludedNumericFields?.length ?? 0) > 0 && <div className="rounded-surface border border-warning-border bg-warning-muted p-3 text-meta text-warning" data-testid="student-analysis-invalid-numeric-warning">
                数值字段 {analysisMetrics!.excludedNumericFields!.join("、")} 含空值或非数值，已停止该字段的均值与标准误分析。请联系教师修正总体数据。
            </div>}

            <TabsContent value="overview" className="min-w-0 space-y-5">
                <Card className="min-w-0 gap-0 rounded-surface border-border bg-card py-0"><CardContent className="p-5">
                    {target ? <TargetMetricsPanel target={target} methods={completedAnalysisMethods}/> : <div className="space-y-3 py-6">
                        <h2 className="text-section-title font-semibold">研究目标结果</h2>
                        <p className="text-label text-muted-foreground">{statsLoading ? "正在准备目标估计与精度比较…" : "暂时没有研究目标的完整指标。可以查看已有图表和抽样记录。"}</p>
                        <Button variant="outline" onClick={() => setWorkspace("charts")}>查看图表探索</Button>
                    </div>}
                </CardContent></Card>
                <details className="rounded-surface border border-border bg-card p-4">
                    <summary className="cursor-pointer text-label font-semibold">这些指标如何计算，解释时要注意什么？</summary>
                    <div className="mt-3 space-y-3 text-meta leading-relaxed text-muted-foreground">
                        <p data-testid="student-analysis-oracle-notice">本实验使用完整虚拟总体演示抽样设计，因此可以对照总体真值并计算设计层面的误差。现实调查通常看不到未入样单位，需使用与抽样设计匹配的权重和方差估计。样本量、设计效应和无回答率计算均是基于页面所列假设的规划近似，不替代预调查、抽样框评估和专业统计设计。{analysisMetrics && hasPpsCompleted && ppsStandardErrorMode && ppsStandardErrorNotice}</p>
                        <SamplingObservationNotice nonResponseRate={experiment?.samplePlan?.nonResponseRate}/>
                        <p>{isPpsDisabled ? "PPS 已由教师设为不适用，不纳入方法间比较。" : isPpsUnavailable ? "没有合格的 PPS 规模变量，PPS 已按规则跳过。" : isPpsCensus ? "PPS 本次覆盖完整总体，当前结果没有抽样误差；这不代表非普查情形下也具有相同精度。" : hasPpsCompleted ? "PPS 使用可能存在小样本偏差的 Hájek 比估计。" : "本次未选择 PPS，只比较实际完成的方法。"}</p>
                        <p>分布和总体对照偏差描述的是当前样本与已知虚拟总体的差异，不能单独证明无偏或整体代表性。</p>
                    </div>
                </details>
            </TabsContent>

            <TabsContent value="charts" className="min-w-0">
                <Card className="min-w-0 rounded-surface border-border bg-card"><CardHeader>
                    <CardTitle><h2 className="text-section-title font-semibold">从不同角度比较样本</h2></CardTitle>
                    <CardDescription>选择变量和图表，补充对研究目标的解释。图表只包含本次实际完成的方法。</CardDescription>
                </CardHeader><CardContent className="min-w-0">
                    <Tabs value={chartTab} onValueChange={setChartTab}>
                                <TabsList className="bg-background border border-border p-1 rounded-surface w-full flex h-auto" data-testid="student-analysis-tabs">
                                    <TabsTrigger value="mean" data-testid="student-analysis-tab-mean" className="flex-1 rounded-surface py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">均值对比</TabsTrigger>
                                    <TabsTrigger value="dist" data-testid="student-analysis-tab-dist" className="flex-1 rounded-surface py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">分布对比</TabsTrigger>
                                    <TabsTrigger value="error" data-testid="student-analysis-tab-error" className="flex-1 rounded-surface py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">设计标准误</TabsTrigger>
                                    <TabsTrigger value="represent" data-testid="student-analysis-tab-represent" className="flex-1 rounded-surface py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">总体对照偏差</TabsTrigger>
                                </TabsList>

                                <TabsContent value="mean" data-testid="student-analysis-mean-chart">
                                    <ChartTabPanel
                                        description={`比较各抽样方法对同一数值变量的均值估计，并利用已知虚拟总体显示真值对照。${hasPpsCompleted
                                            ? isPpsCensus
                                                ? "PPS 本次覆盖完整总体，估计等于总体真值。"
                                                : "PPS 使用 Hájek 比估计（按一阶包含概率的倒数加权并归一化），不是 Horvitz–Thompson 均值；Hájek 通常更稳定，但并非严格设计无偏，小样本偏差可能不可忽略。"
                                            : ""}`}
                                        rows={meanRows}
                                        series={meanSeries}
                                        emptyMessage="暂无可用于均值分析的数值字段"
                                        onZoom={() => setZoomChart("mean")}
                                        onDownload={() => downloadChart("mean")}
                                        fieldSelector={
                                            <FieldSelect value={selectedNumericField} onChange={setSelectedNumericField} fields={numericFields} placeholder="选择数值变量" />
                                        }
                                    />
                                </TabsContent>

                                <TabsContent value="dist" data-testid="student-analysis-distribution-chart">
                                    <ChartTabPanel
                                        description="比较各抽样方法在分类变量上的分布占比，并利用已知虚拟总体显示真值对照。超过 20 类时，图中合并尾部类别，保留主分析目标类别；总体对照偏差始终按完整类别计算，合并后的柱形可能隐藏类别间差异。"
                                        rows={distributionRows}
                                        series={distributionSeries}
                                        unit="%"
                                        emptyMessage="暂无可用于分布分析的分类字段"
                                        onZoom={() => setZoomChart("dist")}
                                        onDownload={() => downloadChart("dist")}
                                        fieldSelector={
                                            <FieldSelect
                                                value={selectedCategoricalField}
                                                onChange={setSelectedCategoricalField}
                                                fields={categoricalFields}
                                                placeholder="选择分类变量"
                                            />
                                        }
                                    />
                                </TabsContent>

                                <TabsContent value="error" data-testid="student-analysis-error-chart">
                                    <ChartTabPanel
                                        description={`利用完整虚拟总体比较已完成方法的设计标准误：简单随机和分层采用设计公式，系统抽样枚举随机起点，${hasPpsCompleted ? ppsStandardErrorDescription : ""}这些结果不是现实调查中仅凭当前样本直接得到的标准误。`}
                                        rows={errorRows}
                                        series={errorSeries}
                                        emptyMessage="暂无可用于误差分析的数值字段"
                                        onZoom={() => setZoomChart("error")}
                                        onDownload={() => downloadChart("error")}
                                        fieldSelector={
                                            <FieldSelect value={selectedNumericField} onChange={setSelectedNumericField} fields={numericFields} placeholder="选择数值变量" />
                                        }
                                    />
                                </TabsContent>

                                <TabsContent value="represent" data-testid="student-analysis-representativeness-chart">
                                    <ChartTabPanel
                                        description="描述当前样本与已知虚拟总体的差异：数值行为 |估计−总体均值|/|总体均值|，分类行为完整类别空间上各类占比绝对差的平均（单位：百分点）。两套百分数不可横比，接近总体也不能单独证明样本无偏或具有整体代表性。"
                                        rows={representativenessRows}
                                        series={representSeries}
                                        unit="%"
                                        emptyMessage="暂无可用于总体对照偏差分析的数据"
                                        onZoom={() => setZoomChart("represent")}
                                        onDownload={() => downloadChart("represent")}
                                    />
                                </TabsContent>
                            </Tabs>
                </CardContent></Card>
            </TabsContent>

            <TabsContent value="records" className="min-w-0 space-y-4">
                <PageHeader><div className="space-y-2"><h2 className="text-section-title font-semibold">回看你的实验依据</h2><p className="text-label text-muted-foreground">这些是已保存的参数，写报告时可用来解释样本量与方法选择。</p></div></PageHeader>
                <details open className="rounded-surface border border-border bg-card p-5">
                    <summary className="cursor-pointer text-label font-semibold" data-testid="student-analysis-section-tab-plan">样本量规划</summary>
                    <div className="mt-4 min-w-0"><SamplePlanDecisionPanel samplePlan={experiment?.samplePlan ?? null} populationSize={populationSize}/></div>
                </details>
                <details className="rounded-surface border border-border bg-card p-5">
                    <summary className="cursor-pointer text-label font-semibold" data-testid="student-analysis-section-tab-sampling">抽样执行记录</summary>
                    <div className="mt-4 min-w-0"><SamplingMethodParamsPanel samplingResults={experiment?.samplingResults ?? null} targetSampleSize={experiment?.samplePlan?.finalSampleSize ?? null} populationSize={populationSize} samplingPolicy={samplingPolicy}/></div>
                </details>
            </TabsContent>

            <TabsContent value="report" forceMount className="min-w-0 data-[state=inactive]:hidden">
                <div className="flex flex-wrap items-start gap-5">
                    <Card className="min-w-0 flex-[3_1_36rem] gap-0 rounded-surface border-border bg-card py-0">
                        <CardHeader className="border-b border-border p-5"><CardTitle><h2 className="text-section-title font-semibold">用数据回答研究问题</h2></CardTitle><CardDescription>报告需 {minLength}–{maxLength} 字。先写结论，再用估计值、误差和抽样设计说明理由。</CardDescription></CardHeader>
                        <CardContent className="space-y-3 p-5">
                            <Label htmlFor="report" className="text-label font-medium">报告正文</Label>
                            <RichTextEditor dataTestId="student-analysis-report" editorTestId="student-analysis-report-editor" id="report" ariaLabel="报告正文" showWordCount={false}
                                placeholder="这次调查要回答什么问题？各方法得到了什么结果？请引用具体数值，并说明结论的适用范围。"
                                value={reportContent} onChange={setReportContent} editorClassName="min-h-[420px]"/>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-meta" aria-live="polite">
                                <span className={reportTextLength > maxLength ? "text-destructive" : isValidLength ? "text-success" : "text-muted-foreground"}>
                                    {reportTextLength > maxLength ? "已超出 " + (reportTextLength - maxLength) + " 字，请精简后继续" : reportTextLength < minLength ? "还需至少 " + (minLength - reportTextLength) + " 字" : "字数符合要求，请再检查结论与数据是否一致"}
                                </span><span className="tabular-nums text-muted-foreground">{reportTextLength} / {maxLength} 字</span>
                            </div>
                        </CardContent>
                    </Card>
                    <aside className="min-w-0 flex-[1_1_18rem] space-y-4" aria-label="报告写作参考">
                        {target && <section className="rounded-surface border border-primary-border bg-primary-muted p-5 space-y-3">
                            <h3 className="text-subheading font-semibold">随手查结果</h3>
                            <p className="text-meta text-muted-foreground">{target.contract.contract.researchQuestion}</p>
                            {completedAnalysisMethods.map(method => <div key={method} className="border-t border-primary-border pt-3 text-label">
                                <p className="font-medium">{METHOD_META[method].label}</p>
                                <p className="mt-1 tabular-nums">估计 {formatTargetEstimate(target.methods[method].estimate, target.contract.contract.target.kind)}</p>
                                <p className="mt-1 text-meta text-muted-foreground">教学半宽 {formatTargetMargin(target.methods[method].marginOfError, target.contract.contract.target.kind)}</p>
                            </div>)}
                            <Button type="button" variant="outline" onClick={() => setWorkspace("overview")}>查看完整结果与条件</Button>
                        </section>}
                        <section className="rounded-surface border border-border bg-card p-5 space-y-3">
                            <h3 className="text-subheading font-semibold">写作提纲</h3>
                            <ol className="list-decimal space-y-3 pl-5 text-label leading-relaxed text-muted-foreground">
                                <li><strong className="font-medium text-foreground">研究问题与方法。</strong>估计哪个指标？为什么选择这些方法？</li>
                                <li><strong className="font-medium text-foreground">结果与比较。</strong>引用估计值和误差，说明方法之间的差异。</li>
                                <li><strong className="font-medium text-foreground">结论与限制。</strong>精度是否满足要求？哪些假设会影响解释？</li>
                                <li><strong className="font-medium text-foreground">改进方向。</strong>如果再做一次，会调整样本量、抽样设计还是问卷？</li>
                            </ol>
                        </section>
                        <p className="text-meta leading-relaxed text-muted-foreground">下一步先保存并预览整份实验。预览页中确认提交后，教师才能收到报告。</p>
                    </aside>
                </div>
            </TabsContent>
        </Tabs>

        <StageActions>
            <div className="space-y-2"><DraftSaveStatus status={clearDraft.status} onRetry={clearDraft.retry}/><Button variant="outline" onClick={onPrev} data-testid="student-analysis-prev">查看抽样记录</Button></div>
            {workspace === "report" ? <Button onClick={handleSubmit} disabled={!isValidLength || isSubmitting || clearDraft.status === "conflict"} data-testid="student-analysis-preview">
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>正在保存报告…</> : <><Send className="mr-2 h-4 w-4"/>保存并预览报告</>}
            </Button> : <Button onClick={() => setWorkspace("report")} data-testid="student-analysis-write">继续：撰写报告<ArrowRight className="ml-2 h-4 w-4"/></Button>}
        </StageActions>

        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <DialogContent><DialogHeader><DialogTitle>导出抽样数据</DialogTitle><DialogDescription>下载本次已完成方法的入样记录，供你复核和分析。导出数据不会提交实验报告。</DialogDescription></DialogHeader>
                <Label>导出范围</Label>
                <Select value={exportType} onValueChange={value => setExportType(value as MethodKey | "all")} disabled={isExporting}><SelectTrigger aria-label="选择导出范围"><SelectValue/></SelectTrigger><SelectContent>
                    <SelectItem value="all">全部抽样数据</SelectItem>{completedAnalysisMethods.map(method => <SelectItem key={method} value={method}>{METHOD_META[method].label}结果</SelectItem>)}
                </SelectContent></Select>
                {exportError && <p role="alert" className="text-label text-destructive">{exportError}</p>}
                <Button onClick={() => handleExport(exportType)} disabled={isExporting || completedAnalysisMethods.length === 0}>
                    {isExporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>正在导出…</> : <><Download className="mr-2 h-4 w-4"/>导出 CSV</>}
                </Button>
            </DialogContent>
        </Dialog>
        <Dialog open={zoomChart !== null} onOpenChange={open => {if (!open) setZoomChart(null);}}>
            <DialogContent className="w-[calc(100vw-3rem)] max-w-6xl max-h-[90vh] overflow-y-auto bg-card" data-testid="student-analysis-zoom-dialog">
                <DialogHeader><DialogTitle>{activeZoom?.title}（放大）</DialogTitle><DialogDescription>放大查看当前图表，关闭后返回原来的位置。</DialogDescription></DialogHeader>
                {activeZoom && <ChartBars rows={activeZoom.rows} series={activeZoom.series} unit={activeZoom.unit} emptyMessage={activeZoom.emptyMessage} heightClass="h-[65vh]"/>}
            </DialogContent>
        </Dialog>
    </div>;
}

export default AnalysisReport;

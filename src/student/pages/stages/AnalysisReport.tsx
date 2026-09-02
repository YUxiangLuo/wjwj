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
import { BarChart3, Download, FileText, Send, Loader2, Sparkles, Maximize2, Ruler, ListTree, AlertCircle, Info } from "lucide-react";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { useExperiment } from "../ExperimentLayout";
import { RichTextEditor } from "../../components/RichTextEditor";
import { experimentApi, type AnalysisMetricsData } from "../../api-client";
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
import { TargetMetricsPanel } from "../../components/TargetMetricsPanel";
import { notifyAuthExpiredFromResponse } from "@/lib/auth-expired";
import {
    readExperimentDraft,
    useExperimentDraft,
} from "../../experiment/experiment-draft";

interface AnalysisReportProps {
    onPrev: () => void;
    onSubmit: () => void;
}

type ZoomChartType = "mean" | "dist" | "error" | "represent" | null;

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
    const maxValue = useMemo(() => {
        const values = rows.flatMap((row) => series.map((s) => row.values[s.key] ?? 0));
        return Math.max(...values, 1);
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
                                const widthPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
                                return (
                                    <div key={`${row.label}-${s.key}`} className="flex items-center gap-2">
                                        <span className="w-20 text-meta text-muted-foreground shrink-0">{s.label}</span>
                                        <div className="h-3 flex-1 rounded-control bg-muted overflow-hidden">
                                            <div
                                                className="h-full rounded-control"
                                                style={{
                                                    width: `${Math.max(0, Math.min(100, widthPercent))}%`,
                                                    backgroundColor: s.color,
                                                }}
                                            />
                                        </div>
                                        <span className="w-20 text-right text-meta text-muted-foreground font-mono">
                                            {value.toFixed(2)}{unit}
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
        <div className="mt-6 space-y-4">
            <div className="flex flex-row items-center justify-between gap-3">
                <div className="text-label text-muted-foreground">{description}</div>
                <div className="flex items-center gap-2">
                    {fieldSelector}
                    <Button aria-label="放大图表" title="放大图表" variant="outline" size="icon" className="border-input bg-muted text-foreground hover:bg-muted" onClick={onZoom}>
                        <Maximize2 className="w-4 h-4" />
                    </Button>
                    <Button aria-label="下载图表 SVG" title="下载图表 SVG" variant="outline" size="icon" className="border-input bg-muted text-foreground hover:bg-muted" onClick={onDownload}>
                        <Download className="w-4 h-4" />
                    </Button>
                </div>
            </div>
            <ChartBars rows={rows} series={series} unit={unit} emptyMessage={emptyMessage} />
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
            <SelectTrigger aria-label={placeholder} className="w-[220px] bg-card border-input text-foreground">
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

    const restoredDraft = useMemo(() => readExperimentDraft<{ reportContent: string }>({
        experimentId: experiment?.id,
        experimentVersion: experiment?.version,
        stage: 4,
    }), [experiment?.id, experiment?.version]);
    const [reportContent, setReportContent] = useState(
        restoredDraft?.reportContent ?? experiment?.reportContent ?? "",
    );
    const reportDraft = useMemo(() => ({ reportContent }), [reportContent]);
    const clearDraft = useExperimentDraft({
        experimentId: experiment?.id,
        experimentVersion: experiment?.version,
        stage: 4,
        data: reportDraft,
        enabled: Boolean(experiment),
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [exportType, setExportType] = useState<MethodKey | "all">("all");
    const [zoomChart, setZoomChart] = useState<ZoomChartType>(null);
    const [analysisMetrics, setAnalysisMetrics] = useState<AnalysisMetricsData | null>(null);
    const [analysisMetricsError, setAnalysisMetricsError] = useState<string | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [selectedNumericField, setSelectedNumericField] = useState("");
    const [selectedCategoricalField, setSelectedCategoricalField] = useState("");
    const analysisTarget = experiment?.analysisTarget?.target;
    const [chartTab, setChartTab] = useState(analysisTarget?.kind === "proportion" ? "dist" : "mean");
    const samplingResultsKey = useMemo(
        () => JSON.stringify(experiment?.samplingResults ?? null),
        [experiment?.samplingResults],
    );
    const isPpsUnavailable = Boolean(experiment?.samplingResults?.pps?.unavailable);

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
    const ppsStandardErrorNotice = ppsStandardErrorMode === "census_exact"
        ? "PPS 本次为全体入样，每个单位的包含概率均为 1，设计标准误精确为 0；该结果未执行 Monte Carlo 重复抽样。"
        : `PPS 标准误是 ${ppsMonteCarloReplicates} 次重复抽样的 Monte Carlo 估计（按 R−1 计算重复间标准差），仍有模拟误差。`;
    const ppsStandardErrorDescription = isPpsUnavailable
        ? "PPS 本任务按规则跳过，不计算设计标准误。"
        : ppsStandardErrorMode === "census_exact"
            ? "PPS 为全体入样，每个单位的包含概率均为 1，设计标准误精确为 0，未执行 Monte Carlo 重复抽样。"
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
        let cancelled = false;

        async function loadAnalysisMetrics() {
            if (!experiment?.taskId) return;
            if (!cancelled) {
                setStatsLoading(true);
                setAnalysisMetricsError(null);
            }
            try {
                const res = await experimentApi.getAnalysisMetrics(experiment.taskId);
                if (cancelled) return;

                if (res.success && res.data) {
                    setAnalysisMetrics(res.data);
                    setAnalysisMetricsError(null);
                    return;
                }

                const message = res.error?.message
                    ? `分析指标加载失败：${res.error.message}`
                    : "分析指标加载失败，请刷新后重试";
                setAnalysisMetrics(null);
                setAnalysisMetricsError(message);
                toast.error(message);
            } catch (error) {
                if (cancelled) return;
                console.error("Failed to load analysis metrics:", error);
                setAnalysisMetrics(null);
                const message = "分析指标加载失败，请刷新后重试";
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
        };
    }, [experiment?.taskId, samplingResultsKey]);

    // ---- Chart data (memoized) ----

    const meanRows = useMemo<ChartRow[]>(() => {
        const fieldMetrics = selectedNumericField ? analysisMetrics?.numeric[selectedNumericField] : null;
        if (!fieldMetrics) return [];

        return (Object.keys(METHOD_META) as MethodKey[]).reduce<ChartRow[]>((rows, method) => {
            const estimate = fieldMetrics.methods[method].estimate;
            if (estimate !== null) {
                rows.push({ label: METHOD_META[method].label, values: { value: estimate } });
            }
            return rows;
        }, []);
    }, [analysisMetrics, selectedNumericField]);

    const errorRows = useMemo<ChartRow[]>(() => {
        const fieldMetrics = selectedNumericField ? analysisMetrics?.numeric[selectedNumericField] : null;
        if (!fieldMetrics) return [];

        return (Object.keys(METHOD_META) as MethodKey[]).reduce<ChartRow[]>((rows, method) => {
            const standardError = fieldMetrics.methods[method].standardError;
            if (standardError !== null) {
                rows.push({ label: METHOD_META[method].label, values: { value: standardError } });
            }
            return rows;
        }, []);
    }, [analysisMetrics, selectedNumericField]);

    const distributionRows = useMemo(() => {
        const fieldMetrics = selectedCategoricalField ? analysisMetrics?.categorical[selectedCategoricalField] : null;
        if (!fieldMetrics) return [];

        const categories = Array.from(new Set([
            ...Object.keys(fieldMetrics.population),
            ...Object.values(fieldMetrics.methods).flatMap((methodValues) => Object.keys(methodValues)),
        ])).sort((left, right) => left.localeCompare(right, "zh-CN"));

        return categories.map((category) => ({
            label: category,
            values: {
                simple: fieldMetrics.methods.simple[category] ?? 0,
                systematic: fieldMetrics.methods.systematic[category] ?? 0,
                pps: fieldMetrics.methods.pps[category] ?? 0,
                stratified: fieldMetrics.methods.stratified[category] ?? 0,
                population: fieldMetrics.population[category] ?? 0,
            },
        }));
    }, [analysisMetrics, selectedCategoricalField]);

    const representativenessRows = useMemo(() => {
        const rows: ChartRow[] = [];

        for (const field of numericFields) {
            const fieldMetrics = analysisMetrics?.numeric[field];
            if (!fieldMetrics || fieldMetrics.populationMean === 0) continue;

            const values: Record<string, number> = {};
            let hasValue = false;

            for (const method of Object.keys(METHOD_META) as MethodKey[]) {
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

            for (const method of Object.keys(METHOD_META) as MethodKey[]) {
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
    }, [analysisMetrics, categoricalFields, numericFields]);

    // ---- Series ----

    const methodSeries = useMemo<ChartSeries[]>(() =>
        (Object.keys(METHOD_META) as MethodKey[]).map((key) => ({
            key, label: METHOD_META[key].label, color: METHOD_META[key].color,
        })),
    []);

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

            const methodKeys = (Object.keys(METHOD_META) as MethodKey[]).filter((method) =>
                method !== "pps" || !isPpsUnavailable
            );

            return [
                ...methodKeys.map((key) => ({
                    key,
                    label: METHOD_META[key].label,
                    color: METHOD_META[key].color,
                })),
                POPULATION_SERIES,
            ];
        },
    [analysisMetrics, isPpsUnavailable, methodSeries, selectedCategoricalField]);

    const representSeries = useMemo<ChartSeries[]>(() => {
        const availableMethodKeys = (Object.keys(METHOD_META) as MethodKey[]).filter((method) =>
            representativenessRows.some((row) => Object.prototype.hasOwnProperty.call(row.values, method))
        );

        return availableMethodKeys.map((key) => ({
            key,
            label: METHOD_META[key].label,
            color: METHOD_META[key].color,
        }));
    }, [representativenessRows]);

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
        error: { title: "误差分析", rows: errorRows, series: errorSeries, emptyMessage: "暂无可用于误差分析的数值字段", downloadFileName: `error_${sanitizeFileName(selectedNumericField)}.svg` },
        represent: { title: "与已知总体的描述性偏差", rows: representativenessRows, series: representSeries, unit: "%", emptyMessage: "暂无可用于总体对照偏差分析的数据", downloadFileName: "population-deviation.svg" },
    }), [meanRows, meanSeries, distributionRows, distributionSeries, errorRows, errorSeries, representSeries, representativenessRows, selectedNumericField, selectedCategoricalField]);

    const activeZoom = zoomChart ? chartConfig[zoomChart] : null;

    // ---- Handlers ----

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const success = await completeStage(4, { reportContent });
            if (!success) return;
            clearDraft();
            onSubmit();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExport = async (type: MethodKey | "all") => {
        if (!experiment?.taskId) return;
        try {
            const res = await fetch(`/api/student/tasks/${experiment.taskId}/export?type=${type}`, {
                credentials: "include",
            });
            await notifyAuthExpiredFromResponse(res);
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

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-analysis-report">
            <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 space-y-6">
                    <Card className="rounded-surface border-border bg-card ">
                        <CardHeader className="border-b border-border pb-4">
                            <CardTitle className="flex items-center gap-2 text-foreground">
                                <BarChart3 className="w-5 h-5 text-primary" />
                                分析数据
                            </CardTitle>
                            <CardDescription className="text-muted-foreground">
                                {statsLoading
                                    ? "正在加载总体统计数据…"
                                    : "在图表分析、样本量规划决策参数与抽样执行参数之间切换查看"}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {analysisMetricsError && (
                                <div
                                    className="mb-4 flex items-start gap-2 rounded-surface border border-destructive-border bg-destructive-muted px-4 py-3 text-label text-destructive"
                                    data-testid="student-analysis-metrics-error"
                                >
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>{analysisMetricsError}</span>
                                </div>
                            )}
                            {(analysisMetrics?.excludedNumericFields?.length ?? 0) > 0 && (
                                <div className="mb-4 flex items-start gap-2 rounded-surface border border-warning-border bg-warning-muted p-3 text-meta leading-relaxed text-warning" data-testid="student-analysis-invalid-numeric-warning">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>
                                        历史总体中的数值字段 {analysisMetrics!.excludedNumericFields!.join("、")} 含空值或非数值，已停止该字段的均值与标准误分析，避免混用总体行数和有效值数。请联系教师修正总体数据。
                                    </span>
                                </div>
                            )}
                            <div className="mb-4 flex items-start gap-2 rounded-surface border border-info-border bg-info-muted p-3 text-meta leading-relaxed text-info" data-testid="student-analysis-oracle-notice">
                                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    本实验使用完整虚拟总体演示抽样设计，因此可以对照总体真值并计算设计层面的误差。现实调查通常看不到未入样单位，需使用与抽样设计匹配的权重和方差估计。样本量、设计效应和无回答率计算均是基于页面所列假设的规划近似，不替代预调查、抽样框评估和专业统计设计。
                                    {analysisMetrics && !isPpsUnavailable && ppsStandardErrorMode && <>{ppsStandardErrorNotice}</>}
                                </span>
                            </div>
                            {analysisMetrics?.target && (
                                <TargetMetricsPanel target={analysisMetrics.target} />
                            )}
                            <Tabs defaultValue="charts" className="w-full">
                                <TabsList
                                    className="mb-6 flex h-auto w-full flex-wrap gap-1 rounded-surface border border-border bg-background p-1"
                                    data-testid="student-analysis-section-tabs"
                                >
                                    <TabsTrigger
                                        value="charts"
                                        data-testid="student-analysis-section-tab-charts"
                                        className="flex-1 min-w-[7rem] rounded-surface py-2.5 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
                                    >
                                        <span className="flex items-center justify-center gap-1.5">
                                            <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                                            图表分析
                                        </span>
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="plan"
                                        data-testid="student-analysis-section-tab-plan"
                                        className="flex-1 min-w-[7rem] rounded-surface py-2.5 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
                                    >
                                        <span className="flex items-center justify-center gap-1.5">
                                            <Ruler className="h-3.5 w-3.5 shrink-0" />
                                            样本量规划
                                        </span>
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="sampling"
                                        data-testid="student-analysis-section-tab-sampling"
                                        className="flex-1 min-w-[7rem] rounded-surface py-2.5 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
                                    >
                                        <span className="flex items-center justify-center gap-1.5">
                                            <ListTree className="h-3.5 w-3.5 shrink-0" />
                                            抽样参数
                                        </span>
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="charts" className="mt-0 focus-visible:outline-none">
                            <Tabs value={chartTab} onValueChange={setChartTab}>
                                <TabsList className="bg-background border border-border p-1 rounded-surface w-full flex h-auto" data-testid="student-analysis-tabs">
                                    <TabsTrigger value="mean" data-testid="student-analysis-tab-mean" className="flex-1 rounded-surface py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">均值对比</TabsTrigger>
                                    <TabsTrigger value="dist" data-testid="student-analysis-tab-dist" className="flex-1 rounded-surface py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">分布对比</TabsTrigger>
                                    <TabsTrigger value="error" data-testid="student-analysis-tab-error" className="flex-1 rounded-surface py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">误差分析</TabsTrigger>
                                    <TabsTrigger value="represent" data-testid="student-analysis-tab-represent" className="flex-1 rounded-surface py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">总体对照偏差</TabsTrigger>
                                </TabsList>

                                <TabsContent value="mean">
                                    <ChartTabPanel
                                        description="比较各抽样方法对同一数值变量的均值估计，并利用已知虚拟总体显示真值对照。PPS 使用 Hájek 比估计（按一阶包含概率的倒数加权并归一化），不是 Horvitz–Thompson 均值；Hájek 通常更稳定，但并非严格设计无偏，小样本偏差可能不可忽略。"
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

                                <TabsContent value="dist">
                                    <ChartTabPanel
                                        description="比较各抽样方法在分类变量上的分布占比，并利用已知虚拟总体显示真值对照。"
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

                                <TabsContent value="error">
                                    <ChartTabPanel
                                        description={`利用完整虚拟总体比较均值估计的设计标准误：简单随机和分层采用设计公式，系统抽样枚举随机起点，${ppsStandardErrorDescription}这些结果不是现实调查中仅凭当前样本直接得到的标准误。`}
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

                                <TabsContent value="represent">
                                    <ChartTabPanel
                                        description="描述当前样本与已知虚拟总体的差异：数值行为 |估计−总体均值|/|总体均值|，分类行为各类占比差的平均。两套百分数不可横比，接近总体也不能单独证明样本无偏或具有整体代表性。"
                                        rows={representativenessRows}
                                        series={representSeries}
                                        unit="%"
                                        emptyMessage="暂无可用于总体对照偏差分析的数据"
                                        onZoom={() => setZoomChart("represent")}
                                        onDownload={() => downloadChart("represent")}
                                    />
                                </TabsContent>
                            </Tabs>
                                </TabsContent>

                                <TabsContent value="plan" className="mt-0 focus-visible:outline-none">
                                    <SamplePlanDecisionPanel
                                        samplePlan={experiment?.samplePlan ?? null}
                                        populationSize={populationSize}
                                    />
                                </TabsContent>

                                <TabsContent value="sampling" className="mt-0 focus-visible:outline-none">
                                    <SamplingMethodParamsPanel
                                        samplingResults={experiment?.samplingResults ?? null}
                                        targetSampleSize={experiment?.samplePlan?.finalSampleSize ?? null}
                                        populationSize={populationSize}
                                    />
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="rounded-surface border-border bg-card ">
                        <CardHeader className="border-b border-border pb-4">
                            <CardTitle className="flex items-center gap-2 text-foreground">
                                <Download className="w-5 h-5 text-info" />
                                数据导出
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                            <Select value={exportType} onValueChange={(v) => setExportType(v as MethodKey | "all")}>
                                <SelectTrigger aria-label="选择报告分析方法" className="w-full bg-card border-input text-foreground">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    <SelectItem value="all">全部抽样数据</SelectItem>
                                    <SelectItem value="simple">{METHOD_META.simple.label}结果</SelectItem>
                                    <SelectItem value="systematic">{METHOD_META.systematic.label}结果</SelectItem>
                                    <SelectItem value="pps">{METHOD_META.pps.label}结果</SelectItem>
                                    <SelectItem value="stratified">{METHOD_META.stratified.label}结果</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button className="w-full bg-info hover:bg-info-hover text-info-foreground " onClick={() => handleExport(exportType)}>
                                <Download className="w-4 h-4 mr-2" />
                                导出 CSV
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="rounded-surface border-primary-border bg-primary-muted ">
                        <CardHeader>
                            <CardTitle className="text-body text-primary flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                分析提示
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-label text-primary">
                            <p>
                                • 先比较总体均值估计，判断不同抽样方法是否给出接近的结果。
                                {isPpsUnavailable
                                    ? "本任务没有合格的 PPS 规模变量，因此 PPS 已按规则跳过，不应纳入方法间比较。"
                                    : "PPS 看的是可能存在小样本偏差的 Hájek 比估计。"}
                            </p>
                            <p>• 再看分类分布与总体对照偏差，描述当前样本对已知虚拟总体的贴近程度；这不能单独证明无偏或整体代表性。</p>
                            <p>• 最后结合设计标准误说明精度。本页 SE 借助完整虚拟总体；现实调查需使用与设计匹配的样本方差估计。</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card className="rounded-surface border-border bg-card ">
                <CardHeader className="border-b border-border pb-4">
                    <CardTitle className="flex items-center gap-2 text-foreground">
                        <FileText className="w-5 h-5 text-primary" />
                        撰写报告
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        本实验要求：请根据实验结果撰写 {minLength}-{maxLength} 字的分析报告
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="p-4 bg-background border border-border rounded-surface text-label text-muted-foreground">
                        <p className="font-semibold text-foreground mb-2">建议包含以下内容：</p>
                        <ul className="list-disc list-inside space-y-1.5 pl-2">
                            <li>抽样方法选择的理由</li>
                            <li>各方法执行结果的对比分析</li>
                            <li>抽样误差的分析</li>
                            <li>对调查结论可靠性的评估</li>
                            <li>改进建议（可选）</li>
                        </ul>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="report" className="text-foreground">报告内容</Label>
                        <div className="space-y-2">
                            <RichTextEditor
                                dataTestId="student-analysis-report"
                                editorTestId="student-analysis-report-editor"
                                id="report"
                                placeholder="请在此撰写您的分析报告..."
                                value={reportContent}
                                onChange={setReportContent}
                                editorClassName="min-h-[400px]"
                            />
                            <div className="text-right text-meta">
                                <span className={reportTextLength < minLength || reportTextLength > maxLength ? "text-destructive" : "text-success"}>
                                    {reportTextLength > maxLength
                                        ? `已超出 ${reportTextLength - maxLength} 字`
                                        : reportTextLength < minLength
                                            ? `还需 ${minLength - reportTextLength} 字`
                                            : "✓ 字数符合要求"}
                                </span>
                                <span className="text-muted-foreground ml-2">{reportTextLength}/{maxLength}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between items-center pt-6 border-t border-border">
                <Button variant="outline" onClick={onPrev} data-testid="student-analysis-prev" className="border-input bg-muted text-foreground hover:bg-muted hover:text-foreground">
                    上一阶段
                </Button>
                <Button onClick={handleSubmit} disabled={!isValidLength || isSubmitting} data-testid="student-analysis-preview" className="bg-success hover:bg-success-hover text-success-foreground ">
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            进入预览中...
                        </>
                    ) : (
                        <>
                            <Send className="w-4 h-4 mr-2" />
                            完成并预览报告
                        </>
                    )}
                </Button>
            </div>

            {/* Zoom dialog */}
            <Dialog open={zoomChart !== null} onOpenChange={(open) => { if (!open) setZoomChart(null); }}>
                <DialogContent className="max-w-[50vw] bg-card border-border text-foreground" data-testid="student-analysis-zoom-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">
                            {activeZoom?.title}（放大）
                        </DialogTitle>
                        <DialogDescription>
                            放大查看当前统计图表；关闭后可继续编辑实验报告。
                        </DialogDescription>
                    </DialogHeader>
                    {activeZoom && (
                        <ChartBars
                            rows={activeZoom.rows}
                            series={activeZoom.series}
                            unit={activeZoom.unit}
                            emptyMessage={activeZoom.emptyMessage}
                            heightClass="h-[65vh]"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default AnalysisReport;

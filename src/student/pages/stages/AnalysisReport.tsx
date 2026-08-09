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
import { BarChart3, Download, FileText, Send, Loader2, Sparkles, Maximize2, Ruler, ListTree, AlertCircle } from "lucide-react";
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
} from "./analysis-utils";
import { downloadChartAsSvg, sanitizeFileName } from "./chart-svg-export";
import { SamplePlanDecisionPanel, SamplingMethodParamsPanel } from "./analysis-params-panels";
import { notifyAuthExpiredFromResponse } from "@/lib/auth-expired";

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
            <div className={`${heightClass} rounded-2xl bg-background/30 border border-border flex items-center justify-center text-muted-foreground text-sm`}>
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className={`${heightClass} rounded-2xl bg-background/30 border border-border p-4 overflow-auto`}>
            <div className="space-y-4">
                {rows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-border bg-card/40 p-3">
                        <div className="text-xs text-foreground/90 font-medium mb-2">{row.label}</div>
                        <div className="space-y-2">
                            {series.map((s) => {
                                const value = row.values[s.key] ?? 0;
                                const widthPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
                                return (
                                    <div key={`${row.label}-${s.key}`} className="flex items-center gap-2">
                                        <span className="w-20 text-[11px] text-muted-foreground shrink-0">{s.label}</span>
                                        <div className="h-3 flex-1 rounded bg-muted overflow-hidden">
                                            <div
                                                className="h-full rounded"
                                                style={{
                                                    width: `${Math.max(0, Math.min(100, widthPercent))}%`,
                                                    backgroundColor: s.color,
                                                }}
                                            />
                                        </div>
                                        <span className="w-20 text-right text-[11px] text-muted-foreground font-mono">
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
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="text-sm text-muted-foreground">{description}</div>
                <div className="flex items-center gap-2">
                    {fieldSelector}
                    <Button aria-label="放大图表" title="放大图表" variant="outline" size="icon" className="border-input bg-muted text-foreground/90 hover:bg-muted" onClick={onZoom}>
                        <Maximize2 className="w-4 h-4" />
                    </Button>
                    <Button aria-label="下载图表 SVG" title="下载图表 SVG" variant="outline" size="icon" className="border-input bg-muted text-foreground/90 hover:bg-muted" onClick={onDownload}>
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
            <SelectTrigger aria-label="选择分析抽样方法" className="w-[220px] bg-background border-border text-foreground">
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

    const [reportContent, setReportContent] = useState(experiment?.reportContent ?? "");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [exportType, setExportType] = useState<MethodKey | "all">("all");
    const [zoomChart, setZoomChart] = useState<ZoomChartType>(null);
    const [analysisMetrics, setAnalysisMetrics] = useState<AnalysisMetricsData | null>(null);
    const [analysisMetricsError, setAnalysisMetricsError] = useState<string | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [selectedNumericField, setSelectedNumericField] = useState("");
    const [selectedCategoricalField, setSelectedCategoricalField] = useState("");
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

    useEffect(() => {
        if (!numericFields.includes(selectedNumericField)) {
            setSelectedNumericField(numericFields[0] ?? "");
        }
    }, [numericFields, selectedNumericField]);

    useEffect(() => {
        if (!categoricalFields.includes(selectedCategoricalField)) {
            setSelectedCategoricalField(categoricalFields[0] ?? "");
        }
    }, [categoricalFields, selectedCategoricalField]);

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
        represent: { title: "样本代表性", rows: representativenessRows, series: representSeries, unit: "%", emptyMessage: "暂无可用于代表性分析的数据", downloadFileName: "representativeness.svg" },
    }), [meanRows, meanSeries, distributionRows, distributionSeries, errorRows, errorSeries, representSeries, representativenessRows, selectedNumericField, selectedCategoricalField]);

    const activeZoom = zoomChart ? chartConfig[zoomChart] : null;

    // ---- Handlers ----

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const success = await completeStage(4, { reportContent });
            if (!success) return;
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="rounded-2xl border-border bg-card/50 shadow-sm">
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
                                    className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/70 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                                    data-testid="student-analysis-metrics-error"
                                >
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>{analysisMetricsError}</span>
                                </div>
                            )}
                            <Tabs defaultValue="charts" className="w-full">
                                <TabsList
                                    className="mb-6 flex h-auto w-full flex-wrap gap-1 rounded-xl border border-border bg-background p-1"
                                    data-testid="student-analysis-section-tabs"
                                >
                                    <TabsTrigger
                                        value="charts"
                                        data-testid="student-analysis-section-tab-charts"
                                        className="flex-1 min-w-[7rem] rounded-lg py-2.5 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
                                    >
                                        <span className="flex items-center justify-center gap-1.5">
                                            <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                                            图表分析
                                        </span>
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="plan"
                                        data-testid="student-analysis-section-tab-plan"
                                        className="flex-1 min-w-[7rem] rounded-lg py-2.5 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
                                    >
                                        <span className="flex items-center justify-center gap-1.5">
                                            <Ruler className="h-3.5 w-3.5 shrink-0" />
                                            样本量规划
                                        </span>
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="sampling"
                                        data-testid="student-analysis-section-tab-sampling"
                                        className="flex-1 min-w-[7rem] rounded-lg py-2.5 text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground"
                                    >
                                        <span className="flex items-center justify-center gap-1.5">
                                            <ListTree className="h-3.5 w-3.5 shrink-0" />
                                            抽样参数
                                        </span>
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="charts" className="mt-0 focus-visible:outline-none">
                            <Tabs defaultValue="mean">
                                <TabsList className="bg-background border border-border p-1 rounded-xl w-full flex h-auto" data-testid="student-analysis-tabs">
                                    <TabsTrigger value="mean" data-testid="student-analysis-tab-mean" className="flex-1 rounded-lg py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">均值对比</TabsTrigger>
                                    <TabsTrigger value="dist" data-testid="student-analysis-tab-dist" className="flex-1 rounded-lg py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">分布对比</TabsTrigger>
                                    <TabsTrigger value="error" data-testid="student-analysis-tab-error" className="flex-1 rounded-lg py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">误差分析</TabsTrigger>
                                    <TabsTrigger value="represent" data-testid="student-analysis-tab-represent" className="flex-1 rounded-lg py-2 data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground">样本代表性</TabsTrigger>
                                </TabsList>

                                <TabsContent value="mean">
                                    <ChartTabPanel
                                        description="比较各抽样方法对同一数值变量的总体均值估计。"
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
                                        description="比较各抽样方法在分类变量上的分布占比（含总体对照）。"
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
                                        description="比较各抽样方法对同一数值变量均值估计的设计标准误。"
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
                                        description="比较各抽样方法估计结果与总体指标的偏差程度（%）。"
                                        rows={representativenessRows}
                                        series={representSeries}
                                        unit="%"
                                        emptyMessage="暂无可用于代表性分析的数据"
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
                    <Card className="rounded-2xl border-border bg-card/50 shadow-sm">
                        <CardHeader className="border-b border-border pb-4">
                            <CardTitle className="flex items-center gap-2 text-foreground">
                                <Download className="w-5 h-5 text-info" />
                                数据导出
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                            <Select value={exportType} onValueChange={(v) => setExportType(v as MethodKey | "all")}>
                                <SelectTrigger aria-label="选择报告分析方法" className="w-full bg-background border-border text-foreground">
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
                            <Button className="w-full bg-info hover:bg-info/90 text-info-foreground shadow-lg shadow-info/20" onClick={() => handleExport(exportType)}>
                                <Download className="w-4 h-4 mr-2" />
                                导出 CSV
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-primary/20 bg-primary/5 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base text-primary flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                分析提示
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-primary">
                            <p>• 先比较总体均值估计，判断不同抽样方法是否给出接近的结果。</p>
                            <p>• 再看分类分布与代表性偏差，识别各方法对总体结构的贴近程度。</p>
                            <p>• 最后结合设计标准误，说明估计精度与稳定性。</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card className="rounded-2xl border-border bg-card/50 shadow-sm">
                <CardHeader className="border-b border-border pb-4">
                    <CardTitle className="flex items-center gap-2 text-foreground">
                        <FileText className="w-5 h-5 text-primary" />
                        撰写报告
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">
                        请根据实验结果撰写分析报告（{minLength}-{maxLength}字）
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="p-4 bg-background/50 border border-border rounded-xl text-sm text-muted-foreground">
                        <p className="font-semibold text-foreground/90 mb-2">建议包含以下内容：</p>
                        <ul className="list-disc list-inside space-y-1.5 pl-2">
                            <li>抽样方法选择的理由</li>
                            <li>各方法执行结果的对比分析</li>
                            <li>抽样误差的分析</li>
                            <li>对调查结论可靠性的评估</li>
                            <li>改进建议（可选）</li>
                        </ul>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="report" className="text-foreground/90">报告内容</Label>
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
                            <div className="text-right text-xs">
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
            <div className="flex justify-between items-center pt-6 border-t border-border/50">
                <Button variant="outline" onClick={onPrev} data-testid="student-analysis-prev" className="border-input bg-muted text-foreground/90 hover:bg-muted hover:text-foreground">
                    上一阶段
                </Button>
                <Button onClick={handleSubmit} disabled={!isValidLength || isSubmitting} data-testid="student-analysis-preview" className="bg-success hover:bg-success/90 text-success-foreground shadow-lg shadow-success/20">
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
                <DialogContent className="sm:max-w-[50vw] bg-card border-border text-foreground" data-testid="student-analysis-zoom-dialog">
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

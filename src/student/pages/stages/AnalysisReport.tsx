import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, Download, FileText, Send, Loader2, Sparkles, Maximize2, CheckCircle, Ruler, ListTree, AlertCircle } from "lucide-react";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { cn } from "@/lib/utils";
import { useExperiment } from "../ExperimentLayout";
import { RichTextEditor } from "../../components/RichTextEditor";
import { experimentApi, type AnalysisMetricsData } from "../../api-client";
import {
    clearReportDraft,
    clearLegacyTaskReportDraft,
    createReportDraftBasis,
    hashSerializedValue,
    loadReportDraft,
    saveReportDraft,
} from "../../draft-sync";
import {
    type MethodKey,
    type ChartSeries,
    type ChartRow,
    METHOD_META,
    POPULATION_SERIES,
} from "./analysis-utils";
import { downloadChartAsSvg, sanitizeFileName } from "./chart-svg-export";
import { SamplePlanDecisionPanel, SamplingMethodParamsPanel } from "./analysis-params-panels";
import { STUDENT_VISUAL_COLORS } from "../../visual-tokens";

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
            <div className={cn(heightClass, "flex items-center justify-center rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground")}>
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className={cn(heightClass, "overflow-auto rounded-lg border border-border bg-muted/30 p-4")}>
            <div className="flex flex-col gap-4">
                {rows.map((row) => (
                    <div key={row.label} className="rounded-lg border border-border bg-card/70 p-3">
                        <div className="mb-2 text-xs font-medium text-foreground">{row.label}</div>
                        <div className="flex flex-col gap-2">
                            {series.map((s) => {
                                const value = row.values[s.key] ?? 0;
                                const widthPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
                                return (
                                    <div key={`${row.label}-${s.key}`} className="flex items-center gap-2">
                                        <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{s.label}</span>
                                        <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
                                            <div
                                                className="h-full rounded"
                                                style={{
                                                    width: `${Math.max(0, Math.min(100, widthPercent))}%`,
                                                    backgroundColor: s.color,
                                                }}
                                            />
                                        </div>
                                        <span className="w-20 text-right font-mono text-[11px] text-muted-foreground">
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
        <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">{description}</div>
                <div className="flex items-center gap-2">
                    {fieldSelector}
                    <Button variant="outline" size="icon" onClick={onZoom}>
                        <Maximize2 />
                    </Button>
                    <Button variant="outline" size="icon" onClick={onDownload}>
                        <Download />
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
            <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    {fields.map((field) => (
                        <SelectItem key={field} value={field}>{field}</SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalysisReport({ onPrev, onSubmit }: AnalysisReportProps) {
    const { experiment, populationSize, registerStageSave, saveExperiment } = useExperiment();

    const [reportContent, setReportContent] = useState(experiment?.reportContent ?? "");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [exportType, setExportType] = useState<MethodKey | "all">("all");
    const [zoomChart, setZoomChart] = useState<ZoomChartType>(null);
    const [analysisMetrics, setAnalysisMetrics] = useState<AnalysisMetricsData | null>(null);
    const [analysisMetricsError, setAnalysisMetricsError] = useState<string | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [selectedNumericField, setSelectedNumericField] = useState("");
    const [selectedCategoricalField, setSelectedCategoricalField] = useState("");
    const [draftRestored, setDraftRestored] = useState(false);
    const experimentId = experiment?.id ?? null;
    const taskId = experiment?.taskId ?? null;
    const serverReportContent = experiment?.reportContent ?? "";
    const reportDraftBasis = useMemo(() => createReportDraftBasis({
        samplePlan: experiment?.samplePlan ?? null,
        samplingResults: experiment?.samplingResults ?? null,
    }), [experiment?.samplePlan, experiment?.samplingResults]);
    const reportSourceKey = experimentId === null
        ? null
        : `${experimentId}::${reportDraftBasis}::${serverReportContent}`;
    const [hydratedReportSourceKey, setHydratedReportSourceKey] = useState<string | null>(null);
    const samplingResultsKey = useMemo(
        () => hashSerializedValue(experiment?.samplingResults ?? null),
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
        {
            key: "value",
            label: selectedNumericField ? `${selectedNumericField} 估计均值` : "估计均值",
            color: STUDENT_VISUAL_COLORS.analysis.estimate,
        },
    ], [selectedNumericField]);

    const errorSeries = useMemo<ChartSeries[]>(() => [
        {
            key: "value",
            label: `${selectedNumericField || "字段"} 设计标准误`,
            color: STUDENT_VISUAL_COLORS.analysis.standardError,
        },
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

    useEffect(() => {
        if (!experimentId) {
            setDraftRestored(false);
            setReportContent(serverReportContent);
            setHydratedReportSourceKey(null);
            return;
        }

        clearLegacyTaskReportDraft(taskId);

        const restoredDraft = loadReportDraft({
            experimentId,
            basis: reportDraftBasis,
            serverContent: serverReportContent,
        });

        if (restoredDraft !== null) {
            setReportContent(restoredDraft);
            setDraftRestored(true);
            setHydratedReportSourceKey(reportSourceKey);
            return;
        }

        setReportContent(serverReportContent);
        setDraftRestored(false);
        setHydratedReportSourceKey(reportSourceKey);
    }, [experimentId, reportDraftBasis, reportSourceKey, serverReportContent, taskId]);

    useEffect(() => {
        if (!experimentId) return;
        if (hydratedReportSourceKey !== reportSourceKey) return;

        if (reportContent === serverReportContent) {
            clearReportDraft(experimentId);
            return;
        }

        saveReportDraft({
            experimentId,
            basis: reportDraftBasis,
            content: reportContent,
        });
    }, [experimentId, hydratedReportSourceKey, reportContent, reportDraftBasis, reportSourceKey, serverReportContent]);

    const saveCurrentReport = useCallback(async () => {
        if (!experimentId) return false;

        if (reportContent === serverReportContent) {
            clearReportDraft(experimentId);
            setDraftRestored(false);
            return true;
        }

        const success = await saveExperiment({ reportContent });
        if (success) {
            clearReportDraft(experimentId);
            setDraftRestored(false);
        }
        return success;
    }, [experimentId, reportContent, saveExperiment, serverReportContent]);

    useEffect(() => {
        registerStageSave(saveCurrentReport);
        return () => {
            registerStageSave(null);
        };
    }, [registerStageSave, saveCurrentReport]);

    // ---- Handlers ----

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            const success = await saveCurrentReport();
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
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-analysis-report">
            {draftRestored && (
                <Card
                    data-testid="student-analysis-draft-restored"
                    className="border-primary/20 bg-primary/5"
                >
                    <CardContent className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-primary">
                            <CheckCircle className="size-4" />
                            <span>已恢复未提交的本地报告草稿。</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="flex flex-col gap-6 lg:col-span-2">
                    <Card>
                        <CardHeader className="border-b border-border">
                            <CardTitle className="flex items-center gap-2 text-foreground">
                                <BarChart3 className="size-5 text-primary" />
                                分析数据
                            </CardTitle>
                            <CardDescription>
                                {statsLoading
                                    ? "正在加载总体统计数据…"
                                    : "在图表分析、样本量规划决策参数与抽样执行参数之间切换查看"}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {analysisMetricsError && (
                                <Alert
                                    variant="destructive"
                                    className="mb-4"
                                    data-testid="student-analysis-metrics-error"
                                >
                                    <AlertCircle />
                                    <AlertDescription>{analysisMetricsError}</AlertDescription>
                                </Alert>
                            )}
                            <Tabs defaultValue="charts" className="w-full">
                                <TabsList
                                    className="mb-6 flex h-auto w-full flex-wrap gap-1"
                                    data-testid="student-analysis-section-tabs"
                                >
                                    <TabsTrigger
                                        value="charts"
                                        data-testid="student-analysis-section-tab-charts"
                                        className="min-w-[7rem] flex-1 py-2.5"
                                    >
                                        <span className="flex items-center justify-center gap-1.5">
                                            <BarChart3 data-icon="inline-start" />
                                            图表分析
                                        </span>
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="plan"
                                        data-testid="student-analysis-section-tab-plan"
                                        className="min-w-[7rem] flex-1 py-2.5"
                                    >
                                        <span className="flex items-center justify-center gap-1.5">
                                            <Ruler data-icon="inline-start" />
                                            样本量规划
                                        </span>
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="sampling"
                                        data-testid="student-analysis-section-tab-sampling"
                                        className="min-w-[7rem] flex-1 py-2.5"
                                    >
                                        <span className="flex items-center justify-center gap-1.5">
                                            <ListTree data-icon="inline-start" />
                                            抽样参数
                                        </span>
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="charts" className="mt-0 focus-visible:outline-none">
                                    <Tabs defaultValue="mean">
                                        <TabsList className="flex h-auto w-full" data-testid="student-analysis-tabs">
                                            <TabsTrigger value="mean" data-testid="student-analysis-tab-mean" className="flex-1 py-2">均值对比</TabsTrigger>
                                            <TabsTrigger value="dist" data-testid="student-analysis-tab-dist" className="flex-1 py-2">分布对比</TabsTrigger>
                                            <TabsTrigger value="error" data-testid="student-analysis-tab-error" className="flex-1 py-2">误差分析</TabsTrigger>
                                            <TabsTrigger value="represent" data-testid="student-analysis-tab-represent" className="flex-1 py-2">样本代表性</TabsTrigger>
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

                <div className="flex flex-col gap-6">
                    <Card>
                        <CardHeader className="border-b border-border">
                            <CardTitle className="flex items-center gap-2 text-foreground">
                                <Download className="size-5 text-primary" />
                                数据导出
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3 pt-4">
                            <Select value={exportType} onValueChange={(v) => setExportType(v as MethodKey | "all")}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="all">全部抽样数据</SelectItem>
                                        <SelectItem value="simple">{METHOD_META.simple.label}结果</SelectItem>
                                        <SelectItem value="systematic">{METHOD_META.systematic.label}结果</SelectItem>
                                        <SelectItem value="pps">{METHOD_META.pps.label}结果</SelectItem>
                                        <SelectItem value="stratified">{METHOD_META.stratified.label}结果</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <Button className="w-full" onClick={() => handleExport(exportType)}>
                                <Download data-icon="inline-start" />
                                导出 CSV
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="border-primary/20 bg-primary/5">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base text-primary">
                                <Sparkles className="size-4" />
                                分析提示
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                            <p>• 先比较总体均值估计，判断不同抽样方法是否给出接近的结果。</p>
                            <p>• 再看分类分布与代表性偏差，识别各方法对总体结构的贴近程度。</p>
                            <p>• 最后结合设计标准误，说明估计精度与稳定性。</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card>
                <CardHeader className="border-b border-border">
                    <CardTitle className="flex items-center gap-2 text-foreground">
                        <FileText className="size-5 text-primary" />
                        撰写报告
                    </CardTitle>
                    <CardDescription>
                        请根据实验结果撰写分析报告（{minLength}-{maxLength}字）
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6 pt-6">
                    <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        <p className="mb-2 font-semibold text-foreground">建议包含以下内容：</p>
                        <ul className="flex list-inside list-disc flex-col gap-1.5 pl-2">
                            <li>抽样方法选择的理由</li>
                            <li>各方法执行结果的对比分析</li>
                            <li>抽样误差的分析</li>
                            <li>对调查结论可靠性的评估</li>
                            <li>改进建议（可选）</li>
                        </ul>
                    </div>

                    <div className="flex flex-col gap-3">
                        <Label htmlFor="report">报告内容</Label>
                        <div className="flex flex-col gap-2">
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
                                <span className={cn(reportTextLength < minLength || reportTextLength > maxLength ? "text-destructive" : "text-primary")}>
                                    {reportTextLength > maxLength
                                        ? `已超出 ${reportTextLength - maxLength} 字`
                                        : reportTextLength < minLength
                                            ? `还需 ${minLength - reportTextLength} 字`
                                            : "✓ 字数符合要求"}
                                </span>
                                <span className="ml-2 text-muted-foreground">{reportTextLength}/{maxLength}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex flex-col gap-6">
                <Separator />
                <div className="flex items-center justify-between gap-3">
                    <Button variant="outline" onClick={onPrev} data-testid="student-analysis-prev">
                        上一阶段
                    </Button>
                    <Button onClick={handleSubmit} disabled={!isValidLength || isSubmitting} data-testid="student-analysis-preview">
                        {isSubmitting ? (
                            <>
                                <Loader2 data-icon="inline-start" className="animate-spin" />
                                进入预览中...
                            </>
                        ) : (
                            <>
                                <Send data-icon="inline-start" />
                                完成并预览报告
                            </>
                    )}
                    </Button>
                </div>
            </div>

            {/* Zoom dialog */}
            <Dialog open={zoomChart !== null} onOpenChange={(open) => { if (!open) setZoomChart(null); }}>
                <DialogContent className="sm:max-w-[50vw]" data-testid="student-analysis-zoom-dialog">
                    <DialogHeader>
                        <DialogTitle>
                            {activeZoom?.title}（放大）
                        </DialogTitle>
                        <DialogDescription className="sr-only">
                            放大查看当前分析图表。
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

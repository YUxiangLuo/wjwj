import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, Download, FileText, Send, Loader2, Sparkles, AlertCircle, Maximize2, CheckCircle, MonitorPlay } from "lucide-react";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { useExperiment } from "../ExperimentLayout";
import { RichTextEditor } from "../../components/RichTextEditor";
import { useDraftSync } from "../../draft-sync";
import { experimentApi } from "../../api-client";
import { ImmersiveAnalysisDashboard } from "../../components/ImmersiveAnalysisDashboard";
import {
    type MethodKey,
    type SampleRow,
    type ChartSeries,
    type ChartRow,
    METHOD_META,
    POPULATION_SERIES,
    calculateMean,
    calculateStdError,
    collectNumericFields,
    collectCategoricalFields,
    buildDistributionRows,
    buildRepresentativenessRows,
} from "./analysis-utils";
import { downloadChartAsSvg, sanitizeFileName } from "./chart-svg-export";

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
            <div className={`${heightClass} rounded-2xl bg-white/30 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 text-sm`}>
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className={`${heightClass} rounded-2xl bg-white/30 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 p-4 overflow-auto`}>
            <div className="space-y-4 min-w-[620px]">
                {rows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 p-3">
                        <div className="text-xs text-slate-700 dark:text-slate-300 font-medium mb-2">{row.label}</div>
                        <div className="space-y-2">
                            {series.map((s) => {
                                const value = row.values[s.key] ?? 0;
                                const widthPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
                                return (
                                    <div key={`${row.label}-${s.key}`} className="flex items-center gap-2">
                                        <span className="w-20 text-[11px] text-slate-500 shrink-0">{s.label}</span>
                                        <div className="h-3 flex-1 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                            <div
                                                className="h-full rounded"
                                                style={{
                                                    width: `${Math.max(0, Math.min(100, widthPercent))}%`,
                                                    backgroundColor: s.color,
                                                }}
                                            />
                                        </div>
                                        <span className="w-20 text-right text-[11px] text-slate-600 dark:text-slate-400 font-mono">
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
                <div className="text-sm text-slate-600 dark:text-slate-400">{description}</div>
                <div className="flex items-center gap-2">
                    {fieldSelector}
                    <Button variant="outline" size="icon" className="border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700" onClick={onZoom}>
                        <Maximize2 className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700" onClick={onDownload}>
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
            <SelectTrigger className="w-[220px] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
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
    const { experiment, saveExperiment, setStageUnsavedChanges } = useExperiment();

    const [reportContent, setReportContent] = useState(experiment?.reportContent ?? "");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [zoomChart, setZoomChart] = useState<ZoomChartType>(null);
    const [showDashboard, setShowDashboard] = useState(false);
    const [populationStats, setPopulationStats] = useState<Record<string, Record<string, number>>>({});
    const [statsLoading, setStatsLoading] = useState(false);
    const [selectedNumericField, setSelectedNumericField] = useState("");
    const [selectedCategoricalField, setSelectedCategoricalField] = useState("");

    const draftKey = experiment?.taskId ? `student_report_draft_${experiment.taskId}` : null;

    const minLength = 100;
    const maxLength = 5000;
    const reportTextLength = useMemo(() => getRichTextPlainLength(reportContent), [reportContent]);
    const isValidLength = reportTextLength >= minLength && reportTextLength <= maxLength;

    // ---- Data derivation ----

    const methodRows = useMemo<Record<MethodKey, SampleRow[]>>(() => ({
        simple: ((experiment?.samplingResults as any)?.simple?.data ?? []) as SampleRow[],
        systematic: ((experiment?.samplingResults as any)?.systematic?.data ?? []) as SampleRow[],
        pps: ((experiment?.samplingResults as any)?.pps?.data ?? []) as SampleRow[],
        stratified: ((experiment?.samplingResults as any)?.stratified?.data ?? []) as SampleRow[],
    }), [experiment?.samplingResults]);

    const allRows = useMemo(() => {
        return [...methodRows.simple, ...methodRows.systematic, ...methodRows.pps, ...methodRows.stratified];
    }, [methodRows]);

    const numericFields = useMemo(() => collectNumericFields(allRows), [allRows]);
    const categoricalFields = useMemo(() => collectCategoricalFields(allRows, populationStats), [allRows, populationStats]);

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
        async function loadPopulationStats() {
            if (!experiment?.taskId) return;
            setStatsLoading(true);
            try {
                const res = await experimentApi.getStats(experiment.taskId);
                if (res.success && res.data?.stats) {
                    setPopulationStats(res.data.stats);
                }
            } catch (error) {
                console.error("Failed to load population stats:", error);
            } finally {
                setStatsLoading(false);
            }
        }

        void loadPopulationStats();
    }, [experiment?.taskId]);

    // ---- Chart data (memoized) ----

    const meanRows = useMemo<ChartRow[]>(() => {
        if (!selectedNumericField) return [];
        return (Object.keys(METHOD_META) as MethodKey[]).map((method) => ({
            label: METHOD_META[method].label,
            values: { value: calculateMean(methodRows[method], selectedNumericField) },
        }));
    }, [methodRows, selectedNumericField]);

    const errorRows = useMemo<ChartRow[]>(() => {
        if (!selectedNumericField) return [];
        return (Object.keys(METHOD_META) as MethodKey[]).map((method) => ({
            label: METHOD_META[method].label,
            values: { value: calculateStdError(methodRows[method], selectedNumericField) },
        }));
    }, [methodRows, selectedNumericField]);

    const distributionResult = useMemo(() => {
        return buildDistributionRows(selectedCategoricalField, methodRows, populationStats);
    }, [selectedCategoricalField, methodRows, populationStats]);

    const distributionRows = distributionResult.rows;

    const representativenessRows = useMemo(() => {
        return buildRepresentativenessRows(numericFields, categoricalFields, methodRows, populationStats);
    }, [numericFields, categoricalFields, methodRows, populationStats]);

    // ---- Series (memoized) ----

    const meanSeries = useMemo<ChartSeries[]>(() => [
        { key: "value", label: selectedNumericField || "均值", color: "#60a5fa" },
    ], [selectedNumericField]);

    const errorSeries = useMemo<ChartSeries[]>(() => [
        { key: "value", label: `${selectedNumericField || "字段"} 标准误`, color: "#f59e0b" },
    ], [selectedNumericField]);

    const distributionSeries = useMemo<ChartSeries[]>(() => [
        { key: "simple", label: METHOD_META.simple.label, color: METHOD_META.simple.color },
        { key: "systematic", label: METHOD_META.systematic.label, color: METHOD_META.systematic.color },
        { key: "pps", label: METHOD_META.pps.label, color: METHOD_META.pps.color },
        { key: "stratified", label: METHOD_META.stratified.label, color: METHOD_META.stratified.color },
        ...(distributionResult.withPopulation ? [POPULATION_SERIES] : []),
    ], [distributionResult.withPopulation]);

    const representativenessSeries = useMemo<ChartSeries[]>(() => [
        { key: "simple", label: METHOD_META.simple.label, color: METHOD_META.simple.color },
        { key: "systematic", label: METHOD_META.systematic.label, color: METHOD_META.systematic.color },
        { key: "pps", label: METHOD_META.pps.label, color: METHOD_META.pps.color },
        { key: "stratified", label: METHOD_META.stratified.label, color: METHOD_META.stratified.color },
    ], []);

    // ---- Zoom dialog config (lookup map) ----

    const zoomConfig = useMemo<Record<Exclude<ZoomChartType, null>, {
        title: string;
        rows: ChartRow[];
        series: ChartSeries[];
        unit?: string;
        emptyMessage: string;
    }>>(() => ({
        mean: { title: "均值对比（放大）", rows: meanRows, series: meanSeries, emptyMessage: "暂无可用于均值分析的数值字段" },
        dist: { title: "分布对比（放大）", rows: distributionRows, series: distributionSeries, unit: "%", emptyMessage: "暂无可用于分布分析的分类字段" },
        error: { title: "误差分析（放大）", rows: errorRows, series: errorSeries, emptyMessage: "暂无可用于误差分析的数值字段" },
        represent: { title: "样本代表性（放大）", rows: representativenessRows, series: representativenessSeries, unit: "%", emptyMessage: "暂无可用于代表性分析的数据" },
    }), [meanRows, meanSeries, distributionRows, distributionSeries, errorRows, errorSeries, representativenessRows, representativenessSeries]);

    const activeZoom = zoomChart ? zoomConfig[zoomChart] : null;

    // ---- Draft sync ----

    const saveReportContent = useCallback(async (nextContent: string) => {
        return saveExperiment({ reportContent: nextContent });
    }, [saveExperiment]);
    const parseReportDraft = useCallback((raw: string) => raw, []);
    const isMeaningfulReportDraft = useCallback((draft: string) => getRichTextPlainLength(draft) > 0, []);
    const serializeReport = useCallback((value: string) => value, []);

    const loadLatestReport = useCallback(async () => {
        if (!experiment?.taskId) return null;
        const res = await experimentApi.get(experiment.taskId);
        if (!res.success || !res.data) return null;
        return typeof res.data.reportContent === "string" ? res.data.reportContent : "";
    }, [experiment?.taskId]);

    const {
        clearLocalDraft,
        discardPendingDraft,
        handleRestoreDraftOpenChange,
        handleSyncConflictOpenChange,
        hasUnsavedLocalChanges,
        isOnline,
        keepLocalDraft,
        keepServerDraft,
        networkNotice,
        restoreDraftOpen,
        restorePendingDraft,
        saveNow,
        syncConflictOpen,
    } = useDraftSync<string>({
        applyValue: setReportContent,
        currentValue: reportContent,
        draftKey,
        initialServerValue: experiment?.reportContent ?? "",
        isMeaningfulDraft: isMeaningfulReportDraft,
        loadServerLatest: loadLatestReport,
        parseDraft: parseReportDraft,
        saveToServer: saveReportContent,
        serialize: serializeReport,
    });

    useEffect(() => {
        if (hasUnsavedLocalChanges) {
            return;
        }
        setReportContent(experiment?.reportContent ?? "");
    }, [experiment?.reportContent, experiment?.taskId, hasUnsavedLocalChanges]);

    useEffect(() => {
        setStageUnsavedChanges(4, hasUnsavedLocalChanges);
        return () => {
            setStageUnsavedChanges(4, false);
        };
    }, [hasUnsavedLocalChanges, setStageUnsavedChanges]);

    // ---- Handlers ----

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            await saveNow();
            clearLocalDraft();
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

    const downloadMeanChart = () => {
        if (!selectedNumericField || meanRows.length === 0) return;
        downloadChartAsSvg({
            title: `均值对比 - ${selectedNumericField}`,
            rows: meanRows,
            series: meanSeries,
            fileName: `mean_${sanitizeFileName(selectedNumericField)}.svg`,
        });
    };

    const downloadDistributionChart = () => {
        if (!selectedCategoricalField || distributionRows.length === 0) return;
        downloadChartAsSvg({
            title: `分布对比 - ${selectedCategoricalField}`,
            rows: distributionRows,
            series: distributionSeries,
            fileName: `distribution_${sanitizeFileName(selectedCategoricalField)}.svg`,
            unit: "%",
        });
    };

    const downloadErrorChart = () => {
        if (!selectedNumericField || errorRows.length === 0) return;
        downloadChartAsSvg({
            title: `抽样标准误对比 - ${selectedNumericField}`,
            rows: errorRows,
            series: errorSeries,
            fileName: `error_${sanitizeFileName(selectedNumericField)}.svg`,
        });
    };

    const downloadRepresentativenessChart = () => {
        if (representativenessRows.length === 0) return;
        downloadChartAsSvg({
            title: "样本代表性 - 各方法与总体的偏差",
            rows: representativenessRows,
            series: representativenessSeries,
            fileName: "representativeness.svg",
            unit: "%",
        });
    };

    // ---- Render ----

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-analysis-report">
            {networkNotice && (
                <Card
                    data-testid="student-analysis-network-notice"
                    className={`rounded-2xl border shadow-sm ${syncConflictOpen
                        ? "border-amber-500/30 bg-amber-500/10"
                        : isOnline
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : "border-rose-500/30 bg-rose-500/10"
                        }`}
                >
                    <CardContent className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm">
                            {syncConflictOpen ? (
                                <AlertCircle className="h-4 w-4 text-amber-600" />
                            ) : isOnline ? (
                                <CheckCircle className="h-4 w-4 text-emerald-600" />
                            ) : (
                                <AlertCircle className="h-4 w-4 text-rose-600" />
                            )}
                            <span
                                className={syncConflictOpen
                                    ? "text-amber-700 dark:text-amber-300"
                                    : isOnline
                                        ? "text-emerald-700 dark:text-emerald-300"
                                        : "text-rose-500"
                                }
                            >
                                {networkNotice}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                                    <BarChart3 className="w-5 h-5 text-indigo-500" />
                                    图表分析
                                </CardTitle>
                                <Button variant="outline" size="sm" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-800 dark:hover:text-indigo-200" onClick={() => setShowDashboard(true)}>
                                    <MonitorPlay className="w-4 h-4 mr-1.5" />
                                    全屏仪表盘
                                </Button>
                            </div>
                            <CardDescription className="text-slate-600 dark:text-slate-400">
                                {statsLoading ? "正在加载总体统计数据…" : "基于阶段三真实抽样结果自动生成"}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <Tabs defaultValue="mean">
                                <TabsList className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-1 rounded-xl w-full flex h-auto" data-testid="student-analysis-tabs">
                                    <TabsTrigger value="mean" data-testid="student-analysis-tab-mean" className="flex-1 rounded-lg py-2 data-[state=active]:bg-slate-200 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-slate-50 text-slate-600 dark:text-slate-400">均值对比</TabsTrigger>
                                    <TabsTrigger value="dist" data-testid="student-analysis-tab-dist" className="flex-1 rounded-lg py-2 data-[state=active]:bg-slate-200 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-slate-50 text-slate-600 dark:text-slate-400">分布对比</TabsTrigger>
                                    <TabsTrigger value="error" data-testid="student-analysis-tab-error" className="flex-1 rounded-lg py-2 data-[state=active]:bg-slate-200 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-slate-50 text-slate-600 dark:text-slate-400">误差分析</TabsTrigger>
                                    <TabsTrigger value="represent" data-testid="student-analysis-tab-represent" className="flex-1 rounded-lg py-2 data-[state=active]:bg-slate-200 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-slate-950 dark:data-[state=active]:text-slate-50 text-slate-600 dark:text-slate-400">样本代表性</TabsTrigger>
                                </TabsList>

                                <TabsContent value="mean">
                                    <ChartTabPanel
                                        description="比较各抽样方法在同一数值变量上的均值。"
                                        rows={meanRows}
                                        series={meanSeries}
                                        emptyMessage="暂无可用于均值分析的数值字段"
                                        onZoom={() => setZoomChart("mean")}
                                        onDownload={downloadMeanChart}
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
                                        onDownload={downloadDistributionChart}
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
                                        description="比较各抽样方法在同一变量上的抽样标准误。"
                                        rows={errorRows}
                                        series={errorSeries}
                                        emptyMessage="暂无可用于误差分析的数值字段"
                                        onZoom={() => setZoomChart("error")}
                                        onDownload={downloadErrorChart}
                                        fieldSelector={
                                            <FieldSelect value={selectedNumericField} onChange={setSelectedNumericField} fields={numericFields} placeholder="选择数值变量" />
                                        }
                                    />
                                </TabsContent>

                                <TabsContent value="represent">
                                    <ChartTabPanel
                                        description="比较各抽样方法样本与总体关键指标的偏差程度（%）。"
                                        rows={representativenessRows}
                                        series={representativenessSeries}
                                        unit="%"
                                        emptyMessage="暂无可用于代表性分析的数据"
                                        onZoom={() => setZoomChart("represent")}
                                        onDownload={downloadRepresentativenessChart}
                                    />
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
                            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                                <Download className="w-5 h-5 text-teal-500" />
                                数据导出
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-6">
                            <Button variant="outline" data-testid="student-analysis-export-simple" className="w-full justify-start border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100" onClick={() => handleExport("simple")}>
                                <FileText className="w-4 h-4 mr-2" />
                                简单随机抽样结果
                            </Button>
                            <Button variant="outline" data-testid="student-analysis-export-systematic" className="w-full justify-start border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100" onClick={() => handleExport("systematic")}>
                                <FileText className="w-4 h-4 mr-2" />
                                系统抽样结果
                            </Button>
                            <Button variant="outline" data-testid="student-analysis-export-pps" className="w-full justify-start border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100" onClick={() => handleExport("pps")}>
                                <FileText className="w-4 h-4 mr-2" />
                                PPS抽样结果
                            </Button>
                            <Button variant="outline" data-testid="student-analysis-export-stratified" className="w-full justify-start border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100" onClick={() => handleExport("stratified")}>
                                <FileText className="w-4 h-4 mr-2" />
                                分层抽样结果
                            </Button>
                            <div className="h-px bg-slate-200 dark:bg-slate-800 my-2"></div>
                            <Button variant="default" data-testid="student-analysis-export-all" className="w-full justify-start bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20" onClick={() => handleExport("all")}>
                                <FileText className="w-4 h-4 mr-2" />
                                导出全部数据
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-indigo-500/20 bg-indigo-500/5 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                分析提示
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-indigo-800/70 dark:text-indigo-200/70">
                            <p>• 先比较均值差异，判断三种方法估计结果是否一致。</p>
                            <p>• 再看分类分布，识别各方法在结构上的偏移。</p>
                            <p>• 最后结合标准误，说明方法稳定性和可靠性。</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
                    <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                        <FileText className="w-5 h-5 text-indigo-500" />
                        撰写报告
                    </CardTitle>
                    <CardDescription className="text-slate-600 dark:text-slate-400">
                        请根据实验结果撰写分析报告（{minLength}-{maxLength}字）
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="p-4 bg-white/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-600 dark:text-slate-400">
                        <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">建议包含以下内容：</p>
                        <ul className="list-disc list-inside space-y-1.5 pl-2">
                            <li>抽样方法选择的理由</li>
                            <li>各方法执行结果的对比分析</li>
                            <li>抽样误差的分析</li>
                            <li>对调查结论可靠性的评估</li>
                            <li>改进建议（可选）</li>
                        </ul>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="report" className="text-slate-700 dark:text-slate-300">报告内容</Label>
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
                                <span className={reportTextLength < minLength || reportTextLength > maxLength ? "text-rose-600" : "text-emerald-600"}>
                                    {reportTextLength > maxLength
                                        ? `已超出 ${reportTextLength - maxLength} 字`
                                        : reportTextLength < minLength
                                            ? `还需 ${minLength - reportTextLength} 字`
                                            : "✓ 字数符合要求"}
                                </span>
                                <span className="text-slate-500 ml-2">{reportTextLength}/{maxLength}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between items-center pt-6 border-t border-slate-200/50 dark:border-slate-800/50">
                <Button variant="outline" onClick={onPrev} data-testid="student-analysis-prev" className="border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100">
                    上一阶段
                </Button>
                <Button onClick={handleSubmit} disabled={!isValidLength || isSubmitting} data-testid="student-analysis-preview" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20">
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
                <DialogContent className="max-w-6xl bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200" data-testid="student-analysis-zoom-dialog">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 dark:text-slate-100">
                            {activeZoom?.title}
                        </DialogTitle>
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

            {/* Restore draft dialog */}
            <AlertDialog open={restoreDraftOpen} onOpenChange={handleRestoreDraftOpenChange}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200" data-testid="student-analysis-restore-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">恢复草稿</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400">检测到本地草稿，是否恢复？</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                            data-testid="student-analysis-restore-discard"
                            onClick={discardPendingDraft}
                        >
                            放弃草稿
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            data-testid="student-analysis-restore-apply"
                            onClick={restorePendingDraft}
                        >
                            恢复草稿
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Sync conflict dialog */}
            <AlertDialog open={syncConflictOpen} onOpenChange={handleSyncConflictOpenChange}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200" data-testid="student-analysis-conflict-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">检测到草稿冲突</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400 leading-relaxed">
                            本地草稿和服务器草稿都发生了变化。请选择要保留的版本。
                            <br />
                            <span className="text-slate-500">保留本地版本将覆盖服务器当前草稿。</span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                            data-testid="student-analysis-conflict-server"
                            onClick={keepServerDraft}
                        >
                            保留服务器版本
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            data-testid="student-analysis-conflict-local"
                            onClick={() => {
                                void keepLocalDraft();
                            }}
                        >
                            保留本地版本
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {showDashboard && (
                <ImmersiveAnalysisDashboard
                    methodRows={methodRows}
                    populationStats={populationStats}
                    numericFields={numericFields}
                    categoricalFields={categoricalFields}
                    onClose={() => setShowDashboard(false)}
                />
            )}
        </div>
    );
}

export default AnalysisReport;

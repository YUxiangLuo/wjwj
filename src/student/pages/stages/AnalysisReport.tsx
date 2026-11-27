import { SamplingObservationNotice } from "../../components/SamplingObservationNotice";
import { useSectionNavigation } from "@/hooks/useSectionNavigation";
import { useState, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
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
import { Download, FileText, Send, Loader2, Maximize2, AlertCircle, ArrowRight, ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StageActions } from "../../components/StageActions";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { useExperiment } from "../ExperimentLayout";
import { RichTextEditor } from "@/components/RichTextEditor";
import { experimentApi, downloadStudentFile } from "../../api-client";
import type { AnalysisMetricsData, TargetAnalysisMetrics } from "@/domain/experiment/analysis-types";
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
import {
    readExperimentDraft,
    useExperimentDraft,
} from "../../experiment/experiment-draft";
import { isCompletedSamplingResult, SAMPLING_METHODS, resolveSamplingPolicy } from "@/lib/sampling-policy";
import { normalizeConfidenceLevel, zForConfidenceLevel } from "@/domain/statistics/confidence-level";
import { UnivariateWorkspace } from "../../components/UnivariateWorkspace";
import { WaveLoopSnapshot } from "@/components/WaveLoopSnapshot";
import { EChartBox } from "@/components/charts/EChartBox";
import type { ECharts, EChartsCoreOption } from "@/components/charts/echarts-core";
import {
    CHART_FONT_FAMILY,
    buildExecutiveCategoryAxis,
    buildExecutiveGrid,
    buildExecutiveLegend,
    buildExecutiveTooltip,
    buildExecutiveValueAxis,
    getExecutiveChartTokens,
    type ExecutiveChartTokens,
} from "@/components/charts/echarts-theme";

interface AnalysisReportProps {
    onPrev: () => void;
    onSubmit: () => void;
}

type ZoomChartType = "mean" | "dist" | "error" | "representNumeric" | "representCategorical" | null;
type AnalysisWorkspace = "overview" | "waves" | "charts" | "univariate" | "records" | "report";
type DistributionViewMode = "grouped" | "stacked";

const DEVIATION_DISCLAIMER = "数值相对偏差（%）与分类分布偏差（百分点）使用独立尺度，不可横比；分类分布偏差受类别总数 K 影响（增加零频类别会摊薄均值），仅作同一抽样框下不同抽样方法的横向对比参考；接近总体也不能单独证明样本无偏或具有整体代表性。";

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function truncateChartLabel(label: string, maxChars = 11): string {
    return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
}

function resolveMethodColor(method: MethodKey, tokens: ExecutiveChartTokens): string {
    switch (method) {
        case "simple":
            return tokens.chart2;
        case "systematic":
            return tokens.chart3;
        case "pps":
            return tokens.chart4;
        case "stratified":
            return tokens.chart5;
    }
}

function resolveSeriesTokenColor(colorSpec: string, tokens: ExecutiveChartTokens): string {
    switch (colorSpec) {
        case "var(--chart-1)":
            return tokens.chart1;
        case "var(--chart-2)":
            return tokens.chart2;
        case "var(--chart-3)":
            return tokens.chart3;
        case "var(--chart-4)":
            return tokens.chart4;
        case "var(--chart-5)":
            return tokens.chart5;
        case "var(--chart-6)":
            return tokens.chart6;
        case "var(--chart-7)":
            return tokens.chart7;
        case "var(--chart-8)":
            return tokens.chart8;
        default:
            return colorSpec;
    }
}

function computeNiceStep(rawSpan: number, targetSplits = 5): number {
    const safeSpan = Number.isFinite(rawSpan) && rawSpan > 0 ? rawSpan : 1;
    const rough = safeSpan / targetSplits;
    const pow10 = 10 ** Math.floor(Math.log10(rough));
    const fraction = rough / pow10;
    let niceFraction: number;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 2.5) niceFraction = 2.5;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    return niceFraction * pow10;
}

function computeValueAxisDomain(
    values: number[],
    includeZero = true,
): { min: number; max: number; interval: number } {
    const finite = values.filter((v) => Number.isFinite(v));
    if (includeZero) finite.push(0);
    if (finite.length === 0) return { min: 0, max: 1, interval: 0.2 };
    let rawMin = Math.min(...finite);
    let rawMax = Math.max(...finite);
    const span = Math.max(Math.abs(rawMax - rawMin), Math.max(Math.abs(rawMax), Math.abs(rawMin)) * 0.15, 1e-6);
    rawMin = includeZero && rawMin >= 0 ? 0 : rawMin - span * 0.1;
    rawMax = includeZero && rawMax <= 0 ? 0 : rawMax + span * 0.14;
    const step = computeNiceStep(rawMax - rawMin, 5);
    const niceMin = rawMin === 0 ? 0 : Math.floor(rawMin / step) * step;
    const niceMax = rawMax === 0 ? 0 : Math.ceil(rawMax / step) * step;
    const finalMax = niceMax <= niceMin ? niceMin + step : niceMax;
    return {
        min: Number(niceMin.toPrecision(10)),
        max: Number(finalMax.toPrecision(10)),
        interval: Number(step.toPrecision(10)),
    };
}

// ---------------------------------------------------------------------------
// Screen-reader accessible summary preserving exact row/series value parity
// ---------------------------------------------------------------------------

function ChartRowsSrSummary({
    rows,
    series,
    unit = "",
}: {
    rows: ChartRow[];
    series: ChartSeries[];
    unit?: string;
}) {
    const scale = useMemo(() => {
        const values = rows.flatMap((row) => series.map((s) => row.values[s.key] ?? 0));
        return chartScale(values);
    }, [rows, series]);

    return (
        <div>
            {rows.map((row) => (
                <div key={row.label}>
                    <span>{`${row.label} 明细`}</span>
                    {series.map((s) => {
                        const value = row.values[s.key] ?? 0;
                        const widthPercent = scale.range > 0 ? (Math.abs(value) / scale.range) * 100 : 0;
                        return (
                            <div key={`${row.label}-${s.key}`}>
                                <span>{s.label}</span>
                                <span
                                    aria-hidden="true"
                                    style={{
                                        width: `${Math.max(0, Math.min(100, widthPercent))}%`,
                                        backgroundColor: s.color,
                                    }}
                                />
                                <span>
                                    {formatStatistic(value, 2)}
                                    {unit}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Overview Cross-Method Estimate & Teaching CI Comparison Chart
// ---------------------------------------------------------------------------

function TargetEstimateComparisonCard({
    target,
    methods,
}: {
    target: TargetAnalysisMetrics;
    methods: MethodKey[];
}) {
    const kind = target.contract.contract.target.kind;
    const scaleFactor = kind === "proportion" ? 100 : 1;
    const unitSuffix = kind === "proportion" ? "%" : target.unit ? ` ${target.unit}` : "";

    const plottedMethods = useMemo(
        () =>
            methods.filter((m) => {
                const est = target.methods[m]?.estimate;
                return est !== null && est !== undefined && Number.isFinite(est);
            }),
        [methods, target.methods],
    );

    const option = useMemo<EChartsCoreOption | null>(() => {
        if (plottedMethods.length === 0) return null;
        const tokens = getExecutiveChartTokens();
        const popDisplay = target.populationValue * scaleFactor;
        const plannedHalf =
            target.plannedMarginOfError !== null && Number.isFinite(target.plannedMarginOfError)
                ? target.plannedMarginOfError * scaleFactor
                : null;

        const domainValues = [popDisplay];
        if (plannedHalf !== null) {
            domainValues.push(popDisplay - plannedHalf, popDisplay + plannedHalf);
        }

        const customRows = plottedMethods.map((method, idx) => {
            const metrics = target.methods[method];
            const est = metrics.estimate! * scaleFactor;
            const half =
                metrics.marginOfError !== null && Number.isFinite(metrics.marginOfError)
                    ? metrics.marginOfError * scaleFactor
                    : 0;
            const low = est - half;
            const high = est + half;
            domainValues.push(low, high, est);
            return {
                method,
                idx,
                est,
                low,
                high,
                half,
                sampleSize: metrics.sampleSize,
                color: resolveMethodColor(method, tokens),
            };
        });

        const domain = computeValueAxisDomain(domainValues, false);
        const popTruthLegendLabel = `虚拟总体真值 (${formatTargetEstimate(target.populationValue, kind, target.unit)})`;

        return {
            grid: buildExecutiveGrid({ left: 14, right: 28, top: 44, bottom: 14 }),
            legend: buildExecutiveLegend({
                data: [
                    `${target.confidenceLevel}% 教学区间与点估计`,
                    popTruthLegendLabel,
                    ...(plannedHalf !== null ? ["规划允许误差带 (±E)"] : []),
                ],
            }, tokens),
            tooltip: buildExecutiveTooltip({
                trigger: "axis",
                formatter: (params: unknown) => {
                    const list = Array.isArray(params) ? params : [params];
                    const first = list[0] as { dataIndex?: number } | undefined;
                    const row = customRows[first?.dataIndex ?? 0];
                    if (!row) return "";
                    const rawMetrics = target.methods[row.method];
                    const estText = formatTargetEstimate(rawMetrics.estimate, kind, target.unit);
                    const marginText = formatTargetMargin(rawMetrics.marginOfError, kind, target.unit);
                    const popText = formatTargetEstimate(target.populationValue, kind, target.unit);
                    const intervalText =
                        rawMetrics.marginOfError !== null
                            ? `[${formatStatistic(row.low, 2)}${unitSuffix}, ${formatStatistic(row.high, 2)}${unitSuffix}]`
                            : "—";
                    return [
                        `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(METHOD_META[row.method].label)}（n = ${row.sampleSize ?? "—"}）</div>`,
                        `<div>点估计：<b>${escapeHtml(estText)}</b></div>`,
                        `<div>${target.confidenceLevel}% 正态教学半宽：<b>${escapeHtml(marginText)}</b></div>`,
                        `<div>教学区间范围：<b>${escapeHtml(intervalText)}</b></div>`,
                        `<div style="margin-top:4px;border-top:1px solid ${tokens.border};padding-top:4px;">虚拟总体真值对照：<b>${escapeHtml(popText)}</b></div>`,
                    ].join("");
                },
            }, tokens),
            xAxis: buildExecutiveValueAxis({
                min: domain.min,
                max: domain.max,
                interval: domain.interval,
                axisLabel: {
                    formatter: (val: number) =>
                        kind === "proportion" ? `${formatStatistic(val, 1)}%` : formatStatistic(val, 2),
                },
            }, tokens),
            yAxis: buildExecutiveCategoryAxis({
                inverse: true,
                data: customRows.map((r) => METHOD_META[r.method].label),
            }, tokens),
            series: [
                {
                    name: `${target.confidenceLevel}% 教学区间与点估计`,
                    type: "custom",
                    z: 6,
                    encode: { x: [1, 2, 3], y: 0 },
                    data: customRows.map((r) => [r.idx, r.low, r.high, r.est]),
                    renderItem: (
                        params: { dataIndex: number },
                        api: {
                            value: (idx: number) => number;
                            coord: (pt: [number, number]) => [number, number];
                        },
                    ) => {
                        const row = customRows[params.dataIndex];
                        const strokeColor = row?.color ?? tokens.chart2;
                        const yIdx = api.value(0);
                        const lowPt = api.coord([api.value(1), yIdx]);
                        const highPt = api.coord([api.value(2), yIdx]);
                        const estPt = api.coord([api.value(3), yIdx]);
                        const capHalf = 6;
                        return {
                            type: "group",
                            children: [
                                {
                                    type: "line",
                                    shape: { x1: lowPt[0], y1: lowPt[1], x2: highPt[0], y2: highPt[1] },
                                    style: { stroke: strokeColor, lineWidth: 2.5 },
                                },
                                {
                                    type: "line",
                                    shape: {
                                        x1: lowPt[0],
                                        y1: lowPt[1] - capHalf,
                                        x2: lowPt[0],
                                        y2: lowPt[1] + capHalf,
                                    },
                                    style: { stroke: strokeColor, lineWidth: 2 },
                                },
                                {
                                    type: "line",
                                    shape: {
                                        x1: highPt[0],
                                        y1: highPt[1] - capHalf,
                                        x2: highPt[0],
                                        y2: highPt[1] + capHalf,
                                    },
                                    style: { stroke: strokeColor, lineWidth: 2 },
                                },
                                {
                                    type: "circle",
                                    shape: { cx: estPt[0], cy: estPt[1], r: 6 },
                                    style: {
                                        fill: strokeColor,
                                        stroke: tokens.card,
                                        lineWidth: 2,
                                    },
                                },
                            ],
                        };
                    },
                    markLine: {
                        silent: true,
                        symbol: "none",
                        lineStyle: {
                            color: tokens.chart1,
                            width: 2,
                            type: "dashed",
                        },
                        label: { show: false },
                        data: [{ xAxis: popDisplay }],
                    },
                    ...(plannedHalf !== null
                        ? {
                              markArea: {
                                  silent: true,
                                  label: { show: false },
                                  itemStyle: {
                                      color: tokens.successMuted,
                                      borderColor: tokens.successBorder,
                                      borderWidth: 1,
                                      borderType: "dashed",
                                  },
                                  data: [
                                      [
                                          { xAxis: popDisplay - plannedHalf },
                                          { xAxis: popDisplay + plannedHalf },
                                      ],
                                  ],
                              },
                          }
                        : {}),
                },
                {
                    name: popTruthLegendLabel,
                    type: "line",
                    data: [],
                    lineStyle: { color: tokens.chart1, width: 2, type: "dashed" },
                    itemStyle: { color: tokens.chart1 },
                },
                ...(plannedHalf !== null
                    ? [
                          {
                              name: "规划允许误差带 (±E)",
                              type: "line",
                              data: [],
                              itemStyle: { color: tokens.success },
                          },
                      ]
                    : []),
            ],
        };
    }, [plottedMethods, scaleFactor, target, kind, unitSuffix]);

    if (!option) return null;

    const chartHeight = Math.max(208, 84 + plottedMethods.length * 42);

    return (
        <Card className="min-w-0 gap-0 rounded-surface border-border bg-card py-0" data-testid="student-target-comparison-chart">
            <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                        <h3 className="text-subheading font-semibold text-foreground">
                            跨抽样方法目标点估计与 {target.confidenceLevel}% 教学区间森林图
                        </h3>
                        <p className="mt-0.5 text-meta text-muted-foreground">
                            圆点表示各方法点估计，水平须线为正态近似教学区间，虚线标注虚拟总体真值
                            {target.plannedMarginOfError !== null
                                ? `，浅绿底纹带表示真值周围 ${formatTargetMargin(target.plannedMarginOfError, kind, target.unit)} 规划容差走廊`
                                : ""}
                        </p>
                    </div>
                </div>
                <EChartBox
                    option={option}
                    height={chartHeight}
                    fallbackWidth={720}
                    ariaLabel="跨抽样方法目标估计与教学误差带对比森林图"
                />
            </CardContent>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// ChartTabPanel — EChartBox wrapper with zoom, vector SVG export, & controls
// ---------------------------------------------------------------------------

function ChartTabPanel({
    title,
    description,
    rows,
    series,
    option,
    unit,
    height = 300,
    emptyMessage,
    chartRef,
    onZoom,
    onDownload,
    fieldSelector,
    extraControls,
}: {
    title: string;
    description: string;
    rows: ChartRow[];
    series: ChartSeries[];
    option: EChartsCoreOption;
    unit?: string;
    height?: number;
    emptyMessage: string;
    chartRef?: MutableRefObject<ECharts | null>;
    onZoom: () => void;
    onDownload: () => void;
    fieldSelector?: ReactNode;
    extraControls?: ReactNode;
}) {
    return (
        <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    {fieldSelector}
                    {extraControls}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        aria-label="放大图表"
                        title="放大图表"
                        variant="outline"
                        size="icon-sm"
                        disabled={rows.length === 0}
                        onClick={onZoom}
                    >
                        <Maximize2 className="w-4 h-4" />
                    </Button>
                    <Button
                        type="button"
                        aria-label="下载图表 SVG"
                        title="下载图表 SVG"
                        variant="outline"
                        size="icon-sm"
                        disabled={rows.length === 0}
                        onClick={onDownload}
                    >
                        <Download className="w-4 h-4" />
                    </Button>
                </div>
            </div>
            {rows.length === 0 ? (
                <div className="flex h-72 items-center justify-center rounded-surface border border-dashed border-border bg-muted text-label text-muted-foreground">
                    {emptyMessage}
                </div>
            ) : (
                <div className="rounded-surface border border-border bg-card p-4">
                    <EChartBox
                        option={option}
                        height={height}
                        fallbackWidth={720}
                        ariaLabel={title}
                        chartRef={chartRef}
                        srSummary={<ChartRowsSrSummary rows={rows} series={series} unit={unit} />}
                    />
                </div>
            )}
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
                    <SelectItem key={field} value={field}>
                        {field}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalysisReport({ onPrev, onSubmit }: AnalysisReportProps) {
    const { experiment, populationSize, completeStage, refreshRequired, requireRefresh } = useExperiment();

    const activeDraftStage = experiment?.currentStage === 4 ? 4 : 5;
    const restoredDraft = useMemo(
        () =>
            readExperimentDraft<{ reportContent: string; analysisReferences?: number[]; workspace?: AnalysisWorkspace }>({
                experimentId: experiment?.id,
                experimentVersion: experiment?.version,
                stage: activeDraftStage,
            }),
        [activeDraftStage, experiment?.id, experiment?.version],
    );
    const [reportContent, setReportContent] = useState(
        restoredDraft?.reportContent ?? experiment?.reportContent ?? "",
    );
    const [analysisReferences, setAnalysisReferences] = useState<number[]>(
        restoredDraft?.analysisReferences ?? experiment?.analysisReferences ?? [],
    );
    const [staleAnalysisReferences, setStaleAnalysisReferences] = useState<number[]>(() => {
        const initialRefs = restoredDraft?.analysisReferences ?? experiment?.analysisReferences ?? [];
        const appendices = experiment?.analysisAppendices ?? [];
        return appendices.filter((item) => item.stale && initialRefs.includes(item.id)).map((item) => item.id);
    });
    const [workspace, setWorkspace, workspaceNavigationRef] = useSectionNavigation<AnalysisWorkspace>(
        restoredDraft?.workspace
            && ["overview", "waves", "charts", "univariate", "records", "report"].includes(restoredDraft.workspace)
            ? restoredDraft.workspace
            : "overview",
        '[data-testid="student-experiment-navigation"]',
    );
    const reportDraft = useMemo(
        () => ({ reportContent, analysisReferences, workspace }),
        [reportContent, analysisReferences, workspace],
    );
    const reportBaseline = useMemo(
        () => ({
            reportContent: experiment?.reportContent ?? "",
            analysisReferences: experiment?.analysisReferences ?? [],
            workspace: "overview" as const,
        }),
        [experiment?.analysisReferences, experiment?.reportContent],
    );
    const clearDraft = useExperimentDraft({
        experimentId: experiment?.id,
        experimentVersion: experiment?.version,
        stage: activeDraftStage,
        data: reportDraft,
        baseline: reportBaseline,
        enabled: Boolean(experiment),
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [exportType, setExportType] = useState<MethodKey | "all">("all");
    const [exportOpen, setExportOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [zoomChart, setZoomChart] = useState<ZoomChartType>(null);
    const [distViewMode, setDistViewMode] = useState<DistributionViewMode>("grouped");
    const [analysisMetrics, setAnalysisMetrics] = useState<AnalysisMetricsData | null>(null);
    const [analysisMetricsError, setAnalysisMetricsError] = useState<string | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [metricsRetry, setMetricsRetry] = useState(0);
    const [selectedNumericField, setSelectedNumericField] = useState("");
    const [selectedCategoricalField, setSelectedCategoricalField] = useState("");
    const analysisTarget = experiment?.analysisTarget?.target;
    const [chartTab, setChartTab] = useState(analysisTarget?.kind === "proportion" ? "dist" : "mean");

    const meanChartRef = useRef<ECharts | null>(null);
    const distChartRef = useRef<ECharts | null>(null);
    const errorChartRef = useRef<ECharts | null>(null);
    const representNumericChartRef = useRef<ECharts | null>(null);
    const representCategoricalChartRef = useRef<ECharts | null>(null);
    const zoomChartRef = useRef<ECharts | null>(null);

    const samplingResultsKey = useMemo(
        () => JSON.stringify(experiment?.samplingResults ?? null),
        [experiment?.samplingResults],
    );
    const isPpsUnavailable = Boolean(experiment?.samplingResults?.pps?.unavailable);
    const samplingPolicy = useMemo(
        () => resolveSamplingPolicy(experiment?.samplingPolicy),
        [experiment?.samplingPolicy],
    );
    const isPpsDisabled = samplingPolicy.methods.pps === "disabled";
    const completedAnalysisMethods = useMemo<MethodKey[]>(
        () =>
            SAMPLING_METHODS.filter(
                (method) =>
                    samplingPolicy.methods[method] !== "disabled"
                    && isCompletedSamplingResult(experiment?.samplingResults?.[method]),
            ),
        [experiment?.samplingResults, samplingPolicy],
    );
    const hasPpsCompleted = completedAnalysisMethods.includes("pps");

    const minLength = 100;
    const maxLength = 5000;
    const reportTextLength = useMemo(() => getRichTextPlainLength(reportContent), [reportContent]);
    const isValidLength = reportTextLength >= minLength && reportTextLength <= maxLength;
    const reportLengthHint =
        reportTextLength > maxLength
            ? `已超出 ${reportTextLength - maxLength} 字，请精简后继续`
            : reportTextLength < minLength
                ? `还需至少 ${minLength - reportTextLength} 字`
                : "字数符合要求，请检查结论与数据";

    // ---- Data derivation ----

    const numericFields = analysisMetrics?.numericFields ?? [];
    const categoricalFields = analysisMetrics?.categoricalFields ?? [];
    const reportedPpsMonteCarloReplicates = analysisMetrics?.ppsMonteCarloReplicates;
    const ppsMonteCarloReplicates = reportedPpsMonteCarloReplicates ?? 512;
    const ppsStandardErrorMode =
        analysisMetrics?.ppsStandardErrorMode
        ?? (typeof reportedPpsMonteCarloReplicates === "number" && reportedPpsMonteCarloReplicates > 0
            ? "monte_carlo"
            : null);
    const isPpsCensus = hasPpsCompleted && ppsStandardErrorMode === "census_exact";
    const ppsStandardErrorNotice =
        ppsStandardErrorMode === "census_exact"
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

        const populationMean = Number.isFinite(fieldMetrics.populationMean) ? fieldMetrics.populationMean : null;
        return completedAnalysisMethods.reduce<ChartRow[]>((rows, method) => {
            const estimate = fieldMetrics.methods[method].estimate;
            if (estimate !== null) {
                rows.push({
                    label: METHOD_META[method].label,
                    values: populationMean === null ? { value: estimate } : { value: estimate, population: populationMean },
                });
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

        const categories = Array.from(
            new Set([
                ...Object.keys(fieldMetrics.population),
                ...completedAnalysisMethods.flatMap((method) => Object.keys(fieldMetrics.methods[method])),
            ]),
        ).sort((left, right) => left.localeCompare(right, "zh-CN"));

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
        const categoricalRows: ChartRow[] = [];

        for (const field of numericFields) {
            const fieldMetrics = analysisMetrics?.numeric[field];
            if (!fieldMetrics || fieldMetrics.populationMean === 0) continue;

            const values: Record<string, number> = {};
            let hasValue = false;

            for (const method of completedAnalysisMethods) {
                const estimate = fieldMetrics.methods[method].estimate;
                if (estimate === null) continue;
                values[method] =
                    (Math.abs(estimate - fieldMetrics.populationMean) / Math.abs(fieldMetrics.populationMean)) * 100;
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
                categoricalRows.push({ label: `${field}（分布偏差）`, values });
            }
        }

        return { numeric: rows, categorical: categoricalRows };
    }, [analysisMetrics, categoricalFields, completedAnalysisMethods, numericFields]);

    // ---- Series ----

    const methodSeries = useMemo<ChartSeries[]>(
        () =>
            completedAnalysisMethods.map((key) => ({
                key,
                label: METHOD_META[key].label,
                color: METHOD_META[key].color,
            })),
        [completedAnalysisMethods],
    );

    const meanSeries = useMemo<ChartSeries[]>(() => {
        const estimateSeries: ChartSeries = {
            key: "value",
            label: selectedNumericField ? `${selectedNumericField} 估计均值` : "估计均值",
            color: "var(--chart-2)",
        };
        const hasPopulation = meanRows.some((row) => Object.prototype.hasOwnProperty.call(row.values, "population"));
        return hasPopulation ? [estimateSeries, { ...POPULATION_SERIES, label: "总体真值" }] : [estimateSeries];
    }, [meanRows, selectedNumericField]);

    const errorSeries = useMemo<ChartSeries[]>(
        () => [{ key: "value", label: `${selectedNumericField || "字段"} 设计标准误`, color: "var(--chart-5)" }],
        [selectedNumericField],
    );

    const distributionSeries = useMemo<ChartSeries[]>(() => {
        const fieldMetrics = selectedCategoricalField ? analysisMetrics?.categorical[selectedCategoricalField] : null;
        if (!fieldMetrics) {
            return methodSeries;
        }
        return [
            ...completedAnalysisMethods.map((key) => ({
                key,
                label: METHOD_META[key].label,
                color: METHOD_META[key].color,
            })),
            POPULATION_SERIES,
        ];
    }, [analysisMetrics, completedAnalysisMethods, methodSeries, selectedCategoricalField]);

    const representSeries = useMemo<ChartSeries[]>(() => {
        const availableMethodKeys = completedAnalysisMethods.filter((method) =>
            [...representativenessRows.numeric, ...representativenessRows.categorical].some((row) =>
                Object.prototype.hasOwnProperty.call(row.values, method),
            ),
        );

        return availableMethodKeys.map((key) => ({
            key,
            label: METHOD_META[key].label,
            color: METHOD_META[key].color,
        }));
    }, [completedAnalysisMethods, representativenessRows]);

    const target = analysisMetrics?.target;
    const plannedConfidenceLevel = normalizeConfidenceLevel(
        String(target?.confidenceLevel ?? experiment?.samplePlan?.confidenceLevel ?? "95"),
    );
    const plannedZ = zForConfidenceLevel(plannedConfidenceLevel);
    const meanIntervalLabel = `${plannedConfidenceLevel}% 教学误差带（±${plannedZ} SE，不保证覆盖率）`;

    const selectedNumericUnit = useMemo(() => {
        if (!selectedNumericField || !target) return undefined;
        if (
            target.contract.contract.target.kind === "mean"
            && target.contract.contract.target.field === selectedNumericField
            && target.unit
        ) {
            return target.unit;
        }
        return undefined;
    }, [selectedNumericField, target]);

    // ---- ECharts Options across all 4 multi-dimensional tabs ----

    const meanOption = useMemo<EChartsCoreOption>(() => {
        const tokens = getExecutiveChartTokens();
        const fieldMetrics = selectedNumericField ? analysisMetrics?.numeric[selectedNumericField] : null;
        if (!fieldMetrics) return {};

        const popMean = Number.isFinite(fieldMetrics.populationMean) ? fieldMetrics.populationMean : null;
        const unitStr = selectedNumericUnit ? ` ${selectedNumericUnit}` : "";
        const entries = completedAnalysisMethods
            .map((method) => {
                const m = fieldMetrics.methods[method];
                if (m.estimate === null) return null;
                const se = m.standardError;
                const ciHalf = se !== null && Number.isFinite(se) ? plannedZ * se : null;
                return {
                    method,
                    label: METHOD_META[method].label,
                    estimate: m.estimate,
                    se,
                    low: ciHalf !== null ? m.estimate - ciHalf : null,
                    high: ciHalf !== null ? m.estimate + ciHalf : null,
                    color: resolveMethodColor(method, tokens),
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        const domainValues = entries.flatMap((e) => [
            e.estimate,
            ...(e.low !== null ? [e.low] : []),
            ...(e.high !== null ? [e.high] : []),
        ]);
        if (popMean !== null) domainValues.push(popMean);
        const domain = computeValueAxisDomain(domainValues, true);

        const ciWhiskers = entries
            .map((e, idx) => (e.low !== null && e.high !== null ? [idx, e.low, e.high, e.estimate] : null))
            .filter((x): x is [number, number, number, number] => x !== null);
        const popLegendLabel =
            popMean !== null ? `真值参考线 (${formatStatistic(popMean, 2)}${unitStr})` : null;

        return {
            grid: buildExecutiveGrid({ left: 16, right: 24, top: 44, bottom: 14 }),
            legend: buildExecutiveLegend({
                data: [
                    "样本均值估计",
                    ...(ciWhiskers.length > 0 ? [meanIntervalLabel] : []),
                    ...(popLegendLabel ? [popLegendLabel] : []),
                ],
            }, tokens),
            tooltip: buildExecutiveTooltip({
                trigger: "axis",
                formatter: (params: unknown) => {
                    const list = Array.isArray(params) ? params : [params];
                    const first = list[0] as { dataIndex?: number } | undefined;
                    const item = entries[first?.dataIndex ?? 0];
                    if (!item) return "";
                    const ciLine =
                        item.low !== null && item.high !== null
                            ? `<div>${escapeHtml(meanIntervalLabel)}：<b>[${formatStatistic(item.low, 2)}, ${formatStatistic(item.high, 2)}]${escapeHtml(unitStr)}</b>（SE = ${formatStatistic(item.se ?? 0, 3)}）</div>`
                            : "";
                    const popLine =
                        popMean !== null
                            ? `<div>虚拟总体均值：<b>${formatStatistic(popMean, 2)}${escapeHtml(unitStr)}</b></div>`
                            : "";
                    return [
                        `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(item.label)} · ${escapeHtml(selectedNumericField)}</div>`,
                        `<div>估计均值：<b>${formatStatistic(item.estimate, 2)}${escapeHtml(unitStr)}</b></div>`,
                        ciLine,
                        popLine,
                    ].join("");
                },
            }, tokens),
            xAxis: buildExecutiveCategoryAxis({
                data: entries.map((e) => e.label),
            }, tokens),
            yAxis: buildExecutiveValueAxis({
                min: domain.min,
                max: domain.max,
                interval: domain.interval,
                name: selectedNumericUnit ? `均值（${selectedNumericUnit}）` : undefined,
                nameGap: 12,
                nameTextStyle: { align: "left" },
            }, tokens),
            series: [
                {
                    name: "样本均值估计",
                    type: "bar",
                    barMaxWidth: 50,
                    data: entries.map((e) => ({
                        value: e.estimate,
                        itemStyle: {
                            color: e.color,
                            borderRadius: e.estimate >= 0 ? [6, 6, 0, 0] : [0, 0, 6, 6],
                        },
                    })),
                    ...(popMean !== null
                        ? {
                              markLine: {
                                  silent: true,
                                  symbol: "none",
                                  lineStyle: {
                                      color: tokens.chart1,
                                      width: 2,
                                      type: "dashed",
                                  },
                                  label: { show: false },
                                  data: [{ yAxis: popMean }],
                              },
                          }
                        : {}),
                },
                ...(popLegendLabel
                    ? [
                          {
                              name: popLegendLabel,
                              type: "line",
                              data: [],
                              lineStyle: { color: tokens.chart1, width: 2, type: "dashed" },
                              itemStyle: { color: tokens.chart1 },
                          },
                      ]
                    : []),
                ...(ciWhiskers.length > 0
                    ? [
                          {
                              name: meanIntervalLabel,
                              type: "custom",
                              z: 8,
                              encode: { x: 0, y: [1, 2, 3] },
                              data: ciWhiskers,
                              renderItem: (
                                  _params: unknown,
                                  api: {
                                      value: (idx: number) => number;
                                      coord: (pt: [number, number]) => [number, number];
                                  },
                              ) => {
                                  const xIdx = api.value(0);
                                  const lowPt = api.coord([xIdx, api.value(1)]);
                                  const highPt = api.coord([xIdx, api.value(2)]);
                                  const estPt = api.coord([xIdx, api.value(3)]);
                                  const capHalf = 7;
                                  return {
                                      type: "group",
                                      children: [
                                          {
                                              type: "line",
                                              shape: { x1: lowPt[0], y1: lowPt[1], x2: highPt[0], y2: highPt[1] },
                                              style: { stroke: tokens.foreground, lineWidth: 2 },
                                          },
                                          {
                                              type: "line",
                                              shape: {
                                                  x1: highPt[0] - capHalf,
                                                  y1: highPt[1],
                                                  x2: highPt[0] + capHalf,
                                                  y2: highPt[1],
                                              },
                                              style: { stroke: tokens.foreground, lineWidth: 2 },
                                          },
                                          {
                                              type: "line",
                                              shape: {
                                                  x1: lowPt[0] - capHalf,
                                                  y1: lowPt[1],
                                                  x2: lowPt[0] + capHalf,
                                                  y2: lowPt[1],
                                              },
                                              style: { stroke: tokens.foreground, lineWidth: 2 },
                                          },
                                          {
                                              type: "circle",
                                              shape: { cx: estPt[0], cy: estPt[1], r: 3.5 },
                                              style: {
                                                  fill: tokens.card,
                                                  stroke: tokens.foreground,
                                                  lineWidth: 2,
                                              },
                                          },
                                      ],
                                  };
                              },
                          },
                      ]
                    : []),
            ],
        };
    }, [analysisMetrics, completedAnalysisMethods, selectedNumericField, selectedNumericUnit, plannedZ, meanIntervalLabel]);

    const distOption = useMemo<EChartsCoreOption>(() => {
        const tokens = getExecutiveChartTokens();
        if (distributionRows.length === 0) return {};

        if (distViewMode === "stacked") {
            // 100% Stacked Composition View: X-axis = Methods + 总体基准, Series = Categories summing to 100%
            const methodColumns = distributionSeries.map((s) => ({
                key: s.key,
                label: s.key === "population" ? "总体真值" : s.label,
            }));

            return {
                grid: buildExecutiveGrid({ left: 14, right: 20, top: 42, bottom: 14 }),
                legend: buildExecutiveLegend({
                    type: "scroll",
                    data: distributionRows.map((r) => truncateChartLabel(r.label, 12)),
                }, tokens),
                tooltip: buildExecutiveTooltip({
                    trigger: "axis",
                    formatter: (params: unknown) => {
                        const list = Array.isArray(params) ? params : [params];
                        const first = list[0] as { dataIndex?: number } | undefined;
                        const col = methodColumns[first?.dataIndex ?? 0];
                        if (!col) return "";
                        const lines = distributionRows.map((row, idx) => {
                            const val = row.values[col.key] ?? 0;
                            const color = tokens.palette[idx % tokens.palette.length]!;
                            return (
                                `<div style="display:flex;justify-content:space-between;gap:14px;">`
                                + `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px;"></span>${escapeHtml(row.label)}</span>`
                                + `<b>${formatStatistic(val, 2)}%</b>`
                                + `</div>`
                            );
                        });
                        return [`<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(col.label)} · 100% 构成</div>`, ...lines].join("");
                    },
                }, tokens),
                xAxis: buildExecutiveCategoryAxis({
                    data: methodColumns.map((c) => c.label),
                }, tokens),
                yAxis: buildExecutiveValueAxis({
                    min: 0,
                    max: 100,
                    axisLabel: { formatter: "{value}%" },
                }, tokens),
                series: distributionRows.map((row, cIdx) => ({
                    name: truncateChartLabel(row.label, 12),
                    type: "bar",
                    stack: "dist-100",
                    barMaxWidth: 54,
                    itemStyle: {
                        color: tokens.palette[cIdx % tokens.palette.length],
                        borderRadius: cIdx === distributionRows.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0],
                    },
                    data: methodColumns.map((col) => Number((row.values[col.key] ?? 0).toFixed(3))),
                })),
            };
        }

        // Default Grouped View: X-axis = Categories, Series = Completed Methods + 总体基准
        return {
            grid: buildExecutiveGrid({ left: 14, right: 20, top: 42, bottom: 16 }),
            legend: buildExecutiveLegend({
                data: distributionSeries.map((s) => (s.key === "population" ? "总体真值" : s.label)),
            }, tokens),
            tooltip: buildExecutiveTooltip({
                trigger: "axis",
                formatter: (params: unknown) => {
                    const list = Array.isArray(params) ? params : [params];
                    const first = list[0] as { dataIndex?: number } | undefined;
                    const row = distributionRows[first?.dataIndex ?? 0];
                    if (!row) return "";
                    const lines = distributionSeries.map((s) => {
                        const color = resolveSeriesTokenColor(s.color, tokens);
                        const label = s.key === "population" ? "总体真值" : s.label;
                        const val = row.values[s.key] ?? 0;
                        return (
                            `<div style="display:flex;justify-content:space-between;gap:14px;">`
                            + `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px;"></span>${escapeHtml(label)}</span>`
                            + `<b>${formatStatistic(val, 2)}%</b>`
                            + `</div>`
                        );
                    });
                    return [`<div style="font-weight:600;margin-bottom:4px;">类别：${escapeHtml(row.label)}</div>`, ...lines].join("");
                },
            }, tokens),
            xAxis: buildExecutiveCategoryAxis({
                data: distributionRows.map((r) => truncateChartLabel(r.label, 10)),
                axisLabel: {
                    rotate: distributionRows.length > 6 ? 22 : 0,
                },
            }, tokens),
            yAxis: buildExecutiveValueAxis({
                min: 0,
                axisLabel: { formatter: "{value}%" },
            }, tokens),
            series: distributionSeries.map((s) => ({
                name: s.key === "population" ? "总体真值" : s.label,
                type: "bar",
                barMaxWidth: 28,
                itemStyle: {
                    color: resolveSeriesTokenColor(s.color, tokens),
                    borderRadius: [4, 4, 0, 0],
                },
                data: distributionRows.map((r) => Number((r.values[s.key] ?? 0).toFixed(3))),
            })),
        };
    }, [distViewMode, distributionRows, distributionSeries]);

    const errorOption = useMemo<EChartsCoreOption>(() => {
        const tokens = getExecutiveChartTokens();
        const fieldMetrics = selectedNumericField ? analysisMetrics?.numeric[selectedNumericField] : null;
        if (!fieldMetrics) return {};

        const srsSe = fieldMetrics.methods.simple?.standardError ?? null;
        const unitStr = selectedNumericUnit ? ` ${selectedNumericUnit}` : "";

        const ranked = completedAnalysisMethods
            .map((method) => {
                const se = fieldMetrics.methods[method].standardError;
                if (se === null) return null;
                let relCallout = "";
                if (se === 0) {
                    relCallout = "（精确无抽样误差）";
                } else if (method !== "simple" && srsSe !== null && srsSe > 0) {
                    const deltaPct = ((se - srsSe) / srsSe) * 100;
                    if (Math.abs(deltaPct) < 0.5) {
                        relCallout = `（较简单随机 ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%）`;
                    } else {
                        relCallout = `（较简单随机 ${deltaPct <= 0 ? `${deltaPct.toFixed(0)}%` : `+${deltaPct.toFixed(0)}%`}）`;
                    }
                }
                return {
                    method,
                    label: METHOD_META[method].label,
                    se,
                    relCallout,
                    color: resolveMethodColor(method, tokens),
                };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => a.se - b.se);

        const maxSe = Math.max(...ranked.map((r) => r.se), 0);
        const domain = computeValueAxisDomain([maxSe === 0 ? 1 : maxSe * 1.4], true);

        return {
            grid: buildExecutiveGrid({ left: 14, right: 28, top: 24, bottom: 26 }),
            tooltip: buildExecutiveTooltip({
                trigger: "axis",
                formatter: (params: unknown) => {
                    const list = Array.isArray(params) ? params : [params];
                    const first = list[0] as { dataIndex?: number } | undefined;
                    const item = ranked[first?.dataIndex ?? 0];
                    if (!item) return "";
                    return [
                        `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(item.label)}（精度排名 #${(first?.dataIndex ?? 0) + 1}）</div>`,
                        `<div>设计标准误 SE：<b>${formatStatistic(item.se, 4)}${escapeHtml(unitStr)}</b> ${escapeHtml(item.relCallout)}</div>`,
                    ].join("");
                },
            }, tokens),
            xAxis: buildExecutiveValueAxis({
                min: 0,
                max: domain.max,
                interval: domain.interval,
                name: selectedNumericUnit ? `设计标准误（${selectedNumericUnit}）` : "设计标准误",
                nameLocation: "middle",
                nameGap: 26,
            }, tokens),
            yAxis: buildExecutiveCategoryAxis({
                inverse: true,
                data: ranked.map((r) => r.label),
            }, tokens),
            series: [
                {
                    name: "精度棒线",
                    type: "bar",
                    barWidth: 8,
                    data: ranked.map((r) => ({
                        value: r.se,
                        itemStyle: {
                            color: r.color,
                            borderRadius: [0, 4, 4, 0],
                        },
                    })),
                },
                {
                    name: "设计标准误",
                    type: "scatter",
                    symbolSize: 15,
                    z: 5,
                    data: ranked.map((r) => ({
                        value: r.se,
                        itemStyle: {
                            color: r.color,
                            borderColor: tokens.card,
                            borderWidth: 2.5,
                        },
                    })),
                    label: {
                        show: true,
                        position: "right",
                        distance: 8,
                        formatter: (params: unknown) => {
                            const p = params as { dataIndex?: number };
                            const item = ranked[p.dataIndex ?? 0];
                            if (!item) return "";
                            return `${formatStatistic(item.se, 3)}${unitStr}${item.relCallout}`;
                        },
                        color: tokens.foreground,
                        fontFamily: CHART_FONT_FAMILY,
                        fontSize: 12,
                        fontWeight: 500,
                    },
                },
            ],
        };
    }, [analysisMetrics, completedAnalysisMethods, selectedNumericField, selectedNumericUnit]);

    const buildDeviationBarOption = (rows: ChartRow[], series: ChartSeries[], unitLabel: string): EChartsCoreOption => {
        const tokens = getExecutiveChartTokens();
        if (rows.length === 0 || series.length === 0) return {};

        return {
            grid: buildExecutiveGrid({ left: 16, right: 24, top: 44, bottom: 16 }),
            legend: buildExecutiveLegend({
                data: series.map((s) => s.label),
            }, tokens),
            tooltip: buildExecutiveTooltip({
                trigger: "axis",
                formatter: (params: unknown) => {
                    const list = Array.isArray(params) ? params : [params];
                    const first = list[0] as { dataIndex?: number } | undefined;
                    const row = rows[first?.dataIndex ?? 0];
                    if (!row) return "";
                    const lines = series.map((s) => {
                        const color = resolveSeriesTokenColor(s.color, tokens);
                        const val = row.values[s.key] ?? 0;
                        return (
                            `<div style="display:flex;justify-content:space-between;gap:14px;">`
                            + `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px;"></span>${escapeHtml(s.label)}</span>`
                            + `<b>${formatStatistic(val, 2)}${escapeHtml(unitLabel)}</b>`
                            + `</div>`
                        );
                    });
                    return [`<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(row.label)}</div>`, ...lines].join("");
                },
            }, tokens),
            xAxis: buildExecutiveCategoryAxis({
                data: rows.map((r) => truncateChartLabel(r.label.replace(/（(?:均值|分布)偏差）$/, ""), 11)),
                axisLabel: {
                    rotate: rows.length > 5 ? 20 : 0,
                },
            }, tokens),
            yAxis: buildExecutiveValueAxis({
                min: 0,
                name: `偏差（${unitLabel}）`,
                nameGap: 12,
                nameTextStyle: {
                    align: "left",
                },
            }, tokens),
            series: series.map((s) => ({
                name: s.label,
                type: "bar",
                barMaxWidth: 32,
                itemStyle: {
                    color: resolveSeriesTokenColor(s.color, tokens),
                    borderRadius: [4, 4, 0, 0],
                },
                data: rows.map((r) => Number((r.values[s.key] ?? 0).toFixed(4))),
            })),
        };
    };

    const representNumericOption = useMemo<EChartsCoreOption>(
        () => buildDeviationBarOption(representativenessRows.numeric, representSeries, "%"),
        [representativenessRows.numeric, representSeries],
    );

    const representCategoricalOption = useMemo<EChartsCoreOption>(
        () => buildDeviationBarOption(representativenessRows.categorical, representSeries, "百分点"),
        [representativenessRows.categorical, representSeries],
    );

    const representRadarOption = useMemo<EChartsCoreOption | null>(() => {
        const combined = [
            ...representativenessRows.numeric.map((row) => ({ ...row, unit: "%" })),
            ...representativenessRows.categorical.map((row) => ({ ...row, unit: "百分点" })),
        ];
        if (combined.length < 3 || representSeries.length === 0) return null;

        const tokens = getExecutiveChartTokens();
        const radarMetrics = combined.slice(0, 8);
        const indicators = radarMetrics.map((metric) => {
            const maxObserved = Math.max(...representSeries.map((s) => metric.values[s.key] ?? 0), 0);
            const spokeMax = Math.max(5, Number((maxObserved * 1.25).toPrecision(3)));
            const cleanName = truncateChartLabel(metric.label.replace(/（(?:均值|分布)偏差）$/, ""), 9);
            return {
                name: `${cleanName} (${metric.unit})`,
                max: spokeMax,
            };
        });

        return {
            legend: buildExecutiveLegend({
                data: representSeries.map((s) => s.label),
            }, tokens),
            tooltip: buildExecutiveTooltip({
                trigger: "item",
                formatter: (params: unknown) => {
                    const p = params as { name?: string; dataIndex?: number };
                    const seriesItem = representSeries[p.dataIndex ?? 0];
                    if (!seriesItem) return "";
                    const lines = radarMetrics.map((m) => {
                        const val = m.values[seriesItem.key] ?? 0;
                        return (
                            `<div style="display:flex;justify-content:space-between;gap:14px;">`
                            + `<span>${escapeHtml(m.label)}</span>`
                            + `<b>${formatStatistic(val, 2)}${escapeHtml(m.unit)}</b>`
                            + `</div>`
                        );
                    });
                    return [`<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(seriesItem.label)} · 多变量偏差轮廓</div>`, ...lines].join("");
                },
            }, tokens),
            radar: {
                center: ["50%", "60%"],
                radius: "50%",
                splitNumber: 4,
                indicator: indicators,
                axisName: {
                    color: tokens.mutedForeground,
                    fontFamily: CHART_FONT_FAMILY,
                    fontSize: 12,
                },
                splitLine: {
                    lineStyle: { color: tokens.border },
                },
                splitArea: {
                    areaStyle: { color: [tokens.card, tokens.background] },
                },
                axisLine: {
                    lineStyle: { color: tokens.border },
                },
            },
            series: [
                {
                    name: "多变量总体偏差轮廓",
                    type: "radar",
                    symbolSize: 6,
                    data: representSeries.map((s) => {
                        const color = resolveSeriesTokenColor(s.color, tokens);
                        return {
                            name: s.label,
                            value: radarMetrics.map((m) => Number((m.values[s.key] ?? 0).toFixed(3))),
                            lineStyle: { color, width: 2 },
                            itemStyle: { color },
                            areaStyle: { color, opacity: 0.12 },
                        };
                    }),
                },
            ],
        };
    }, [representativenessRows, representSeries]);

    // ---- Chart config (shared by tabs, zoom dialog, and SVG download) ----

    const chartConfig = useMemo<
        Record<
            Exclude<ZoomChartType, null>,
            {
                title: string;
                rows: ChartRow[];
                series: ChartSeries[];
                option: EChartsCoreOption;
                chartRef: MutableRefObject<ECharts | null>;
                unit?: string;
                notes?: string[];
                emptyMessage: string;
                downloadFileName: string;
            }
        >
    >(
        () => ({
            mean: {
                title: "均值对比",
                rows: meanRows,
                series: meanSeries,
                option: meanOption,
                chartRef: meanChartRef,
                unit: selectedNumericUnit,
                emptyMessage: "暂无可用于均值分析的数值字段",
                downloadFileName: `mean_${sanitizeFileName(selectedNumericField)}.svg`,
            },
            dist: {
                title: "分布对比",
                rows: distributionRows,
                series: distributionSeries,
                option: distOption,
                chartRef: distChartRef,
                unit: "%",
                emptyMessage: "暂无可用于分布分析的分类字段",
                downloadFileName: `distribution_${sanitizeFileName(selectedCategoricalField)}.svg`,
            },
            error: {
                title: "设计标准误",
                rows: errorRows,
                series: errorSeries,
                option: errorOption,
                chartRef: errorChartRef,
                unit: selectedNumericUnit,
                emptyMessage: "暂无可用于标准误分析的数值字段",
                downloadFileName: `error_${sanitizeFileName(selectedNumericField)}.svg`,
            },
            representNumeric: {
                title: "数值均值相对偏差（%）",
                rows: representativenessRows.numeric,
                series: representSeries,
                option: representNumericOption,
                chartRef: representNumericChartRef,
                unit: "%",
                notes: ["数值：|估计−总体均值|/|总体均值| × 100%；总体均值为零时不展示。", DEVIATION_DISCLAIMER],
                emptyMessage: "暂无可用于均值相对偏差分析的数据",
                downloadFileName: "population-deviation-numeric.svg",
            },
            representCategorical: {
                title: "分类分布偏差（百分点）",
                rows: representativenessRows.categorical,
                series: representSeries,
                option: representCategoricalOption,
                chartRef: representCategoricalChartRef,
                unit: "百分点",
                notes: ["分类：完整类别空间上各类占比绝对差的平均（单位：百分点）。", DEVIATION_DISCLAIMER],
                emptyMessage: "暂无可用于分类分布偏差分析的数据",
                downloadFileName: "population-deviation-categorical.svg",
            },
        }),
        [
            meanRows,
            meanSeries,
            meanOption,
            selectedNumericUnit,
            distributionRows,
            distributionSeries,
            distOption,
            errorRows,
            errorSeries,
            errorOption,
            representSeries,
            representativenessRows,
            representNumericOption,
            representCategoricalOption,
            selectedNumericField,
            selectedCategoricalField,
        ],
    );

    const activeZoom = zoomChart ? chartConfig[zoomChart] : null;

    const distModeToggle = (
        <div
            role="group"
            aria-label="分布对比视图切换"
            className="inline-flex items-center gap-1 rounded-control bg-muted p-1"
        >
            <Button
                type="button"
                size="sm"
                variant={distViewMode === "grouped" ? "secondary" : "ghost"}
                className="h-8 px-2.5 text-meta"
                aria-pressed={distViewMode === "grouped"}
                data-testid="student-analysis-dist-mode-grouped"
                onClick={() => setDistViewMode("grouped")}
            >
                分组柱状
            </Button>
            <Button
                type="button"
                size="sm"
                variant={distViewMode === "stacked" ? "secondary" : "ghost"}
                className="h-8 px-2.5 text-meta"
                aria-pressed={distViewMode === "stacked"}
                data-testid="student-analysis-dist-mode-stacked"
                onClick={() => setDistViewMode("stacked")}
            >
                100% 堆叠
            </Button>
        </div>
    );

    // ---- Handlers ----

    const handleSubmit = async () => {
        if (!isValidLength || staleAnalysisReferences.length > 0 || isSubmitting || refreshRequired) return;
        setIsSubmitting(true);
        try {
            const stageNum = experiment?.currentStage === 4 ? 4 : 5;
            const success = await completeStage(stageNum, { reportContent, analysisReferences });
            if (!success) return;
            clearDraft.clear();
            onSubmit();
        } finally {
            setIsSubmitting(false);
        }
    };

    const insertBusinessReportOutline = () => {
        if (reportTextLength > 20) {
            toast.info("编辑器中已有正文内容，请直接在现有内容上补充");
            return;
        }
        const decisionText =
            experiment?.studyContract?.contract.businessDecision
            ?? experiment?.studyContract?.contract.researchQuestion
            ?? "本次商业调研课题";
        const starter = `<h3>一、商业管理问题与核心结论摘要</h3><p>围绕「${decisionText}」，本团队完成了从首轮试投探底、回收质检清洗到二轮抽样调优的闭环实证调研。最终核心结论与经营建议如下：</p><h3>二、首轮试投诊断与二轮抽样调优复盘</h3><p>首轮试投中暴露的主要非抽样误差与结构偏差包括：……；针对上述问题，我们在正式轮采取了修订问卷、代入实测无回答率与样本方差重算样本量、以及升级分层/PPS/系统抽样策略等措施，使有效回收率与标准误显著改善。</p><h3>三、主指标点估计、教学误差带与方法效率对比</h3><p>对比正式轮不同抽样方法及质检清洗前后、无回答权重校准后的点估计与 ${meanIntervalLabel}：……</p><h3>四、细分客群交叉洞察与商业落地建议</h3><p>结合客群交叉分析结果，针对不同细分客群提出以下具体定价/运营/资源配置建议，并说明模型假设边界：……</p>`;
        setReportContent(starter);
        toast.success("已插入商务决策报告结构框架，请结合左侧实测数据补充具体数值与结论");
    };

    const handleExport = async (type: MethodKey | "all") => {
        if (!experiment?.taskId || isExporting) return;
        setIsExporting(true);
        setExportError(null);
        try {
            await downloadStudentFile(`/api/student/tasks/${experiment.taskId}/export?type=${type}`, `sampling_${type}.csv`);
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
        const activeInstance = zoomChart === type && zoomChartRef.current ? zoomChartRef.current : cfg.chartRef.current;
        downloadChartAsSvg({
            title: cfg.title,
            rows: cfg.rows,
            series: cfg.series,
            fileName: cfg.downloadFileName,
            unit: cfg.unit,
            notes: cfg.notes,
            echartInstance: activeInstance,
        });
    };

    // ---- Render ----
    const switchWorkspace = (value: string) => setWorkspace(value as AnalysisWorkspace);

    return (
        <div className="min-w-0 space-y-5" data-testid="student-stage-analysis-report">
            <Tabs value={workspace} onValueChange={switchWorkspace} className="min-w-0 space-y-5">
                <div ref={workspaceNavigationRef} className="scroll-mt-36 flex flex-wrap items-center justify-between gap-2">
                    <TabsList
                        aria-label="分析与报告工作区"
                        className="flex h-auto flex-wrap gap-1 rounded-control bg-muted p-1"
                        data-testid="student-analysis-workspace-tabs"
                    >
                        <TabsTrigger value="overview" className="min-h-10 px-2.5 text-label" data-testid="student-analysis-workspace-overview">
                            研究目标推断
                        </TabsTrigger>
                        {(experiment?.waves?.length ?? 0) > 0 && (
                            <TabsTrigger value="waves" className="min-h-10 px-2.5 text-label" data-testid="student-analysis-workspace-waves">
                                多轮质检与校准演进
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="charts" className="min-h-10 px-2.5 text-label" data-testid="student-analysis-section-tab-charts">
                            多维图表对比
                        </TabsTrigger>
                        <TabsTrigger value="univariate" className="min-h-10 px-2.5 text-label" data-testid="student-analysis-workspace-univariate">
                            客群交叉与单变量分析
                        </TabsTrigger>
                        <TabsTrigger value="records" className="min-h-10 px-2.5 text-label" data-testid="student-analysis-workspace-records">
                            规划与抽样档案
                        </TabsTrigger>
                        <TabsTrigger value="report" className="min-h-10 gap-1.5 px-2.5 text-label" data-testid="student-analysis-workspace-report">
                            <FileText className="h-4 w-4" />
                            商业决策报告
                        </TabsTrigger>
                    </TabsList>
                    <Button type="button" variant="outline" size="sm" onClick={() => setExportOpen(true)}>
                        <Download className="h-4 w-4" />
                        导出数据
                    </Button>
                </div>

                {analysisMetricsError && (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-4 text-label text-destructive"
                        data-testid="student-analysis-metrics-error"
                    >
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">{analysisMetricsError}。报告草稿仍可继续编辑。</span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={statsLoading}
                            data-testid="student-analysis-metrics-retry"
                            onClick={() => setMetricsRetry((value) => value + 1)}
                        >
                            重试加载
                        </Button>
                    </div>
                )}
                {statsLoading && (
                    <p role="status" className="flex items-center gap-2 text-label text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在计算分析指标，可先撰写报告。
                    </p>
                )}
                {(analysisMetrics?.excludedNumericFields?.length ?? 0) > 0 && (
                    <div
                        className="rounded-surface border border-warning-border bg-warning-muted p-3 text-meta text-warning"
                        data-testid="student-analysis-invalid-numeric-warning"
                    >
                        数值字段 {analysisMetrics!.excludedNumericFields!.join("、")} 含空值或非数值，已停止该字段的均值与标准误分析。请联系教师修正总体数据。
                    </div>
                )}

                <TabsContent value="overview" className="min-w-0 space-y-5">
                    <Card className="min-w-0 gap-0 rounded-surface border-border bg-card py-0">
                        <CardContent className="p-5">
                            {target ? (
                                <TargetMetricsPanel target={target} methods={completedAnalysisMethods} />
                            ) : (
                                <div className="space-y-3 py-6">
                                    <h2 className="text-section-title font-semibold">研究目标结果</h2>
                                    <p className="text-label text-muted-foreground">
                                        {statsLoading
                                            ? "正在准备目标估计与精度比较…"
                                            : "暂时没有研究目标的完整指标。可以查看已有图表和抽样记录。"}
                                    </p>
                                    <Button type="button" variant="outline" size="sm" onClick={() => setWorkspace("charts")}>
                                        查看图表探索
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    {target && <TargetEstimateComparisonCard target={target} methods={completedAnalysisMethods} />}
                    <details className="px-5 py-2">
                        <summary className="cursor-pointer text-label font-semibold">计算口径与解释限制</summary>
                        <div className="mt-3 space-y-3 text-meta leading-relaxed text-muted-foreground">
                            <p data-testid="student-analysis-oracle-notice">
                                本实验使用完整虚拟总体演示抽样设计，因此可以对照总体真值并计算设计层面的误差。现实调查通常看不到未入样单位，需使用与抽样设计匹配的权重和方差估计。样本量、设计效应和无回答率计算均是基于页面所列假设的规划近似，不替代预调查、抽样框评估和专业统计设计。
                                {analysisMetrics && hasPpsCompleted && ppsStandardErrorMode && ppsStandardErrorNotice}
                            </p>
                            <SamplingObservationNotice nonResponseRate={experiment?.samplePlan?.nonResponseRate} />
                            <p>
                                {isPpsDisabled
                                    ? "PPS 已由教师设为不适用，不纳入方法间比较。"
                                    : isPpsUnavailable
                                        ? "没有合格的 PPS 规模变量，PPS 已按规则跳过。"
                                        : isPpsCensus
                                            ? "PPS 本次覆盖完整总体，当前结果没有抽样误差；这不代表非普查情形下也具有相同精度。"
                                            : hasPpsCompleted
                                                ? "PPS 使用可能存在小样本偏差的 Hájek 比估计。"
                                                : "本次未选择 PPS，只比较实际完成的方法。"}
                            </p>
                            <p>分布和总体对照偏差描述的是当前样本与已知虚拟总体的差异，不能单独证明无偏或整体代表性。</p>
                        </div>
                    </details>
                </TabsContent>

                <TabsContent value="waves" className="min-w-0 space-y-5">
                    <WaveLoopSnapshot
                        waves={experiment?.waves ?? []}
                        adjustmentPlan={experiment?.adjustmentPlan ?? null}
                        analysisTarget={experiment?.analysisTarget ?? null}
                        unitLabel={target?.unit ?? ""}
                        confidenceLevel={plannedConfidenceLevel}
                    />
                </TabsContent>

                <TabsContent value="charts" className="min-w-0">
                    <Card className="min-w-0 rounded-surface border-border bg-card">
                        <CardHeader>
                            <CardTitle>
                                <h2 className="text-section-title font-semibold">从不同角度比较样本</h2>
                            </CardTitle>
                            <CardDescription>选择变量和图表。图表只包含本次完成的方法。</CardDescription>
                        </CardHeader>
                        <CardContent className="min-w-0">
                            <Tabs value={chartTab} onValueChange={setChartTab}>
                                <TabsList
                                    className="flex h-auto w-full gap-1 rounded-control bg-muted p-1"
                                    data-testid="student-analysis-tabs"
                                >
                                    <TabsTrigger
                                        value="mean"
                                        data-testid="student-analysis-tab-mean"
                                        className="flex-1 py-2"
                                    >
                                        均值对比
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="dist"
                                        data-testid="student-analysis-tab-dist"
                                        className="flex-1 py-2"
                                    >
                                        分布对比
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="error"
                                        data-testid="student-analysis-tab-error"
                                        className="flex-1 py-2"
                                    >
                                        设计标准误
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="represent"
                                        data-testid="student-analysis-tab-represent"
                                        className="flex-1 py-2"
                                    >
                                        总体对照偏差
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="mean" data-testid="student-analysis-mean-chart">
                                    <ChartTabPanel
                                        title="均值对比图"
                                        description={`比较各抽样方法对同一数值变量的均值估计，并利用已知虚拟总体显示真值对照。${
                                            hasPpsCompleted
                                                ? isPpsCensus
                                                    ? "PPS 本次覆盖完整总体，估计等于总体真值。"
                                                    : "PPS 使用 Hájek 比估计（按一阶包含概率的倒数加权并归一化），不是 Horvitz–Thompson 均值；Hájek 通常更稳定，但并非严格设计无偏，小样本偏差可能不可忽略。"
                                                : ""
                                        }`}
                                        rows={meanRows}
                                        series={meanSeries}
                                        option={meanOption}
                                        chartRef={meanChartRef}
                                        unit={selectedNumericUnit}
                                        emptyMessage="暂无可用于均值分析的数值字段"
                                        onZoom={() => setZoomChart("mean")}
                                        onDownload={() => downloadChart("mean")}
                                        fieldSelector={
                                            <FieldSelect
                                                value={selectedNumericField}
                                                onChange={setSelectedNumericField}
                                                fields={numericFields}
                                                placeholder="选择数值变量"
                                            />
                                        }
                                    />
                                </TabsContent>

                                <TabsContent value="dist" data-testid="student-analysis-distribution-chart">
                                    <ChartTabPanel
                                        title="分类分布对比图"
                                        description="比较各抽样方法在分类变量上的分布占比，并利用已知虚拟总体显示真值对照。主图把类别统一为去除首尾空格并经 Unicode NFKC 规范化（包括全角/半角）的文本，因此数字 1 与文本“1”会合并；空值作为“（缺失值）”并计入全部行的分母。单变量分析则按变量字典保留 JSON 原始类型，并从有效值分母排除声明的缺失编码，两处结果可能因此不同。超过 20 类时，图中合并尾部类别，保留主分析目标类别；总体对照偏差始终按完整类别计算，合并后的柱形可能隐藏类别间差异。"
                                        rows={distributionRows}
                                        series={distributionSeries}
                                        option={distOption}
                                        chartRef={distChartRef}
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
                                        extraControls={distModeToggle}
                                    />
                                </TabsContent>

                                <TabsContent value="error" data-testid="student-analysis-error-chart">
                                    <ChartTabPanel
                                        title="设计标准误精度对比图"
                                        description={`利用完整虚拟总体比较已完成方法的设计标准误：简单随机和分层采用设计公式，系统抽样枚举随机起点。${
                                            hasPpsCompleted ? ppsStandardErrorDescription : ""
                                        }这些结果不是现实调查中仅凭当前样本直接得到的标准误。口径说明：均值规划的总体方差 σ² 按 N 计算；简单随机均值设计公式使用按 N−1 计算的总体方差 S² = Nσ²/(N−1)（N>1），分层公式使用各层的总体方差。这里使用已知总体信息，不以本次样本方差估计总体方差。设计标准误衡量估计量在重复抽样中的波动，与描述总体单位离散程度的总体方差不是同一指标。`}
                                        rows={errorRows}
                                        series={errorSeries}
                                        option={errorOption}
                                        chartRef={errorChartRef}
                                        height={Math.max(230, 80 + errorRows.length * 46)}
                                        unit={selectedNumericUnit}
                                        emptyMessage="暂无可用于误差分析的数值字段"
                                        onZoom={() => setZoomChart("error")}
                                        onDownload={() => downloadChart("error")}
                                        fieldSelector={
                                            <FieldSelect
                                                value={selectedNumericField}
                                                onChange={setSelectedNumericField}
                                                fields={numericFields}
                                                placeholder="选择数值变量"
                                            />
                                        }
                                    />
                                </TabsContent>

                                <TabsContent value="represent" data-testid="student-analysis-representativeness-chart">
                                    {representRadarOption && (
                                        <div
                                            className="mt-5 rounded-surface border border-border bg-card p-4"
                                            data-testid="student-analysis-represent-radar"
                                        >
                                            <div className="mb-2">
                                                <h3 className="text-subheading font-semibold text-foreground">
                                                    多变量总体偏差轮廓雷达图
                                                </h3>
                                                <p className="mt-0.5 text-meta text-muted-foreground">
                                                    各辐射轴按所属变量的独立最大尺度归一化显示，越靠近圆心表示该变量样本与总体越贴近；具体数值与单位以悬停提示及下方分表为准。
                                                </p>
                                            </div>
                                            <EChartBox
                                                option={representRadarOption}
                                                height={320}
                                                fallbackWidth={720}
                                                ariaLabel="多抽样方法多变量总体偏差轮廓雷达图"
                                            />
                                        </div>
                                    )}
                                    {(["representNumeric", "representCategorical"] as const).map((type) => {
                                        const cfg = chartConfig[type];
                                        return (
                                            <section key={type} aria-label={cfg.title} className="mt-5">
                                                <h3 className="text-subheading font-semibold">{cfg.title}</h3>
                                                <ChartTabPanel
                                                    title={cfg.title}
                                                    description={cfg.notes!.join(" ")}
                                                    rows={cfg.rows}
                                                    series={cfg.series}
                                                    option={cfg.option}
                                                    chartRef={cfg.chartRef}
                                                    unit={cfg.unit}
                                                    emptyMessage={cfg.emptyMessage}
                                                    onZoom={() => setZoomChart(type)}
                                                    onDownload={() => downloadChart(type)}
                                                />
                                            </section>
                                        );
                                    })}
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="records" className="min-w-0 space-y-4">
                    <PageHeader>
                        <div className="space-y-2">
                            <h2 className="text-section-title font-semibold">实验依据</h2>
                            <p className="text-label text-muted-foreground">查看已保存的样本量参数和抽样记录。</p>
                        </div>
                    </PageHeader>
                    <details open className="rounded-surface border border-border bg-card p-5">
                        <summary className="cursor-pointer text-label font-semibold" data-testid="student-analysis-section-tab-plan">
                            样本量规划
                        </summary>
                        <div className="mt-4 min-w-0">
                            <SamplePlanDecisionPanel samplePlan={experiment?.samplePlan ?? null} populationSize={populationSize} />
                        </div>
                    </details>
                    <details className="rounded-surface border border-border bg-card p-5">
                        <summary className="cursor-pointer text-label font-semibold" data-testid="student-analysis-section-tab-sampling">
                            抽样执行记录
                        </summary>
                        <div className="mt-4 min-w-0">
                            <SamplingMethodParamsPanel
                                samplingResults={experiment?.samplingResults ?? null}
                                targetSampleSize={experiment?.samplePlan?.finalSampleSize ?? null}
                                populationSize={populationSize}
                                samplingPolicy={samplingPolicy}
                            />
                        </div>
                    </details>
                </TabsContent>

                <TabsContent value="univariate" forceMount className="min-w-0 data-[state=inactive]:hidden">
                    {experiment?.taskId && (
                        <UnivariateWorkspace
                            taskId={experiment.taskId}
                            observedVersion={experiment.version}
                            completedMethods={completedAnalysisMethods}
                            waves={experiment.waves}
                            activeWaveNumber={experiment.activeWaveNumber}
                            references={analysisReferences}
                            refreshRequired={refreshRequired}
                            onReferencesChange={setAnalysisReferences}
                            onRefreshRequired={requireRefresh}
                            onStaleReferencesChange={setStaleAnalysisReferences}
                        />
                    )}
                </TabsContent>

                <TabsContent value="report" forceMount className="min-w-0 data-[state=inactive]:hidden">
                    <div className="flex flex-wrap items-start gap-5">
                        <Card className="min-w-0 flex-[3_1_36rem] gap-0 rounded-surface border-border bg-card py-0">
                            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 p-5">
                                <div>
                                    <CardTitle>
                                        <h2 className="text-section-title font-semibold">撰写商业统计分析与管理决策报告</h2>
                                    </CardTitle>
                                    <CardDescription className="mt-1">
                                        报告需 {minLength}–{maxLength} 字。请结合试投质检复盘、抽样误差比较与细分客群洞察给出可执行商业建议。
                                    </CardDescription>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={insertBusinessReportOutline}
                                    data-testid="student-report-insert-outline"
                                    className="shrink-0"
                                >
                                    <FileText className="h-3.5 w-3.5" />
                                    插入商业决策提纲框架
                                </Button>
                            </CardHeader>
                            <CardContent className="px-3 pb-3 pt-1">
                                <Label htmlFor="report" className="sr-only">
                                    报告正文
                                </Label>
                                <RichTextEditor
                                    dataTestId="student-analysis-report"
                                    editorTestId="student-analysis-report-editor"
                                    id="report"
                                    ariaLabel="报告正文"
                                    showWordCount={false}
                                    placeholder="这次调查要回答什么问题？各方法得到了什么结果？请引用具体数值，并说明结论的适用范围。"
                                    value={reportContent}
                                    onChange={setReportContent}
                                    editorClassName="min-h-[10rem] h-[clamp(10rem,calc(100dvh-30rem),26rem)] overflow-y-auto"
                                />
                            </CardContent>
                        </Card>
                        <aside className="min-w-0 flex-[1_1_18rem] space-y-6 rounded-surface border border-border bg-card p-5" aria-label="报告写作参考">
                            {target && (
                                <section className="space-y-3">
                                    <h3 className="text-subheading font-semibold">结果速查</h3>
                                    <p className="text-meta text-muted-foreground">{target.contract.contract.researchQuestion}</p>
                                    {completedAnalysisMethods.map((method) => (
                                        <div key={method} className="border-t border-border pt-3 text-label">
                                            <p className="font-medium">{METHOD_META[method].label}</p>
                                            <p className="mt-1 tabular-nums">
                                                估计 {formatTargetEstimate(target.methods[method].estimate, target.contract.contract.target.kind, target.unit)}
                                            </p>
                                            <p className="mt-1 text-meta text-muted-foreground">
                                                教学半宽 {formatTargetMargin(target.methods[method].marginOfError, target.contract.contract.target.kind, target.unit)}
                                            </p>
                                        </div>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" onClick={() => setWorkspace("overview")}>
                                        查看完整结果与条件
                                    </Button>
                                </section>
                            )}
                            <section className="border-t border-border pt-5 space-y-3">
                                <h3 className="text-subheading font-semibold">写作提纲</h3>
                                <ol className="list-decimal space-y-3 pl-5 text-label leading-relaxed text-muted-foreground">
                                    <li>
                                        <strong className="font-medium text-foreground">研究问题与方法。</strong>估计哪个指标？为什么选择这些方法？
                                    </li>
                                    <li>
                                        <strong className="font-medium text-foreground">结果与比较。</strong>引用估计值和误差，说明方法之间的差异。
                                    </li>
                                    <li>
                                        <strong className="font-medium text-foreground">结论与限制。</strong>精度是否满足要求？哪些假设会影响解释？
                                    </li>
                                    <li>
                                        <strong className="font-medium text-foreground">改进方向。</strong>如果再做一次，会调整样本量、抽样设计还是问卷？
                                    </li>
                                </ol>
                            </section>
                            <p className="text-meta leading-relaxed text-muted-foreground">
                                保存后先预览；在预览页确认提交，教师才会收到报告。
                            </p>
                        </aside>
                    </div>
                </TabsContent>
            </Tabs>

            <StageActions>
                <Button variant="outline" onClick={onPrev} data-testid="student-analysis-prev">
                    <ChevronLeft className="h-4 w-4" />
                    查看正式轮投放
                </Button>
                {workspace === "report" ? (
                    <div className="flex flex-wrap items-center justify-end gap-3">
                        {staleAnalysisReferences.length > 0 && (
                            <div role="alert" className="flex flex-wrap items-center gap-2 text-meta text-warning">
                                <span>
                                    有 {staleAnalysisReferences.length} 条已引用分析来源过期。请到“客群交叉与单变量分析”明确移除或重新运行后再保存。
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-2.5 text-meta"
                                    onClick={() => setWorkspace("univariate")}
                                >
                                    前往处理
                                </Button>
                            </div>
                        )}
                        <p
                            className={`text-meta ${
                                reportTextLength > maxLength
                                    ? "text-destructive"
                                    : isValidLength
                                        ? "text-success"
                                        : "text-muted-foreground"
                            }`}
                            role="status"
                            data-testid="student-analysis-length-status"
                        >
                            <span className="tabular-nums">
                                {reportTextLength} / {maxLength} 字
                            </span>{" "}
                            · {reportLengthHint}
                        </p>
                        <Button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!isValidLength || staleAnalysisReferences.length > 0 || isSubmitting || refreshRequired}
                            data-testid="student-analysis-preview"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    正在保存报告…
                                </>
                            ) : (
                                <>
                                    <Send className="h-4 w-4" />
                                    保存并预览报告
                                </>
                            )}
                        </Button>
                    </div>
                ) : (
                    <Button type="button" onClick={() => setWorkspace("report")} data-testid="student-analysis-write">
                        继续：撰写报告
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                )}
            </StageActions>

            <Dialog open={exportOpen} onOpenChange={setExportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>导出抽样数据</DialogTitle>
                        <DialogDescription>
                            下载本次已完成方法的入样记录，供你复核和分析。导出数据不会提交实验报告。
                        </DialogDescription>
                    </DialogHeader>
                    <Label>导出范围</Label>
                    <Select
                        value={exportType}
                        onValueChange={(value) => setExportType(value as MethodKey | "all")}
                        disabled={isExporting}
                    >
                        <SelectTrigger aria-label="选择导出范围">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部抽样数据</SelectItem>
                            {completedAnalysisMethods.map((method) => (
                                <SelectItem key={method} value={method}>
                                    {METHOD_META[method].label}结果
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {exportError && (
                        <p role="alert" className="text-label text-destructive">
                            {exportError}
                        </p>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setExportOpen(false)} disabled={isExporting}>
                            取消
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport(exportType)}
                            disabled={isExporting || completedAnalysisMethods.length === 0}
                            className="px-4"
                        >
                            {isExporting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    正在导出…
                                </>
                            ) : (
                                <>
                                    <Download className="h-4 w-4" />
                                    导出 CSV
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={zoomChart !== null}
                onOpenChange={(open) => {
                    if (!open) setZoomChart(null);
                }}
            >
                <DialogContent
                    className="w-[calc(100vw-3rem)] max-w-6xl max-h-[90vh] overflow-y-auto bg-card"
                    data-testid="student-analysis-zoom-dialog"
                >
                    <DialogHeader>
                        <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
                            <DialogTitle>{activeZoom?.title}（放大）</DialogTitle>
                            {zoomChart && (
                                <div className="flex items-center gap-2">
                                    {zoomChart === "dist" && distModeToggle}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={!activeZoom || activeZoom.rows.length === 0}
                                        onClick={() => downloadChart(zoomChart)}
                                    >
                                        <Download className="mr-1.5 h-4 w-4" />
                                        下载 SVG
                                    </Button>
                                </div>
                            )}
                        </div>
                        <DialogDescription>
                            {activeZoom?.notes?.join(" ") ?? "放大查看当前图表，支持悬停查看完整指标明细，关闭后返回原来的位置。"}
                        </DialogDescription>
                    </DialogHeader>
                    {activeZoom && (
                        activeZoom.rows.length === 0 ? (
                            <div className="flex h-96 items-center justify-center rounded-surface border border-dashed border-border bg-muted text-label text-muted-foreground">
                                {activeZoom.emptyMessage}
                            </div>
                        ) : (
                            <div className="rounded-surface border border-border bg-card p-4">
                                <EChartBox
                                    option={activeZoom.option}
                                    height={440}
                                    fallbackWidth={920}
                                    ariaLabel={`${activeZoom.title}（放大视图）`}
                                    chartRef={zoomChartRef}
                                    srSummary={
                                        <ChartRowsSrSummary
                                            rows={activeZoom.rows}
                                            series={activeZoom.series}
                                            unit={activeZoom.unit}
                                        />
                                    }
                                />
                            </div>
                        )
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default AnalysisReport;

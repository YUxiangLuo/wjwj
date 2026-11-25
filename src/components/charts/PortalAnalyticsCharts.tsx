import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EChartBox } from "./EChartBox";
import { disambiguateAxisLabels } from "./axis-label";
import type { EChartsCoreOption, ExecutiveChartOption } from "./echarts-core";
import {
    CHART_FONT_FAMILY,
    buildExecutiveCategoryAxis,
    buildExecutiveGrid,
    buildExecutiveLegend,
    buildExecutiveTooltip,
    buildExecutiveValueAxis,
    getExecutiveChartTokens,
    type ExecutiveChartTokens,
} from "./echarts-theme";

export type TaskProgressStatusKey =
    | "not_started"
    | "stage1"
    | "stage2"
    | "stage3"
    | "stage4"
    | "stage5"
    | "submitted"
    | "graded"
    | "rejected";

export type TaskProgressFilterValue = "all" | "in_progress" | TaskProgressStatusKey;

export interface TaskProgressStatusMeta {
    key: TaskProgressStatusKey;
    shortLabel: string;
    label: string;
    intent: StatusBadgeIntent;
    dotClass: string;
    textClass: string;
}

export const TASK_PROGRESS_STATUS_META: readonly TaskProgressStatusMeta[] = [
    {
        key: "not_started",
        shortLabel: "未开始",
        label: "未开始",
        intent: "neutral",
        dotClass: "bg-chart-1",
        textClass: "text-muted-foreground",
    },
    {
        key: "stage1",
        shortLabel: "阶段 1",
        label: "商业问卷设计",
        intent: "info",
        dotClass: "bg-chart-3",
        textClass: "text-info",
    },
    {
        key: "stage2",
        shortLabel: "阶段 2",
        label: "首轮试投发放",
        intent: "auxiliary",
        dotClass: "bg-auxiliary",
        textClass: "text-auxiliary-strong",
    },
    {
        key: "stage3",
        shortLabel: "阶段 3",
        label: "回收质检与诊断",
        intent: "auxiliary",
        dotClass: "bg-chart-4",
        textClass: "text-auxiliary-strong",
    },
    {
        key: "stage4",
        shortLabel: "阶段 4",
        label: "调整思路与二轮投放",
        intent: "primary",
        dotClass: "bg-chart-2",
        textClass: "text-primary",
    },
    {
        key: "stage5",
        shortLabel: "阶段 5",
        label: "商务分析与决策报告",
        intent: "warning",
        dotClass: "bg-chart-5",
        textClass: "text-warning",
    },
    {
        key: "submitted",
        shortLabel: "已提交",
        label: "已提交",
        intent: "warning",
        dotClass: "bg-chart-6",
        textClass: "text-warning",
    },
    {
        key: "graded",
        shortLabel: "已批改",
        label: "已批改",
        intent: "success",
        dotClass: "bg-chart-7",
        textClass: "text-success",
    },
    {
        key: "rejected",
        shortLabel: "已驳回",
        label: "已驳回",
        intent: "destructive",
        dotClass: "bg-chart-8",
        textClass: "text-destructive",
    },
] as const;

function sanitizeCount(value: number | null | undefined): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.round(value)
        : 0;
}

function sanitizeNullableScore(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function escapeHtml(text: string): string {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function resolveStatusBucketColor(
    key: TaskProgressStatusKey,
    tokens: ExecutiveChartTokens,
): string {
    switch (key) {
        case "not_started":
            return tokens.chart1;
        case "stage1":
            return tokens.chart3;
        case "stage2":
            return tokens.auxiliary;
        case "stage3":
            return tokens.chart4;
        case "stage4":
            return tokens.chart2;
        case "stage5":
            return tokens.chart5;
        case "submitted":
            return tokens.chart6;
        case "graded":
            return tokens.chart7;
        case "rejected":
            return tokens.chart8;
    }
}

function sanitizeRichText(value: string): string {
    return value
        .replaceAll("{", "（")
        .replaceAll("}", "）")
        .replaceAll("|", "｜");
}

function extractClickedStatusKey(params: unknown): TaskProgressStatusKey | null {
    if (!params || typeof params !== "object") return null;
    const record = params as {
        data?: unknown;
        name?: unknown;
    };
    if (record.data && typeof record.data === "object") {
        const key = (record.data as { statusKey?: unknown }).statusKey;
        if (typeof key === "string" && TASK_PROGRESS_STATUS_META.some((m) => m.key === key)) {
            return key as TaskProgressStatusKey;
        }
    }
    if (typeof record.name === "string") {
        const matched = TASK_PROGRESS_STATUS_META.find(
            (m) => m.shortLabel === record.name || m.label === record.name,
        );
        if (matched) return matched.key;
    }
    return null;
}

/* ==========================================================================
 * 1. TaskProgressDetail — 2-Card Executive Status Donut + Pipeline Bar View
 * ========================================================================== */

export interface TaskProgressExecutiveChartsProps {
    counts: Partial<Record<TaskProgressStatusKey, number>>;
    statusFilter: TaskProgressFilterValue;
    onSelectStatusFilter: (nextFilter: TaskProgressFilterValue) => void;
}

export function TaskProgressExecutiveCharts({
    counts,
    statusFilter,
    onSelectStatusFilter,
}: TaskProgressExecutiveChartsProps) {
    const tokens = getExecutiveChartTokens();

    const buckets = useMemo(() => {
        const rows = TASK_PROGRESS_STATUS_META.map((meta) => ({
            ...meta,
            count: sanitizeCount(counts[meta.key]),
            color: resolveStatusBucketColor(meta.key, tokens),
        }));
        const total = rows.reduce((sum, item) => sum + item.count, 0);
        return {
            total,
            rows: rows.map((row) => ({
                ...row,
                pct: total > 0 ? (row.count / total) * 100 : 0,
            })),
        };
    }, [counts, tokens]);

    const activeMeta = useMemo(() => {
        if (statusFilter === "all") return null;
        if (statusFilter === "in_progress") {
            const inProgressCount = buckets.rows
                .filter((row) => row.key.startsWith("stage"))
                .reduce((sum, row) => sum + row.count, 0);
            return {
                label: "实训进行中（阶段 1–5）",
                count: inProgressCount,
            };
        }
        const matched = buckets.rows.find((row) => row.key === statusFilter);
        return matched
            ? {
                label: matched.key.startsWith("stage")
                    ? `${matched.shortLabel} · ${matched.label}`
                    : matched.label,
                count: matched.count,
            }
            : null;
    }, [buckets.rows, statusFilter]);

    const toggleBucket = (key: TaskProgressStatusKey) => {
        onSelectStatusFilter(statusFilter === key ? "all" : key);
    };

    const donutOption = useMemo<ExecutiveChartOption>(() => {
        const nonZeroSlices = buckets.rows.filter((row) => row.count > 0);
        const slices =
            nonZeroSlices.length > 0
                ? nonZeroSlices.map((row) => {
                    const isSelected =
                        statusFilter === row.key
                        || (statusFilter === "in_progress" && row.key.startsWith("stage"));
                    return {
                        value: row.count,
                        name: row.key.startsWith("stage")
                            ? `${row.shortLabel} · ${row.label}`
                            : row.label,
                        statusKey: row.key,
                        pct: row.pct,
                        selected: isSelected,
                        itemStyle: {
                            color: row.color,
                            borderColor: tokens.card,
                            borderWidth: 2,
                            borderRadius: 5,
                            opacity:
                                statusFilter === "all" || isSelected ? 1 : 0.38,
                        },
                    };
                })
                : [
                    {
                        value: 1,
                        name: "暂无学生记录",
                        pct: 0,
                        itemStyle: {
                            color: tokens.border,
                            borderColor: tokens.card,
                            borderWidth: 2,
                        },
                    },
                ];

        const centerCount = activeMeta ? activeMeta.count : buckets.total;
        const centerSubLabel = activeMeta ? "当前筛选人数" : "总人数";

        return {
            animation: false,
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "item",
                    formatter: (params: unknown) => {
                        const item = params as {
                            name?: string;
                            value?: number;
                            marker?: string;
                            data?: { pct?: number; statusKey?: TaskProgressStatusKey };
                        };
                        if (!item.data?.statusKey) {
                            return "暂无学生记录";
                        }
                        const pctText = (item.data.pct ?? 0).toFixed(1);
                        const hint =
                            statusFilter === item.data.statusKey
                                ? "再次点击恢复全部学生"
                                : "点击扇区筛选该阶段学生";
                        return [
                            `<div style="font-weight:600;margin-bottom:4px;">${item.marker ?? ""}${escapeHtml(item.name ?? "")}</div>`,
                            `<div>人数：<strong>${item.value ?? 0} 人</strong>（占比 ${pctText}%）</div>`,
                            `<div style="margin-top:4px;color:${tokens.mutedForeground};">${hint}</div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            series: [
                {
                    name: "学生实验状态分布",
                    type: "pie",
                    radius: ["56%", "80%"],
                    center: ["50%", "50%"],
                    avoidLabelOverlap: true,
                    selectedMode: false,
                    label: { show: false },
                    labelLine: { show: false },
                    emphasis: {
                        scale: true,
                        scaleSize: 5,
                    },
                    data: slices,
                },
                {
                    name: "中心汇总",
                    type: "pie",
                    radius: ["0%", "0%"],
                    center: ["50%", "50%"],
                    silent: true,
                    tooltip: { show: false },
                    label: {
                        show: true,
                        position: "center",
                        formatter: `{count|${centerCount}}\n{sub|${centerSubLabel}}`,
                        rich: {
                            count: {
                                fontSize: 24,
                                fontWeight: 700,
                                lineHeight: 28,
                                color: tokens.foreground,
                                fontFamily: CHART_FONT_FAMILY,
                            },
                            sub: {
                                fontSize: 12,
                                lineHeight: 18,
                                color: tokens.mutedForeground,
                                fontFamily: CHART_FONT_FAMILY,
                            },
                        },
                    },
                    labelLine: { show: false },
                    itemStyle: { color: "transparent" },
                    data: [{ value: Math.max(1, buckets.total), name: centerSubLabel }],
                },
            ],
        };
    }, [activeMeta, buckets.rows, buckets.total, statusFilter, tokens]);

    const pipelineOption = useMemo<ExecutiveChartOption>(() => {
        const maxCount = Math.max(1, ...buckets.rows.map((row) => row.count));
        const xAxisMax = Math.max(4, Math.ceil(maxCount * 1.28));

        return {
            animation: false,
            grid: buildExecutiveGrid({
                left: 8,
                right: 20,
                top: 10,
                bottom: 8,
                containLabel: true,
            }),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "axis",
                    formatter: (params: unknown) => {
                        const first = Array.isArray(params) ? params[0] : params;
                        const row = (
                            first as {
                                data?: {
                                    statusKey?: TaskProgressStatusKey;
                                    shortLabel?: string;
                                    displayLabel?: string;
                                    count?: number;
                                    pct?: number;
                                };
                            } | undefined
                        )?.data;
                        if (!row?.statusKey) return "";
                        const fullTitle = row.statusKey.startsWith("stage")
                            ? `${row.shortLabel ?? ""} · ${row.displayLabel ?? ""}`
                            : (row.displayLabel ?? "");
                        const hint =
                            statusFilter === row.statusKey
                                ? "再次点击恢复全部状态"
                                : "点击柱条按此节点筛选名册";
                        return [
                            `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(fullTitle)}</div>`,
                            `<div>当前人数：<strong>${row.count ?? 0} 人</strong>（占全班 ${(row.pct ?? 0).toFixed(1)}%）</div>`,
                            `<div style="margin-top:4px;color:${tokens.mutedForeground};">${hint}</div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            xAxis: buildExecutiveValueAxis(
                {
                    min: 0,
                    max: xAxisMax,
                    minInterval: 1,
                    splitNumber: 4,
                },
                tokens,
            ),
            yAxis: buildExecutiveCategoryAxis(
                {
                    inverse: true,
                    data: buckets.rows.map((row) => row.shortLabel),
                    axisLabel: {
                        color: tokens.foreground,
                        fontWeight: 500,
                        hideOverlap: false,
                    },
                },
                tokens,
            ),
            series: [
                {
                    name: "各阶段学生人数",
                    type: "bar",
                    barWidth: 13,
                    showBackground: true,
                    backgroundStyle: {
                        color: tokens.muted,
                        borderRadius: 4,
                    },
                    label: {
                        show: true,
                        position: "right",
                        distance: 6,
                        color: tokens.mutedForeground,
                        fontFamily: CHART_FONT_FAMILY,
                        fontSize: 12,
                        formatter: (params: unknown) => {
                            const data = (params as { data?: { count?: number; pct?: number } })?.data;
                            const count = data?.count ?? 0;
                            const pct = Math.round(data?.pct ?? 0);
                            return `${count} 人 (${pct}%)`;
                        },
                    },
                    data: buckets.rows.map((row) => {
                        const isSelected =
                            statusFilter === row.key
                            || (statusFilter === "in_progress" && row.key.startsWith("stage"));
                        return {
                            value: row.count,
                            name: row.shortLabel,
                            statusKey: row.key,
                            shortLabel: row.shortLabel,
                            displayLabel: row.label,
                            count: row.count,
                            pct: row.pct,
                            itemStyle: {
                                color: row.color,
                                borderRadius: [0, 4, 4, 0],
                                opacity: statusFilter === "all" || isSelected ? 1 : 0.42,
                            },
                        };
                    }),
                },
            ],
        };
    }, [buckets.rows, statusFilter, tokens]);

    const srTable = (
        <table aria-label="学生实验状态分布数据表">
            <thead>
                <tr>
                    <th scope="col">阶段或状态</th>
                    <th scope="col">人数</th>
                    <th scope="col">占比</th>
                </tr>
            </thead>
            <tbody>
                {buckets.rows.map((row) => (
                    <tr key={row.key}>
                        <th scope="row">
                            {row.key.startsWith("stage") ? `${row.shortLabel} ${row.label}` : row.label}
                        </th>
                        <td>{row.count} 人</td>
                        <td>{Math.round(row.pct)}%</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <div
            id="teacher-progress-charts"
            className="mt-3 grid grid-cols-[18.5rem_minmax(0,1fr)] items-stretch gap-4"
        >
            <Card className="min-w-0 gap-3 border-border bg-card py-4">
                <CardHeader className="gap-1 border-b border-border px-4 pb-3">
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-label font-semibold text-foreground">
                            实验状态环形分布
                        </CardTitle>
                        <StatusBadge intent={activeMeta ? "primary" : "neutral"} className="tabular-nums">
                            {activeMeta ? "筛选中" : `共 ${buckets.total} 人`}
                        </StatusBadge>
                    </div>
                    <p className="text-meta text-muted-foreground">
                        点击环形扇区可联动筛选下方学生名册
                    </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col items-center justify-center px-3 py-2">
                    <EChartBox
                        option={donutOption}
                        height={212}
                        fallbackWidth={264}
                        ariaLabel="学生实验状态分布环形图"
                        testId="teacher-progress-donut-chart"
                        onChartClick={(params) => {
                            const key = extractClickedStatusKey(params);
                            if (key) toggleBucket(key);
                        }}
                        srSummary={srTable}
                    />
                    {activeMeta && (
                        <div className="mt-2 flex w-full items-center justify-between gap-2 rounded-control border border-primary-border bg-primary-muted px-3 py-1.5 text-meta">
                            <span className="truncate font-medium text-primary">
                                已筛选：{activeMeta.label}
                            </span>
                            <button
                                type="button"
                                onClick={() => onSelectStatusFilter("all")}
                                className="shrink-0 font-medium text-primary underline-offset-2 hover:underline"
                            >
                                重置
                            </button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="min-w-0 gap-3 border-border bg-card py-4">
                <CardHeader className="gap-1 border-b border-border px-4 pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-label font-semibold text-foreground">
                                五阶段实训推进管道图
                            </CardTitle>
                            <p className="mt-0.5 text-meta text-muted-foreground">
                                覆盖未开始、阶段 1–5 实训节点及提交批改状态的人数与全班占比
                            </p>
                        </div>
                        {statusFilter !== "all" && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2.5 text-meta"
                                onClick={() => onSelectStatusFilter("all")}
                            >
                                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                全部状态
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-2.5 px-4 pt-1">
                    <EChartBox
                        option={pipelineOption}
                        height={216}
                        fallbackWidth={520}
                        ariaLabel="各阶段人数与占比管道柱状图"
                        testId="teacher-progress-pipeline-chart"
                        onChartClick={(params) => {
                            const key = extractClickedStatusKey(params);
                            if (key) toggleBucket(key);
                        }}
                    />
                    <div
                        role="group"
                        aria-label="按实验阶段快速筛选"
                        className="flex flex-wrap gap-1.5 border-t border-border pt-2.5"
                    >
                        {buckets.rows.map((row) => {
                            const isActive = statusFilter === row.key;
                            const pillTitle = row.key.startsWith("stage")
                                ? `${row.shortLabel} · ${row.label}`
                                : row.label;
                            return (
                                <button
                                    key={row.key}
                                    type="button"
                                    aria-pressed={isActive}
                                    onClick={() => toggleBucket(row.key)}
                                    className={cn(
                                        "inline-flex items-center gap-1 rounded-control border px-2 py-0.5 text-meta transition-colors",
                                        isActive
                                            ? "border-primary-border bg-primary-muted font-medium text-primary"
                                            : "border-border bg-muted text-foreground hover:bg-card",
                                    )}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={cn("h-2 w-2 shrink-0 rounded-circle", row.dotClass)}
                                    />
                                    <span>{pillTitle}</span>
                                    <span className="font-mono tabular-nums text-muted-foreground">
                                        {row.count} ({Math.round(row.pct)}%)
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

/* ==========================================================================
 * 2. GradeExport — Funnel + Score Histogram w/ MarkLines + Rubric Radar/Bar
 * ========================================================================== */

export interface GradeAnalyticsFunnelInput {
    total: number;
    notStarted: number;
    inProgress: number;
    pendingGrading: number;
    graded: number;
    rejected: number;
}

export interface GradeAnalyticsScoresInput {
    count: number;
    average: number | null;
    median: number | null;
    componentAverages: {
        questionnaire: number | null;
        process: number | null;
        report: number | null;
    };
    bands: Array<{ label: string; count: number }>;
}

export function GradeSubmissionFunnelCard({
    funnel,
}: {
    funnel: GradeAnalyticsFunnelInput;
}) {
    const tokens = getExecutiveChartTokens();

    const metrics = useMemo(() => {
        const notStarted = sanitizeCount(funnel.notStarted);
        const inProgress = sanitizeCount(funnel.inProgress);
        const pendingGrading = sanitizeCount(funnel.pendingGrading);
        const graded = sanitizeCount(funnel.graded);
        const rejected = sanitizeCount(funnel.rejected);
        const computedTotal = notStarted + inProgress + pendingGrading + graded + rejected;
        const total = Math.max(sanitizeCount(funnel.total), computedTotal);

        const started = inProgress + pendingGrading + graded + rejected;
        const submittedTotal = pendingGrading + graded + rejected;

        const stages = [
            {
                name: "应交任务人次",
                value: total,
                overallPct: total > 0 ? 100 : 0,
                stepPct: total > 0 ? 100 : 0,
                detail: `未开始 ${notStarted} 人次 · 已进入流程 ${started} 人次`,
                color: tokens.chart2,
            },
            {
                name: "已启动实训",
                value: started,
                overallPct: total > 0 ? (started / total) * 100 : 0,
                stepPct: total > 0 ? (started / total) * 100 : 0,
                detail: `实训进行中 ${inProgress} 人次 · 已提交报告 ${submittedTotal} 人次`,
                color: tokens.chart3,
            },
            {
                name: "已提交报告",
                value: submittedTotal,
                overallPct: total > 0 ? (submittedTotal / total) * 100 : 0,
                stepPct: started > 0 ? (submittedTotal / started) * 100 : 0,
                detail: `待批改 ${pendingGrading} · 已批改 ${graded} · 已驳回 ${rejected}`,
                color: tokens.chart5,
            },
            {
                name: "已批改归档",
                value: graded,
                overallPct: total > 0 ? (graded / total) * 100 : 0,
                stepPct: submittedTotal > 0 ? (graded / submittedTotal) * 100 : 0,
                detail: `占已提交报告 ${submittedTotal > 0 ? ((graded / submittedTotal) * 100).toFixed(1) : "0.0"}%`,
                color: tokens.chart7,
            },
        ];

        const statusBreakdown = [
            { label: "未开始", count: notStarted, dotClass: "bg-chart-1" },
            { label: "进行中", count: inProgress, dotClass: "bg-chart-2" },
            { label: "待批改", count: pendingGrading, dotClass: "bg-chart-6" },
            { label: "已批改", count: graded, dotClass: "bg-chart-7" },
            { label: "已驳回", count: rejected, dotClass: "bg-chart-8" },
        ];

        return { total, stages, statusBreakdown };
    }, [funnel, tokens]);

    const funnelOption = useMemo<ExecutiveChartOption>(() => {
        const safeMax = Math.max(1, metrics.total);
        return {
            animation: false,
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "item",
                    formatter: (params: unknown) => {
                        const data = (
                            params as {
                                marker?: string;
                                data?: (typeof metrics.stages)[number];
                            }
                        )?.data;
                        if (!data) return "";
                        return [
                            `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(data.name)}</div>`,
                            `<div>累计规模：<strong>${data.value} 人次</strong></div>`,
                            `<div>占应交总人次：<strong>${data.overallPct.toFixed(1)}%</strong> · 环节转化率：<strong>${data.stepPct.toFixed(1)}%</strong></div>`,
                            `<div style="margin-top:4px;color:${tokens.mutedForeground};">${escapeHtml(data.detail)}</div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            series: [
                {
                    name: "学生任务状态转化漏斗",
                    type: "funnel",
                    left: "4%",
                    top: 12,
                    bottom: 12,
                    width: "54%",
                    min: 0,
                    max: safeMax,
                    minSize: "24%",
                    maxSize: "96%",
                    sort: "none",
                    gap: 4,
                    label: {
                        show: true,
                        position: "right",
                        color: tokens.foreground,
                        fontFamily: CHART_FONT_FAMILY,
                        fontSize: 12,
                        formatter: (params: unknown) => {
                            const data = (
                                params as { data?: (typeof metrics.stages)[number] }
                            )?.data;
                            if (!data) return "";
                            return `${data.name}  ${data.value} (${Math.round(data.overallPct)}%)`;
                        },
                    },
                    labelLine: {
                        show: true,
                        length: 10,
                        lineStyle: {
                            color: tokens.border,
                            width: 1,
                        },
                    },
                    itemStyle: {
                        borderColor: tokens.card,
                        borderWidth: 1.5,
                    },
                    data: metrics.stages.map((stage) => ({
                        ...stage,
                        itemStyle: {
                            color: stage.color,
                        },
                    })),
                },
            ],
        };
    }, [metrics.stages, metrics.total, tokens]);

    return (
        <Card className="min-w-0">
            <CardHeader className="border-b border-border pb-4">
                <CardTitle className="text-body text-foreground">学生任务状态漏斗</CardTitle>
                <p className="mt-1 text-meta text-muted-foreground">
                    同一学生参与多个实验任务时按多个人次计算，展示实训启动、提交与批改转化率。
                </p>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
                <EChartBox
                    option={funnelOption}
                    height={224}
                    fallbackWidth={420}
                    ariaLabel="学生任务状态转化漏斗图"
                    testId="teacher-grade-funnel-chart"
                    srSummary={
                        <table aria-label="学生任务状态漏斗摘要表">
                            <thead>
                                <tr>
                                    <th scope="col">转化环节</th>
                                    <th scope="col">人次</th>
                                    <th scope="col">占总人次比例</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.stages.map((stage) => (
                                    <tr key={stage.name}>
                                        <th scope="row">{stage.name}</th>
                                        <td>{stage.value}</td>
                                        <td>{stage.overallPct.toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    }
                />
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    {metrics.statusBreakdown.map((item) => (
                        <div
                            key={item.label}
                            className="inline-flex items-center gap-1.5 rounded-control bg-muted px-2.5 py-1 text-meta"
                        >
                            <span
                                aria-hidden="true"
                                className={cn("h-2 w-2 shrink-0 rounded-circle", item.dotClass)}
                            />
                            <span className="text-muted-foreground">{item.label}</span>
                            <span className="font-mono font-medium tabular-nums text-foreground">
                                {item.count}
                            </span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function mapScoreToHistogramAxis(score: number): number {
    const clamped = Math.max(0, Math.min(100, score));
    if (clamped < 60) {
        return 50 + (clamped / 60) * 10;
    }
    return clamped;
}

export function resolveHistogramMarkLineAlign(
    score: number,
): "left" | "center" | "right" {
    if (score > 93) return "right";
    if (score < 55) return "left";
    return "center";
}

export function GradeScoreHistogramCard({
    scores,
}: {
    scores: GradeAnalyticsScoresInput;
}) {
    const tokens = getExecutiveChartTokens();

    const normalizedBands = useMemo(() => {
        const defaultLabels = ["<60", "60–69", "70–79", "80–89", "90–100"];
        const source =
            scores.bands.length > 0
                ? scores.bands
                : defaultLabels.map((label) => ({ label, count: 0 }));
        const bandColors = [
            tokens.chart8,
            tokens.chart5,
            tokens.chart3,
            tokens.chart2,
            tokens.chart7,
        ];
        const gradedCount = Math.max(
            sanitizeCount(scores.count),
            source.reduce((sum, item) => sum + sanitizeCount(item.count), 0),
        );
        return {
            gradedCount,
            rows: source.map((item, idx) => {
                const count = sanitizeCount(item.count);
                return {
                    label: item.label,
                    count,
                    pct: gradedCount > 0 ? (count / gradedCount) * 100 : 0,
                    color: bandColors[idx % bandColors.length]!,
                };
            }),
        };
    }, [scores.bands, scores.count, tokens]);

    const average = sanitizeNullableScore(scores.average);
    const median = sanitizeNullableScore(scores.median);

    const histogramOption = useMemo<EChartsCoreOption>(() => {
        const maxBandCount = Math.max(0, ...normalizedBands.rows.map((item) => item.count));
        const yMax = Math.max(4, Math.ceil(maxBandCount * 1.25));

        const markLines: Array<Record<string, unknown>> = [];
        const bothPresent = average !== null && median !== null;
        const nearlyIdentical = bothPresent && Math.abs(average - median) < 0.1;
        const closeTogether =
            bothPresent
            && !nearlyIdentical
            && Math.abs(mapScoreToHistogramAxis(average) - mapScoreToHistogramAxis(median)) < 15;

        if (nearlyIdentical && average !== null) {
            markLines.push({
                name: "均值与中位数",
                xAxis: mapScoreToHistogramAxis(average),
                lineStyle: {
                    color: tokens.primary,
                    width: 1.75,
                    type: "dashed",
                },
                label: {
                    show: true,
                    position: "end",
                    distance: 4,
                    rotate: 0,
                    align: resolveHistogramMarkLineAlign(average),
                    color: tokens.primary,
                    fontFamily: CHART_FONT_FAMILY,
                    fontSize: 12,
                    fontWeight: 600,
                    formatter: `均值/中位 ${average.toFixed(1)}`,
                },
            });
        } else {
            if (average !== null) {
                markLines.push({
                    name: "总分均值",
                    xAxis: mapScoreToHistogramAxis(average),
                    lineStyle: {
                        color: tokens.primary,
                        width: 1.75,
                        type: "dashed",
                    },
                    label: {
                        show: true,
                        position: "end",
                        distance: closeTogether ? 20 : 4,
                        rotate: 0,
                        align: resolveHistogramMarkLineAlign(average),
                        color: tokens.primary,
                        fontFamily: CHART_FONT_FAMILY,
                        fontSize: 12,
                        fontWeight: 600,
                        formatter: `均值 ${average.toFixed(1)}`,
                    },
                });
            }
            if (median !== null) {
                markLines.push({
                    name: "总分中位数",
                    xAxis: mapScoreToHistogramAxis(median),
                    lineStyle: {
                        color: tokens.auxiliary,
                        width: 1.75,
                        type: "dashed",
                    },
                    label: {
                        show: true,
                        position: "end",
                        distance: 4,
                        rotate: 0,
                        align: resolveHistogramMarkLineAlign(median),
                        color: tokens.auxiliaryStrong,
                        fontFamily: CHART_FONT_FAMILY,
                        fontSize: 12,
                        fontWeight: 600,
                        formatter: `中位 ${median.toFixed(1)}`,
                    },
                });
            }
        }

        return {
            animation: false,
            grid: buildExecutiveGrid({
                left: 10,
                right: 16,
                top: closeTogether ? 46 : 30,
                bottom: 8,
                containLabel: true,
            }),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "axis",
                    formatter: (params: unknown) => {
                        const list = Array.isArray(params) ? params : [params];
                        const barItem = list.find(
                            (entry) =>
                                (entry as { seriesName?: string })?.seriesName === "总分区间分布",
                        ) as
                            | { data?: (typeof normalizedBands.rows)[number] }
                            | undefined;
                        const row = barItem?.data;
                        if (!row) return "";
                        const lines = [
                            `<div style="font-weight:600;margin-bottom:4px;">分数段：${escapeHtml(row.label)} 分</div>`,
                            `<div>已批改份数：<strong>${row.count} 份</strong>（占比 ${row.pct.toFixed(1)}%）</div>`,
                        ];
                        if (average !== null || median !== null) {
                            const summaryParts: string[] = [];
                            if (average !== null) summaryParts.push(`均值 ${average.toFixed(1)}`);
                            if (median !== null) summaryParts.push(`中位数 ${median.toFixed(1)}`);
                            lines.push(
                                `<div style="margin-top:4px;color:${tokens.mutedForeground};">${summaryParts.join(" · ")}</div>`,
                            );
                        }
                        return lines.join("");
                    },
                },
                tokens,
            ),
            xAxis: [
                buildExecutiveCategoryAxis(
                    {
                        data: normalizedBands.rows.map((row) => row.label),
                        axisLabel: {
                            hideOverlap: false,
                        },
                    },
                    tokens,
                ),
                {
                    type: "value",
                    min: 50,
                    max: 100,
                    show: false,
                },
            ],
            yAxis: buildExecutiveValueAxis(
                {
                    min: 0,
                    max: yMax,
                    minInterval: 1,
                    splitNumber: 4,
                },
                tokens,
            ),
            series: [
                {
                    name: "总分区间分布",
                    type: "bar",
                    xAxisIndex: 0,
                    barMaxWidth: 38,
                    label: {
                        show: true,
                        position: "top",
                        distance: 4,
                        color: tokens.mutedForeground,
                        fontFamily: CHART_FONT_FAMILY,
                        fontSize: 12,
                        formatter: "{c}",
                    },
                    data: normalizedBands.rows.map((row) => ({
                        ...row,
                        value: row.count,
                        itemStyle: {
                            color: row.color,
                            borderRadius: [6, 6, 0, 0],
                        },
                    })),
                },
                {
                    name: "均值与中位数基准线",
                    type: "line",
                    xAxisIndex: 1,
                    data: [],
                    silent: true,
                    tooltip: { show: false },
                    markLine: {
                        silent: true,
                        symbol: ["none", "none"],
                        data: markLines,
                    },
                },
            ],
        };
    }, [average, median, normalizedBands.rows, tokens]);

    return (
        <Card className="min-w-0">
            <CardHeader className="border-b border-border pb-4">
                <CardTitle className="text-body text-foreground">已批改总分分布</CardTitle>
                <p className="mt-1 text-meta text-muted-foreground">
                    共 {normalizedBands.gradedCount} 个已批改成绩，虚线标示总分均值与中位数参考线。
                </p>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
                <EChartBox
                    option={histogramOption}
                    height={224}
                    fallbackWidth={420}
                    ariaLabel="已批改总分分布直方图"
                    testId="teacher-grade-score-histogram"
                    srSummary={
                        <table aria-label="已批改总分分布摘要表">
                            <thead>
                                <tr>
                                    <th scope="col">分数区间</th>
                                    <th scope="col">人数</th>
                                </tr>
                            </thead>
                            <tbody>
                                {normalizedBands.rows.map((row) => (
                                    <tr key={row.label}>
                                        <th scope="row">{row.label}</th>
                                        <td>{row.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    }
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-meta">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 text-foreground">
                            <span
                                aria-hidden="true"
                                className="h-0.5 w-3.5 border-t-2 border-dashed border-primary"
                            />
                            <span className="text-muted-foreground">总分均值</span>
                            <span className="font-mono font-medium tabular-nums">
                                {average === null ? "暂无" : `${average.toFixed(1)} 分`}
                            </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-foreground">
                            <span
                                aria-hidden="true"
                                className="h-0.5 w-3.5 border-t-2 border-dashed border-auxiliary"
                            />
                            <span className="text-muted-foreground">总分中位数</span>
                            <span className="font-mono font-medium tabular-nums">
                                {median === null ? "暂无" : `${median.toFixed(1)} 分`}
                            </span>
                        </span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">
                        样本量 n = {normalizedBands.gradedCount}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

export function GradeRubricRadarBarCard({
    scores,
}: {
    scores: GradeAnalyticsScoresInput;
}) {
    const tokens = getExecutiveChartTokens();

    const dimensions = useMemo(() => {
        const items = [
            {
                key: "questionnaire",
                label: "问卷设计",
                value: sanitizeNullableScore(scores.componentAverages.questionnaire),
                color: tokens.chart2,
                dotClass: "bg-chart-2",
            },
            {
                key: "process",
                label: "实验过程",
                value: sanitizeNullableScore(scores.componentAverages.process),
                color: tokens.chart3,
                dotClass: "bg-chart-3",
            },
            {
                key: "report",
                label: "实验报告",
                value: sanitizeNullableScore(scores.componentAverages.report),
                color: tokens.chart4,
                dotClass: "bg-chart-4",
            },
        ];
        const hasAnyScore = items.some((item) => item.value !== null);
        return { items, hasAnyScore };
    }, [
        scores.componentAverages.process,
        scores.componentAverages.questionnaire,
        scores.componentAverages.report,
        tokens,
    ]);

    const overallAverage = sanitizeNullableScore(scores.average);

    const radarOption = useMemo<ExecutiveChartOption>(() => {
        return {
            animation: false,
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "item",
                    formatter: () => {
                        if (!dimensions.hasAnyScore) {
                            return "暂无已批改分项成绩";
                        }
                        return [
                            `<div style="font-weight:600;margin-bottom:4px;">三维分项平均表现</div>`,
                            ...dimensions.items.map(
                                (item) =>
                                    `<div>${escapeHtml(item.label)}：<strong>${
                                        item.value === null ? "暂无评分" : `${item.value.toFixed(1)} 分`
                                    }</strong></div>`,
                            ),
                        ].join("");
                    },
                },
                tokens,
            ),
            legend: dimensions.hasAnyScore
                ? buildExecutiveLegend(
                    {
                        top: 0,
                        right: 0,
                        data: ["分项均分", "良好基准 (80)"],
                    },
                    tokens,
                )
                : undefined,
            radar: {
                center: ["50%", "57%"],
                radius: "60%",
                splitNumber: 4,
                indicator: dimensions.items.map((item) => ({
                    name: item.label,
                    max: 100,
                })),
                axisName: {
                    color: tokens.foreground,
                    fontFamily: CHART_FONT_FAMILY,
                    fontSize: 12,
                    fontWeight: 500,
                },
                splitLine: {
                    lineStyle: {
                        color: tokens.border,
                        width: 1,
                    },
                },
                splitArea: {
                    areaStyle: {
                        color: [tokens.card, tokens.muted],
                    },
                },
                axisLine: {
                    lineStyle: {
                        color: tokens.border,
                    },
                },
            },
            series: [
                {
                    name: "三维评分雷达",
                    type: "radar",
                    symbol: "circle",
                    symbolSize: 6,
                    data: dimensions.hasAnyScore
                        ? [
                            {
                                name: "分项均分",
                                value: dimensions.items.map((item) => item.value ?? 0),
                                lineStyle: {
                                    color: tokens.primary,
                                    width: 2,
                                },
                                itemStyle: {
                                    color: tokens.primary,
                                },
                                areaStyle: {
                                    color: tokens.primary,
                                    opacity: 0.14,
                                },
                            },
                            {
                                name: "良好基准 (80)",
                                value: [80, 80, 80],
                                symbol: "none",
                                lineStyle: {
                                    color: tokens.chart1,
                                    width: 1.25,
                                    type: "dashed",
                                },
                                itemStyle: {
                                    color: tokens.chart1,
                                },
                            },
                        ]
                        : [],
                },
            ],
        };
    }, [dimensions.hasAnyScore, dimensions.items, tokens]);

    const barOption = useMemo<ExecutiveChartOption>(() => {
        return {
            animation: false,
            grid: buildExecutiveGrid({
                left: 10,
                right: 64,
                top: 30,
                bottom: 8,
                containLabel: true,
            }),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "axis",
                    formatter: (params: unknown) => {
                        const first = Array.isArray(params) ? params[0] : params;
                        const row = (
                            first as { data?: { displayLabel?: string; rawScore?: number | null } } | undefined
                        )?.data;
                        if (!row) return "";
                        return [
                            `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(row.displayLabel ?? "")}</div>`,
                            `<div>平均得分：<strong>${
                                row.rawScore === null || row.rawScore === undefined
                                    ? "暂无已批改数据"
                                    : `${row.rawScore.toFixed(1)} 分`
                            }</strong></div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            xAxis: buildExecutiveValueAxis(
                {
                    min: 0,
                    max: 100,
                    splitNumber: 5,
                },
                tokens,
            ),
            yAxis: buildExecutiveCategoryAxis(
                {
                    inverse: true,
                    data: dimensions.items.map((item) => item.label),
                    axisLabel: {
                        color: tokens.foreground,
                        fontWeight: 500,
                        hideOverlap: false,
                    },
                },
                tokens,
            ),
            series: [
                {
                    name: "分项平均得分",
                    type: "bar",
                    z: 4,
                    barWidth: 16,
                    showBackground: true,
                    backgroundStyle: {
                        color: tokens.muted,
                        borderRadius: 6,
                    },
                    label: {
                        show: dimensions.hasAnyScore,
                        position: "right",
                        distance: 6,
                        backgroundColor: tokens.card,
                        padding: [2, 5],
                        borderRadius: 4,
                        color: tokens.foreground,
                        fontFamily: CHART_FONT_FAMILY,
                        fontSize: 12,
                        fontWeight: 600,
                        formatter: (params: unknown) => {
                            const rawScore = (
                                params as { data?: { rawScore?: number | null } }
                            )?.data?.rawScore;
                            return typeof rawScore === "number"
                                ? `${rawScore.toFixed(1)} 分`
                                : "";
                        },
                    },
                    data: dimensions.items.map((item) => ({
                        value: item.value ?? 0,
                        rawScore: item.value,
                        displayLabel: item.label,
                        itemStyle: {
                            color: item.value === null ? "transparent" : item.color,
                            borderRadius: [0, 6, 6, 0],
                        },
                    })),
                    markLine:
                        overallAverage !== null
                            ? {
                                z: 2,
                                silent: true,
                                symbol: ["none", "none"],
                                lineStyle: {
                                    color: tokens.primary,
                                    width: 1.5,
                                    type: "dashed",
                                },
                                label: {
                                    show: true,
                                    position: "start",
                                    distance: 6,
                                    align:
                                        overallAverage > 92
                                            ? "right"
                                            : overallAverage < 10
                                                ? "left"
                                                : "center",
                                    color: tokens.primary,
                                    fontFamily: CHART_FONT_FAMILY,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    formatter: `总均分 ${overallAverage.toFixed(1)}`,
                                },
                                data: [{ xAxis: overallAverage }],
                            }
                            : undefined,
                },
            ],
        };
    }, [dimensions.hasAnyScore, dimensions.items, overallAverage, tokens]);

    /*
     * Keep `<Card> -> <CardHeader> -> <CardTitle>分项平均分</CardTitle>` structure intact
     * and render exact `"—"` only inside the 3 visible summary tiles when component
     * scores are null (never `"0.0 分"`).
     */
    return (
        <Card>
            <CardHeader className="border-b border-border pb-4">
                <CardTitle className="text-body text-foreground">分项平均分</CardTitle>
                <p className="mt-1 text-meta text-muted-foreground">
                    仅统计已批改记录中的问卷设计、实验过程和实验报告三维评分表现（百分制口径）。
                </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-3 gap-3" role="list" aria-label="分项平均分指标汇总">
                    {dimensions.items.map((item) => (
                        <div
                            key={item.key}
                            role="listitem"
                            className="flex items-center justify-between gap-2 rounded-control border border-border bg-muted px-3.5 py-2.5"
                        >
                            <span className="inline-flex items-center gap-2 text-label font-medium text-foreground">
                                <span
                                    aria-hidden="true"
                                    className={cn("h-2.5 w-2.5 shrink-0 rounded-circle", item.dotClass)}
                                />
                                {item.label}
                            </span>
                            <span className="font-mono text-label font-semibold tabular-nums text-foreground">
                                {item.value === null ? "—" : `${item.value.toFixed(1)} 分`}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-2 items-center gap-4">
                    <EChartBox
                        option={radarOption}
                        height={228}
                        fallbackWidth={360}
                        ariaLabel="三维评分结构雷达图"
                        testId="teacher-grade-rubric-radar"
                        srSummary={
                            <table aria-label="三维评分雷达摘要表">
                                <thead>
                                    <tr>
                                        <th scope="col">评分维度</th>
                                        <th scope="col">分项均分</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dimensions.items.map((item) => (
                                        <tr key={item.key}>
                                            <th scope="row">{item.label}</th>
                                            <td>
                                                {item.value === null
                                                    ? "暂无评分"
                                                    : `${item.value.toFixed(1)} 分`}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        }
                    />
                    <EChartBox
                        option={barOption}
                        height={228}
                        fallbackWidth={380}
                        ariaLabel="三维评分分项柱状对比图"
                        testId="teacher-grade-rubric-bars"
                    />
                </div>
            </CardContent>
        </Card>
    );
}

/* ==========================================================================
 * 3. Teacher/Dashboard — Active Tasks Student Progression Structure Chart
 * ========================================================================== */

export interface ActiveTaskChartItem {
    id: number;
    templateName: string;
    className: string;
    deadline: string | null;
    total: number;
    completed: number;
    pending: number;
    rejected: number;
}

export function TeacherActiveTasksStructureCard({
    activeTasks,
    onSelectTask,
}: {
    activeTasks: readonly ActiveTaskChartItem[];
    onSelectTask?: (taskId: number) => void;
}) {
    const [mode, setMode] = useState<"percent" | "count">("percent");
    const tokens = getExecutiveChartTokens();

    const rows = useMemo(() => {
        const topicAxisLabels = disambiguateAxisLabels(
            activeTasks.map((task) => task.templateName),
            14,
        );
        const classAxisLabels = disambiguateAxisLabels(
            activeTasks.map((task) => task.className),
            14,
        );
        return activeTasks.map((task, idx) => {
            const total = sanitizeCount(task.total);
            const completed = sanitizeCount(task.completed);
            const pending = Math.min(completed, sanitizeCount(task.pending));
            const graded = Math.max(0, completed - pending);
            const rejected = sanitizeCount(task.rejected);
            const inProgressOrNotStarted = Math.max(0, total - completed - rejected);

            const safeDenom = total > 0 ? total : 1;
            const topicAxisLabel = topicAxisLabels[idx] ?? task.templateName;
            const classAxisLabel = classAxisLabels[idx] ?? task.className;
            return {
                id: task.id,
                templateName: task.templateName,
                className: task.className,
                topicAxisLabel,
                classAxisLabel,
                axisLabel: `${topicAxisLabel} · ${classAxisLabel}`,
                total,
                graded,
                pending,
                rejected,
                inProgressOrNotStarted,
                gradedPct: total > 0 ? (graded / safeDenom) * 100 : 0,
                pendingPct: total > 0 ? (pending / safeDenom) * 100 : 0,
                rejectedPct: total > 0 ? (rejected / safeDenom) * 100 : 0,
                activePct: total > 0 ? (inProgressOrNotStarted / safeDenom) * 100 : 0,
            };
        });
    }, [activeTasks]);

    const chartHeight = Math.max(220, rows.length * 52 + 68);

    const option = useMemo<ExecutiveChartOption>(() => {
        const isPercent = mode === "percent";
        const seriesDefs = [
            {
                name: "已批改完成",
                color: tokens.chart7,
                getValue: (r: (typeof rows)[number]) => (isPercent ? Number(r.gradedPct.toFixed(1)) : r.graded),
                getRaw: (r: (typeof rows)[number]) => r.graded,
                getPct: (r: (typeof rows)[number]) => r.gradedPct,
            },
            {
                name: "待批改提交",
                color: tokens.chart5,
                getValue: (r: (typeof rows)[number]) => (isPercent ? Number(r.pendingPct.toFixed(1)) : r.pending),
                getRaw: (r: (typeof rows)[number]) => r.pending,
                getPct: (r: (typeof rows)[number]) => r.pendingPct,
            },
            {
                name: "退回重做",
                color: tokens.chart8,
                getValue: (r: (typeof rows)[number]) => (isPercent ? Number(r.rejectedPct.toFixed(1)) : r.rejected),
                getRaw: (r: (typeof rows)[number]) => r.rejected,
                getPct: (r: (typeof rows)[number]) => r.rejectedPct,
            },
            {
                name: "进行中/未交",
                color: tokens.chart3,
                getValue: (r: (typeof rows)[number]) =>
                    isPercent ? Number(r.activePct.toFixed(1)) : r.inProgressOrNotStarted,
                getRaw: (r: (typeof rows)[number]) => r.inProgressOrNotStarted,
                getPct: (r: (typeof rows)[number]) => r.activePct,
            },
        ];

        return {
            animation: false,
            grid: buildExecutiveGrid({
                left: 12,
                right: 20,
                top: 38,
                bottom: 8,
                containLabel: true,
            }),
            legend: buildExecutiveLegend(
                {
                    top: 2,
                    right: 4,
                    data: seriesDefs.map((s) => s.name),
                },
                tokens,
            ),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "axis",
                    formatter: (params: unknown) => {
                        const items = Array.isArray(params) ? params : [params];
                        const firstData = (
                            items[0] as { data?: { rowIndex?: number } } | undefined
                        )?.data;
                        const row =
                            typeof firstData?.rowIndex === "number"
                                ? rows[firstData.rowIndex]
                                : undefined;
                        if (!row) return "";
                        return [
                            `<div style="font-weight:600;margin-bottom:2px;">${escapeHtml(row.templateName)}</div>`,
                            `<div style="color:${tokens.mutedForeground};margin-bottom:6px;">${escapeHtml(row.className)} · 共 ${row.total} 名学生</div>`,
                            `<div>已批改完成：<strong>${row.graded} 人</strong>（${row.gradedPct.toFixed(1)}%）</div>`,
                            `<div>待批改提交：<strong>${row.pending} 人</strong>（${row.pendingPct.toFixed(1)}%）</div>`,
                            `<div>退回重做：<strong>${row.rejected} 人</strong>（${row.rejectedPct.toFixed(1)}%）</div>`,
                            `<div>进行中/未交：<strong>${row.inProgressOrNotStarted} 人</strong>（${row.activePct.toFixed(1)}%）</div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            xAxis: buildExecutiveValueAxis(
                isPercent
                    ? {
                        min: 0,
                        max: 100,
                        axisLabel: {
                            formatter: "{value}%",
                        },
                    }
                    : {
                        min: 0,
                        minInterval: 1,
                    },
                tokens,
            ),
            yAxis: buildExecutiveCategoryAxis(
                {
                    inverse: true,
                    data: rows.map((_, idx) => String(idx)),
                    axisLabel: {
                        color: tokens.foreground,
                        fontWeight: 500,
                        hideOverlap: false,
                        formatter: (val: string) => {
                            const row = rows[Number(val)];
                            if (!row) return "";
                            return `{topic|${sanitizeRichText(row.topicAxisLabel)}}\n{cls|${sanitizeRichText(row.classAxisLabel)}}`;
                        },
                        rich: {
                            topic: {
                                color: tokens.foreground,
                                fontFamily: CHART_FONT_FAMILY,
                                fontSize: 12,
                                fontWeight: 500,
                                lineHeight: 17,
                                align: "right",
                            },
                            cls: {
                                color: tokens.mutedForeground,
                                fontFamily: CHART_FONT_FAMILY,
                                fontSize: 11,
                                fontWeight: 400,
                                lineHeight: 15,
                                align: "right",
                            },
                        },
                    },
                },
                tokens,
            ),
            series: seriesDefs.map((def) => ({
                name: def.name,
                type: "bar" as const,
                stack: "task-structure",
                barMaxWidth: 22,
                itemStyle: {
                    color: def.color,
                },
                label: {
                    show: true,
                    position: "inside" as const,
                    color: "#ffffff",
                    fontFamily: CHART_FONT_FAMILY,
                    fontSize: 12,
                    fontWeight: 600,
                    formatter: (params: unknown) => {
                        const d = (
                            params as { data?: { pct?: number; rawCount?: number } }
                        )?.data;
                        const pct = d?.pct ?? 0;
                        const raw = d?.rawCount ?? 0;
                        if (raw <= 0 || pct < 12) return "";
                        return isPercent ? `${Math.round(pct)}%` : `${raw}`;
                    },
                },
                data: rows.map((row, rowIndex) => ({
                    value: def.getValue(row),
                    rawCount: def.getRaw(row),
                    pct: def.getPct(row),
                    taskId: row.id,
                    rowIndex,
                })),
            })),
        };
    }, [mode, rows, tokens]);

    if (rows.length === 0) return null;

    return (
        <Card className="border-border bg-card" data-testid="teacher-dashboard-tasks-chart">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                    <CardTitle className="text-section-title text-foreground">
                        活跃任务学生推进结构图
                    </CardTitle>
                    <p className="mt-1 text-meta text-muted-foreground">
                        横向对比各活动任务中已批改、待批改、退回重做及进行中学生的构成比例（点击柱条进入任务详情）
                    </p>
                </div>
                <div
                    role="group"
                    aria-label="切换活跃任务图表口径"
                    className="inline-flex rounded-control border border-border bg-muted p-0.5"
                >
                    <button
                        type="button"
                        aria-pressed={mode === "percent"}
                        onClick={() => setMode("percent")}
                        className={cn(
                            "rounded-control px-3 py-1 text-meta font-medium transition-colors",
                            mode === "percent"
                                ? "bg-card text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        100% 占比结构
                    </button>
                    <button
                        type="button"
                        aria-pressed={mode === "count"}
                        onClick={() => setMode("count")}
                        className={cn(
                            "rounded-control px-3 py-1 text-meta font-medium transition-colors",
                            mode === "count"
                                ? "bg-card text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        学生人数对比
                    </button>
                </div>
            </CardHeader>
            <CardContent className="pt-4">
                <EChartBox
                    option={option}
                    height={chartHeight}
                    fallbackWidth={720}
                    ariaLabel="活跃任务学生推进结构堆叠柱状图"
                    testId="teacher-dashboard-tasks-echart"
                    onChartClick={(params) => {
                        if (!onSelectTask || !params || typeof params !== "object") return;
                        const taskId = (
                            params as { data?: { taskId?: unknown } }
                        ).data?.taskId;
                        if (typeof taskId === "number" && Number.isInteger(taskId) && taskId > 0) {
                            onSelectTask(taskId);
                        }
                    }}
                    srSummary={
                        <table aria-label="活跃任务学生推进结构摘要表">
                            <thead>
                                <tr>
                                    <th scope="col">任务与班级</th>
                                    <th scope="col">总人数</th>
                                    <th scope="col">已批改</th>
                                    <th scope="col">待批改</th>
                                    <th scope="col">退回重做</th>
                                    <th scope="col">进行中或未开始</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.id}>
                                        <th scope="row">
                                            {row.templateName}（{row.className}）
                                        </th>
                                        <td>{row.total}</td>
                                        <td>{row.graded}</td>
                                        <td>{row.pending}</td>
                                        <td>{row.rejected}</td>
                                        <td>{row.inProgressOrNotStarted}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    }
                />
            </CardContent>
        </Card>
    );
}

/* ==========================================================================
 * 4. Admin/Dashboard — Platform Teaching Resource & Operational Overview Row
 * ========================================================================== */

export interface AdminPlatformStatsInput {
    currentSemester: string;
    teacherCount: number;
    classCount: number;
    studentCount: number;
    pendingItems: number;
}

function computeNiceIntegerAxisScale(rawMax: number, targetSplits = 5): { max: number; interval: number } {
    const safeMax = Math.max(4, Math.ceil(rawMax));
    const roughStep = safeMax / targetSplits;
    const pow10 = 10 ** Math.floor(Math.log10(Math.max(1, roughStep)));
    const fraction = roughStep / pow10;
    let niceFraction: number;
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 2.5 && pow10 >= 10) niceFraction = 2.5;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
    const interval = Math.max(1, Math.round(niceFraction * pow10));
    const max = Math.ceil(safeMax / interval) * interval;
    return { max, interval };
}

export function AdminPlatformOverviewCharts({
    stats,
}: {
    stats: AdminPlatformStatsInput;
}) {
    const tokens = getExecutiveChartTokens();

    const normalized = useMemo(() => {
        const teacherCount = sanitizeCount(stats.teacherCount);
        const classCount = sanitizeCount(stats.classCount);
        const studentCount = sanitizeCount(stats.studentCount);
        const pendingItems = sanitizeCount(stats.pendingItems);
        const totalAccounts = teacherCount + studentCount;

        const avgClassSize =
            classCount > 0 ? `${(studentCount / classCount).toFixed(1)} 人/班` : "—";
        const studentTeacherRatio =
            teacherCount > 0 ? `1 : ${(studentCount / teacherCount).toFixed(1)}` : "—";
        const pendingPerTeacher =
            teacherCount > 0 ? `${(pendingItems / teacherCount).toFixed(1)} 份/师` : "—";

        return {
            semesterLabel: stats.currentSemester?.trim() || "未设置",
            teacherCount,
            classCount,
            studentCount,
            pendingItems,
            totalAccounts,
            avgClassSize,
            studentTeacherRatio,
            pendingPerTeacher,
        };
    }, [stats]);

    const resourceScaleOption = useMemo<ExecutiveChartOption>(() => {
        const items = [
            { displayLabel: "注册实训学生", value: normalized.studentCount, unit: "人", color: tokens.chart2 },
            { displayLabel: "实验教学班级", value: normalized.classCount, unit: "个", color: tokens.chart4 },
            { displayLabel: "在册授课教师", value: normalized.teacherCount, unit: "人", color: tokens.chart3 },
            { displayLabel: "待批改提交队列", value: normalized.pendingItems, unit: "份", color: tokens.chart5 },
        ];
        const maxVal = Math.max(4, ...items.map((item) => item.value));
        const xAxisScale = computeNiceIntegerAxisScale(maxVal * 1.24);

        return {
            animation: false,
            grid: buildExecutiveGrid({
                left: 10,
                right: 64,
                top: 12,
                bottom: 8,
                containLabel: true,
            }),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "axis",
                    formatter: (params: unknown) => {
                        const first = Array.isArray(params) ? params[0] : params;
                        const row = (first as { data?: (typeof items)[number] } | undefined)?.data;
                        if (!row) return "";
                        return [
                            `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(row.displayLabel)}</div>`,
                            `<div>当前规模：<strong>${row.value} ${row.unit}</strong></div>`,
                            `<div style="margin-top:4px;color:${tokens.mutedForeground};">当前教学学期：${escapeHtml(normalized.semesterLabel)}</div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            xAxis: buildExecutiveValueAxis(
                {
                    min: 0,
                    max: xAxisScale.max,
                    interval: xAxisScale.interval,
                    minInterval: 1,
                },
                tokens,
            ),
            yAxis: buildExecutiveCategoryAxis(
                {
                    inverse: true,
                    data: items.map((item) => item.displayLabel),
                    axisLabel: {
                        color: tokens.foreground,
                        fontWeight: 500,
                        hideOverlap: false,
                    },
                },
                tokens,
            ),
            series: [
                {
                    name: "平台教学资源规模",
                    type: "bar",
                    barWidth: 16,
                    showBackground: true,
                    backgroundStyle: {
                        color: tokens.muted,
                        borderRadius: 6,
                    },
                    label: {
                        show: true,
                        position: "right",
                        distance: 8,
                        color: tokens.foreground,
                        fontFamily: CHART_FONT_FAMILY,
                        fontSize: 12,
                        fontWeight: 600,
                        formatter: (params: unknown) => {
                            const row = (params as { data?: (typeof items)[number] })?.data;
                            return row ? `${row.value} ${row.unit}` : "";
                        },
                    },
                    data: items.map((item) => ({
                        ...item,
                        itemStyle: {
                            color: item.color,
                            borderRadius: [0, 6, 6, 0],
                        },
                    })),
                },
            ],
        };
    }, [normalized, tokens]);

    const roleBreakdownOption = useMemo<ExecutiveChartOption>(() => {
        const hasAccounts = normalized.totalAccounts > 0;
        const slices = hasAccounts
            ? [
                {
                    name: "注册实训学生",
                    value: normalized.studentCount,
                    pct: (normalized.studentCount / normalized.totalAccounts) * 100,
                    itemStyle: {
                        color: tokens.chart2,
                        borderColor: tokens.card,
                        borderWidth: 2,
                        borderRadius: 5,
                    },
                },
                {
                    name: "在册授课教师",
                    value: normalized.teacherCount,
                    pct: (normalized.teacherCount / normalized.totalAccounts) * 100,
                    itemStyle: {
                        color: tokens.chart3,
                        borderColor: tokens.card,
                        borderWidth: 2,
                        borderRadius: 5,
                    },
                },
            ]
            : [
                {
                    name: "暂无注册账户",
                    value: 1,
                    pct: 0,
                    itemStyle: {
                        color: tokens.border,
                        borderColor: tokens.card,
                        borderWidth: 2,
                    },
                },
            ];

        return {
            animation: false,
            legend: buildExecutiveLegend(
                {
                    bottom: 0,
                    top: "auto",
                    left: "center",
                    right: "auto",
                    data: hasAccounts ? ["注册实训学生", "在册授课教师"] : [],
                },
                tokens,
            ),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "item",
                    formatter: (params: unknown) => {
                        const item = params as {
                            name?: string;
                            value?: number;
                            data?: { pct?: number };
                        };
                        if (!hasAccounts) return "暂无注册账户数据";
                        return [
                            `<div style="font-weight:600;margin-bottom:4px;">${escapeHtml(item.name ?? "")}</div>`,
                            `<div>账号数量：<strong>${item.value ?? 0} 人</strong>（占比 ${(item.data?.pct ?? 0).toFixed(1)}%）</div>`,
                            `<div style="margin-top:4px;color:${tokens.mutedForeground};">师生配置比：${escapeHtml(normalized.studentTeacherRatio)}</div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            series: [
                {
                    name: "平台角色账户构成",
                    type: "pie",
                    radius: ["52%", "76%"],
                    center: ["50%", "45%"],
                    label: { show: false },
                    labelLine: { show: false },
                    data: slices,
                },
                {
                    name: "账户总数",
                    type: "pie",
                    radius: ["0%", "0%"],
                    center: ["50%", "45%"],
                    silent: true,
                    tooltip: { show: false },
                    label: {
                        show: true,
                        position: "center",
                        formatter: `{count|${normalized.totalAccounts}}\n{sub|师生总账号}`,
                        rich: {
                            count: {
                                fontSize: 22,
                                fontWeight: 700,
                                lineHeight: 26,
                                color: tokens.foreground,
                                fontFamily: CHART_FONT_FAMILY,
                            },
                            sub: {
                                fontSize: 12,
                                lineHeight: 16,
                                color: tokens.mutedForeground,
                                fontFamily: CHART_FONT_FAMILY,
                            },
                        },
                    },
                    labelLine: { show: false },
                    itemStyle: { color: "transparent" },
                    data: [{ value: Math.max(1, normalized.totalAccounts), name: "师生总账号" }],
                },
            ],
        };
    }, [normalized, tokens]);

    return (
        <section
            aria-label="平台教学资源与实验运行概览"
            data-testid="admin-dashboard-analytics"
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,27rem),1fr))] gap-4"
        >
            <Card className="min-w-0 gap-3 py-4">
                <CardHeader className="border-b border-border pb-3">
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-section-title font-semibold text-foreground">
                            平台教学资源规模概览
                        </CardTitle>
                        <StatusBadge intent="primary" className="tabular-nums">
                            {normalized.semesterLabel}
                        </StatusBadge>
                    </div>
                    <p className="text-meta text-muted-foreground">
                        对比全平台在册教师、授课班级、注册学生与待批改实验负载规模
                    </p>
                </CardHeader>
                <CardContent className="space-y-3 pt-1">
                    <EChartBox
                        option={resourceScaleOption}
                        height={212}
                        fallbackWidth={420}
                        ariaLabel="平台教学资源规模横向柱状图"
                        testId="admin-dashboard-resource-chart"
                        srSummary={
                            <table aria-label="平台教学资源规模摘要表">
                                <thead>
                                    <tr>
                                        <th scope="col">指标</th>
                                        <th scope="col">数值</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <th scope="row">注册实训学生</th>
                                        <td>{normalized.studentCount} 人</td>
                                    </tr>
                                    <tr>
                                        <th scope="row">实验教学班级</th>
                                        <td>{normalized.classCount} 个</td>
                                    </tr>
                                    <tr>
                                        <th scope="row">在册授课教师</th>
                                        <td>{normalized.teacherCount} 人</td>
                                    </tr>
                                    <tr>
                                        <th scope="row">待批改提交队列</th>
                                        <td>{normalized.pendingItems} 份</td>
                                    </tr>
                                </tbody>
                            </table>
                        }
                    />
                    <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-meta">
                        <div className="rounded-control bg-muted px-3 py-2">
                            <span className="block text-muted-foreground">平均班额</span>
                            <span className="mt-0.5 block font-mono font-semibold tabular-nums text-foreground">
                                {normalized.avgClassSize}
                            </span>
                        </div>
                        <div className="rounded-control bg-muted px-3 py-2">
                            <span className="block text-muted-foreground">师生配置比</span>
                            <span className="mt-0.5 block font-mono font-semibold tabular-nums text-foreground">
                                {normalized.studentTeacherRatio}
                            </span>
                        </div>
                        <div className="rounded-control bg-muted px-3 py-2">
                            <span className="block text-muted-foreground">师均待审量</span>
                            <span className="mt-0.5 block font-mono font-semibold tabular-nums text-foreground">
                                {normalized.pendingPerTeacher}
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="min-w-0 gap-3 py-4">
                <CardHeader className="border-b border-border pb-3">
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-section-title font-semibold text-foreground">
                            角色构成与批改队列状态
                        </CardTitle>
                        <StatusBadge
                            intent={normalized.pendingItems > 0 ? "warning" : "success"}
                            className="tabular-nums"
                        >
                            {normalized.pendingItems > 0
                                ? `待审 ${normalized.pendingItems} 份`
                                : "队列已清空"}
                        </StatusBadge>
                    </div>
                    <p className="text-meta text-muted-foreground">
                        展示平台教学与实训账号角色占比及当前全校实验批改积压状态
                    </p>
                </CardHeader>
                <CardContent className="space-y-3 pt-1">
                    <EChartBox
                        option={roleBreakdownOption}
                        height={212}
                        fallbackWidth={420}
                        ariaLabel="平台角色账号构成环形图"
                        testId="admin-dashboard-role-chart"
                        srSummary={
                            <table aria-label="平台角色账号构成摘要表">
                                <thead>
                                    <tr>
                                        <th scope="col">角色</th>
                                        <th scope="col">人数</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <th scope="row">注册实训学生</th>
                                        <td>{normalized.studentCount} 人</td>
                                    </tr>
                                    <tr>
                                        <th scope="row">在册授课教师</th>
                                        <td>{normalized.teacherCount} 人</td>
                                    </tr>
                                </tbody>
                            </table>
                        }
                    />
                    <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-meta">
                        <div className="min-w-0 rounded-control bg-muted px-3 py-2">
                            <span className="block text-muted-foreground">实训学生占比</span>
                            <span className="mt-0.5 block font-mono font-semibold tabular-nums text-foreground">
                                {normalized.totalAccounts > 0
                                    ? `${((normalized.studentCount / normalized.totalAccounts) * 100).toFixed(1)}%`
                                    : "—"}
                            </span>
                        </div>
                        <div className="min-w-0 rounded-control bg-muted px-3 py-2">
                            <span className="block text-muted-foreground">待批改队列</span>
                            <span className="mt-0.5 block font-mono font-semibold tabular-nums text-foreground">
                                {normalized.pendingItems} 份
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}

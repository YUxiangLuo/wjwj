import { useMemo } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatStatistic } from "@/utils/statistic-format";
import { EChartBox } from "./EChartBox";
import type { EChartsCoreOption } from "./echarts-core";
import {
    buildExecutiveCategoryAxis,
    buildExecutiveGrid,
    buildExecutiveLegend,
    buildExecutiveTooltip,
    buildExecutiveValueAxis,
    getExecutiveChartTokens,
} from "./echarts-theme";

export interface StratumResponseRow {
    stratum: string;
    frameSharePct: number;
    invitedCount: number;
    validCount: number;
    validSharePct: number;
    responseRatePct: number;
}

function clampPercentage(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function shortenStratumLabel(label: string, maxChars = 10): string {
    const trimmed = label.trim();
    if (trimmed.length <= maxChars) return trimmed;
    return `${trimmed.slice(0, maxChars - 1)}…`;
}

export function StratumComparisonChart({
    stratumField,
    rows,
}: {
    stratumField: string;
    rows: StratumResponseRow[];
}) {
    const normalizedRows = rows.map((row) => {
        const frameSharePct = clampPercentage(row.frameSharePct);
        const validSharePct = clampPercentage(row.validSharePct);
        const invitedCount = Number.isFinite(row.invitedCount) ? Math.max(0, Math.round(row.invitedCount)) : 0;
        const validCount = Number.isFinite(row.validCount) ? Math.max(0, Math.round(row.validCount)) : 0;
        const responseRatePct = clampPercentage(row.responseRatePct);
        const diff = validSharePct - frameSharePct;
        const hasInvited = invitedCount > 0;
        const lowResponse = hasInvited && responseRatePct < 60;
        const underRepresented = diff <= -4 || lowResponse;
        const overRepresented = diff >= 4;
        return {
            stratum: row.stratum?.trim() ? row.stratum : "（未命名层）",
            frameSharePct,
            validSharePct,
            invitedCount,
            validCount,
            responseRatePct,
            diff,
            hasInvited,
            lowResponse,
            underRepresented,
            overRepresented,
        };
    });

    const maxShare = Math.max(25, ...normalizedRows.flatMap((row) => [row.frameSharePct, row.validSharePct]));
    const shareAxisMax = maxShare > 85 ? 100 : Math.min(100, Math.ceil((maxShare + 8) / 10) * 10);
    const maxAbsBias = normalizedRows.length > 0
        ? Math.max(...normalizedRows.map((row) => Math.abs(row.diff)))
        : 0;

    const composedOption = useMemo<EChartsCoreOption>(() => {
        const tokens = getExecutiveChartTokens();

        return {
            legend: buildExecutiveLegend(
                {
                    top: 0,
                    left: 0,
                    right: "auto",
                    data: ["抽样框总体占比 (%)", "质检有效回收占比 (%)", "实测有效应答率 (%)"],
                },
                tokens,
            ),
            grid: buildExecutiveGrid({
                top: 56,
                left: 12,
                right: 16,
                bottom: 12,
            }),
            tooltip: buildExecutiveTooltip(
                {
                    trigger: "axis",
                    formatter: (params: unknown) => {
                        const list = Array.isArray(params) ? params : [params];
                        const first = list[0] as { dataIndex?: number } | undefined;
                        const row = normalizedRows[first?.dataIndex ?? 0];
                        if (!row) return "";
                        const biasTag =
                            row.diff <= -4 ? "（欠代表）" : row.overRepresented ? "（超代表）" : "（结构均衡）";
                        const biasColor = Math.abs(row.diff) >= 4 ? tokens.warning : tokens.success;
                        const respText = row.hasInvited
                            ? `${formatStatistic(row.responseRatePct, 1)}%（${row.validCount}/${row.invitedCount} 份${row.lowResponse ? " · 低响应" : ""}）`
                            : `—（${row.validCount}/${row.invitedCount} 份）`;

                        return [
                            `<div style="min-width:220px;">`,
                            `<div style="font-weight:600;color:${tokens.foreground};margin-bottom:6px;">${escapeHtml(row.stratum)}</div>`,
                            `<div style="display:flex;justify-content:space-between;gap:14px;"><span>抽样框总体占比</span><strong style="color:${tokens.foreground};">${formatStatistic(row.frameSharePct, 1)}%</strong></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:14px;"><span>质检有效回收占比</span><strong style="color:${row.underRepresented ? tokens.warning : tokens.primary};">${formatStatistic(row.validSharePct, 1)}%</strong></div>`,
                            `<div style="display:flex;justify-content:space-between;gap:14px;"><span>实测有效应答率</span><strong style="color:${row.lowResponse ? tokens.warning : tokens.success};">${respText}</strong></div>`,
                            `<div style="margin-top:4px;padding-top:4px;border-top:1px dashed ${tokens.border};display:flex;justify-content:space-between;gap:14px;"><span>代表性结构偏差</span><strong style="color:${biasColor};">${row.diff >= 0 ? "+" : ""}${formatStatistic(row.diff, 1)} pp${biasTag}</strong></div>`,
                            `</div>`,
                        ].join("");
                    },
                },
                tokens,
            ),
            xAxis: buildExecutiveCategoryAxis(
                {
                    data: normalizedRows.map((row) => shortenStratumLabel(row.stratum, 10)),
                    axisLabel: {
                        color: tokens.foreground,
                        fontWeight: 500,
                        hideOverlap: true,
                    },
                },
                tokens,
            ),
            yAxis: [
                buildExecutiveValueAxis(
                    {
                        name: "结构占比 (%)",
                        min: 0,
                        max: shareAxisMax,
                        splitNumber: 4,
                        axisLabel: {
                            formatter: "{value}%",
                        },
                    },
                    tokens,
                ),
                buildExecutiveValueAxis(
                    {
                        name: "应答率 (%)",
                        nameGap: 12,
                        min: 0,
                        max: 100,
                        interval: 25,
                        splitLine: { show: false },
                        axisLabel: {
                            formatter: "{value}%",
                        },
                    },
                    tokens,
                ),
            ],
            series: [
                {
                    name: "抽样框总体占比 (%)",
                    type: "bar",
                    yAxisIndex: 0,
                    barMaxWidth: 24,
                    barGap: "18%",
                    itemStyle: {
                        color: tokens.chart1,
                        borderRadius: [4, 4, 0, 0],
                    },
                    data: normalizedRows.map((row) => Number(row.frameSharePct.toFixed(2))),
                },
                {
                    name: "质检有效回收占比 (%)",
                    type: "bar",
                    yAxisIndex: 0,
                    barMaxWidth: 24,
                    itemStyle: {
                        color: tokens.chart2,
                    },
                    data: normalizedRows.map((row) => ({
                        value: Number(row.validSharePct.toFixed(2)),
                        itemStyle: {
                            color: row.underRepresented ? tokens.chart5 : tokens.chart2,
                            borderRadius: [4, 4, 0, 0],
                        },
                    })),
                },
                {
                    name: "实测有效应答率 (%)",
                    type: "line",
                    yAxisIndex: 1,
                    smooth: 0.25,
                    symbol: "circle",
                    symbolSize: 8,
                    connectNulls: true,
                    lineStyle: {
                        color: tokens.chart7,
                        width: 2.5,
                    },
                    itemStyle: {
                        color: tokens.chart7,
                        borderColor: tokens.card,
                        borderWidth: 2,
                    },
                    data: normalizedRows.map((row) =>
                        row.hasInvited ? Number(row.responseRatePct.toFixed(2)) : null,
                    ),
                },
            ],
        };
    }, [normalizedRows, shareAxisMax]);

    return (
        <div className="rounded-surface border border-border bg-card p-5" data-testid="stratum-comparison-chart">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div className="min-w-0">
                    <h3 className="break-words text-subheading font-semibold text-foreground">
                        细分客群应答率与样本结构偏倚诊断（{stratumField || "未指定字段"}）
                    </h3>
                    <p className="text-meta text-muted-foreground">
                        双轴联动对比抽样框总体占比 vs 质检有效回收占比（左轴）与实测有效应答率（右轴）
                    </p>
                </div>
                {normalizedRows.length > 0 && (
                    <StatusBadge intent={maxAbsBias >= 4 ? "warning" : "success"}>
                        最大结构偏差 {formatStatistic(maxAbsBias, 1)} pp
                    </StatusBadge>
                )}
            </div>

            {normalizedRows.length === 0 ? (
                <p className="py-6 text-center text-label text-muted-foreground">当前课题未配置框内客群分层字段</p>
            ) : (
                <div className="space-y-4">
                    <div className="rounded-control border border-border bg-background p-3">
                        <EChartBox
                            option={composedOption}
                            height={264}
                            fallbackWidth={580}
                            ariaLabel={`${stratumField || "未指定字段"}细分客群框内占比、有效回收占比与实测应答率双轴对比图`}
                            testId="stratum-comparison-echart"
                            srSummary={
                                <table aria-label={`${stratumField || "未指定字段"}细分客群结构偏倚诊断表`}>
                                    <thead>
                                        <tr>
                                            <th scope="col">客群分层</th>
                                            <th scope="col">抽样框总体占比</th>
                                            <th scope="col">质检有效回收占比</th>
                                            <th scope="col">代表性结构偏差</th>
                                            <th scope="col">实测有效应答率</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {normalizedRows.map((row, index) => (
                                            <tr key={`${row.stratum}-sr-${index}`}>
                                                <th scope="row">客群层：{row.stratum}</th>
                                                <td>{formatStatistic(row.frameSharePct, 1)}%</td>
                                                <td>{formatStatistic(row.validSharePct, 1)}%</td>
                                                <td>{row.diff >= 0 ? "+" : ""}{formatStatistic(row.diff, 1)} pp</td>
                                                <td>
                                                    {row.hasInvited ? `${formatStatistic(row.responseRatePct, 1)}%` : "—"}
                                                    （{row.validCount}/{row.invitedCount}）
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            }
                        />
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15.5rem),1fr))] gap-2.5">
                        {normalizedRows.map((row, index) => (
                            <div
                                key={`${row.stratum}-${index}`}
                                className="flex flex-col justify-between gap-2 rounded-control border border-border bg-background px-3.5 py-3"
                            >
                                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                    <span
                                        className="max-w-full break-words text-label font-semibold text-foreground"
                                        title={row.stratum}
                                    >
                                        {row.stratum}
                                    </span>
                                    <StatusBadge intent={!row.hasInvited ? "neutral" : row.lowResponse ? "warning" : "success"}>
                                        有效回收率 {row.hasInvited ? `${formatStatistic(row.responseRatePct, 1)}%` : "—"}（{row.validCount}/{row.invitedCount}）
                                    </StatusBadge>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 text-meta tabular-nums">
                                    <span className="text-muted-foreground">
                                        框 {formatStatistic(row.frameSharePct, 1)}% → 回收 {formatStatistic(row.validSharePct, 1)}%
                                    </span>
                                    <span className={`font-medium ${Math.abs(row.diff) >= 4 ? "text-warning" : "text-muted-foreground"}`}>
                                        结构偏差 {row.diff >= 0 ? "+" : ""}{formatStatistic(row.diff, 1)} pp
                                        {row.diff <= -4 ? "（欠代表）" : row.overRepresented ? "（超代表）" : ""}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

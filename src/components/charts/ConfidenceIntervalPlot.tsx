import { formatStatistic } from "@/utils/statistic-format";

export interface ConfidenceIntervalRow {
    key: string;
    label: string;
    sublabel?: string;
    estimate: number | null;
    standardError: number | null;
    halfWidth: number | null;
    sampleSize?: number;
    tone?: "primary" | "info" | "success" | "warning" | "auxiliary";
}

const STROKE_COLORS: Record<NonNullable<ConfidenceIntervalRow["tone"]>, string> = {
    primary: "var(--chart-2)",
    info: "var(--chart-3)",
    success: "var(--chart-7)",
    warning: "var(--chart-5)",
    auxiliary: "var(--chart-4)",
};

export function ConfidenceIntervalPlot({
    title,
    subtitle,
    rows,
    populationValue,
    unit = "",
    isPercentage = false,
}: {
    title: string;
    subtitle?: string;
    rows: ConfidenceIntervalRow[];
    populationValue?: number | null;
    unit?: string;
    isPercentage?: boolean;
}) {
    const scaleFactor = isPercentage ? 100 : 1;
    const validRows = rows.filter(
        (row) => row.estimate !== null && Number.isFinite(row.estimate) && Number.isFinite(row.estimate * scaleFactor),
    );
    const displayUnit = isPercentage ? "%" : unit;
    const scaledPop = populationValue != null && Number.isFinite(populationValue)
        ? populationValue * scaleFactor
        : Number.NaN;
    const hasValidPop = Number.isFinite(scaledPop);

    const allPoints: number[] = [];
    if (hasValidPop) {
        allPoints.push(scaledPop);
    }
    for (const row of validRows) {
        const est = (row.estimate ?? 0) * scaleFactor;
        const rawHw = row.halfWidth !== null && Number.isFinite(row.halfWidth)
            ? Math.max(0, row.halfWidth * scaleFactor)
            : 0;
        const hw = Number.isFinite(rawHw) ? rawHw : 0;
        const lo = Number.isFinite(est - hw) ? est - hw : est;
        const hi = Number.isFinite(est + hw) ? est + hw : est;
        allPoints.push(lo, hi);
    }

    const rawMin = allPoints.length > 0 ? Math.min(...allPoints) : 0;
    const rawMax = allPoints.length > 0 ? Math.max(...allPoints) : 100;
    const halfRawRange = rawMax * 0.5 - rawMin * 0.5;
    const rawRange = rawMax - rawMin;
    const degenerateThreshold = Math.max(Math.abs(rawMax) * 1e-6, 1e-9);
    const [domainMin, domainMax] = !Number.isFinite(rawRange)
        ? [rawMin, rawMax] as const
        : rawRange <= degenerateThreshold
            ? (() => {
                const padCandidate = Math.max(Math.abs(rawMax) * 0.1, isPercentage ? 2 : 1);
                const halfPad = Number.isFinite(rawMin - padCandidate) && Number.isFinite(rawMax + padCandidate)
                    ? padCandidate
                    : 0;
                return [rawMin - halfPad, rawMax + halfPad] as const;
            })()
            : (() => {
                const pad = rawRange * 0.14;
                return Number.isFinite(rawMin - pad) && Number.isFinite(rawMax + pad)
                    ? [rawMin - pad, rawMax + pad] as const
                    : [rawMin, rawMax] as const;
            })();
    const halfDomainMin = domainMin * 0.5;
    const halfDomainSpan = Math.max(domainMax * 0.5 - halfDomainMin, 5e-7, halfRawRange > 0 ? halfRawRange : 0);
    const domainRange = Number.isFinite(domainMax - domainMin) ? Math.max(domainMax - domainMin, 1e-6) : halfDomainSpan * 2;
    const tickDigits = domainRange < 0.04 ? 4 : domainRange < 0.4 ? 2 : 1;

    const toX = (val: number) => {
        const ratio = ((val * 0.5 - halfDomainMin) / halfDomainSpan);
        const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0.5;
        return 40 + clamped * 440;
    };
    const ticks = Array.from({ length: 5 }, (_, index) => {
        const t = index / 4;
        return domainMin * (1 - t) + domainMax * t;
    });

    return (
        <div className="rounded-surface border border-border bg-card p-5" data-testid="confidence-interval-plot">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div className="min-w-0">
                    <h3 className="break-words text-subheading font-semibold text-foreground">{title}</h3>
                    {subtitle && <p className="mt-0.5 text-meta text-muted-foreground">{subtitle}</p>}
                </div>
                {hasValidPop && (
                    <span className="rounded-control border border-border bg-muted px-3 py-1 text-meta tabular-nums text-muted-foreground">
                        教学总体参考基准：{formatStatistic(scaledPop, 2)}{displayUnit}
                    </span>
                )}
            </div>

            {validRows.length === 0 ? (
                <div className="flex h-36 items-center justify-center rounded-control border border-border bg-background text-label text-muted-foreground">
                    完成抽样与问卷回收后将在此展示点估计与置信区间森林图
                </div>
            ) : (
                <div className="space-y-3">
                    <div>
                        <svg
                            viewBox={`0 0 520 ${validRows.length * 46 + 38}`}
                            className="w-full"
                            role="img"
                            aria-label={`${title}森林对比图`}
                        >
                            {ticks.map((tick, index) => {
                                const x = toX(tick);
                                const label = `${formatStatistic(tick, tickDigits)}${displayUnit}`;
                                const anchor = label.length > 8
                                    ? (index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle")
                                    : "middle";
                                return (
                                    <g key={index}>
                                        <line x1={x} y1={8} x2={x} y2={validRows.length * 46 + 12} stroke="var(--border)" strokeWidth="1" />
                                        <text x={x} y={validRows.length * 46 + 28} textAnchor={anchor} fill="var(--muted-foreground)" fontSize="12">
                                            {label}
                                        </text>
                                    </g>
                                );
                            })}

                            {hasValidPop && (
                                <g>
                                    <line
                                        x1={toX(scaledPop)}
                                        y1={4}
                                        x2={toX(scaledPop)}
                                        y2={validRows.length * 46 + 12}
                                        stroke="var(--chart-1)"
                                        strokeWidth="1.75"
                                        strokeDasharray="4 3"
                                    />
                                </g>
                            )}

                            {validRows.map((row, index) => {
                                const est = (row.estimate ?? 0) * scaleFactor;
                                const rawHw = row.halfWidth !== null && Number.isFinite(row.halfWidth)
                                    ? Math.max(0, row.halfWidth * scaleFactor)
                                    : 0;
                                const hw = Number.isFinite(rawHw) ? rawHw : 0;
                                const lo = Number.isFinite(est - hw) ? est - hw : est;
                                const hi = Number.isFinite(est + hw) ? est + hw : est;
                                const cy = 26 + index * 46;
                                const cx = toX(est);
                                const xLeft = toX(lo);
                                const xRight = toX(hi);
                                const color = STROKE_COLORS[row.tone ?? "primary"];

                                return (
                                    <g key={row.key}>
                                        <title>
                                            {`${row.label}：点估计 ${formatStatistic(est, 2)}${displayUnit}${hw > 0 ? `，区间 [${formatStatistic(lo, 2)}, ${formatStatistic(hi, 2)}]${displayUnit}` : ""}`}
                                        </title>
                                        <rect x="12" y={cy - 18} width="496" height="36" rx="6" fill={index % 2 === 0 ? "var(--muted)" : "transparent"} />
                                        {hw > 0 && (
                                            <>
                                                <line x1={xLeft} y1={cy} x2={xRight} y2={cy} stroke={color} strokeWidth="2.5" />
                                                <line x1={xLeft} y1={cy - 6} x2={xLeft} y2={cy + 6} stroke={color} strokeWidth="2" />
                                                <line x1={xRight} y1={cy - 6} x2={xRight} y2={cy + 6} stroke={color} strokeWidth="2" />
                                            </>
                                        )}
                                        <circle cx={cx} cy={cy} r="5.5" fill={color} stroke="var(--card)" strokeWidth="1.5" />
                                    </g>
                                );
                            })}
                        </svg>
                    </div>

                    <div
                        role="region"
                        aria-label={`${title}数值明细区域`}
                        tabIndex={0}
                        className="overflow-x-auto rounded-control border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <table className="w-full text-meta tabular-nums" aria-label={`${title}数值明细表`}>
                            <thead className="border-b border-border bg-muted text-muted-foreground">
                                <tr>
                                    <th scope="col" className="px-3.5 py-2 text-left font-medium">估计口径</th>
                                    <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">点估计</th>
                                    <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">标准误 SE</th>
                                    <th scope="col" className="whitespace-nowrap px-3.5 py-2 text-right font-medium">区间半宽</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {rows.map((row) => {
                                    const est = row.estimate !== null && Number.isFinite(row.estimate)
                                        ? row.estimate * scaleFactor
                                        : null;
                                    const se = row.standardError !== null && Number.isFinite(row.standardError) && row.standardError >= 0
                                        ? row.standardError * scaleFactor
                                        : null;
                                    const hw = row.halfWidth !== null && Number.isFinite(row.halfWidth) && row.halfWidth >= 0
                                        ? row.halfWidth * scaleFactor
                                        : null;
                                    return (
                                        <tr key={row.key}>
                                            <th scope="row" className="min-w-[10rem] px-3.5 py-2.5 text-left font-normal">
                                                <span className="block break-words font-semibold text-foreground" title={row.label}>{row.label}</span>
                                                {row.sublabel && <span className="block break-words text-muted-foreground" title={row.sublabel}>{row.sublabel}</span>}
                                            </th>
                                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-foreground">
                                                {est !== null ? `${formatStatistic(est, 2)}${displayUnit}` : "—"}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-foreground">
                                                {se !== null ? `${formatStatistic(se, 2)}${displayUnit}` : "不可用"}
                                            </td>
                                            <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-medium text-foreground">
                                                {hw !== null ? `±${formatStatistic(hw, 2)}${displayUnit}` : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

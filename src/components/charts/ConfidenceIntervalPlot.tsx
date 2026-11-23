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
    const validRows = rows.filter((row) => row.estimate !== null && Number.isFinite(row.estimate));
    const scaleFactor = isPercentage ? 100 : 1;
    const displayUnit = isPercentage ? "%" : unit;

    const allPoints: number[] = [];
    if (populationValue != null && Number.isFinite(populationValue)) {
        allPoints.push(populationValue * scaleFactor);
    }
    for (const row of validRows) {
        const est = (row.estimate ?? 0) * scaleFactor;
        const hw = (row.halfWidth ?? 0) * scaleFactor;
        allPoints.push(est - hw, est + hw);
    }

    const rawMin = allPoints.length > 0 ? Math.min(...allPoints) : 0;
    const rawMax = allPoints.length > 0 ? Math.max(...allPoints) : 100;
    const span = Math.max(rawMax - rawMin, 1e-6);
    const domainMin = rawMin - span * 0.14;
    const domainMax = rawMax + span * 0.14;
    const domainRange = Math.max(domainMax - domainMin, 1e-6);

    const toX = (val: number) => 40 + ((val - domainMin) / domainRange) * 440;
    const ticks = Array.from({ length: 5 }, (_, index) => domainMin + (domainRange * index) / 4);

    return (
        <div className="rounded-surface border border-border bg-card p-5" data-testid="confidence-interval-plot">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                    <h3 className="text-subheading font-semibold text-foreground">{title}</h3>
                    {subtitle && <p className="mt-0.5 text-meta text-muted-foreground">{subtitle}</p>}
                </div>
                {populationValue != null && Number.isFinite(populationValue) && (
                    <span className="rounded-control border border-border bg-muted px-3 py-1 text-meta tabular-nums text-muted-foreground">
                        教学总体参考基准：{formatStatistic(populationValue * scaleFactor, 2)}{displayUnit}
                    </span>
                )}
            </div>

            {validRows.length === 0 ? (
                <div className="flex h-36 items-center justify-center rounded-control border border-border bg-background text-label text-muted-foreground">
                    完成抽样与问卷回收后将在此展示点估计与置信区间森林图
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="overflow-x-auto">
                        <svg
                            viewBox={`0 0 520 ${validRows.length * 46 + 38}`}
                            className="w-full min-w-[32rem]"
                            role="img"
                            aria-label={`${title}森林对比图`}
                        >
                            {ticks.map((tick, index) => {
                                const x = toX(tick);
                                return (
                                    <g key={index}>
                                        <line x1={x} y1={8} x2={x} y2={validRows.length * 46 + 12} stroke="var(--border)" strokeWidth="1" />
                                        <text x={x} y={validRows.length * 46 + 28} textAnchor="middle" fill="var(--muted-foreground)" fontSize="12">
                                            {formatStatistic(tick, 1)}{displayUnit}
                                        </text>
                                    </g>
                                );
                            })}

                            {populationValue != null && Number.isFinite(populationValue) && (
                                <g>
                                    <line
                                        x1={toX(populationValue * scaleFactor)}
                                        y1={4}
                                        x2={toX(populationValue * scaleFactor)}
                                        y2={validRows.length * 46 + 12}
                                        stroke="var(--chart-1)"
                                        strokeWidth="1.75"
                                        strokeDasharray="4 3"
                                    />
                                </g>
                            )}

                            {validRows.map((row, index) => {
                                const est = (row.estimate ?? 0) * scaleFactor;
                                const hw = Math.max(0, (row.halfWidth ?? 0) * scaleFactor);
                                const cy = 26 + index * 46;
                                const cx = toX(est);
                                const xLeft = toX(est - hw);
                                const xRight = toX(est + hw);
                                const color = STROKE_COLORS[row.tone ?? "primary"];

                                return (
                                    <g key={row.key}>
                                        <rect x="12" y={cy - 18} width="496" height="36" rx="6" fill={index % 2 === 0 ? "var(--background)" : "transparent"} opacity="0.55" />
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

                    <div className="divide-y divide-border rounded-control border border-border bg-background">
                        {rows.map((row) => {
                            const est = row.estimate !== null ? row.estimate * scaleFactor : null;
                            const se = row.standardError !== null ? row.standardError * scaleFactor : null;
                            const hw = row.halfWidth !== null ? row.halfWidth * scaleFactor : null;
                            return (
                                <div key={row.key} className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] items-center gap-3 px-4 py-2.5 text-meta tabular-nums">
                                    <div className="min-w-0">
                                        <span className="block truncate font-semibold text-foreground">{row.label}</span>
                                        {row.sublabel && <span className="block truncate text-muted-foreground">{row.sublabel}</span>}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">点估计：</span>
                                        <span className="font-semibold text-foreground">{est !== null ? `${formatStatistic(est, 2)}${displayUnit}` : "—"}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">标准误 SE：</span>
                                        <span className="font-medium text-foreground">{se !== null ? `${formatStatistic(se, 2)}${displayUnit}` : "不可用"}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">区间半宽：</span>
                                        <span className="font-medium text-foreground">{hw !== null ? `±${formatStatistic(hw, 2)}${displayUnit}` : "—"}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

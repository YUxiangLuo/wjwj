import type { TargetAnalysisMetrics } from "../api-client";
import { METHOD_META, type MethodKey } from "../pages/stages/analysis-utils";

function formatMaybe(value: number | null, format: (value: number) => string) {
    return value === null ? "—" : format(value);
}

/**
 * 研究目标结果面板：以研究合同的目标估计量为中心，对照虚拟总体真值，\n * 逐方法展示目标估计、设计标准误、教学误差半宽与可靠性提示。
 */
export function TargetMetricsPanel({ target }: { target: TargetAnalysisMetrics }) {
    const kind = target.contract.contract.target.kind;
    const formatEstimate = (value: number | null) => value === null
        ? "—"
        : kind === "proportion" ? `${(value * 100).toFixed(2)}%` : value.toFixed(4);
    const formatMargin = (value: number | null) => value === null
        ? "—"
        : kind === "proportion" ? `±${(value * 100).toFixed(2)} 个百分点` : `±${value.toFixed(4)}`;
    const { contract } = target.contract;

    return (
        <section className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4" data-testid="student-target-metrics">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">研究目标结果</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {contract.researchQuestion}
                        {target.contract.inferred ? "（由对照变量推断的兼容目标）" : ""}
                    </p>
                    {target.plannedMarginOfError !== null && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            规划误差限 {formatMargin(target.plannedMarginOfError)}；教学误差半宽为 {target.confidenceLevel}% 置信水平下 z × 设计标准误。
                        </p>
                    )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                    <p>虚拟总体真值</p>
                    <p className="mt-0.5 text-lg font-bold text-primary" data-testid="student-target-population-value">
                        {formatEstimate(target.populationValue)}
                    </p>
                </div>
            </div>
            <div role="region" aria-label="研究目标结果表，可横向滚动" tabIndex={0} className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-xs">
                    <thead className="text-muted-foreground">
                        <tr>
                            <th className="pb-2">方法</th>
                            <th className="pb-2">目标估计</th>
                            <th className="pb-2">设计 SE</th>
                            <th className="pb-2">{target.confidenceLevel}% 教学误差半宽</th>
                            <th className="pb-2">等效 SRS 样本量</th>
                            <th className="pb-2">可靠性提示</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {(Object.keys(METHOD_META) as MethodKey[]).map((method) => {
                            const metrics = target.methods[method];
                            return (
                                <tr key={method} data-testid={`student-target-method-${method}`}>
                                    <th className="py-2.5 font-medium text-foreground">{METHOD_META[method].label}</th>
                                    <td className="py-2.5 font-mono">{formatEstimate(metrics.estimate)}</td>
                                    <td className="py-2.5 font-mono">{formatMaybe(metrics.standardError, (value) => value.toFixed(4))}</td>
                                    <td className="py-2.5 font-mono">{formatMargin(metrics.marginOfError)}</td>
                                    <td className="py-2.5 font-mono">
                                        {formatMaybe(metrics.effectiveSampleSize, (value) => value.toFixed(0))}
                                    </td>
                                    <td className={`py-2.5 ${metrics.reliability.status === "caution" ? "text-warning" : "text-muted-foreground"}`}>
                                        {metrics.reliability.reasons[0]
                                            ?? (metrics.reliability.status === "ok"
                                                ? "当前教学近似可用"
                                                : metrics.reliability.status === "census"
                                                    ? "覆盖完整虚拟总体"
                                                    : "—")}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

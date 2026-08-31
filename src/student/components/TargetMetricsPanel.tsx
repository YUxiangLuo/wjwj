import type { AnalysisMetricsData } from "../api-client";
import { METHOD_META, type MethodKey } from "../pages/stages/analysis-utils";

export function TargetMetricsPanel({ target }: { target: NonNullable<AnalysisMetricsData["target"]> }) {
    const kind = target.contract.contract.target.kind;
    const formatEstimate = (value: number | null) => value === null
        ? "—"
        : kind === "proportion" ? `${(value * 100).toFixed(2)}%` : value.toFixed(4);
    const formatMargin = (value: number | null) => value === null
        ? "—"
        : kind === "proportion" ? `±${(value * 100).toFixed(2)} 个百分点` : `±${value.toFixed(4)}`;

    return (
        <section className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4" data-testid="student-target-metrics">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">研究目标结果</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{target.contract.contract.researchQuestion}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                    <p>虚拟总体真值</p>
                    <p className="mt-0.5 text-lg font-bold text-primary">{formatEstimate(target.populationValue)}</p>
                </div>
            </div>
            <div role="region" aria-label="研究目标结果表，可横向滚动" tabIndex={0} className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-xs">
                    <thead className="text-muted-foreground"><tr><th className="pb-2">方法</th><th className="pb-2">目标估计</th><th className="pb-2">设计 SE</th><th className="pb-2">{target.confidenceLevel}% 教学误差半宽</th><th className="pb-2">可靠性提示</th></tr></thead>
                    <tbody className="divide-y divide-border">
                        {(Object.keys(METHOD_META) as MethodKey[]).map((method) => {
                            const metrics = target.methods[method];
                            return (
                                <tr key={method}>
                                    <th className="py-2.5 font-medium text-foreground">{METHOD_META[method].label}</th>
                                    <td className="py-2.5 font-mono">{formatEstimate(metrics.estimate)}</td>
                                    <td className="py-2.5 font-mono">{metrics.standardError === null ? "—" : metrics.standardError.toFixed(4)}</td>
                                    <td className="py-2.5 font-mono">{formatMargin(metrics.marginOfError)}</td>
                                    <td className={`py-2.5 ${metrics.reliability.status === "caution" ? "text-warning" : "text-muted-foreground"}`}>
                                        {metrics.reliability.reasons[0] ?? (metrics.reliability.status === "ok" ? "当前教学近似可用" : "—")}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {kind === "proportion" && (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    这里展示点估计、与抽样设计匹配的标准误及正态近似误差半宽，不把它作为小样本或边界比例的正式置信区间。
                </p>
            )}
        </section>
    );
}

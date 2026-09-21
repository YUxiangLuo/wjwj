import { Info } from "lucide-react";
import type { SamplingResultsData } from "@/domain/experiment/types";

function formatNumber(value: number, digits = 4) {
    if (!Number.isFinite(value)) return "—";
    if (value !== 0 && Math.abs(value) < 10 ** -digits) return value.toExponential(3);
    return value.toFixed(digits).replace(/\.?0+$/, "");
}

export function PpsProbabilityExplanation({
    result,
}: {
    result: SamplingResultsData["pps"] | null | undefined;
}) {
    if (!result?.completed) return null;
    const summary = result.probabilitySummary;
    const preview = result.probabilityPreview ?? [];

    return (
        <section className="space-y-4 rounded-surface border border-auxiliary-border bg-auxiliary-muted p-4" data-testid="pps-probability-explanation">
            <div className="flex items-start gap-2 text-label text-auxiliary-strong">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                    <h3 className="font-semibold">规模值如何转成抽中概率</h3>
                    <p className="mt-1 leading-relaxed">
                        普通单位的一阶包含概率与规模值成正比；概率达到 1 的单位必然入样，剩余样本名额再在其他单位间按规模重新分配。设计权重为 1/π。
                    </p>
                </div>
            </div>

            {summary ? (
                <div className="grid grid-cols-5 gap-2">
                    <div className="rounded-surface border border-auxiliary-border bg-card p-3"><p className="text-meta text-muted-foreground">总体单位</p><p className="mt-1 text-label font-semibold">{summary.populationCount}</p></div>
                    <div className="rounded-surface border border-auxiliary-border bg-card p-3"><p className="text-meta text-muted-foreground">概率和</p><p className="mt-1 text-label font-semibold">{formatNumber(summary.probabilitySum, 2)}</p></div>
                    <div className="rounded-surface border border-auxiliary-border bg-card p-3"><p className="text-meta text-muted-foreground">最小 π</p><p className="mt-1 text-label font-semibold">{formatNumber(summary.minInclusionProbability)}</p></div>
                    <div className="rounded-surface border border-auxiliary-border bg-card p-3"><p className="text-meta text-muted-foreground">最大 π</p><p className="mt-1 text-label font-semibold">{formatNumber(summary.maxInclusionProbability)}</p></div>
                    <div className="rounded-surface border border-auxiliary-border bg-card p-3"><p className="text-meta text-muted-foreground">必然入样</p><p className="mt-1 text-label font-semibold">{summary.certaintyUnitCount}</p></div>
                </div>
            ) : null}

            {preview.length > 0 ? (
                <div className="overflow-x-auto rounded-surface border border-auxiliary-border bg-card">
                    <table className="w-full text-left text-meta">
                        <thead className="border-b border-border bg-muted text-muted-foreground">
                            <tr><th className="px-3 py-2">样例序号</th><th className="px-3 py-2">规模值</th><th className="px-3 py-2">包含概率 π</th><th className="px-3 py-2">设计权重 1/π</th></tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {preview.map((row) => (
                                <tr key={row.samplePosition}>
                                    <td className="px-3 py-2">{row.samplePosition}</td>
                                    <td className="px-3 py-2 font-mono">{formatNumber(row.sizeValue, 2)}</td>
                                    <td className="px-3 py-2 font-mono">{formatNumber(row.inclusionProbability)}</td>
                                    <td className="px-3 py-2 font-mono">{typeof row.designWeight === "number" ? formatNumber(row.designWeight) : row.designWeight}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="rounded-surface border border-auxiliary-border bg-card p-3 text-meta text-muted-foreground">
                    该历史结果没有可展示的概率明细；仍可查看样本行，但系统不会推测或伪造包含概率。
                </p>
            )}
        </section>
    );
}

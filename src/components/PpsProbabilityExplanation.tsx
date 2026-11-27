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
        <section className="space-y-4 rounded-surface border border-border bg-card p-4" data-testid="pps-probability-explanation">
            <div className="flex items-start gap-2.5 text-label text-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                    <h3 className="font-medium text-foreground">规模值如何转成抽中概率</h3>
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                        普通单位的一阶包含概率与规模值成正比；概率达到 1 的单位必然入样，剩余样本名额再在其他单位间按规模重新分配。设计权重为 1/π。
                    </p>
                </div>
            </div>

            {summary ? (
                <div className="grid grid-cols-5 gap-2.5">
                    <div className="rounded-control bg-muted p-3"><p className="text-meta text-muted-foreground">总体单位</p><p className="mt-1 text-label font-medium tabular-nums text-foreground">{summary.populationCount}</p></div>
                    <div className="rounded-control bg-muted p-3"><p className="text-meta text-muted-foreground">概率和</p><p className="mt-1 text-label font-medium tabular-nums text-foreground">{formatNumber(summary.probabilitySum, 2)}</p></div>
                    <div className="rounded-control bg-muted p-3"><p className="text-meta text-muted-foreground">最小 π</p><p className="mt-1 text-label font-medium tabular-nums text-foreground">{formatNumber(summary.minInclusionProbability)}</p></div>
                    <div className="rounded-control bg-muted p-3"><p className="text-meta text-muted-foreground">最大 π</p><p className="mt-1 text-label font-medium tabular-nums text-foreground">{formatNumber(summary.maxInclusionProbability)}</p></div>
                    <div className="rounded-control bg-muted p-3"><p className="text-meta text-muted-foreground">必然入样</p><p className="mt-1 text-label font-medium tabular-nums text-foreground">{summary.certaintyUnitCount}</p></div>
                </div>
            ) : null}

            {preview.length > 0 ? (
                <div className="overflow-x-auto rounded-surface border border-border bg-card">
                    <table className="w-full text-left text-meta">
                        <thead className="border-b border-border bg-muted text-muted-foreground">
                            <tr><th className="px-3 py-2 font-medium">样例序号</th><th className="px-3 py-2 font-medium">规模值</th><th className="px-3 py-2 font-medium">包含概率 π</th><th className="px-3 py-2 font-medium">设计权重 1/π</th></tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {preview.map((row) => (
                                <tr key={row.samplePosition}>
                                    <td className="px-3 py-2 tabular-nums text-foreground">{row.samplePosition}</td>
                                    <td className="px-3 py-2 font-mono tabular-nums text-foreground">{formatNumber(row.sizeValue, 2)}</td>
                                    <td className="px-3 py-2 font-mono tabular-nums text-foreground">{formatNumber(row.inclusionProbability)}</td>
                                    <td className="px-3 py-2 font-mono tabular-nums text-foreground">{typeof row.designWeight === "number" ? formatNumber(row.designWeight) : row.designWeight}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="rounded-surface bg-muted p-3 text-meta text-muted-foreground">
                    该历史结果没有可展示的概率明细；仍可查看样本行，但系统不会推测或伪造包含概率。
                </p>
            )}
        </section>
    );
}

import type { TargetAnalysisMetrics } from "@/domain/experiment/analysis-types";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { METHOD_META, type MethodKey } from "../pages/stages/analysis-utils";
import { formatStatistic } from "@/utils/statistic-format";

export function formatTargetEstimate(value: number | null, kind: "mean" | "proportion") {
    return value === null ? "—" : kind === "proportion" ? `${formatStatistic(value * 100, 2)}%` : formatStatistic(value);
}

export function formatTargetMargin(value: number | null, kind: "mean" | "proportion") {
    return value === null ? "—" : kind === "proportion" ? `±${formatStatistic(value * 100, 2)} 个百分点` : `±${formatStatistic(value)}`;
}

/** Compare the target estimates first; keep technical diagnostics available below. */
export function TargetMetricsPanel({ target, methods = Object.keys(METHOD_META) as MethodKey[] }: {
    target: TargetAnalysisMetrics;
    methods?: MethodKey[];
}) {
    const { contract } = target.contract;
    const kind = contract.target.kind;
    const formatEstimate = (value: number | null) => formatTargetEstimate(value, kind);
    const formatMargin = (value: number | null) => formatTargetMargin(value, kind);

    return <section className="min-w-0 space-y-5" data-testid="student-target-metrics">
        <PageHeader border={false} className="flex-wrap items-center">
            <div className="min-w-0 space-y-2">
                <h2 className="text-section-title font-semibold text-foreground">研究目标结果</h2>
                <p className="text-label text-muted-foreground">{target.plannedMarginOfError !== null ? <>本次规划误差半宽：<strong className="font-semibold text-foreground">{formatMargin(target.plannedMarginOfError)}</strong></> : "本次尚未设置可比较的规划误差半宽"}</p>
            </div>
            <div className="shrink-0 rounded-surface border border-primary-border bg-primary-muted px-4 py-3">
                <p className="text-meta text-muted-foreground">虚拟总体真值 · 用于教学对照</p>
                <p className="mt-1 text-section-title font-bold tabular-nums text-primary" data-testid="student-target-population-value">{formatEstimate(target.populationValue)}</p>
            </div>
        </PageHeader>
        <div role="region" aria-label="研究目标结果表，可横向滚动" tabIndex={0} className="max-w-full overflow-auto rounded-surface border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <table className="w-full min-w-[42rem] text-left text-label">
                <caption className="sr-only">已完成抽样方法的目标估计与规划精度比较</caption>
                <thead className="bg-muted text-muted-foreground">
                    <tr>
                        <th scope="col" className="px-4 py-3 font-medium">抽样方法</th>
                        <th scope="col" className="px-4 py-3 font-medium">实际入样量</th>
                        <th scope="col" className="px-4 py-3 font-medium">目标估计</th>
                        <th scope="col" className="px-4 py-3 font-medium">{target.confidenceLevel}% 教学误差半宽</th>
                        <th scope="col" className="px-4 py-3 font-medium">与规划半宽比较</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                    {methods.map(method => {
                        const metrics = target.methods[method];
                        const comparable = metrics.marginOfError !== null && target.plannedMarginOfError !== null;
                        const meetsTarget = comparable && metrics.marginOfError! <= target.plannedMarginOfError! * (1 + 1e-9);
                        return <tr key={method} data-testid={`student-target-method-${method}`}>
                            <th scope="row" className="px-4 py-4 font-medium text-foreground">{METHOD_META[method].label}</th>
                            <td className="px-4 py-4 tabular-nums">{metrics.sampleSize?.toLocaleString() ?? "—"}</td>
                            <td className="px-4 py-4 font-semibold tabular-nums">{formatEstimate(metrics.estimate)}</td>
                            <td className="px-4 py-4 tabular-nums">{formatMargin(metrics.marginOfError)}</td>
                            <td className="px-4 py-4"><StatusBadge intent={!comparable ? "neutral" : meetsTarget ? "success" : "warning"}>{!comparable ? "暂不可比较" : meetsTarget ? "半宽达标" : "半宽未达标"}</StatusBadge></td>
                        </tr>;
                    })}
                </tbody>
            </table>
        </div>
        <p className="text-meta leading-relaxed text-muted-foreground">先比较估计值，再看误差半宽是否满足规划要求。教学误差半宽 = z × 设计标准误；半宽达标不保证区间达到标称覆盖率，一次结果更接近真值也不能单独证明某种方法更好。{target.contract.inferred && "当前研究目标由对照变量推断：" + contract.researchQuestion}请结合下面的近似条件解释结果。</p>
        <details className="rounded-surface border border-border bg-background p-4">
            <summary className="cursor-pointer text-label font-semibold text-foreground">查看标准误、等效样本量与近似条件</summary>
            <p className="mt-3 text-meta leading-relaxed text-muted-foreground">下列提示用于筛查，样本数 30、事件数 5 等经验阈值不是充分条件。等效 SRS 样本量用于表达设计精度，不是实际调查人数。</p>
            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-3">
                {methods.map(method => {
                    const metrics = target.methods[method];
                    const reason = metrics.reliability.reasons.length > 0 ? metrics.reliability.reasons.join("；")
                        : metrics.reliability.status === "ok"
                            ? metrics.standardError === 0 ? "已知设计下估计不随抽样变化" : "未触发筛查提示；区间覆盖率尚未验证"
                            : metrics.reliability.status === "census" ? "覆盖完整虚拟总体" : "暂无可用的近似条件评估。";
                    return <section key={method} className="space-y-3 rounded-surface border border-border bg-card p-4">
                        <h3 className="text-label font-semibold">{METHOD_META[method].label}</h3>
                        <dl className="grid grid-cols-2 gap-3 text-meta">
                            <div><dt className="text-muted-foreground">{kind === "proportion" ? "设计 SE（百分点）" : "设计 SE"}</dt><dd className="mt-1 font-semibold tabular-nums">{metrics.standardError === null ? "—" : formatStatistic(kind === "proportion" ? metrics.standardError * 100 : metrics.standardError)}</dd></div>
                            <div><dt className="text-muted-foreground">等效 SRS 样本量</dt><dd className="mt-1 font-semibold tabular-nums">{metrics.effectiveSampleSize?.toFixed(0) ?? "—"}</dd></div>
                        </dl>
                        <p className={`text-meta leading-relaxed ${metrics.reliability.status === "caution" ? "text-warning" : "text-muted-foreground"}`}>{reason}</p>
                    </section>;
                })}
            </div>
        </details>
    </section>;
}

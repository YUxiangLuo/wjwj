import type { ResearchRun } from "@/domain/experiment/research-analysis";
import { formatStatistic } from "@/utils/statistic-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
const methods = { simple: "简单随机抽样", systematic: "系统抽样", pps: "PPS抽样", stratified: "分层抽样" };
const display = (v: number | null) => v === null ? "不可用" : formatStatistic(v, 6);
export function ResearchResult({ run }: { run: ResearchRun }) {
    const r = run.result;
    return <Card className="min-w-0 bg-card" data-testid={`research-result-${run.id}`}><CardHeader><CardTitle className="text-subheading">{run.spec.question}</CardTitle></CardHeader><CardContent className="space-y-3 break-words text-label">
        <p>{methods[run.spec.method]} · {run.spec.mode === "raw" ? "原始样本描述（未加权）" : "设计加权比率点估计"}</p>
        <p>{run.variable.label} · 精确源字段 {JSON.stringify(run.variable.sourceField)} · 单位：{run.variable.unit || "未声明"}</p>
        <p>实际入样 {r.sampleCount}；有效 {r.validCount}；缺失 {r.missingCount}（{display(r.missingCount / r.sampleCount * 100)}%）。{run.spec.mode === "design-weighted" && `实际权重合计 ${display(r.weightSum)}。`}</p>
        {r.kind === "numeric" ? <dl className="grid grid-cols-4 gap-3">{([["均值", r.mean], ...(run.spec.mode === "raw" ? [["样本标准差（不是SE）", r.sampleSD], ["最小值", r.min], ["第一四分位数", r.q1], ["中位数", r.median], ["第三四分位数", r.q3], ["最大值", r.max]] : [])] as Array<[string, number | null]>).map(([label, value]) => <div key={label} className="rounded-surface border border-border p-3"><dt className="text-meta text-muted-foreground">{label}</dt><dd className="mt-1 text-label font-semibold tabular-nums">{display(value)}</dd></div>)}</dl> : <div className="overflow-x-auto"><table className="w-full text-left text-label"><thead><tr className="border-b border-border"><th className="p-2">类别标签</th><th className="p-2">精确编码</th><th className="p-2">原始频数</th><th className="p-2">{run.spec.mode === "raw" ? "有效百分比" : "设计加权比例"}</th></tr></thead><tbody>{r.categories.map(c => <tr key={JSON.stringify([typeof c.value, c.value])} className="border-b border-border"><td className="p-2">{c.label}</td><td className="p-2">{JSON.stringify([typeof c.value, c.value])}</td><td className="p-2">{c.count}</td><td className="p-2">{c.proportion === null ? "不可用" : `${display(c.proportion * 100)}%`}</td></tr>)}</tbody></table></div>}
        <ul className="list-disc space-y-1 pl-5 text-meta text-muted-foreground">{r.notes.map(note => <li key={note}>{note}</li>)}</ul>
        <p className="text-meta text-muted-foreground">来自教师已有总体和服务器保存的抽样记录，不是认知试填答案。显示按六位小数或科学记数法格式化，记录保留完整数值；解释由学生另行撰写。</p>
        <details className="text-meta"><summary className="cursor-pointer">记录与来源证据</summary><dl className="mt-2 space-y-2 break-all"><div><dt>记录编号</dt><dd>{run.id}</dd></div><div><dt>保存时间 / 算法</dt><dd>{run.createdAt} · {run.algorithmVersion}</dd></div><div><dt>总体N / 字典修订 / 抽样成果代次</dt><dd>{run.source.populationSize} / {run.source.dictionaryRevision} / {run.source.samplingRevision}</dd></div><div><dt>样本修订</dt><dd>{run.source.sampleRevision}</dd></div><div><dt>来源指纹</dt><dd>{run.source.fingerprint}</dd></div><div><dt>总体文件SHA256</dt><dd>{run.source.populationFileSha256}</dd></div></dl></details>
    </CardContent></Card>;
}
export function ResearchAppendix({ runs }: { runs: ResearchRun[] }) {
    if (!Array.isArray(runs)) return <p role="alert" className="text-label text-destructive">分析附录响应格式无效，请重新加载；不会自动补为空列表。</p>;
    if (!runs.length) return null;
    return <section className="mt-5 space-y-4" data-testid="research-appendix"><h3 className="text-section-title">报告引用的自主分析</h3><p className="text-meta text-muted-foreground">以下为保存的结果及当时口径，不自动改用后来数据重算。</p>{runs.map(run => <ResearchResult key={run.id} run={run} />)}</section>;
}

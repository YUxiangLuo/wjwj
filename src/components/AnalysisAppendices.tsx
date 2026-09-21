import type { SavedAnalysisView } from "@/domain/variables/types";

const value = (input: number | null, digits = 4) => input == null ? "—" : input.toLocaleString("zh-CN", { maximumFractionDigits: digits });
const methodLabels: Record<SavedAnalysisView["config"]["method"], string> = {
    simple: "简单随机抽样",
    systematic: "系统抽样",
    pps: "PPS 抽样",
    stratified: "分层抽样",
};

function rawCategoryValue(input: string | number | boolean | null) {
    if (typeof input === "string") return `文本“${input}”`;
    if (typeof input === "number") return `数字 ${input}`;
    if (typeof input === "boolean") return `布尔 ${input}`;
    return "空值 null";
}

export function AnalysisResultTable({ record }: { record: SavedAnalysisView }) {
    const result = record.result;
    const caption = <caption className="mb-3 text-left text-meta text-muted-foreground">{result.weighted ? "设计加权比率点估计（不提供标准误、置信区间或加权分位数）" : "未加权样本描述；分位数采用 R7，SD 不是标准误"} · 样本 {result.sampleCount} · 有效 {result.validCount} · 缺失 {result.missingCount}{record.variable.unit && ` · 单位：${record.variable.unit}`}</caption>;
    if (result.kind === "numeric") {
        const rows = [
            ["样本数", result.sampleCount], ["有效数", result.validCount], ["缺失数", result.missingCount], ["均值", result.mean],
            ["样本标准差（SD）", result.sampleStandardDeviation], ["最小值", result.min],
            ["Q1（R7）", result.q1], ["中位数（R7）", result.median], ["Q3（R7）", result.q3], ["最大值", result.max],
        ] as const;
        return <table className="w-full text-label">{caption}<tbody>{rows.map(([label, item]) => <tr className="border-b border-border" key={label}><th className="p-2 text-left font-medium">{label}</th><td className="p-2 text-right tabular-nums">{value(item)}</td></tr>)}</tbody></table>;
    }
    const duplicateLabels = new Set(result.categories.filter((item, index, categories) => categories.some((other, otherIndex) => otherIndex !== index && other.label === item.label)).map(item => item.label));
    return <table className="w-full text-label">{caption}<thead><tr className="border-b border-border"><th className="p-2 text-left">类别</th><th className="p-2 text-right">原始频数</th><th className="p-2 text-right">{result.weighted ? "加权比例" : "样本比例"}</th></tr></thead><tbody>{result.categories.map((item, index) => <tr className="border-b border-border" key={`${String(item.value)}-${index}`}><td className="p-2">{item.label}{duplicateLabels.has(item.label) && <span className="ml-1 text-meta text-muted-foreground">（原值：{rawCategoryValue(item.value)}）</span>}</td><td className="p-2 text-right tabular-nums">{item.count}</td><td className="p-2 text-right tabular-nums">{item.proportion == null ? "—" : `${value(item.proportion * 100, 2)}%`}</td></tr>)}</tbody></table>;
}

export function AnalysisAppendices({ records }: { records: SavedAnalysisView[] }) {
    if (!records.length) return null;
    return <section className="mt-8 space-y-5 border-t border-border pt-6" aria-label="分析附录" data-testid="analysis-appendices">
        <div><h2 className="text-section-title font-semibold">分析附录</h2><p className="text-meta text-muted-foreground">附录位于正文之后，不计入报告正文字数。</p></div>
        {records.map((record, index) => <article className="rounded-surface border border-border bg-card p-4" key={record.id}>
            <h3 className="text-subheading font-semibold">附录 {index + 1}：{record.config.question}</h3>
            <p className="mt-1 text-meta text-muted-foreground">{record.variable.label}（{record.variable.field}） · {methodLabels[record.config.method]} · {record.result.weighted ? "加权" : "未加权"}</p>
            <p className="mt-1 text-meta text-muted-foreground">来源 {record.source} · 字典 revision {record.dictionaryRevision} · 抽样 generation {record.samplingGeneration} · 算法 {record.algorithmVersion}</p>
            {record.stale && <p className="mt-2 text-label text-warning">此结果来源已过期，仅供查看；请移除引用或重新运行后再提交。</p>}
            <div className="mt-3 overflow-x-auto"><AnalysisResultTable record={record} /></div>
            <p className="mt-3 text-meta text-muted-foreground">分位数采用 R7；SD 是样本标准差，不是标准误。{record.result.weighted ? "加权结果不提供置信区间，也不声明估计量无偏。原始频数未加权，与加权比例分开列示。" : "本表为描述统计，不提供置信区间。"}</p>
        </article>)}
    </section>;
}

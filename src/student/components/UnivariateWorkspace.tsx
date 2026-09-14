import { useEffect, useMemo, useRef, useState } from "react";
import { createApiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { AnalysisResultTable } from "@/components/AnalysisAppendices";
import type { AnalysisConfig, SavedAnalysisView, VariableDictionary } from "@/domain/variables/types";

const client = createApiClient("student");
const methods = { simple: "简单随机", systematic: "系统抽样", pps: "PPS", stratified: "分层抽样" } as const;
const signature = (config: AnalysisConfig) => JSON.stringify(config);

export function UnivariateWorkspace({ taskId, observedVersion, completedMethods, references, onReferencesChange, onStaleReferencesChange }: {
    taskId: number; observedVersion: number; completedMethods: AnalysisConfig["method"][];
    references: number[]; onReferencesChange: (ids: number[]) => void; onStaleReferencesChange?: (ids: number[]) => void;
}) {
    const [dictionary, setDictionary] = useState<VariableDictionary | null>(null);
    const [records, setRecords] = useState<SavedAnalysisView[]>([]);
    const [capacity, setCapacity] = useState(20);
    const [config, setConfig] = useState<AnalysisConfig>({ question: "", method: completedMethods[0] ?? "simple", field: "", weighted: false });
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pending = useRef<{ signature: string; requestId: string } | null>(null);
    const variables = useMemo(() => dictionary?.variables.filter(item => item.kind !== "identifier") ?? [], [dictionary]);

    const load = async () => {
        setLoading(true); setError(null);
        const [dictionaryResponse, analysesResponse] = await Promise.all([
            client.request<{ dictionary: VariableDictionary | null }>(`/api/student/tasks/${taskId}/variables`),
            client.request<{ records: SavedAnalysisView[]; capacity: number }>(`/api/student/tasks/${taskId}/analyses`),
        ]);
        setLoading(false);
        setDictionary(dictionaryResponse.data?.dictionary ?? null);
        if (analysesResponse.success) {
            setRecords(analysesResponse.data?.records ?? []);
            setCapacity(analysesResponse.data?.capacity ?? 20);
        }
        if (!dictionaryResponse.success || !analysesResponse.success) setError(dictionaryResponse.error?.message ?? analysesResponse.error?.message ?? "分析工作区加载失败");
    };
    useEffect(() => { void load(); }, [taskId]);
    useEffect(() => {
        onStaleReferencesChange?.(records.filter(record => record.stale && references.includes(record.id)).map(record => record.id));
    }, [records, references, onStaleReferencesChange]);
    const update = (patch: Partial<AnalysisConfig>) => { const next = { ...config, ...patch }; setConfig(next); if (pending.current?.signature !== signature(next)) pending.current = null; };
    const run = async () => {
        if (running || config.question.trim().length < 5 || config.question.trim().length > 500 || !config.field || records.length >= capacity) return;
        setRunning(true); setError(null);
        const key = signature(config);
        if (!pending.current || pending.current.signature !== key) pending.current = { signature: key, requestId: crypto.randomUUID() };
        const response = await client.request<SavedAnalysisView>(`/api/student/tasks/${taskId}/analyses`, { method: "POST", body: JSON.stringify({ requestId: pending.current.requestId, observedVersion, config: { ...config, question: config.question.trim() } }) });
        setRunning(false);
        if (!response.success || !response.data) {
            const conflict = ["VERSION_CONFLICT", "SOURCE_CONFLICT", "DICTIONARY_CONFLICT", "SAMPLING_CONFLICT"].includes(response.error?.code ?? "");
            setError(conflict ? `${response.error?.message ?? "数据来源已变化"}。配置已保留，请刷新并核对后重试；不会静默替换来源。` : response.error?.message ?? "执行失败，配置和请求编号已保留，可安全重试。");
            return;
        }
        setRecords(current => [response.data!, ...current.filter(item => item.id !== response.data!.id)]);
        pending.current = null;
    };
    const toggleReference = (record: SavedAnalysisView) => {
        if (references.includes(record.id)) return onReferencesChange(references.filter(id => id !== record.id));
        if (record.stale || references.length >= 10) return;
        onReferencesChange([...references, record.id]);
    };

    if (loading) return <p role="status" className="text-label text-muted-foreground">正在加载单变量分析工作区…</p>;
    return <div className="space-y-5" data-testid="student-univariate-workspace">
        {error && <div role="alert" className="rounded-surface border border-destructive-border bg-destructive-muted p-3 text-label text-destructive">{error} <Button variant="outline" onClick={() => void load()}>刷新核对</Button></div>}
        {!dictionary ? <p className="rounded-surface border border-warning-border bg-warning-muted p-4 text-label text-warning">教师尚未提供变量字典，暂不能运行分析。</p> : <section className="grid gap-3 rounded-surface border border-border bg-card p-4">
            <label className="text-label">研究问题（5–500 字）<textarea className="mt-1 min-h-20 w-full rounded-control border border-input bg-background p-2" value={config.question} onChange={event => update({ question: event.target.value })} /></label>
            <div className="grid gap-3 grid-cols-2"><label className="text-label">抽样结果<select className="mt-1 w-full rounded-control border border-input bg-background p-2" value={config.method} onChange={event => update({ method: event.target.value as AnalysisConfig["method"] })}>{completedMethods.map(method => <option key={method} value={method}>{methods[method]}</option>)}</select></label>
            <label className="text-label">分析变量<select className="mt-1 w-full rounded-control border border-input bg-background p-2" value={config.field} onChange={event => update({ field: event.target.value })}><option value="">请选择</option>{variables.map(variable => <option key={variable.field} value={variable.field}>{variable.label}</option>)}</select></label></div>
            <label className="text-label"><input type="checkbox" checked={config.weighted} onChange={event => update({ weighted: event.target.checked })} /> 使用抽样权重</label>
            <p className="text-meta text-muted-foreground">修改配置不会自动运行。每次点击执行后服务端会自动保存一条不可变记录。</p>
            <Button onClick={() => void run()} disabled={running || config.question.trim().length < 5 || config.question.trim().length > 500 || !config.field || records.length >= capacity}>{running ? "正在执行…" : "执行并保存分析"}</Button>
        </section>}
        {records.length >= capacity && <p className="rounded-surface border border-warning-border bg-warning-muted p-3 text-label text-warning">已达到 {capacity} 条容量上限。历史记录会保留且不能删除；如需继续分析，请联系教师处理。</p>}
        <section className="space-y-3"><h2 className="text-section-title font-semibold">已保存分析（{records.length}/{capacity}）</h2>{records.length === 0 ? <p className="text-label text-muted-foreground">暂无分析记录。</p> : records.map(record => <article key={record.id} className="rounded-surface border border-border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="font-semibold">{record.config.question}</h3><p className="break-all text-meta text-muted-foreground">{record.variable.label} · {methods[record.config.method]} · 来源 {record.source} · 修订 {record.dictionaryRevision} · 抽样代次 {record.samplingGeneration} · {record.algorithmVersion}</p></div><Button variant="outline" onClick={() => toggleReference(record)} disabled={!references.includes(record.id) && (record.stale || references.length >= 10)}>{references.includes(record.id) ? "移除引用" : "引用到报告"}</Button></div>{record.stale && <p className="my-2 text-label text-warning">来源已过期，不可新选；若已引用，请明确移除或重新运行。</p>}<div className="mt-3 overflow-x-auto"><AnalysisResultTable record={record} /></div></article>)}</section>
    </div>;
}

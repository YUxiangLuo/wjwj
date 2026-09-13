import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResearchResult } from "@/components/ResearchResult";
import { parseResearchReferences, parseResearchSpec, type ResearchList, type ResearchSpec } from "@/domain/experiment/research-analysis";
import { researchApi } from "../research-api";
const names = { simple: "简单随机抽样", systematic: "系统抽样", pps: "PPS抽样", stratified: "分层抽样" };
const levels = { id: "标识符", continuous: "连续数值", nominal: "无序分类", ordinal: "有序分类", unclassified: "未分类" };
function requestIdentity() { return `r_${Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("")}`; }
export function ResearchWorkbench(props: { taskId: number; observedVersion: number; references: unknown; onReferencesChange: (ids: string[]) => void }) {
    return <ResearchWorkspace key={props.taskId} {...props} />;
}
function ResearchWorkspace({ taskId, observedVersion, references, onReferencesChange }: Parameters<typeof ResearchWorkbench>[0]) {
    const id = useId(), live = useRef(true), pending = useRef(false), abort = useRef<AbortController | null>(null);
    const loadSequence = useRef(0), latestVersion = useRef(observedVersion); latestVersion.current = observedVersion;
    const [checkedVersion, setCheckedVersion] = useState<number | null>(null);
    const [data, setData] = useState<ResearchList | null>(null), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
    const [question, setQuestion] = useState(""), [method, setMethod] = useState(""), [variableId, setVariableId] = useState(""), [mode, setMode] = useState("raw");
    const [lastSaved, setLastSaved] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
    const retry = useRef<{ signature: string; requestKey: string } | null>(null);
    const spec = parseResearchSpec({ schemaVersion: 1, question, method, variableId, mode });
    const refs = parseResearchReferences(references);
    async function load(signal: AbortSignal) {
        if (observedVersion !== latestVersion.current) return;
        const sequence = ++loadSequence.current;
        const active = () => live.current && !signal.aborted && sequence === loadSequence.current && observedVersion === latestVersion.current;
        setCheckedVersion(null);
        try {
            const result = await researchApi.list(taskId, signal);
            if (!active()) return;
            if (!result.success || !result.data) throw new Error(result.error?.message ?? "分析记录加载失败，请重试");
            setData(result.data); setCheckedVersion(observedVersion);
        } catch (cause) { if (active()) throw cause; }
    }
    useEffect(() => {
        live.current = true;
        return () => { live.current = false; abort.current?.abort(); };
    }, [taskId]);
    useEffect(() => {
        const controller = new AbortController();
        void load(controller.signal).catch(cause => { if (live.current && !controller.signal.aborted) setError(cause.message); });
        return () => controller.abort();
    }, [taskId, observedVersion]);
    async function refresh() {
        if (pending.current) return; pending.current = true; setBusy(true); setError(null);
        const controller = new AbortController(); abort.current = controller;
        try { await load(controller.signal); } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : "加载失败"); }
        finally { if (live.current) { pending.current = false; setBusy(false); } }
    }
    async function run() {
        if (pending.current || typeof spec === "string") return;
        pending.current = true; setBusy(true); setError(null); setNotice(null);
        const signature = JSON.stringify([observedVersion, spec]);
        if (retry.current?.signature !== signature) retry.current = { signature, requestKey: requestIdentity() };
        const controller = new AbortController(); abort.current = controller;
        try {
            const result = await researchApi.run(taskId, { observedVersion, spec: spec as ResearchSpec, requestKey: retry.current.requestKey }, controller.signal);
            if (!live.current || controller.signal.aborted) return;
            if (!result.success || !result.data) throw new Error(result.error?.message ?? "运行失败，可重试同一请求");
            setLastSaved(JSON.stringify(result.data.run.spec)); setNotice("分析已保存。请在下方核对结果，再选择是否附到报告；正文解释仍由你填写。");
            retry.current = null;
            await load(controller.signal);
        } catch (cause) { if (live.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "分析失败，请重试"); }
        finally { if (live.current) { pending.current = false; setBusy(false); } }
    }
    const variables = data?.dictionary?.variables.filter(v => ["continuous", "nominal", "ordinal"].includes(v.measurementLevel)) ?? [];
    const sourceReady = checkedVersion === observedVersion;
    const selectionAvailable = variables.some(v => v.id === variableId) && data?.methods.some(m => m === method);
    return <section className="space-y-4" data-testid="research-workbench">
        <div className="rounded-surface border border-border bg-card p-5 space-y-4">
            <h2 className="text-section-title">我的自主分析</h2><p className="text-label text-muted-foreground">明确选择一种真实样本和一个已确认变量。改配置不自动计算；只有“运行分析并保存”会生成新记录。不读取认知试填答案，也不自动撰写结论。</p>
            <p className="text-meta text-muted-foreground">本期提供单变量描述和设计加权均值/比例，不含显著性检验；最多30条保存记录、10条报告引用。未运行的配置不提交。</p>
            {error && <p role="alert" className="text-label text-destructive">{error}</p>}
            {data?.sourceError && <p role="alert" className="text-label text-warning">{data.sourceError}</p>}
            {notice && <p role="status" className="text-label text-success">{notice}</p>}
            <Label htmlFor={`${id}-question`}>这次分析要回答的问题</Label><Input id={`${id}-question`} value={question} disabled={busy} maxLength={300} onChange={e => setQuestion(e.target.value)} placeholder="例如：这次样本的等待时长分布如何？" data-testid="research-question" />
            <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label htmlFor={`${id}-method`}>实际样本</Label><select id={`${id}-method`} data-testid="research-method" className="w-full rounded-control border border-input bg-card px-3 py-2 text-label" value={method} disabled={busy} onChange={e => setMethod(e.target.value)}><option value="">明确选择抽样方法</option>{data?.methods.map(m => <option key={m} value={m}>{names[m]}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor={`${id}-variable`}>真实分析变量</Label><select id={`${id}-variable`} data-testid="research-variable" className="w-full rounded-control border border-input bg-card px-3 py-2 text-label" value={variableId} disabled={busy} onChange={e => setVariableId(e.target.value)}><option value="">明确选择变量</option>{variables.map(v => <option key={v.id} value={v.id}>{v.label} · {JSON.stringify(v.sourceField)} · {levels[v.measurementLevel]}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor={`${id}-mode`}>分析口径</Label><select id={`${id}-mode`} data-testid="research-mode" className="w-full rounded-control border border-input bg-card px-3 py-2 text-label" value={mode} disabled={busy} onChange={e => setMode(e.target.value)}><option value="raw">原始样本描述（未加权）</option><option value="design-weighted">设计加权点估计</option></select></div>
            </div>
            {lastSaved && typeof spec !== "string" && JSON.stringify(spec) !== lastSaved && <p className="text-label text-warning">配置已修改，尚未重新运行；下方记录仍对应其各自保存的参数。</p>}
            <div className="flex gap-3"><Button type="button" onClick={() => void run()} disabled={busy || !sourceReady || !selectionAvailable || typeof spec === "string" || !data?.dictionary || !!data.sourceError} data-testid="research-run">{busy ? "正在处理…" : "运行分析并保存"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void refresh()}>刷新已保存记录</Button></div>
        </div>
        {typeof refs === "string" ? <div role="alert" className="text-label text-destructive">{refs}<Button variant="outline" onClick={() => onReferencesChange([])}>从草稿移除无效引用（保留正文）</Button></div> : refs.some(ref => data && !data.runs.some(row => row.run.id === ref)) && <div role="alert" className="text-label text-destructive">草稿有不属于当前记录列表的引用，请移除后重新选择。<Button variant="outline" onClick={() => onReferencesChange(refs.filter(ref => data?.runs.some(row => row.run.id === ref)))}>从草稿移除这些引用</Button></div>}
        {data?.runs.length === 0 && <p className="text-label text-muted-foreground">尚未保存自主分析。此功能可选，不影响原有实验完成规则。</p>}
        {data?.runs.map(({ run: item, current }) => <article key={item.id} className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-3 text-label"><p className={current ? "text-success" : "text-warning"}>{!sourceReady ? "当前版本来源尚未核对；暂不可新增引用" : current ? "来源已核对" : "已过期或来源无法核对；保留历史结果，不可新增引用"}</p>{typeof refs !== "string" && (refs.includes(item.id) ? <Button variant="outline" onClick={() => onReferencesChange(refs.filter(id => id !== item.id))}>从报告草稿移除这条引用</Button> : <Button variant="outline" disabled={!sourceReady || !current || refs.length >= 10} onClick={() => onReferencesChange([...refs, item.id])} data-testid={`research-cite-${item.id}`}>附到报告草稿</Button>)}</div><ResearchResult run={item} /></article>)}
        <p className="text-meta text-muted-foreground">引用增删只影响本地报告草稿，需正常保存报告后生效；不会删除已保存分析。</p>
    </section>;
}

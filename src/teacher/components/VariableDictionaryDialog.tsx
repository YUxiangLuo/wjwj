import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseVariableDictionary } from "@/domain/experiment/variable-dictionary";
import { teacherApi, type TopicVariableDictionary } from "../api-client";
import { buildDictionaryDraft, dictionaryDraft, measurementLabels, type VariableDraft } from "./variable-dictionary-form";
import { VariableDictionaryFieldEditor } from "./VariableDictionaryFieldEditor";

function checkedResponse(data: TopicVariableDictionary | undefined): TopicVariableDictionary {
    const parsed = parseVariableDictionary(data?.dictionary);
    if (!parsed.ok || typeof data?.confirmed !== "boolean" || typeof data.editable !== "boolean" || (data.confirmed && parsed.value.revision < 1)) {
        throw new Error("变量字典响应无效，请重新加载；不会使用未经确认的版本覆盖数据。");
    }
    return { ...data, dictionary: parsed.value };
}
interface Props { topicId: number; readOnly?: boolean; onClose: () => void }
/** Mount only while open. A topic/mode change creates a new request and draft scope. */
export function VariableDictionaryDialog(props: Props) {
    return <DictionarySession key={`${props.topicId}:${Boolean(props.readOnly)}`} {...props} />;
}
function DictionarySession({ topicId, readOnly = false, onClose }: Props) {
    const [base, setBase] = useState<TopicVariableDictionary | null>(null);
    const [variables, setVariables] = useState<VariableDraft[]>([]);
    const [selected, setSelected] = useState("v_1");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [locked, setLocked] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [discard, setDiscard] = useState<"close" | "reload" | null>(null);
    const live = useRef(false);
    const pending = useRef(false);
    const readRequest = useRef<AbortController | null>(null);
    const editor = useRef<HTMLDivElement>(null);
    const dirty = base !== null && JSON.stringify(variables) !== JSON.stringify(dictionaryDraft(base.dictionary));
    const editable = base?.editable === true && !readOnly;
    const parsed = base ? buildDictionaryDraft(base.dictionary, variables) : null;
    const current = variables.find(v => v.id === selected);
    const visibleVariables = variables.filter(v => `${v.sourceField}\n${v.label}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    const canSave = editable && !loading && !saving && !locked && parsed?.ok && (!base?.confirmed || dirty);

    function accept(data: TopicVariableDictionary) {
        setBase(data);
        setVariables(dictionaryDraft(data.dictionary));
        setSelected(id => data.dictionary.variables.some(v => v.id === id) ? id : data.dictionary.variables[0]!.id);
    }
    async function load() {
        if (pending.current) return;
        readRequest.current?.abort();
        const request = new AbortController();
        readRequest.current = request;
        setLoading(true); setError(null); setBase(null); setVariables([]); setLocked(false); setSearch("");
        try {
            const response = await teacherApi.getVariableDictionary(topicId, request.signal);
            if (!live.current || request.signal.aborted) return;
            if (!response.success) throw new Error(response.error?.message ?? "无法加载变量字典，请重试。");
            accept(checkedResponse(response.data));
        } catch (cause) {
            if (live.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "无法加载变量字典，请重试。");
        } finally {
            if (live.current && !request.signal.aborted) setLoading(false);
        }
    }
    useEffect(() => {
        live.current = true;
        void load();
        return () => { live.current = false; readRequest.current?.abort(); };
    }, []);
    useEffect(() => { if (editor.current) editor.current.scrollTop = 0; }, [selected]);
    useEffect(() => {
        if (!dirty && !saving) return;
        const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", prevent);
        return () => window.removeEventListener("beforeunload", prevent);
    }, [dirty, saving]);

    function requestDiscard(action: "close" | "reload") {
        if (pending.current) return;
        if (dirty) setDiscard(action);
        else if (action === "close") onClose();
        else void load();
    }
    async function save() {
        if (!canSave || !parsed?.ok || pending.current) return;
        pending.current = true; setSaving(true); setError(null);
        try {
            const response = await teacherApi.updateVariableDictionary(topicId, parsed.value);
            if (!live.current) return;
            if (!response.success) {
                if (["VERSION_CONFLICT", "DATASET_CHANGED", "INVALID_DICTIONARY_STORAGE", "FORBIDDEN", "VERSION_LIMIT"].includes(response.error?.code ?? "")) setLocked(true);
                setError(`${response.error?.message ?? "未确认保存结果"}；当前输入已保留。`);
                return;
            }
            const next = checkedResponse(response.data);
            if (!next.confirmed || next.dictionary.datasetRevision !== parsed.value.datasetRevision || next.dictionary.revision !== parsed.value.revision + 1) {
                setLocked(true);
                throw new Error("保存响应的来源或版本不一致，请重新加载后核对。当前输入已保留。");
            }
            accept(next);
        } catch (cause) {
            if (live.current) setError(`${cause instanceof Error ? cause.message : "未确认保存结果"}；当前输入已保留。`);
        } finally {
            pending.current = false;
            if (live.current) setSaving(false);
        }
    }
    return <Dialog open onOpenChange={open => { if (!open) requestDiscard("close"); }}>
        <DialogContent data-testid="variable-dictionary-dialog" className="flex h-[calc(100dvh-2rem)] max-w-6xl flex-col overflow-hidden" showCloseButton={false}
            onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { event.preventDefault(); requestDiscard("close"); }}>
            <DialogHeader className="shrink-0">
                <DialogTitle>数据变量字典</DialogTitle>
                <DialogDescription>定义完整总体各字段的含义、类别及缺失编码。仅保存元数据，不生成问卷答案，不改变抽样配置和评分规则。</DialogDescription>
            </DialogHeader>
            {base && <div className="shrink-0 space-y-2">
                <div role="status" className="flex items-center gap-3 text-meta">
                    <StatusBadge intent={base.confirmed ? "success" : "warning"}>{base.confirmed ? "已确认" : "仅建议 · 未确认"}</StatusBadge>
                    <span>{dirty ? "有未保存修改 · " : ""}修订 {base.dictionary.revision} · {variables.length} 个变量</span>
                    <span className="text-muted-foreground" title={base.dictionary.datasetRevision}>来源 {base.dictionary.datasetRevision.slice(0, 12)}</span>
                </div>
                {!base.editable ? <p className="text-meta text-muted-foreground">已发布或已分配任务的模板只读；如需修改，请复制为新模板。未确认的建议不会自动写入历史任务。</p>
                    : readOnly ? <p className="text-meta text-muted-foreground">当前仅查看；配置请进入编辑模板的“研究目标与字段”步骤。</p>
                    : <p className="text-meta text-muted-foreground">建议不会自动确认。请逐项核对后明确保存；替换总体文件或改变抽样字段配置会使字典失效。</p>}
            </div>}
            {loading ? <p role="status" className="flex-1 text-label text-muted-foreground">正在读取完整总体的变量定义…</p> : base && current ? <div className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)] gap-4">
                <div className="flex min-h-0 flex-col gap-3 border-r border-border pr-4">
                    <Input aria-label="查找变量" placeholder="查找字段或显示名称" value={search} disabled={saving} onChange={e => setSearch(e.target.value)} />
                    <nav aria-label="变量列表" className="min-h-0 space-y-2 overflow-y-auto">
                        {visibleVariables.length === 0 && <p role="status" className="text-meta text-muted-foreground">没有匹配的变量</p>}
                        {visibleVariables.map(variable => <button key={variable.id} type="button" aria-pressed={selected === variable.id}
                            data-testid={`dictionary-variable-${variable.id}`} disabled={saving} onClick={() => setSelected(variable.id)} title={JSON.stringify(variable.sourceField)}
                            className={`w-full rounded-control border p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === variable.id ? "border-primary-border bg-primary-muted text-primary" : "border-border bg-card text-foreground hover:bg-muted"}`}>
                            <span className="block truncate text-label font-medium">{variable.label || variable.sourceField}</span>
                            <span className="mt-1 block text-meta text-muted-foreground">{variable.id} · {measurementLabels[variable.measurementLevel]}</span>
                        </button>)}
                    </nav>
                </div>
                <div ref={editor} role="region" aria-label="当前变量配置，可滚动" tabIndex={0} className="min-h-0 min-w-0 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    <VariableDictionaryFieldEditor value={current} readOnly={!editable} saving={saving} onChange={next => {
                        setVariables(values => values.map(v => v.id === next.id ? next : v));
                        if (!locked) setError(null);
                    }} />
                </div>
            </div> : <div className="flex-1" />}
            <div className="shrink-0 space-y-2">
                {(error || (parsed && !parsed.ok)) && <div role="alert" className="max-h-24 overflow-y-auto break-words rounded-surface border border-destructive-border bg-destructive-muted p-3 text-meta text-destructive">
                    {error}{parsed && !parsed.ok && <p>{parsed.error}</p>}{locked && <p>请先重新加载最新版本并核对，不能用旧版本继续保存。</p>}
                </div>}
                {discard && <div role="alert" className="flex items-center justify-between gap-3 rounded-surface border border-warning-border bg-warning-muted p-3 text-meta text-warning">
                    <p>尚有未保存修改。{discard === "reload" ? "重新加载" : "关闭"}会放弃这些修改。</p>
                    <div className="flex shrink-0 gap-2"><Button variant="outline" onClick={() => setDiscard(null)}>保留修改</Button><Button variant="destructive" onClick={() => {
                        const action = discard; setDiscard(null);
                        if (action === "close") onClose(); else void load();
                    }}>放弃修改并{discard === "reload" ? "重新加载" : "关闭"}</Button></div>
                </div>}
                <DialogFooter className="border-t border-border pt-3">
                    <Button variant="outline" disabled={saving || loading || Boolean(discard)} onClick={() => requestDiscard("reload")}>重新加载</Button>
                    <Button variant="outline" disabled={saving || Boolean(discard)} onClick={() => requestDiscard("close")}>关闭</Button>
                    {editable && <Button data-testid="dictionary-save" disabled={!canSave || Boolean(discard)} onClick={() => void save()}>{saving ? "正在保存…" : "确认并保存字典"}</Button>}
                </DialogFooter>
            </div>
        </DialogContent>
    </Dialog>;
}

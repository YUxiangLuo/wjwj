import { useEffect, useState } from "react";
import type { RawValue, VariableDictionary } from "@/domain/variables/types";
import { valueKey } from "@/domain/variables/dictionary";
import { teacherApi, type VariableDictionaryResponse } from "../api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp } from "lucide-react";

function scalarText(value: RawValue) { return JSON.stringify(value); }
function parseMissingValues(input: string): RawValue[] {
    const parsed: unknown = JSON.parse(input);
    if (!Array.isArray(parsed)) throw new Error("缺失编码必须是 JSON 数组");
    return parsed.map((value: unknown) => {
        if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
        throw new Error("缺失编码仅支持 null、文本、有限数值或布尔值；文本需带双引号");
    });
}

function missingValuesDescription(input: string) {
    try {
        const missing = parseMissingValues(input);
        if (!missing.length) return "未指定缺失值";
        return missing.map(value => {
            if (value === null) return "空白单元格";
            if (value === "") return "空文本";
            if (typeof value === "string") return `文本 ${scalarText(value)}`;
            if (typeof value === "number") return `数值 ${value}`;
            return value ? "逻辑值 true（真）" : "逻辑值 false（假）";
        }).join("、") + "按缺失值处理";
    } catch {
        return "格式有误，请展开高级设置检查";
    }
}

export function VariableDictionaryEditor({ topicId, readOnly = false, disabled = false, onStateChange }: { topicId: number; readOnly?: boolean; disabled?: boolean; onStateChange?: (state: { dirty: boolean; busy: boolean }) => void }) {
    const [snapshot, setSnapshot] = useState<VariableDictionaryResponse | null>(null);
    const [draft, setDraft] = useState<VariableDictionary | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [missingInputs, setMissingInputs] = useState<Record<string, string>>({});
    const [baseline, setBaseline] = useState<string | null>(null);
    const dirty = baseline !== null && baseline !== JSON.stringify([draft, missingInputs]);
    useEffect(() => { onStateChange?.({ dirty, busy: loading || saving }); }, [dirty, loading, saving, onStateChange]);
    useEffect(() => () => onStateChange?.({ dirty: false, busy: false }), [onStateChange]);
    useEffect(() => {
        if (!dirty && !saving) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty, saving]);
    function reload() {
        if (disabled || saving || (dirty && !window.confirm("重新载入会丢弃变量字典中未保存的修改。继续吗？"))) return;
        void load();
    }

    async function load() {
        setLoading(true); setError(null);
        try {
            const result = await teacherApi.getVariableDictionary(topicId);
            if (result.success && result.data) {
                setSnapshot(result.data);
                const loaded = structuredClone(result.data.dictionary ?? result.data.suggestion);
                const inputs = Object.fromEntries(loaded.variables.map(variable => [variable.field, `[${variable.missing.map(scalarText).join(", ")}]`]));
                setDraft(loaded);
                setMissingInputs(inputs);
                setBaseline(JSON.stringify([loaded, inputs]));
            } else setError(result.error?.message ?? "无法载入变量字典");
        } catch { setError("无法载入变量字典；已有输入已保留"); }
        finally { setLoading(false); }
    }
    useEffect(() => { void load(); }, [topicId]);
    function update(index: number, patch: Partial<VariableDictionary["variables"][number]>) {
        setDraft((current) => current ? { ...current, variables: current.variables.map((item, i) => i === index ? { ...item, ...patch } : item) } : current);
    }
    async function save() {
        if (!snapshot || !draft || readOnly || disabled || snapshot.locked || loading || saving) return;
        setSaving(true); setError(null);
        try {
            const variables = draft.variables.map(variable => {
                const missing = parseMissingValues(missingInputs[variable.field] ?? "[]");
                const keys = new Set(missing.map(valueKey));
                const restored = variable.kind === "nominal" || variable.kind === "ordinal"
                    ? variable.missing.filter(value => !keys.has(valueKey(value)) && !variable.categories.some(category => valueKey(category.value) === valueKey(value)))
                        .map(value => ({ value, label: String(value) })) : [];
                return { ...variable, missing, categories: [...variable.categories, ...restored].filter(category => !keys.has(valueKey(category.value))) };
            });
            const result = await teacherApi.updateVariableDictionary(topicId, { source: snapshot.source, observedRevision: snapshot.revision, dictionary: { ...draft, variables } });
            if (result.success) await load();
            else setError(result.error?.message ?? "保存失败；输入已保留");
        } catch (cause) {
            setError(cause instanceof SyntaxError
                ? '缺失编码格式无效，请填写 JSON 数组，例如 [null, "NA"]；文本编码需用双引号包围。输入已保留。'
                : cause instanceof Error ? cause.message : "缺失编码格式无效；输入已保留");
        }
        finally { setSaving(false); }
    }
    if (loading) return <div role="status" className="text-label text-muted-foreground">正在读取变量字典…</div>;
    if (!draft) return <div className="space-y-3"><p className="text-label text-destructive">{error}</p><Button variant="outline" disabled={disabled} onClick={reload}>重新载入</Button></div>;
    const locked = readOnly || snapshot?.locked || saving || disabled;
    return <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-section-title">变量字典</h3><p className="text-label text-muted-foreground">{readOnly || snapshot?.locked ? "查看各字段的标签、单位、测量类型、类别顺序与缺失值处理规则。" : "逐字段确认标签、单位、测量类型、类别顺序与缺失值处理规则。"}</p></div>
            {!readOnly && !snapshot?.locked && <Button onClick={save} disabled={locked}>{saving ? "保存中…" : "明确确认并保存"}</Button>}
        </div>
        <p className="text-label text-muted-foreground">标记为缺失的值不作为该变量的有效数据。以下是处理规则，不代表数据中一定存在缺失。</p>
        {error && <div role="alert" className="rounded-surface border border-destructive-border bg-destructive-muted p-3 text-label text-destructive">{error} <Button data-testid="teacher-dictionary-reload" variant="outline" className="ml-2" disabled={saving || disabled} onClick={reload}>重新载入</Button></div>}
        {draft.variables.map((variable, index) => <section key={variable.field} className="rounded-surface border border-border bg-background p-4 space-y-3">
            <div className="text-subheading font-medium">{variable.field}</div>
            <div className="grid grid-cols-3 gap-3">
                <Input aria-label={`${variable.field} 标签`} maxLength={120} disabled={locked} value={variable.label} onChange={e => update(index, { label: e.target.value })} />
                <Input aria-label={`${variable.field} 单位`} maxLength={60} disabled={locked} placeholder="单位（可空）" value={variable.unit} onChange={e => update(index, { unit: e.target.value })} />
                <Select disabled={locked} value={variable.kind} onValueChange={(kind: VariableDictionary["variables"][number]["kind"]) => update(index, { kind, categories: kind === "continuous" || kind === "identifier" ? [] : variable.categories.length ? variable.categories : snapshot?.suggestion.variables.find(item => item.field === variable.field)?.categories ?? [] })}>
                    <SelectTrigger aria-label={`${variable.field} 测量类型`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="continuous">连续数值</SelectItem><SelectItem value="nominal">无序类别</SelectItem><SelectItem value="ordinal">有序类别</SelectItem><SelectItem value="identifier">标识 / 不用于分析</SelectItem></SelectContent>
                </Select>
            </div>
            {(variable.kind === "nominal" || variable.kind === "ordinal") && <div className="space-y-2"><div className="text-label font-medium">类别（显示类型，可调整顺序；缺失编码会在确认时排除）</div>{variable.categories.map((category, categoryIndex) => <div key={`${scalarText(category.value)}-${categoryIndex}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input disabled value={`${typeof category.value} · ${scalarText(category.value)}`} aria-label="类别类型和值" />
                <Input disabled={locked} maxLength={120} aria-label={`${variable.field} 类别标签 ${categoryIndex + 1}`} value={category.label} onChange={e => update(index, { categories: variable.categories.map((item, i) => i === categoryIndex ? { ...item, label: e.target.value } : item) })} />
                <div className="flex gap-1"><Button type="button" variant="outline" size="icon" disabled={locked || categoryIndex === 0} aria-label="类别上移" onClick={() => { const categories = [...variable.categories]; [categories[categoryIndex - 1], categories[categoryIndex]] = [categories[categoryIndex]!, categories[categoryIndex - 1]!]; update(index, { categories }); }}><ArrowUp /></Button><Button type="button" variant="outline" size="icon" disabled={locked || categoryIndex === variable.categories.length - 1} aria-label="类别下移" onClick={() => { const categories = [...variable.categories]; [categories[categoryIndex], categories[categoryIndex + 1]] = [categories[categoryIndex + 1]!, categories[categoryIndex]!]; update(index, { categories }); }}><ArrowDown /></Button></div>
            </div>)}</div>}
            <div className="space-y-2">
                <p className="text-label" data-testid={`teacher-missing-summary-${index}`}><span className="font-medium">缺失值处理：</span><span className="whitespace-pre-wrap break-words">{missingValuesDescription(missingInputs[variable.field] ?? "[]")}</span></p>
                {!readOnly && !snapshot?.locked && <details className="rounded-control border border-border p-3">
                    <summary data-testid={`teacher-missing-settings-${index}`} className="cursor-pointer text-label text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">高级设置：自定义缺失值</summary>
                    <div className="mt-3 space-y-2">
                        <label className="text-label font-medium" htmlFor={`missing-${index}`}>缺失值编码（高级）</label>
                        <Input id={`missing-${index}`} aria-describedby={`missing-help-${index}`} disabled={locked} value={missingInputs[variable.field] ?? "[]"} onChange={e => setMissingInputs(current => ({ ...current, [variable.field]: e.target.value }))} />
                        <p id={`missing-help-${index}`} className="text-meta text-muted-foreground">仅在数据使用特殊编码表示缺失时修改。请填写 JSON 数组，例如 [null, "NA", -999]；null 表示空白单元格，文本需带双引号。数值 0 只有列入这里才会按缺失值处理。</p>
                    </div>
                </details>}
            </div>
        </section>)}
    </div>;
}

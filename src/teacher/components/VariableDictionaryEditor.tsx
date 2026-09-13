import { useEffect, useState } from "react";
import type { RawValue, VariableDictionary } from "@/domain/variables/types";
import { teacherApi, type VariableDictionaryResponse } from "../api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDown, ArrowUp } from "lucide-react";

function scalarText(value: RawValue) { return JSON.stringify(value); }
function parseScalar(value: string): RawValue {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed === "string" || typeof parsed === "boolean" || (typeof parsed === "number" && Number.isFinite(parsed))) return parsed;
    throw new Error("请输入 JSON 标量（文本需带双引号）");
}

export function VariableDictionaryEditor({ topicId, readOnly = false }: { topicId: number; readOnly?: boolean }) {
    const [snapshot, setSnapshot] = useState<VariableDictionaryResponse | null>(null);
    const [draft, setDraft] = useState<VariableDictionary | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [missingInputs, setMissingInputs] = useState<Record<string, string>>({});

    async function load() {
        setLoading(true); setError(null);
        const result = await teacherApi.getVariableDictionary(topicId);
        if (result.success && result.data) {
            setSnapshot(result.data);
            const loaded = structuredClone(result.data.dictionary ?? result.data.suggestion);
            setDraft(loaded);
            setMissingInputs(Object.fromEntries(loaded.variables.map(variable => [variable.field, `[${variable.missing.map(scalarText).join(", ")}]`])));
        } else setError(result.error?.message ?? "无法载入变量字典");
        setLoading(false);
    }
    useEffect(() => { void load(); }, [topicId]);
    function update(index: number, patch: Partial<VariableDictionary["variables"][number]>) {
        setDraft((current) => current ? { ...current, variables: current.variables.map((item, i) => i === index ? { ...item, ...patch } : item) } : current);
    }
    async function save() {
        if (!snapshot || !draft) return;
        setSaving(true); setError(null);
        const result = await teacherApi.updateVariableDictionary(topicId, { source: snapshot.source, observedRevision: snapshot.revision, dictionary: draft });
        if (result.success) await load();
        else setError(result.error?.message ?? "保存失败；输入已保留");
        setSaving(false);
    }
    if (loading) return <div role="status" className="text-label text-muted-foreground">正在读取变量字典…</div>;
    if (!draft) return <div className="space-y-3"><p className="text-label text-destructive">{error}</p><Button variant="outline" onClick={load}>重新载入</Button></div>;
    const locked = readOnly || snapshot?.locked;
    return <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-section-title">变量字典</h3><p className="text-label text-muted-foreground">逐字段确认标签、单位、测量类型、类别顺序与缺失编码。</p></div>
            {!locked && <Button onClick={save} disabled={saving}>{saving ? "保存中…" : "明确确认并保存"}</Button>}
        </div>
        {error && <div role="alert" className="rounded-surface border border-destructive-border bg-destructive-muted p-3 text-label text-destructive">{error} <Button variant="outline" className="ml-2" onClick={load}>重新载入</Button></div>}
        {draft.variables.map((variable, index) => <section key={variable.field} className="rounded-surface border border-border bg-background p-4 space-y-3">
            <div className="text-subheading font-medium">{variable.field}</div>
            <div className="grid grid-cols-3 gap-3">
                <Input aria-label={`${variable.field} 标签`} maxLength={120} disabled={locked} value={variable.label} onChange={e => update(index, { label: e.target.value })} />
                <Input aria-label={`${variable.field} 单位`} maxLength={60} disabled={locked} placeholder="单位（可空）" value={variable.unit} onChange={e => update(index, { unit: e.target.value })} />
                <Select disabled={locked} value={variable.kind} onValueChange={(kind: "continuous" | "nominal" | "ordinal") => update(index, { kind, categories: kind === "continuous" ? [] : variable.categories })}>
                    <SelectTrigger aria-label={`${variable.field} 测量类型`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="continuous">连续数值</SelectItem><SelectItem value="nominal">无序类别</SelectItem><SelectItem value="ordinal">有序类别</SelectItem></SelectContent>
                </Select>
            </div>
            {variable.kind !== "continuous" && <div className="space-y-2"><div className="text-label font-medium">类别（显示类型，可调整顺序）</div>{variable.categories.map((category, categoryIndex) => <div key={`${scalarText(category.value)}-${categoryIndex}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input disabled value={`${typeof category.value} · ${scalarText(category.value)}`} aria-label="类别类型和值" />
                <Input disabled={locked} maxLength={120} aria-label={`${variable.field} 类别标签 ${categoryIndex + 1}`} value={category.label} onChange={e => update(index, { categories: variable.categories.map((item, i) => i === categoryIndex ? { ...item, label: e.target.value } : item) })} />
                <div className="flex gap-1"><Button type="button" variant="outline" size="icon" disabled={locked || categoryIndex === 0} aria-label="类别上移" onClick={() => { const categories = [...variable.categories]; [categories[categoryIndex - 1], categories[categoryIndex]] = [categories[categoryIndex]!, categories[categoryIndex - 1]!]; update(index, { categories }); }}><ArrowUp /></Button><Button type="button" variant="outline" size="icon" disabled={locked || categoryIndex === variable.categories.length - 1} aria-label="类别下移" onClick={() => { const categories = [...variable.categories]; [categories[categoryIndex], categories[categoryIndex + 1]] = [categories[categoryIndex + 1]!, categories[categoryIndex]!]; update(index, { categories }); }}><ArrowDown /></Button></div>
            </div>)}</div>}
            <div><label className="text-label font-medium" htmlFor={`missing-${index}`}>缺失编码（JSON 标量数组）</label><Input id={`missing-${index}`} disabled={locked} value={missingInputs[variable.field] ?? "[]"} onChange={e => { const text = e.target.value; setMissingInputs(current => ({ ...current, [variable.field]: text })); try { const list = JSON.parse(text); if (Array.isArray(list)) update(index, { missing: list.map(value => parseScalar(JSON.stringify(value))) }); } catch { /* 输入文字保留，保存时仍使用上一有效值 */ } }} /></div>
        </section>)}
    </div>;
}

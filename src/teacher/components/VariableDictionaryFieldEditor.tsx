import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { MAX_VARIABLE_CATEGORIES, type MeasurementLevel } from "@/domain/experiment/variable-dictionary";
import { measurementLabels, type CodeDraft, type VariableDraft } from "./variable-dictionary-form";

const selectClass = "h-10 min-w-0 w-full rounded-control border border-input bg-card px-3 text-label text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground";
function CodeInput({ value, label, onChange }: { value: CodeDraft; label: string; onChange: (value: CodeDraft) => void }) {
    return <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
        <select aria-label={`${label}类型`} className={selectClass} value={value.kind} onChange={e => {
            const kind = e.target.value as CodeDraft["kind"];
            onChange({ kind, text: kind === "boolean" && value.text !== "false" ? "true" : value.text });
        }}><option value="string">文本</option><option value="number">数值</option><option value="boolean">布尔</option></select>
        {value.kind === "boolean" ? <select aria-label={`${label}原值`} className={selectClass} value={value.text} onChange={e => onChange({ ...value, text: e.target.value })}>
            <option value="true">true</option><option value="false">false</option>
        </select> : <Input aria-label={`${label}原值`} value={value.text} maxLength={200} onChange={e => onChange({ ...value, text: e.target.value })} />}
    </div>;
}
export function VariableDictionaryFieldEditor({ value, onChange, readOnly, saving }: {
    value: VariableDraft; onChange: (value: VariableDraft) => void; readOnly: boolean; saving: boolean;
}) {
    const categorical = value.measurementLevel === "nominal" || value.measurementLevel === "ordinal";
    const identifier = value.measurementLevel === "id";
    function move(index: number, offset: number) {
        const categories = [...value.categories];
        const target = index + offset;
        if (target < 0 || target >= categories.length) return;
        [categories[index], categories[target]] = [categories[target]!, categories[index]!];
        onChange({ ...value, categories });
    }
    return <fieldset disabled={readOnly || saving} className="min-w-0 space-y-5">
        <legend className="sr-only">当前变量配置</legend>
        <div className="rounded-surface border border-border bg-background p-3">
            <h3 className="text-label font-semibold">源字段（不可改名）</h3>
            <p className="mt-1 break-all whitespace-pre-wrap text-meta" data-testid="dictionary-source-field">{JSON.stringify(value.sourceField)}</p>
            <p className="mt-1 text-meta text-muted-foreground">{value.id} · 仅定义数据含义，不生成问卷答案，也不修改原总体表。</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2 text-label">显示名称<Input aria-label="变量显示名称" value={value.label} maxLength={200} onChange={e => onChange({ ...value, label: e.target.value })} /></label>
            <label className="space-y-2 text-label">单位<Input aria-label="变量单位" value={value.unit} maxLength={40} placeholder="如：分钟、元" onChange={e => onChange({ ...value, unit: e.target.value })} /></label>
            <label className="space-y-2 text-label">测量类型<select aria-label="变量测量类型" className={selectClass} disabled={identifier} value={value.measurementLevel} onChange={e => {
                const measurementLevel = e.target.value as MeasurementLevel;
                onChange({ ...value, measurementLevel, storageType: measurementLevel === "continuous" ? "number" : value.storageType });
            }}>{Object.entries(measurementLabels).filter(([key]) => identifier ? key === "id" : key !== "id").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="space-y-2 text-label">分析读取方式<select aria-label="变量读取方式" className={selectClass} disabled={identifier || value.measurementLevel === "continuous"} value={value.storageType} onChange={e => onChange({ ...value, storageType: e.target.value as "text" | "number" })}>
                <option value="text">文本（保留显示编码）</option><option value="number">数值（XLSX 使用原始值）</option>
            </select></label>
        </div>
        <p className="text-meta text-muted-foreground">{identifier ? "标识符及其文本读取方式与已保存的抽样字段配置保持一致。" : "数字外观不代表连续变量。改变读取方式后，请核对编码类型；不会自动把文本“01”转换成数值 1。"}</p>
        {!categorical && value.categories.length > 0 && <p className="text-meta text-warning">当前不是分类类型，保存时不保留类别表；保存前切回分类类型可恢复本地类别设置。</p>}
        {categorical && <section aria-label="类别与顺序" className="space-y-3">
            <div className="flex items-center justify-between gap-3"><h3 className="text-label font-semibold">类别与顺序（{value.categories.length}/{MAX_VARIABLE_CATEGORIES}）</h3>
                {!readOnly && <Button type="button" variant="outline" disabled={value.categories.length >= MAX_VARIABLE_CATEGORIES} onClick={() => onChange({ ...value, categories: [...value.categories, { kind: value.storageType === "number" ? "number" : "string", text: "", label: "" }] })}>添加类别</Button>}
            </div>
            <p className="text-meta text-muted-foreground">填写总体中全部真实原值及标签；有序分类按从上到下排列。服务器校验全部数据行，不只校验预览。</p>
            {value.categories.map((category, index) => <div key={index} className="space-y-2 rounded-surface border border-border p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-meta">类别 {index + 1}</span>{!readOnly && <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" aria-label={`上移类别 ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`下移类别 ${index + 1}`} disabled={index === value.categories.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" disabled={value.missingValues.length >= 20} onClick={() => onChange({ ...value, categories: value.categories.filter((_, i) => i !== index), missingValues: [...value.missingValues, { kind: category.kind, text: category.text }] })}>设为缺失</Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`删除类别 ${index + 1}`} onClick={() => onChange({ ...value, categories: value.categories.filter((_, i) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>
                </div>}</div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><p className="text-meta">原值及类型（精确匹配）</p><CodeInput label={`类别 ${index + 1} `} value={category} onChange={code => onChange({ ...value, categories: value.categories.map((c, i) => i === index ? { ...c, ...code } : c) })} /></div>
                    <div className="space-y-2"><p className="text-meta">显示标签</p><Input aria-label={`类别 ${index + 1} 标签`} placeholder="类别标签" maxLength={200} value={category.label} onChange={e => onChange({ ...value, categories: value.categories.map((c, i) => i === index ? { ...c, label: e.target.value } : c) })} /></div>
                </div>
            </div>)}
        </section>}
        {!identifier && <section aria-label="缺失编码" className="space-y-3">
            <div className="flex items-center justify-between gap-3"><h3 className="text-label font-semibold">缺失编码（{value.missingValues.length}/20）</h3>
                {!readOnly && <Button type="button" variant="outline" disabled={value.missingValues.length >= 20} onClick={() => onChange({ ...value, missingValues: [...value.missingValues, { kind: "string", text: "" }] })}>添加缺失编码</Button>}
            </div>
            <p className="text-meta text-muted-foreground">空单元格自动视为缺失；其他特殊值需在此声明。文本“99”和数值 99 不相同；不会自动补零。</p>
            {value.missingValues.map((code, index) => <div key={index} className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><CodeInput label={`缺失编码 ${index + 1} `} value={code} onChange={next => onChange({ ...value, missingValues: value.missingValues.map((v, i) => i === index ? next : v) })} /></div>
                {!readOnly && <Button type="button" variant="outline" aria-label={`删除缺失编码 ${index + 1}`} onClick={() => onChange({ ...value, missingValues: value.missingValues.filter((_, i) => i !== index) })}>删除</Button>}
            </div>)}
        </section>}
    </fieldset>;
}

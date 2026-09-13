import { Input } from "@/components/ui/input";
import type { NumericRuleDraft } from "@/lib/numeric-question-form";
export function NumericRuleEditor({ value, onChange, errorId }: { value: NumericRuleDraft; onChange: (value: NumericRuleDraft) => void; errorId?: string }) {
    return <div className="space-y-4">
        <p className="text-label text-muted-foreground">填写实际数值，不是 1–10 的有序评分。以下规则只约束认知试填，不会筛选、截断或改写已有总体数据。</p>
        <label className="block space-y-2 text-label"><span>单位（未声明时留空）</span><Input value={value.unit} aria-invalid={Boolean(errorId)} aria-describedby={errorId} maxLength={40} onChange={e => onChange({ ...value, unit: e.target.value })} data-testid="question-number-unit" placeholder="如：分钟、元、无量纲" /></label>
        <div className="grid grid-cols-2 gap-4">
            {(["min", "max"] as const).map(key => <label key={key} className="block space-y-2 text-label"><span>{key === "min" ? "下限" : "上限"}（含边界，留空不限制）</span><Input inputMode="decimal" value={value[key]} maxLength={200} onChange={e => onChange({ ...value, [key]: e.target.value })} aria-invalid={Boolean(errorId)} aria-describedby={errorId} data-testid={`question-number-${key}`} /></label>)}
        </div>
        <label className="block space-y-2 text-label"><span>最多小数位</span><select aria-label="最多小数位" aria-invalid={Boolean(errorId)} aria-describedby={errorId} value={value.decimalPlaces} onChange={e => onChange({ ...value, decimalPlaces: e.target.value })} className="h-10 w-full rounded-control border border-input bg-card px-3 text-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">不限制小数位</option>{Array.from({ length: 13 }, (_, n) => <option value={String(n)} key={n}>{n === 0 ? "0（仅整数）" : n}</option>)}</select></label>
        <p className="text-meta text-muted-foreground">不会自动舍入或换算单位。关联连续变量时，单位必须与教师字典完全一致；双方均未声明单位时仍需自行核对含义。</p>
    </div>;
}

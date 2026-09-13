import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Question } from "@/lib/questionnaire-types";
import type { VariableDefinition, VariableDictionary } from "@/domain/variables/types";
import { questionSignature } from "@/domain/variables/question-binding";

interface Props { open: boolean; onOpenChange(open: boolean): void; question: Question; dictionary: VariableDictionary; taskId: number; onConfirm(question: Question): void }

function answerLabels(question: Question) {
    if (question.type === "multiple") return ["是", "否"];
    if (question.type === "boolean") return ["是", "否"];
    if (question.type === "single") return question.options ?? [];
    if (question.type === "scale") return Array.from({ length: (question.scaleMax ?? 10) - (question.scaleMin ?? 1) + 1 }, (_, i) => String((question.scaleMin ?? 1) + i));
    return [];
}

function eligible(question: Question, variable: VariableDefinition) {
    if (question.type === "numeric") return variable.kind === "continuous" && variable.unit === (question.unit ?? "");
    if (question.type === "scale") return variable.kind === "ordinal" && variable.categories.length === answerLabels(question).length;
    const count = question.type === "multiple" ? 2 : answerLabels(question).length;
    return variable.kind === "nominal" && variable.categories.length === count;
}

export function VariableBindingDialog({ open, onOpenChange, question, dictionary, taskId, onConfirm }: Props) {
    const slots = question.type === "multiple" ? question.options ?? [] : [undefined];
    const [fields, setFields] = useState<string[]>([]);
    useEffect(() => {
        if (open) setFields(slots.map(option => question.variableBinding?.mappings.find(mapping => mapping.option === option)?.field ?? ""));
    }, [open, question]);
    const candidates = useMemo(() => dictionary.variables.filter(variable => eligible(question, variable)), [dictionary, question]);
    const valid = fields.length === slots.length && fields.every(Boolean) && new Set(fields).size === fields.length;
    const confirm = () => {
        if (!valid) return;
        const mappings = fields.map((field, index) => {
            const variable = candidates.find(item => item.field === field)!;
            const labels = answerLabels(question);
            return { field, ...(slots[index] === undefined ? {} : { option: slots[index] }), answers: labels.map((answer, categoryIndex) => ({ answer, value: variable.categories[categoryIndex]!.value })) };
        });
        onConfirm({ ...question, variableBinding: { taskId, source: dictionary.source, revision: dictionary.revision, signature: questionSignature(question), mappings } });
        onOpenChange(false);
    };
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl bg-card">
        <DialogHeader><DialogTitle>关联总体变量</DialogTitle><DialogDescription>按字典类别顺序建立一一映射。关联仅用于后续分析，不会转换单位或改变作答。</DialogDescription></DialogHeader>
        <div className="space-y-4 py-3">
            {candidates.length === 0 && <p role="alert" className="text-label text-warning">当前字典没有类型、类别数量及单位均匹配的字段。</p>}
            {slots.map((option, index) => <div className="space-y-2" key={option ?? "single"}>
                <Label>{option === undefined ? "变量字段" : `选项“${option}”的二值字段`}</Label>
                <Select value={fields[index] ?? ""} onValueChange={value => setFields(current => current.map((field, i) => i === index ? value : field))}>
                    <SelectTrigger aria-label={option === undefined ? "选择变量字段" : `选择选项${option}的变量字段`}><SelectValue placeholder="请选择" /></SelectTrigger>
                    <SelectContent>{candidates.map(variable => <SelectItem key={variable.field} value={variable.field} disabled={fields.some((field, i) => i !== index && field === variable.field)}>{variable.label}（{variable.field}）</SelectItem>)}</SelectContent>
                </Select>
                {fields[index] && question.type !== "numeric" && <p className="text-meta text-muted-foreground">{answerLabels(question).map((answer, i) => `${answer} → ${candidates.find(v => v.field === fields[index])?.categories[i]?.label}`).join("；")}</p>}
            </div>)}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button onClick={confirm} disabled={!valid}>确认关联</Button></DialogFooter>
    </DialogContent></Dialog>;
}

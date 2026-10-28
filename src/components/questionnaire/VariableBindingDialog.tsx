import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Question } from "@/lib/questionnaire-types";
import type { RawValue, VariableDefinition, VariableDictionary } from "@/domain/variables/types";
import { bindingCategories, questionSignature } from "@/domain/variables/question-binding";
import { valueKey } from "@/domain/variables/dictionary";

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
    const categories = bindingCategories(variable);
    if (question.type === "scale") return variable.kind === "ordinal" && categories.length === answerLabels(question).length;
    if (question.type === "single") {
        const extra = answerLabels(question).length - categories.length;
        return (variable.kind === "nominal" || variable.kind === "ordinal")
            && (extra === 0 || (extra === 1 && variable.missing.length > 0));
    }
    const count = question.type === "multiple" ? 2 : answerLabels(question).length;
    return variable.kind === "nominal" && categories.length === count;
}

function missingLabel(value: RawValue, variable: VariableDefinition) {
    const label = variable.categories.find(category => valueKey(category.value) === valueKey(value))?.label
        ?? (value === null ? "空白" : typeof value === "string" ? `“${value}”` : String(value));
    return `${label}（缺失，不计入有效分母）`;
}

export function VariableBindingDialog({ open, onOpenChange, question, dictionary, taskId, onConfirm }: Props) {
    const slots = question.type === "multiple" ? question.options ?? [] : [undefined];
    const [fields, setFields] = useState<string[]>([]);
    const [missingAnswer, setMissingAnswer] = useState("");
    const [missingKey, setMissingKey] = useState("");
    useEffect(() => {
        if (!open) return;
        const mappings = slots.map(option => question.variableBinding?.mappings.find(mapping => mapping.option === option));
        setFields(mappings.map(mapping => mapping?.field ?? ""));
        const variable = dictionary.variables.find(item => item.field === mappings[0]?.field);
        const missing = mappings[0]?.answers.find(item => variable?.missing.some(value => valueKey(value) === valueKey(item.value)));
        setMissingAnswer(missing?.answer ?? "");
        setMissingKey(missing ? valueKey(missing.value) : variable?.missing.length === 1 ? valueKey(variable.missing[0]!) : "");
    }, [open, question, dictionary]);
    const candidates = useMemo(() => dictionary.variables.filter(variable => eligible(question, variable)), [dictionary, question]);
    const selected = candidates.find(variable => variable.field === fields[0]);
    const needsMissing = question.type === "single" && selected
        && answerLabels(question).length === bindingCategories(selected).length + 1;
    const missingValue = selected?.missing.find(value => valueKey(value) === missingKey);
    const valid = fields.length === slots.length && fields.every(field => candidates.some(variable => variable.field === field))
        && new Set(fields).size === fields.length
        && (!needsMissing || (answerLabels(question).includes(missingAnswer) && missingValue !== undefined));
    const answersFor = (variable: VariableDefinition) => {
        let categoryIndex = 0;
        const categories = bindingCategories(variable);
        return answerLabels(question).map(answer => ({ answer, value: needsMissing && answer === missingAnswer
            ? missingValue! : categories[categoryIndex++]!.value }));
    };
    const confirm = () => {
        if (!valid) return;
        const mappings = fields.map((field, index) => {
            const variable = candidates.find(item => item.field === field)!;
            return { field, ...(slots[index] === undefined ? {} : { option: slots[index] }), answers: answersFor(variable) };
        });
        onConfirm({ ...question, variableBinding: { taskId, source: dictionary.source, revision: dictionary.revision, signature: questionSignature(question), mappings } });
        onOpenChange(false);
    };
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl bg-card">
        <DialogHeader><DialogTitle>关联总体变量</DialogTitle><DialogDescription>有效选项按字典类别顺序建立一一映射；单选题如有缺失选项，请明确指定。关联不会转换单位或改变作答。</DialogDescription></DialogHeader>
        <div className="space-y-4 py-3">
            {candidates.length === 0 && <p role="alert" className="text-label text-warning">当前字典没有类型、类别数量及单位均匹配的字段。</p>}
            {slots.map((option, index) => <div className="space-y-2" key={option ?? "single"}>
                <Label>{option === undefined ? "变量字段" : `选项“${option}”的二值字段`}</Label>
                <Select value={fields[index] ?? ""} onValueChange={value => {
                    setFields(current => current.map((field, i) => i === index ? value : field));
                    setMissingAnswer("");
                    const variable = candidates.find(item => item.field === value);
                    setMissingKey(variable?.missing.length === 1 ? valueKey(variable.missing[0]!) : "");
                }}>
                    <SelectTrigger aria-label={option === undefined ? "选择变量字段" : `选择选项${option}的变量字段`}><SelectValue placeholder="请选择" /></SelectTrigger>
                    <SelectContent>{candidates.map(variable => <SelectItem key={variable.field} value={variable.field} disabled={fields.some((field, i) => i !== index && field === variable.field)}>{variable.label}（{variable.field}）</SelectItem>)}</SelectContent>
                </Select>
                {fields[index] && question.type !== "numeric" && (!needsMissing || valid) && <p className="text-meta text-muted-foreground">{(() => {
                    const variable = candidates.find(item => item.field === fields[index]);
                    if (!variable) return "";
                    return answersFor(variable).map(item => `${item.answer} → ${variable.missing.some(value => valueKey(value) === valueKey(item.value))
                        ? missingLabel(item.value, variable) : bindingCategories(variable).find(category => valueKey(category.value) === valueKey(item.value))?.label}`).join("；");
                })()}</p>}
            </div>)}
            {needsMissing && selected && <div className="space-y-2">
                <Label>不计入有效分母的选项</Label>
                <Select value={missingAnswer} onValueChange={setMissingAnswer}>
                    <SelectTrigger aria-label="选择缺失选项"><SelectValue placeholder="请选择，系统不会自动推断" /></SelectTrigger>
                    <SelectContent>{answerLabels(question).map(answer => <SelectItem key={answer} value={answer}>{answer}</SelectItem>)}</SelectContent>
                </Select>
                {selected.missing.length > 1 ? <>
                    <Label>对应的缺失值</Label>
                    <Select value={missingKey} onValueChange={setMissingKey}>
                        <SelectTrigger aria-label="选择缺失值"><SelectValue placeholder="请选择" /></SelectTrigger>
                        <SelectContent>{selected.missing.map(value => <SelectItem key={valueKey(value)} value={valueKey(value)}>{missingLabel(value, selected)}</SelectItem>)}</SelectContent>
                    </Select>
                </> : <p className="text-meta text-muted-foreground">对应{missingLabel(selected.missing[0]!, selected)}</p>}
            </div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button><Button onClick={confirm} disabled={!valid}>确认关联</Button></DialogFooter>
    </DialogContent></Dialog>;
}

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Question, QuestionType } from "@/lib/questionnaire-types";
import type { RawValue, VariableDefinition, VariableDictionary } from "@/domain/variables/types";
import { bindingCategories, questionSignature } from "@/domain/variables/question-binding";
import { valueKey } from "@/domain/variables/dictionary";
import { QUESTION_SECTION_LABELS } from "@/lib/questionnaire-templates";

interface Props {
    open: boolean;
    onOpenChange(open: boolean): void;
    question: Question;
    dictionary: VariableDictionary;
    taskId: number;
    otherBoundFields?: ReadonlyMap<string, number>;
    onConfirm(question: Question): void;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    boolean: "是/否题",
    single: "单选题",
    multiple: "多选题",
    scale: "评分题",
    numeric: "数值题",
};

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

function describeMatchingRule(question: Question): string {
    if (question.type === "numeric") {
        const unitLabel = question.unit?.trim() ? `单位同为「${question.unit.trim()}」` : "无单位（单位留空）";
        return `本题为「数值题」，仅能关联数据字典中${unitLabel}的连续型变量。`;
    }
    if (question.type === "scale") {
        const points = (question.scaleMax ?? 10) - (question.scaleMin ?? 1) + 1;
        return `本题为「${points} 点评分题」，仅能关联含 ${points} 个有效等级的有序变量。`;
    }
    if (question.type === "single") {
        const count = (question.options ?? []).length;
        return `本题为「单选题」（${count} 个选项），需关联含 ${count} 个有效类别（或 ${Math.max(1, count - 1)} 个有效类别加 1 个缺失类别）的名义/有序变量。`;
    }
    if (question.type === "boolean") {
        const screeningNote = question.section === "screening"
            ? "提示：受访资格甄别题通常仅用于开场筛选，若抽样框中无对应二值名义字段则无需绑定。"
            : "";
        return `本题为「是/否题」，仅能关联含 2 个有效类别的名义变量。${screeningNote}`;
    }
    return "本题为「多选题」，每个选项需分别关联含 2 个有效类别（是/否）的二值名义变量。";
}

function missingLabel(value: RawValue, variable: VariableDefinition) {
    const label = variable.categories.find(category => valueKey(category.value) === valueKey(value))?.label
        ?? (value === null ? "空白" : typeof value === "string" ? `“${value}”` : String(value));
    return `${label}（缺失，不计入有效分母）`;
}

export function VariableBindingDialog({ open, onOpenChange, question, dictionary, taskId, otherBoundFields, onConfirm }: Props) {
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
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl bg-card">
                <DialogHeader>
                    <DialogTitle>关联总体变量</DialogTitle>
                    <DialogDescription>
                        有效选项按字典类别顺序建立一一映射；单选题如有缺失选项，请明确指定。关联不会转换单位或改变作答。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="rounded-surface border border-border bg-muted p-3 space-y-1">
                        <div className="text-meta font-medium text-muted-foreground">
                            {QUESTION_SECTION_LABELS[question.section ?? "main"]} · {QUESTION_TYPE_LABELS[question.type]}
                            {question.type === "numeric" && ` · 单位：${question.unit?.trim() || "无"}`}
                            {question.type === "scale" && ` · ${question.scaleMin ?? 1}–${question.scaleMax ?? 5} 分`}
                        </div>
                        <p className="text-label font-medium text-foreground break-words">{question.content}</p>
                    </div>

                    {candidates.length === 0 ? (
                        <div role="alert" className="rounded-surface border border-warning-border bg-warning-muted p-3.5 space-y-1.5 text-warning">
                            <p className="text-label font-semibold">当前字典没有类型、类别数量及单位均匹配的字段。</p>
                            <p className="text-meta leading-relaxed">{describeMatchingRule(question)}</p>
                        </div>
                    ) : (
                        <>
                            {slots.map((option, index) => (
                                <div className="space-y-2" key={option ?? "single"}>
                                    <Label>{option === undefined ? "变量字段" : `选项“${option}”的二值字段`}</Label>
                                    <Select value={fields[index] ?? ""} onValueChange={value => {
                                        setFields(current => current.map((field, i) => i === index ? value : field));
                                        setMissingAnswer("");
                                        const variable = candidates.find(item => item.field === value);
                                        setMissingKey(variable?.missing.length === 1 ? valueKey(variable.missing[0]!) : "");
                                    }}>
                                        <SelectTrigger className="w-full" aria-label={option === undefined ? "选择变量字段" : `选择选项${option}的变量字段`}>
                                            <SelectValue placeholder="请选择" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {candidates.map(variable => {
                                                const otherQNum = otherBoundFields?.get(variable.field);
                                                return (
                                                    <SelectItem
                                                        key={variable.field}
                                                        value={variable.field}
                                                        disabled={fields.some((field, i) => i !== index && field === variable.field)}
                                                    >
                                                        {variable.label}（{variable.field}）{otherQNum ? ` · 已在 Q${otherQNum} 绑定` : ""}
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                    {fields[index] && otherBoundFields?.has(fields[index]!) && (
                                        <p className="text-meta text-warning">
                                            提示：字段「{fields[index]}」已在第 Q{otherBoundFields.get(fields[index]!)} 题绑定，建议避免重复测量同一指标。
                                        </p>
                                    )}
                                    {fields[index] && question.type !== "numeric" && (!needsMissing || valid) && (
                                        <p className="text-meta text-muted-foreground">
                                            {(() => {
                                                const variable = candidates.find(item => item.field === fields[index]);
                                                if (!variable) return "";
                                                return answersFor(variable).map(item => `${item.answer} → ${variable.missing.some(value => valueKey(value) === valueKey(item.value))
                                                    ? missingLabel(item.value, variable)
                                                    : bindingCategories(variable).find(category => valueKey(category.value) === valueKey(item.value))?.label}`).join("；");
                                            })()}
                                        </p>
                                    )}
                                </div>
                            ))}
                            {needsMissing && selected && (
                                <div className="space-y-2">
                                    <Label>不计入有效分母的选项</Label>
                                    <Select value={missingAnswer} onValueChange={setMissingAnswer}>
                                        <SelectTrigger className="w-full" aria-label="选择缺失选项">
                                            <SelectValue placeholder="请选择，系统不会自动推断" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {answerLabels(question).map(answer => (
                                                <SelectItem key={answer} value={answer}>{answer}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {selected.missing.length > 1 ? (
                                        <>
                                            <Label>对应的缺失值</Label>
                                            <Select value={missingKey} onValueChange={setMissingKey}>
                                                <SelectTrigger className="w-full" aria-label="选择缺失值">
                                                    <SelectValue placeholder="请选择" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {selected.missing.map(value => (
                                                        <SelectItem key={valueKey(value)} value={valueKey(value)}>{missingLabel(value, selected)}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </>
                                    ) : (
                                        <p className="text-meta text-muted-foreground">对应{missingLabel(selected.missing[0]!, selected)}</p>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    {candidates.length > 0 && <Button onClick={confirm} disabled={!valid}>确认关联</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

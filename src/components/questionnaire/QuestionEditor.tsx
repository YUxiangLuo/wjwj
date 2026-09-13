import { useState, useEffect, useId } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type { Question, QuestionSection, QuestionType } from "@/lib/questionnaire-types";
import { QUESTION_SECTION_LABELS } from "@/lib/questionnaire-templates";
import { generateOptionIdentity, getDuplicateOptionIndexes } from "@/lib/questionnaire-options";

interface QuestionEditorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    question?: Question;
    onSave: (question: Question) => void;
}

const questionTypeLabels: Record<QuestionType, string> = {
    boolean: "是/否题",
    single: "单选题",
    multiple: "多选题",
    scale: "评分题",
};

const questionTypeDescriptions: Record<QuestionType, string> = {
    boolean: "固定「是」「否」两个选项",
    single: "从多个选项中选择一个",
    multiple: "从多个选项中选择多个",
    scale: "有序评分题，可选择常用的 Likert 型题项或一般评分预设",
};

interface LikertPreset {
    label: string;
    scaleMin: number;
    scaleMax: number;
    scaleMinLabel: string;
    scaleMaxLabel: string;
}

const LIKERT_PRESETS: LikertPreset[] = [
    { label: "5点 Likert 型题项（非常不同意—非常同意）", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不同意", scaleMaxLabel: "非常同意" },
    { label: "5点评分（非常不满意—非常满意）", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
    { label: "5点评分（从不—总是）", scaleMin: 1, scaleMax: 5, scaleMinLabel: "从不", scaleMaxLabel: "总是" },
    { label: "7点 Likert 型题项（非常不同意—非常同意）", scaleMin: 1, scaleMax: 7, scaleMinLabel: "非常不同意", scaleMaxLabel: "非常同意" },
    { label: "7点评分（非常不满意—非常满意）", scaleMin: 1, scaleMax: 7, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
    { label: "10点评分（非常不满意—非常满意）", scaleMin: 1, scaleMax: 10, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
];

function generateId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function QuestionEditor({ open, onOpenChange, question, onSave }: QuestionEditorProps) {
    const isEditing = !!question;
    const optionErrorId = useId();
    const ruleErrorId = useId();

    const [type, setType] = useState<QuestionType>(question?.type ?? "single");
    const [content, setContent] = useState(question?.content ?? "");
    const [section, setSection] = useState<QuestionSection>(question?.section ?? "main");
    const [options, setOptions] = useState<string[]>(question?.options ?? ["", ""]);
    const [optionIds, setOptionIds] = useState<string[]>([]);
    const [minSelect, setMinSelect] = useState<number | string>(question?.minSelect ?? 1);
    const [maxSelect, setMaxSelect] = useState<number | string>(question?.maxSelect ?? 3);
    const [scaleMin, setScaleMin] = useState<number | string>(question?.scaleMin ?? 1);
    const [scaleMax, setScaleMax] = useState<number | string>(question?.scaleMax ?? 5);
    const [scaleMinLabel, setScaleMinLabel] = useState(question?.scaleMinLabel ?? "非常不同意");
    const [scaleMaxLabel, setScaleMaxLabel] = useState(question?.scaleMaxLabel ?? "非常同意");

    useEffect(() => {
        if (question) {
            setType(question.type);
            setContent(question.content);
            setSection(question.section ?? "main");
            setOptions(question.options ?? ["", ""]);
            setOptionIds(question.optionIds ?? (question.options ?? ["", ""]).map(() => generateOptionIdentity()));
            setMinSelect(question.minSelect ?? 1);
            setMaxSelect(question.maxSelect ?? 3);
            setScaleMin(question.scaleMin ?? 1);
            setScaleMax(question.scaleMax ?? 5);
            setScaleMinLabel(question.scaleMinLabel ?? "非常不同意");
            setScaleMaxLabel(question.scaleMaxLabel ?? "非常同意");
        } else {
            setType("single");
            setContent("");
            setSection("main");
            setOptions(["", ""]);
            setOptionIds([generateOptionIdentity(), generateOptionIdentity()]);
            setMinSelect(1);
            setMaxSelect(3);
            setScaleMin(1);
            setScaleMax(5);
            setScaleMinLabel("非常不同意");
            setScaleMaxLabel("非常同意");
        }
    }, [question, open]);

    const addOption = () => {
        if (options.length < 10) {
            setOptions([...options, ""]);
            setOptionIds([...optionIds, generateOptionIdentity()]);
        }
    };

    const removeOption = (index: number) => {
        if (options.length > 2) {
            setOptions(options.filter((_, i) => i !== index));
            setOptionIds(optionIds.filter((_, i) => i !== index));
        }
    };

    const updateOption = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const numberValue = (value: number | string) => typeof value === "string" && !/^(?:0|[1-9]\d*)$/.test(value) ? NaN : Number(value);
    const minCount = numberValue(minSelect), maxCount = numberValue(maxSelect);
    const minScore = numberValue(scaleMin), maxScore = numberValue(scaleMax);
    const validOptionCount = options.filter(option => option.trim()).length;
    const ruleError = type === "multiple" && (!Number.isInteger(minCount) || !Number.isInteger(maxCount) || minCount < 1 || maxCount < minCount || maxCount > validOptionCount)
        ? "选择数量需为整数格式（不使用小数或科学计数法），且满足 1 ≤ 最少选择数 ≤ 最多选择数 ≤ 有效选项数。"
        : type === "scale" && (!Number.isInteger(minScore) || !Number.isInteger(maxScore) || minScore < 1 || maxScore > 10 || minScore >= maxScore)
            ? "评分范围需为 1–10 内的整数格式，且最小值小于最大值；不使用小数或科学计数法，不会自动取整。" : null;
    const duplicateOptions = type === "single" || type === "multiple" ? getDuplicateOptionIndexes(options) : [];
    const emptyOptions = options.flatMap((option, index) => option.trim() ? [] : [index + 1]);
    const optionMessage = duplicateOptions.length ? `第 ${duplicateOptions.join("、")} 个选项内容重复，请修改后保存。`
        : emptyOptions.length ? `第 ${emptyOptions.join("、")} 个选项为空，请填写或明确删除，不会自动忽略。` : null;

    const isValid = () => {
        if (!content.trim() || content.length > 500) return false;

        if (type === "single" || type === "multiple") {
            if (options.length < 2 || options.length > 10 || optionMessage) return false;
        }

        if (ruleError) return false;

        return true;
    };

    const handleSave = () => {
        if (!isValid()) return;

        const savedQuestion: Question = {
            id: question?.id ?? generateId(),
            type,
            content: content.trim(),
            section,
        };
        if (question?.recommendSourceId) {
            savedQuestion.recommendSourceId = question.recommendSourceId;
        }

        if (type === "single" || type === "multiple") {
            savedQuestion.options = [...options];
            savedQuestion.optionIds = [...optionIds];
        }

        if (type === "multiple") {
            savedQuestion.minSelect = minCount;
            savedQuestion.maxSelect = maxCount;
        }

        if (type === "scale") {
            savedQuestion.scaleMin = minScore;
            savedQuestion.scaleMax = maxScore;
            savedQuestion.scaleMinLabel = scaleMinLabel;
            savedQuestion.scaleMaxLabel = scaleMaxLabel;
        }

        onSave(savedQuestion);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden bg-card text-foreground"
                data-testid="student-question-editor"
                onInteractOutside={event => event.preventDefault()}
            >
                <DialogHeader className="shrink-0">
                    <DialogTitle className="text-section-title font-semibold text-foreground">
                        {isEditing ? "编辑题目" : "添加题目"}
                    </DialogTitle>
                    <DialogDescription>
                        配置题目类型、题干、选项和作答规则。
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 space-y-6 overflow-y-auto py-4 pr-2" data-testid="question-editor-fields">
                    <div className="space-y-2">
                        <Label className="text-foreground">问卷部分</Label>
                        <Select value={section} onValueChange={(value) => setSection(value as QuestionSection)}>
                            <SelectTrigger aria-label="选择题目所属问卷部分" className="w-full bg-card"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {(Object.keys(QUESTION_SECTION_LABELS) as QuestionSection[]).map((key) => (
                                    <SelectItem key={key} value={key}>{QUESTION_SECTION_LABELS[key]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {!isEditing && (
                        <div className="space-y-2">
                            <Label className="text-muted-foreground">题目类型</Label>
                            <Tabs value={type} onValueChange={(v) => setType(v as QuestionType)}>
                                <TabsList className="grid grid-cols-4 w-full bg-background border border-border p-1" data-testid="student-question-type-list">
                                    {(Object.keys(questionTypeLabels) as QuestionType[]).map((t) => (
                                        <TabsTrigger
                                            key={t}
                                            value={t}
                                            data-testid={`student-question-type-${t}`}
                                            className="text-meta data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground data-[state=inactive]:hover:text-foreground"
                                        >
                                            {questionTypeLabels[t]}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                            <p className="text-meta text-muted-foreground pl-1">
                                {questionTypeDescriptions[type]}
                            </p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="content" className="text-foreground">
                            题目内容 <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                            id="content"
                            placeholder="请输入题目内容"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={3}
                            maxLength={500}
                            data-testid="student-question-content"
                            className="bg-card border-input text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring"
                        />
                        <p className="text-meta text-muted-foreground text-right">
                            {content.length}/500
                        </p>
                    </div>

                    {type === "boolean" && (
                        <div className="p-4 bg-muted rounded-surface border border-input">
                            <p className="text-label text-muted-foreground">
                                是/否题固定提供「是」和「否」两个选项
                            </p>
                        </div>
                    )}

                    {(type === "single" || type === "multiple") && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-foreground">选项（2-10个）</Label>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={addOption}
                                    disabled={options.length >= 10}
                                    data-testid="student-question-add-option"
                                    className="border-primary-border text-primary hover:bg-primary-muted hover:text-primary"
                                >
                                    <Plus className="w-4 h-4 mr-1" />
                                    添加选项
                                </Button>
                            </div>
                            {optionMessage && <p id={optionErrorId} role="alert" className="text-meta text-destructive" data-testid="question-option-error">{optionMessage}</p>}
                            <div className="space-y-2">
                                {options.map((option, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-label text-muted-foreground w-6 font-mono">
                                            {String.fromCharCode(65 + index)}.
                                        </span>
                                        <Input
                                            placeholder={`选项 ${index + 1}`}
                                            aria-invalid={duplicateOptions.includes(index + 1) || emptyOptions.includes(index + 1) || undefined}
                                            aria-describedby={duplicateOptions.includes(index + 1) || emptyOptions.includes(index + 1) ? optionErrorId : undefined}
                                            value={option}
                                            onChange={(e) => updateOption(index, e.target.value)}
                                            maxLength={200}
                                            data-testid={`student-question-option-${index + 1}`}
                                            className="flex-1 bg-card border-input text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`删除选项 ${index + 1}`}
                                            onClick={() => removeOption(index)}
                                            disabled={options.length <= 2}
                                            data-testid={`student-question-remove-option-${index + 1}`}
                                            className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive-muted"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {type === "multiple" && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="minSelect" className="text-muted-foreground">最少选择数</Label>
                                <Input
                                    id="minSelect"
                                    type="number"
                                    min={1}
                                    max={options.length}
                                    value={minSelect}
                                    onChange={(e) => setMinSelect(e.target.value)}
                                    aria-invalid={Boolean(ruleError)} aria-describedby={ruleError ? ruleErrorId : undefined}
                                    data-testid="student-question-min-select"
                                    className="bg-card border-input text-foreground focus:border-ring"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="maxSelect" className="text-muted-foreground">最多选择数</Label>
                                <Input
                                    id="maxSelect"
                                    type="number"
                                    min={1}
                                    max={options.length}
                                    value={maxSelect}
                                    onChange={(e) => setMaxSelect(e.target.value)}
                                    aria-invalid={Boolean(ruleError)} aria-describedby={ruleError ? ruleErrorId : undefined}
                                    data-testid="student-question-max-select"
                                    className="bg-card border-input text-foreground focus:border-ring"
                                />
                            </div>
                        </div>
                    )}

                    {type === "scale" && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-muted-foreground">常用评分预设</Label>
                                <div className="grid grid-cols-1 gap-1.5">
                                    {LIKERT_PRESETS.map((preset, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                                setScaleMin(preset.scaleMin);
                                                setScaleMax(preset.scaleMax);
                                                setScaleMinLabel(preset.scaleMinLabel);
                                                setScaleMaxLabel(preset.scaleMaxLabel);
                                            }}
                                            data-testid={`student-question-scale-preset-${idx}`}
                                            className={`text-left px-3 py-2 text-meta rounded-surface border transition-none ${
                                                minScore === preset.scaleMin && maxScore === preset.scaleMax && scaleMinLabel === preset.scaleMinLabel && scaleMaxLabel === preset.scaleMaxLabel
                                                    ? "border-primary bg-primary-muted text-primary"
                                                    : "border-border text-muted-foreground hover:border-input"
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="scaleMin" className="text-muted-foreground">评分最小值</Label>
                                    <Input
                                        id="scaleMin"
                                        type="number"
                                        min={1}
                                        max={Number.isFinite(maxScore) ? maxScore - 1 : 9}
                                        value={scaleMin}
                                        onChange={(e) => setScaleMin(e.target.value)}
                                        aria-invalid={Boolean(ruleError)} aria-describedby={ruleError ? ruleErrorId : undefined}
                                        data-testid="student-question-scale-min"
                                        className="bg-card border-input text-foreground focus:border-ring"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="scaleMax" className="text-muted-foreground">评分最大值</Label>
                                    <Input
                                        id="scaleMax"
                                        type="number"
                                        min={Number.isFinite(minScore) ? minScore + 1 : 2}
                                        max={10}
                                        value={scaleMax}
                                        onChange={(e) => setScaleMax(e.target.value)}
                                        aria-invalid={Boolean(ruleError)} aria-describedby={ruleError ? ruleErrorId : undefined}
                                        data-testid="student-question-scale-max"
                                        className="bg-card border-input text-foreground focus:border-ring"
                                    />
                                </div>
                            </div>
                            <p className="text-label text-muted-foreground">
                                评分范围：{scaleMin} - {scaleMax} 分
                            </p>
                            {!ruleError && (maxScore - minScore + 1) % 2 === 0 && (
                                <p className="rounded-surface border border-warning-border bg-warning-muted px-3 py-2 text-meta text-warning">
                                    当前为偶数个评分点。典型 Likert 型题项通常使用 5 点或 7 点以保留中立选项；10 点一般评分可以使用，但应明确它不是典型 Likert 型题项。
                                </p>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="scaleMinLabel" className="text-muted-foreground">左端标签 ({scaleMin}分)</Label>
                                    <Input
                                        id="scaleMinLabel"
                                        placeholder="例如：非常不同意"
                                        value={scaleMinLabel}
                                        onChange={(e) => setScaleMinLabel(e.target.value)}
                                        maxLength={50}
                                        data-testid="student-question-scale-min-label"
                                        className="bg-card border-input text-foreground focus:border-ring"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="scaleMaxLabel" className="text-muted-foreground">右端标签 ({scaleMax}分)</Label>
                                    <Input
                                        id="scaleMaxLabel"
                                        placeholder="例如：非常同意"
                                        value={scaleMaxLabel}
                                        onChange={(e) => setScaleMaxLabel(e.target.value)}
                                        maxLength={50}
                                        data-testid="student-question-scale-max-label"
                                        className="bg-card border-input text-foreground focus:border-ring"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    {ruleError && <p id={ruleErrorId} role="alert" className="text-label text-destructive">{ruleError}</p>}
                </div>

                <DialogFooter className="shrink-0 gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        data-testid="student-question-cancel"
                        className="border-input bg-transparent text-foreground hover:bg-muted hover:text-foreground"
                    >
                        取消
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!isValid()}
                        data-testid="student-question-save"
                        className="bg-primary hover:bg-primary-hover text-primary-foreground "
                    >
                        保存
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default QuestionEditor;

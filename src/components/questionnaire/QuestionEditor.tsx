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
import { getDuplicateOptionIndexes } from "@/lib/questionnaire-options";

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
    numeric: "数值题",
};

const questionTypeDescriptions: Record<QuestionType, string> = {
    boolean: "固定「是」「否」两个选项",
    single: "从多个选项中选择一个",
    multiple: "从多个选项中选择多个",
    scale: "有序评分题，可选择常用的 Likert 型题项或一般评分预设",
    numeric: "输入指定单位和精度的数值",
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

    const [type, setType] = useState<QuestionType>(question?.type ?? "single");
    const [content, setContent] = useState(question?.content ?? "");
    const [section, setSection] = useState<QuestionSection>(question?.section ?? "main");
    const [options, setOptions] = useState<string[]>(question?.options ?? ["", ""]);
    const [minSelect, setMinSelect] = useState(question?.minSelect ?? 1);
    const [maxSelect, setMaxSelect] = useState(question?.maxSelect ?? 3);
    const [scaleMin, setScaleMin] = useState(question?.scaleMin ?? 1);
    const [scaleMax, setScaleMax] = useState(question?.scaleMax ?? 5);
    const [scaleMinLabel, setScaleMinLabel] = useState(question?.scaleMinLabel ?? "非常不同意");
    const [scaleMaxLabel, setScaleMaxLabel] = useState(question?.scaleMaxLabel ?? "非常同意");
    const [unit, setUnit] = useState(question?.unit ?? "");
    const [numericMin, setNumericMin] = useState(question?.numericMin?.toString() ?? "");
    const [numericMax, setNumericMax] = useState(question?.numericMax?.toString() ?? "");
    const [decimalPlaces, setDecimalPlaces] = useState(question?.decimalPlaces ?? 0);

    const dirty = JSON.stringify([type, content, section, options, minSelect, maxSelect,
        scaleMin, scaleMax, scaleMinLabel, scaleMaxLabel, unit, numericMin, numericMax, decimalPlaces]) !== JSON.stringify([
        question?.type ?? "single", question?.content ?? "", question?.section ?? "main", question?.options ?? ["", ""],
        question?.minSelect ?? 1, question?.maxSelect ?? 3, question?.scaleMin ?? 1, question?.scaleMax ?? 5,
        question?.scaleMinLabel ?? "非常不同意", question?.scaleMaxLabel ?? "非常同意", question?.unit ?? "",
        question?.numericMin?.toString() ?? "", question?.numericMax?.toString() ?? "", question?.decimalPlaces ?? 0,
    ]);
    const requestOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && dirty && !window.confirm("关闭会丢弃本题未保存的修改。确定关闭吗？")) return;
        onOpenChange(nextOpen);
    };
    useEffect(() => {
        if (!open || !dirty) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [open, dirty]);

    useEffect(() => {
        if (question) {
            setType(question.type);
            setContent(question.content);
            setSection(question.section ?? "main");
            setOptions(question.options ?? ["", ""]);
            setMinSelect(question.minSelect ?? 1);
            setMaxSelect(question.maxSelect ?? 3);
            setScaleMin(question.scaleMin ?? 1);
            setScaleMax(question.scaleMax ?? 5);
            setScaleMinLabel(question.scaleMinLabel ?? "非常不同意");
            setScaleMaxLabel(question.scaleMaxLabel ?? "非常同意");
            setUnit(question.unit ?? ""); setNumericMin(question.numericMin?.toString() ?? ""); setNumericMax(question.numericMax?.toString() ?? ""); setDecimalPlaces(question.decimalPlaces ?? 0);
        } else {
            setType("single");
            setContent("");
            setSection("main");
            setOptions(["", ""]);
            setMinSelect(1);
            setMaxSelect(3);
            setScaleMin(1);
            setScaleMax(5);
            setScaleMinLabel("非常不同意");
            setScaleMaxLabel("非常同意");
            setUnit(""); setNumericMin(""); setNumericMax(""); setDecimalPlaces(0);
        }
    }, [question, open]);

    const addOption = () => {
        if (options.length < 10) {
            setOptions([...options, ""]);
        }
    };

    const removeOption = (index: number) => {
        if (options.length > 2) {
            setOptions(options.filter((_, i) => i !== index));
        }
    };

    const updateOption = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const duplicateOptions = type === "single" || type === "multiple" ? getDuplicateOptionIndexes(options) : [];
    const duplicateMessage = `第 ${duplicateOptions.join("、")} 个选项内容重复，请修改后保存。`;

    const isValid = () => {
        if (!content.trim() || content.length > 500) return false;

        if (type === "single" || type === "multiple") {
            const validOptions = options.filter((o) => o.trim());
            if (validOptions.length < 2 || duplicateOptions.length > 0) return false;
        }

        if (type === "multiple") {
            const validCount = options.filter((o) => o.trim()).length;
            if (minSelect < 1 || maxSelect < minSelect || maxSelect > validCount) return false;
        }

        if (type === "numeric") {
            if (!Number.isSafeInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 10) return false;
            if (numericMin !== "" && !Number.isFinite(Number(numericMin))) return false;
            if (numericMax !== "" && !Number.isFinite(Number(numericMax))) return false;
            if (numericMin !== "" && numericMax !== "" && Number(numericMin) > Number(numericMax)) return false;
        }

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
            savedQuestion.options = options.filter((o) => o.trim());
        }

        if (type === "multiple") {
            const validCount = savedQuestion.options?.length ?? 3;
            savedQuestion.minSelect = Math.max(1, Math.min(minSelect, validCount));
            savedQuestion.maxSelect = Math.max(savedQuestion.minSelect, Math.min(maxSelect, validCount));
        }

        if (type === "scale") {
            savedQuestion.scaleMin = scaleMin;
            savedQuestion.scaleMax = scaleMax;
            savedQuestion.scaleMinLabel = scaleMinLabel;
            savedQuestion.scaleMaxLabel = scaleMaxLabel;
        }
        if (type === "numeric") {
            savedQuestion.unit = unit.trim();
            savedQuestion.decimalPlaces = decimalPlaces;
            if (numericMin !== "") savedQuestion.numericMin = Number(numericMin);
            if (numericMax !== "") savedQuestion.numericMax = Number(numericMax);
        }
        if (question?.variableBinding) {
            const oldSemantic = { ...question, id: savedQuestion.id, variableBinding: undefined };
            const nextSemantic = { ...savedQuestion, variableBinding: undefined };
            if (JSON.stringify(oldSemantic) === JSON.stringify(nextSemantic)) savedQuestion.variableBinding = question.variableBinding;
        }

        onSave(savedQuestion);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={requestOpenChange}>
            <DialogContent
                className="max-h-[85vh] max-w-2xl overflow-y-auto bg-card text-foreground"
                data-testid="student-question-editor"
            >
                <DialogHeader>
                    <DialogTitle className="text-section-title font-semibold text-foreground">
                        {isEditing ? "编辑题目" : "添加题目"}
                    </DialogTitle>
                    <DialogDescription>
                        配置题目类型、题干、选项和作答规则。
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
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
                                <TabsList className="grid grid-cols-5 w-full bg-background border border-border p-1" data-testid="student-question-type-list">
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
                            {duplicateOptions.length > 0 && <p id={optionErrorId} role="alert" className="text-meta text-destructive" data-testid="question-option-error">{duplicateMessage}</p>}
                            <div className="space-y-2">
                                {options.map((option, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-label text-muted-foreground w-6 font-mono">
                                            {String.fromCharCode(65 + index)}.
                                        </span>
                                        <Input
                                            placeholder={`选项 ${index + 1}`}
                                            aria-invalid={duplicateOptions.includes(index + 1) || undefined}
                                            aria-describedby={duplicateOptions.includes(index + 1) ? optionErrorId : undefined}
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
                                    onChange={(e) => setMinSelect(parseInt(e.target.value) || 1)}
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
                                    onChange={(e) => setMaxSelect(parseInt(e.target.value) || options.length)}
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
                                                scaleMin === preset.scaleMin && scaleMax === preset.scaleMax && scaleMinLabel === preset.scaleMinLabel && scaleMaxLabel === preset.scaleMaxLabel
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
                                        max={scaleMax - 1}
                                        value={scaleMin}
                                        onChange={(e) => setScaleMin(parseInt(e.target.value) || 1)}
                                        data-testid="student-question-scale-min"
                                        className="bg-card border-input text-foreground focus:border-ring"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="scaleMax" className="text-muted-foreground">评分最大值</Label>
                                    <Input
                                        id="scaleMax"
                                        type="number"
                                        min={scaleMin + 1}
                                        max={10}
                                        value={scaleMax}
                                        onChange={(e) => setScaleMax(parseInt(e.target.value) || 10)}
                                        data-testid="student-question-scale-max"
                                        className="bg-card border-input text-foreground focus:border-ring"
                                    />
                                </div>
                            </div>
                            <p className="text-label text-muted-foreground">
                                评分范围：{scaleMin} - {scaleMax} 分
                            </p>
                            {(scaleMax - scaleMin + 1) % 2 === 0 && (
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
                    {type === "numeric" && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2"><Label htmlFor="numericMin">最小值（可选）</Label><Input id="numericMin" type="number" value={numericMin} onChange={e => setNumericMin(e.target.value)} data-testid="student-question-numeric-min" /></div>
                                <div className="space-y-2"><Label htmlFor="numericMax">最大值（可选）</Label><Input id="numericMax" type="number" value={numericMax} onChange={e => setNumericMax(e.target.value)} data-testid="student-question-numeric-max" /></div>
                                <div className="space-y-2"><Label htmlFor="numericUnit">单位（不自动换算）</Label><Input id="numericUnit" value={unit} onChange={e => setUnit(e.target.value)} maxLength={50} data-testid="student-question-numeric-unit" /></div>
                                <div className="space-y-2"><Label htmlFor="decimalPlaces">小数位数</Label><Input id="decimalPlaces" type="number" min={0} max={10} value={decimalPlaces} onChange={e => setDecimalPlaces(Number(e.target.value))} data-testid="student-question-decimal-places" /></div>
                            </div>
                            <p className="text-meta text-muted-foreground">上下限均包含；必须严格按指定小数位填写，留空不会视为 0。</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => requestOpenChange(false)}
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

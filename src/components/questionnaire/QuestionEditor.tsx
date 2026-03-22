import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type { Question, QuestionType } from "@/lib/questionnaire-types";

interface QuestionEditorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    question?: Question;
    onSave: (question: Question) => void;
}

const questionTypeLabels: Record<QuestionType, string> = {
    boolean: "判断题",
    single: "单选题",
    multiple: "多选题",
    scale: "满意度量表",
};

const questionTypeDescriptions: Record<QuestionType, string> = {
    boolean: "固定「是」「否」两个选项",
    single: "从多个选项中选择一个",
    multiple: "从多个选项中选择多个",
    scale: "量表评分，可选择常用的 Likert 量表预设",
};

interface LikertPreset {
    label: string;
    scaleMin: number;
    scaleMax: number;
    scaleMinLabel: string;
    scaleMaxLabel: string;
}

const LIKERT_PRESETS: LikertPreset[] = [
    { label: "5点 Likert（非常不同意—非常同意）", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不同意", scaleMaxLabel: "非常同意" },
    { label: "5点 Likert（非常不满意—非常满意）", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
    { label: "5点 Likert（从不—总是）", scaleMin: 1, scaleMax: 5, scaleMinLabel: "从不", scaleMaxLabel: "总是" },
    { label: "7点 Likert（非常不同意—非常同意）", scaleMin: 1, scaleMax: 7, scaleMinLabel: "非常不同意", scaleMaxLabel: "非常同意" },
    { label: "7点 Likert（非常不满意—非常满意）", scaleMin: 1, scaleMax: 7, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
    { label: "10点量表（非常不满意—非常满意）", scaleMin: 1, scaleMax: 10, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
];

function generateId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function QuestionEditor({ open, onOpenChange, question, onSave }: QuestionEditorProps) {
    const isEditing = !!question;

    const [type, setType] = useState<QuestionType>(question?.type ?? "single");
    const [content, setContent] = useState(question?.content ?? "");
    const [options, setOptions] = useState<string[]>(question?.options ?? ["", ""]);
    const [minSelect, setMinSelect] = useState(question?.minSelect ?? 1);
    const [maxSelect, setMaxSelect] = useState(question?.maxSelect ?? 3);
    const [scaleMin, setScaleMin] = useState(question?.scaleMin ?? 1);
    const [scaleMax, setScaleMax] = useState(question?.scaleMax ?? 5);
    const [scaleMinLabel, setScaleMinLabel] = useState(question?.scaleMinLabel ?? "非常不同意");
    const [scaleMaxLabel, setScaleMaxLabel] = useState(question?.scaleMaxLabel ?? "非常同意");

    useEffect(() => {
        if (question) {
            setType(question.type);
            setContent(question.content);
            setOptions(question.options ?? ["", ""]);
            setMinSelect(question.minSelect ?? 1);
            setMaxSelect(question.maxSelect ?? 3);
            setScaleMin(question.scaleMin ?? 1);
            setScaleMax(question.scaleMax ?? 5);
            setScaleMinLabel(question.scaleMinLabel ?? "非常不同意");
            setScaleMaxLabel(question.scaleMaxLabel ?? "非常同意");
        } else {
            setType("single");
            setContent("");
            setOptions(["", ""]);
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

    const isValid = () => {
        if (!content.trim() || content.length > 500) return false;

        if (type === "single" || type === "multiple") {
            const validOptions = options.filter((o) => o.trim());
            if (validOptions.length < 2) return false;
        }

        if (type === "multiple") {
            const validCount = options.filter((o) => o.trim()).length;
            if (minSelect < 1 || maxSelect < minSelect || maxSelect > validCount) return false;
        }

        return true;
    };

    const handleSave = () => {
        if (!isValid()) return;

        const savedQuestion: Question = {
            id: question?.id ?? generateId(),
            type,
            content: content.trim(),
        };

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

        onSave(savedQuestion);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:rounded-xl shadow-2xl shadow-indigo-500/10"
                data-testid="student-question-editor"
            >
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 dark:from-white to-slate-600 dark:to-slate-400">
                        {isEditing ? "编辑题目" : "添加题目"}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {!isEditing && (
                        <div className="space-y-2">
                            <Label className="text-slate-600 dark:text-slate-400">题目类型</Label>
                            <Tabs value={type} onValueChange={(v) => setType(v as QuestionType)}>
                                <TabsList className="grid grid-cols-4 w-full bg-white/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 p-1" data-testid="student-question-type-list">
                                    {(Object.keys(questionTypeLabels) as QuestionType[]).map((t) => (
                                        <TabsTrigger
                                            key={t}
                                            value={t}
                                            data-testid={`student-question-type-${t}`}
                                            className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                                        >
                                            {questionTypeLabels[t]}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                            <p className="text-xs text-slate-500 pl-1">
                                {questionTypeDescriptions[type]}
                            </p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="content" className="text-slate-700 dark:text-slate-300">
                            题目内容 <span className="text-rose-500">*</span>
                        </Label>
                        <Textarea
                            id="content"
                            placeholder="请输入题目内容"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={3}
                            maxLength={500}
                            data-testid="student-question-content"
                            className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                        />
                        <p className="text-xs text-slate-500 text-right">
                            {content.length}/500
                        </p>
                    </div>

                    {type === "boolean" && (
                        <div className="p-4 bg-slate-200/30 dark:bg-slate-800/30 rounded-lg border border-slate-300/50 dark:border-slate-700/50">
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                判断题固定提供「是」和「否」两个选项
                            </p>
                        </div>
                    )}

                    {(type === "single" || type === "multiple") && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-slate-700 dark:text-slate-300">选项（2-10个）</Label>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={addOption}
                                    disabled={options.length >= 10}
                                    data-testid="student-question-add-option"
                                    className="border-indigo-500/30 text-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-600"
                                >
                                    <Plus className="w-4 h-4 mr-1" />
                                    添加选项
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {options.map((option, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <GripVertical className="w-4 h-4 text-slate-500" />
                                        <span className="text-sm text-slate-500 w-6 font-mono">
                                            {String.fromCharCode(65 + index)}.
                                        </span>
                                        <Input
                                            placeholder={`选项 ${index + 1}`}
                                            value={option}
                                            onChange={(e) => updateOption(index, e.target.value)}
                                            maxLength={200}
                                            data-testid={`student-question-option-${index + 1}`}
                                            className="flex-1 bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeOption(index)}
                                            disabled={options.length <= 2}
                                            data-testid={`student-question-remove-option-${index + 1}`}
                                            className="h-9 w-9 text-slate-500 hover:text-rose-600 hover:bg-rose-500/10"
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
                                <Label htmlFor="minSelect" className="text-slate-600 dark:text-slate-400">最少选择数</Label>
                                <Input
                                    id="minSelect"
                                    type="number"
                                    min={1}
                                    max={options.length}
                                    value={minSelect}
                                    onChange={(e) => setMinSelect(parseInt(e.target.value) || 1)}
                                    data-testid="student-question-min-select"
                                    className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="maxSelect" className="text-slate-600 dark:text-slate-400">最多选择数</Label>
                                <Input
                                    id="maxSelect"
                                    type="number"
                                    min={1}
                                    max={options.length}
                                    value={maxSelect}
                                    onChange={(e) => setMaxSelect(parseInt(e.target.value) || options.length)}
                                    data-testid="student-question-max-select"
                                    className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    )}

                    {type === "scale" && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-slate-600 dark:text-slate-400">常用量表预设</Label>
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
                                            className={`text-left px-3 py-2 text-xs rounded-lg border transition-colors ${
                                                scaleMin === preset.scaleMin && scaleMax === preset.scaleMax && scaleMinLabel === preset.scaleMinLabel && scaleMaxLabel === preset.scaleMaxLabel
                                                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                                                    : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600"
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="scaleMin" className="text-slate-600 dark:text-slate-400">量表最小值</Label>
                                    <Input
                                        id="scaleMin"
                                        type="number"
                                        min={1}
                                        max={scaleMax - 1}
                                        value={scaleMin}
                                        onChange={(e) => setScaleMin(parseInt(e.target.value) || 1)}
                                        data-testid="student-question-scale-min"
                                        className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="scaleMax" className="text-slate-600 dark:text-slate-400">量表最大值</Label>
                                    <Input
                                        id="scaleMax"
                                        type="number"
                                        min={scaleMin + 1}
                                        max={10}
                                        value={scaleMax}
                                        onChange={(e) => setScaleMax(parseInt(e.target.value) || 10)}
                                        data-testid="student-question-scale-max"
                                        className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                量表范围：{scaleMin} - {scaleMax} 分
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="scaleMinLabel" className="text-slate-600 dark:text-slate-400">左端标签 ({scaleMin}分)</Label>
                                    <Input
                                        id="scaleMinLabel"
                                        placeholder="例如：非常不同意"
                                        value={scaleMinLabel}
                                        onChange={(e) => setScaleMinLabel(e.target.value)}
                                        maxLength={50}
                                        data-testid="student-question-scale-min-label"
                                        className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="scaleMaxLabel" className="text-slate-600 dark:text-slate-400">右端标签 ({scaleMax}分)</Label>
                                    <Input
                                        id="scaleMaxLabel"
                                        placeholder="例如：非常同意"
                                        value={scaleMaxLabel}
                                        onChange={(e) => setScaleMaxLabel(e.target.value)}
                                        maxLength={50}
                                        data-testid="student-question-scale-max-label"
                                        className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-3 sm:gap-2">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        data-testid="student-question-cancel"
                        className="border-slate-300 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                        取消
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!isValid()}
                        data-testid="student-question-save"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                    >
                        保存
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default QuestionEditor;

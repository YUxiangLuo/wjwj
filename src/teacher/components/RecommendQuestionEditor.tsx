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
import type { TopicRecommendQuestion } from "../api-client";

/**
 * questionType: 1=判断 2=单选 3=多选 4=量表
 */

const questionTypeLabels: Record<number, string> = {
    1: "判断题",
    2: "单选题",
    3: "多选题",
    4: "满意度量表",
};

const questionTypeDescriptions: Record<number, string> = {
    1: "固定「是」「否」两个选项",
    2: "从多个选项中选择一个",
    3: "从多个选项中选择多个",
    4: "量表评分，可选择常用的 Likert 量表预设",
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

interface RecommendQuestionEditorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    question?: TopicRecommendQuestion;
    topicId: number;
    onSave: (question: TopicRecommendQuestion) => void;
}

function emptyQuestion(topicId: number): TopicRecommendQuestion {
    return {
        id: Date.now(),
        topicId,
        questionType: 2,
        content: "",
        choiceOptions: ["", ""],
        minSelect: 1,
        maxSelect: 3,
        scaleMin: 1,
        scaleMax: 5,
        scaleMinLabel: "非常不同意",
        scaleMaxLabel: "非常同意",
        sortOrder: 0,
    };
}

export function RecommendQuestionEditor({
    open,
    onOpenChange,
    question,
    topicId,
    onSave,
}: RecommendQuestionEditorProps) {
    const isEditing = !!question;

    const [questionType, setQuestionType] = useState<number>(2);
    const [content, setContent] = useState("");
    const [choiceOptions, setChoiceOptions] = useState<string[]>(["", ""]);
    const [minSelect, setMinSelect] = useState(1);
    const [maxSelect, setMaxSelect] = useState(3);
    const [scaleMin, setScaleMin] = useState(1);
    const [scaleMax, setScaleMax] = useState(5);
    const [scaleMinLabel, setScaleMinLabel] = useState("非常不同意");
    const [scaleMaxLabel, setScaleMaxLabel] = useState("非常同意");

    useEffect(() => {
        if (question) {
            setQuestionType(question.questionType);
            setContent(question.content);
            const ch = question.choiceOptions;
            setChoiceOptions(Array.isArray(ch) && ch.length >= 2 ? [...ch] : ["", ""]);
            setMinSelect(question.minSelect ?? 1);
            setMaxSelect(question.maxSelect ?? 3);
            setScaleMin(question.scaleMin ?? 1);
            setScaleMax(question.scaleMax ?? 5);
            setScaleMinLabel(question.scaleMinLabel ?? "非常不同意");
            setScaleMaxLabel(question.scaleMaxLabel ?? "非常同意");
        } else {
            const d = emptyQuestion(topicId);
            setQuestionType(2);
            setContent("");
            setChoiceOptions(d.choiceOptions ?? ["", ""]);
            setMinSelect(1);
            setMaxSelect(3);
            setScaleMin(d.scaleMin ?? 1);
            setScaleMax(d.scaleMax ?? 5);
            setScaleMinLabel(d.scaleMinLabel ?? "非常不同意");
            setScaleMaxLabel(d.scaleMaxLabel ?? "非常同意");
        }
    }, [question, open, topicId]);

    const addOption = () => {
        if (choiceOptions.length < 10) {
            setChoiceOptions([...choiceOptions, ""]);
        }
    };

    const removeOption = (index: number) => {
        if (choiceOptions.length > 2) {
            setChoiceOptions(choiceOptions.filter((_, i) => i !== index));
        }
    };

    const updateOption = (index: number, value: string) => {
        const next = [...choiceOptions];
        next[index] = value;
        setChoiceOptions(next);
    };

    const isValid = () => {
        const trimmedContent = content.trim();
        if (!trimmedContent || trimmedContent.length > 500) return false;

        if (questionType === 2 || questionType === 3) {
            const validOptions = choiceOptions.filter((o) => o.trim());
            if (validOptions.length < 2) return false;
        }

        if (questionType === 3) {
            const validCount = choiceOptions.filter((o) => o.trim()).length;
            if (minSelect < 1 || maxSelect < minSelect || maxSelect > validCount) return false;
        }

        if (questionType === 4) {
            if (scaleMin < 1 || scaleMax > 10 || scaleMin >= scaleMax) return false;
        }

        return true;
    };

    const handleSave = () => {
        if (!isValid()) return;

        const trimmed = choiceOptions.map((o) => o.trim()).filter(Boolean);

        const base: TopicRecommendQuestion = {
            id: question?.id ?? Date.now(),
            topicId: question?.topicId ?? topicId,
            questionType,
            content: content.trim(),
            sortOrder: question?.sortOrder ?? 0,
            choiceOptions: null,
            minSelect: null,
            maxSelect: null,
            scaleMin: null,
            scaleMax: null,
            scaleMinLabel: null,
            scaleMaxLabel: null,
        };

        if (questionType === 2) {
            base.choiceOptions = trimmed;
        } else if (questionType === 3) {
            base.choiceOptions = trimmed;
            base.minSelect = minSelect;
            base.maxSelect = maxSelect;
        } else if (questionType === 4) {
            base.scaleMin = scaleMin;
            base.scaleMax = scaleMax;
            base.scaleMinLabel = scaleMinLabel.trim();
            base.scaleMaxLabel = scaleMaxLabel.trim();
        }

        onSave(base);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:rounded-xl shadow-2xl shadow-indigo-500/10"
                data-testid="teacher-recommend-question-editor"
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 dark:from-white to-slate-600 dark:to-slate-400">
                        {isEditing ? "编辑推荐题目" : "添加推荐题目"}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {!isEditing && (
                        <div className="space-y-2">
                            <Label className="text-slate-600 dark:text-slate-400">题目类型</Label>
                            <Tabs value={String(questionType)} onValueChange={(v) => setQuestionType(Number(v))}>
                                <TabsList
                                    className="grid grid-cols-4 w-full bg-white/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 p-1"
                                    data-testid="teacher-recommend-question-type-list"
                                >
                                    {([1, 2, 3, 4] as const).map((t) => (
                                        <TabsTrigger
                                            key={t}
                                            value={String(t)}
                                            data-testid={`teacher-recommend-question-type-${t}`}
                                            className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                                        >
                                            {questionTypeLabels[t]}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                            <p className="text-xs text-slate-500 pl-1">{questionTypeDescriptions[questionType]}</p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="rq-content" className="text-slate-700 dark:text-slate-300">
                            题目内容 <span className="text-rose-500">*</span>
                        </Label>
                        <Textarea
                            id="rq-content"
                            placeholder="请输入题目内容"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={3}
                            maxLength={500}
                            data-testid="teacher-recommend-question-content"
                            className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                        />
                        <p className="text-xs text-slate-500 text-right">{content.length}/500</p>
                    </div>

                    {questionType === 1 && (
                        <div className="p-4 bg-slate-200/30 dark:bg-slate-800/30 rounded-lg border border-slate-300/50 dark:border-slate-700/50">
                            <p className="text-sm text-slate-600 dark:text-slate-400">判断题固定提供「是」和「否」两个选项</p>
                        </div>
                    )}

                    {(questionType === 2 || questionType === 3) && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-slate-700 dark:text-slate-300">选项（2-10个）</Label>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={addOption}
                                    disabled={choiceOptions.length >= 10}
                                    data-testid="teacher-recommend-question-add-option"
                                    className="border-indigo-500/30 text-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-600"
                                >
                                    <Plus className="w-4 h-4 mr-1" />
                                    添加选项
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {choiceOptions.map((option, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <GripVertical className="w-4 h-4 text-slate-500" />
                                        <span className="text-sm text-slate-500 w-6 font-mono">{String.fromCharCode(65 + index)}.</span>
                                        <Input
                                            placeholder={`选项 ${index + 1}`}
                                            value={option}
                                            onChange={(e) => updateOption(index, e.target.value)}
                                            maxLength={200}
                                            data-testid={`teacher-recommend-question-option-${index + 1}`}
                                            className="flex-1 bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeOption(index)}
                                            disabled={choiceOptions.length <= 2}
                                            data-testid={`teacher-recommend-question-remove-option-${index + 1}`}
                                            className="h-9 w-9 text-slate-500 hover:text-rose-600 hover:bg-rose-500/10"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {questionType === 3 && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="rq-minSelect" className="text-slate-600 dark:text-slate-400">最少选择数</Label>
                                <Input
                                    id="rq-minSelect"
                                    type="number"
                                    min={1}
                                    max={choiceOptions.filter((o) => o.trim()).length || 1}
                                    value={minSelect}
                                    onChange={(e) => setMinSelect(parseInt(e.target.value, 10) || 1)}
                                    data-testid="teacher-recommend-question-min-select"
                                    className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rq-maxSelect" className="text-slate-600 dark:text-slate-400">最多选择数</Label>
                                <Input
                                    id="rq-maxSelect"
                                    type="number"
                                    min={1}
                                    max={choiceOptions.filter((o) => o.trim()).length || 10}
                                    value={maxSelect}
                                    onChange={(e) => setMaxSelect(parseInt(e.target.value, 10) || choiceOptions.length)}
                                    data-testid="teacher-recommend-question-max-select"
                                    className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    )}

                    {questionType === 4 && (
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
                                            data-testid={`teacher-recommend-question-scale-preset-${idx}`}
                                            className={`text-left px-3 py-2 text-xs rounded-lg border transition-colors ${
                                                scaleMin === preset.scaleMin &&
                                                scaleMax === preset.scaleMax &&
                                                scaleMinLabel === preset.scaleMinLabel &&
                                                scaleMaxLabel === preset.scaleMaxLabel
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
                                    <Label htmlFor="rq-scaleMin" className="text-slate-600 dark:text-slate-400">量表最小值</Label>
                                    <Input
                                        id="rq-scaleMin"
                                        type="number"
                                        min={1}
                                        max={scaleMax - 1}
                                        value={scaleMin}
                                        onChange={(e) => setScaleMin(parseInt(e.target.value, 10) || 1)}
                                        data-testid="teacher-recommend-question-scale-min"
                                        className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rq-scaleMax" className="text-slate-600 dark:text-slate-400">量表最大值</Label>
                                    <Input
                                        id="rq-scaleMax"
                                        type="number"
                                        min={scaleMin + 1}
                                        max={10}
                                        value={scaleMax}
                                        onChange={(e) => setScaleMax(parseInt(e.target.value, 10) || 10)}
                                        data-testid="teacher-recommend-question-scale-max"
                                        className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                量表范围：{scaleMin} - {scaleMax} 分
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="rq-scaleMinLabel" className="text-slate-600 dark:text-slate-400">
                                        左端标签 ({scaleMin}分)
                                    </Label>
                                    <Input
                                        id="rq-scaleMinLabel"
                                        placeholder="例如：非常不同意"
                                        value={scaleMinLabel}
                                        onChange={(e) => setScaleMinLabel(e.target.value)}
                                        maxLength={50}
                                        data-testid="teacher-recommend-question-scale-min-label"
                                        className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:border-indigo-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rq-scaleMaxLabel" className="text-slate-600 dark:text-slate-400">
                                        右端标签 ({scaleMax}分)
                                    </Label>
                                    <Input
                                        id="rq-scaleMaxLabel"
                                        placeholder="例如：非常同意"
                                        value={scaleMaxLabel}
                                        onChange={(e) => setScaleMaxLabel(e.target.value)}
                                        maxLength={50}
                                        data-testid="teacher-recommend-question-scale-max-label"
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
                        data-testid="teacher-recommend-question-cancel"
                        className="border-slate-300 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                        取消
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!isValid()}
                        data-testid="teacher-recommend-question-save"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                    >
                        保存
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default RecommendQuestionEditor;

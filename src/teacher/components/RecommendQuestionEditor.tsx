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
 * questionType mapping:
 *   1 = boolean (判断题)
 *   2 = single  (单选题)
 *   3 = multiple(多选题)
 *   4 = scale   (量表题)
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
    4: "1-10分量表评分",
};

interface RecommendQuestionEditorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    question?: TopicRecommendQuestion;
    topicId: number;
    onSave: (question: TopicRecommendQuestion) => void;
}

/** Parse the options field (which may be string[], JSON string, or comma-separated string) into a string[] */
function parseOptions(options: unknown): string[] {
    if (Array.isArray(options)) return options as string[];
    if (typeof options === "string") {
        if (!options.trim()) return [];
        try {
            const parsed = JSON.parse(options);
            if (Array.isArray(parsed)) return parsed as string[];
        } catch {
            // comma-separated fallback
            return options.split(",").map((s) => s.trim()).filter(Boolean);
        }
    }
    return [];
}

export function RecommendQuestionEditor({
    open,
    onOpenChange,
    question,
    topicId,
    onSave,
}: RecommendQuestionEditorProps) {
    const isEditing = !!question;

    // Form state
    const [questionType, setQuestionType] = useState<number>(question?.questionType ?? 2);
    const [content, setContent] = useState(question?.content ?? "");
    const [options, setOptions] = useState<string[]>(() => {
        if (question && (question.questionType === 2 || question.questionType === 3)) {
            const parsed = parseOptions(question.options);
            return parsed.length >= 2 ? parsed : ["", ""];
        }
        return ["", ""];
    });
    const [scaleMinLabel, setScaleMinLabel] = useState("非常不满意");
    const [scaleMaxLabel, setScaleMaxLabel] = useState("非常满意");

    // Reset form when question/open changes
    useEffect(() => {
        if (question) {
            setQuestionType(question.questionType);
            setContent(question.content);
            if (question.questionType === 2 || question.questionType === 3) {
                const parsed = parseOptions(question.options);
                setOptions(parsed.length >= 2 ? parsed : ["", ""]);
            } else {
                setOptions(["", ""]);
            }
            // Parse scale labels if stored in options
            if (question.questionType === 4 && question.options) {
                const parsed = parseOptions(question.options);
                if (parsed.length >= 2) {
                    setScaleMinLabel(parsed[0] || "非常不满意");
                    setScaleMaxLabel(parsed[1] || "非常满意");
                } else {
                    setScaleMinLabel("非常不满意");
                    setScaleMaxLabel("非常满意");
                }
            } else {
                setScaleMinLabel("非常不满意");
                setScaleMaxLabel("非常满意");
            }
        } else {
            setQuestionType(2);
            setContent("");
            setOptions(["", ""]);
            setScaleMinLabel("非常不满意");
            setScaleMaxLabel("非常满意");
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

        if (questionType === 2 || questionType === 3) {
            const validOptions = options.filter((o) => o.trim());
            if (validOptions.length < 2) return false;
        }

        return true;
    };

    const handleSave = () => {
        if (!isValid()) return;

        let savedOptions: string[] | null = null;
        if (questionType === 2 || questionType === 3) {
            savedOptions = options.filter((o) => o.trim());
        } else if (questionType === 4) {
            savedOptions = [scaleMinLabel, scaleMaxLabel];
        }

        const savedQuestion: TopicRecommendQuestion = {
            id: question?.id ?? Date.now(),
            topicId: question?.topicId ?? topicId,
            questionType,
            content: content.trim(),
            options: savedOptions,
            sortOrder: question?.sortOrder ?? 0,
        };

        onSave(savedQuestion);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-800 text-slate-200 sm:rounded-xl shadow-2xl shadow-indigo-500/10"
                data-testid="teacher-recommend-question-editor"
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        {isEditing ? "编辑推荐题目" : "添加推荐题目"}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Question Type Selection - only for new questions */}
                    {!isEditing && (
                        <div className="space-y-2">
                            <Label className="text-slate-400">题目类型</Label>
                            <Tabs
                                value={String(questionType)}
                                onValueChange={(v) => setQuestionType(Number(v))}
                            >
                                <TabsList className="grid grid-cols-4 w-full bg-slate-950/50 border border-slate-800 p-1">
                                    {([1, 2, 3, 4] as const).map((t) => (
                                        <TabsTrigger
                                            key={t}
                                            value={String(t)}
                                            className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200"
                                        >
                                            {questionTypeLabels[t]}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                            <p className="text-xs text-slate-500 pl-1">
                                {questionTypeDescriptions[questionType]}
                            </p>
                        </div>
                    )}

                    {/* Question Content */}
                    <div className="space-y-2">
                        <Label htmlFor="rq-content" className="text-slate-300">
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
                            className="bg-slate-950/50 border-slate-800 text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                        />
                        <p className="text-xs text-slate-500 text-right">
                            {content.length}/500
                        </p>
                    </div>

                    {/* Boolean type */}
                    {questionType === 1 && (
                        <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                            <p className="text-sm text-slate-400">
                                判断题固定提供「是」和「否」两个选项
                            </p>
                        </div>
                    )}

                    {/* Single/Multiple choice options */}
                    {(questionType === 2 || questionType === 3) && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-slate-300">选项（2-10个）</Label>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={addOption}
                                    disabled={options.length >= 10}
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
                                            className="flex-1 bg-slate-950/50 border-slate-800 text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeOption(index)}
                                            disabled={options.length <= 2}
                                            className="h-9 w-9 text-slate-500 hover:text-rose-600 hover:bg-rose-500/10"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Scale labels */}
                    {questionType === 4 && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-400">
                                量表范围：1 - 10 分
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="rq-scaleMinLabel" className="text-slate-400">
                                        左端标签 (1分)
                                    </Label>
                                    <Input
                                        id="rq-scaleMinLabel"
                                        placeholder="例如：非常不满意"
                                        value={scaleMinLabel}
                                        onChange={(e) => setScaleMinLabel(e.target.value)}
                                        maxLength={50}
                                        className="bg-slate-950/50 border-slate-800 text-slate-200 focus:border-indigo-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="rq-scaleMaxLabel" className="text-slate-400">
                                        右端标签 (10分)
                                    </Label>
                                    <Input
                                        id="rq-scaleMaxLabel"
                                        placeholder="例如：非常满意"
                                        value={scaleMaxLabel}
                                        onChange={(e) => setScaleMaxLabel(e.target.value)}
                                        maxLength={50}
                                        className="bg-slate-950/50 border-slate-800 text-slate-200 focus:border-indigo-500"
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
                        className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100"
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

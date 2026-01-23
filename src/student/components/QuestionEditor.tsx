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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type { Question, QuestionType } from "../api-client";

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
    scale: "1-10分量表评分",
};

function generateId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function QuestionEditor({ open, onOpenChange, question, onSave }: QuestionEditorProps) {
    const isEditing = !!question;

    // Form state
    const [type, setType] = useState<QuestionType>(question?.type ?? "single");
    const [content, setContent] = useState(question?.content ?? "");
    const [options, setOptions] = useState<string[]>(question?.options ?? ["", ""]);
    const [minSelect, setMinSelect] = useState(question?.minSelect ?? 1);
    const [maxSelect, setMaxSelect] = useState(question?.maxSelect ?? 3);
    const [scaleMinLabel, setScaleMinLabel] = useState(question?.scaleMinLabel ?? "非常不满意");
    const [scaleMaxLabel, setScaleMaxLabel] = useState(question?.scaleMaxLabel ?? "非常满意");

    // Reset form when question changes
    useEffect(() => {
        if (question) {
            setType(question.type);
            setContent(question.content);
            setOptions(question.options ?? ["", ""]);
            setMinSelect(question.minSelect ?? 1);
            setMaxSelect(question.maxSelect ?? 3);
            setScaleMinLabel(question.scaleMinLabel ?? "非常不满意");
            setScaleMaxLabel(question.scaleMaxLabel ?? "非常满意");
        } else {
            // Reset to defaults for new question
            setType("single");
            setContent("");
            setOptions(["", ""]);
            setMinSelect(1);
            setMaxSelect(3);
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

        if (type === "single" || type === "multiple") {
            // At least 2 non-empty options
            const validOptions = options.filter((o) => o.trim());
            if (validOptions.length < 2) return false;
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
            savedQuestion.minSelect = minSelect;
            savedQuestion.maxSelect = Math.min(maxSelect, savedQuestion.options?.length ?? 3);
        }

        if (type === "scale") {
            savedQuestion.scaleMin = 1;
            savedQuestion.scaleMax = 10;
            savedQuestion.scaleMinLabel = scaleMinLabel;
            savedQuestion.scaleMaxLabel = scaleMaxLabel;
        }

        onSave(savedQuestion);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-900 border-slate-800 text-slate-200 sm:rounded-xl shadow-2xl shadow-indigo-500/10">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        {isEditing ? "编辑题目" : "添加题目"}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Question Type Selection - only for new questions */}
                    {!isEditing && (
                        <div className="space-y-2">
                            <Label className="text-slate-400">题目类型</Label>
                            <Tabs value={type} onValueChange={(v) => setType(v as QuestionType)}>
                                <TabsList className="grid grid-cols-4 w-full bg-slate-950/50 border border-slate-800 p-1">
                                    {(Object.keys(questionTypeLabels) as QuestionType[]).map((t) => (
                                        <TabsTrigger
                                            key={t}
                                            value={t}
                                            className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-slate-400 hover:text-slate-200"
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

                    {/* Question Content */}
                    <div className="space-y-2">
                        <Label htmlFor="content" className="text-slate-300">
                            题目内容 <span className="text-rose-500">*</span>
                        </Label>
                        <Textarea
                            id="content"
                            placeholder="请输入题目内容"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={3}
                            maxLength={500}
                            className="bg-slate-950/50 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-indigo-500/20"
                        />
                        <p className="text-xs text-slate-500 text-right">
                            {content.length}/500
                        </p>
                    </div>

                    {/* Boolean type - no extra config */}
                    {type === "boolean" && (
                        <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
                            <p className="text-sm text-slate-400">
                                判断题固定提供「是」和「否」两个选项
                            </p>
                        </div>
                    )}

                    {/* Single/Multiple choice options */}
                    {(type === "single" || type === "multiple") && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-slate-300">选项（2-10个）</Label>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={addOption}
                                    disabled={options.length >= 10}
                                    className="border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300"
                                >
                                    <Plus className="w-4 h-4 mr-1" />
                                    添加选项
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {options.map((option, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <GripVertical className="w-4 h-4 text-slate-600" />
                                        <span className="text-sm text-slate-500 w-6 font-mono">
                                            {String.fromCharCode(65 + index)}.
                                        </span>
                                        <Input
                                            placeholder={`选项 ${index + 1}`}
                                            value={option}
                                            onChange={(e) => updateOption(index, e.target.value)}
                                            maxLength={200}
                                            className="flex-1 bg-slate-950/50 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-indigo-500/20"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeOption(index)}
                                            disabled={options.length <= 2}
                                            className="h-9 w-9 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Multiple choice constraints */}
                    {type === "multiple" && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="minSelect" className="text-slate-400">最少选择数</Label>
                                <Input
                                    id="minSelect"
                                    type="number"
                                    min={1}
                                    max={options.length}
                                    value={minSelect}
                                    onChange={(e) => setMinSelect(parseInt(e.target.value) || 1)}
                                    className="bg-slate-950/50 border-slate-800 text-slate-200 focus:border-indigo-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="maxSelect" className="text-slate-400">最多选择数</Label>
                                <Input
                                    id="maxSelect"
                                    type="number"
                                    min={1}
                                    max={options.length}
                                    value={maxSelect}
                                    onChange={(e) => setMaxSelect(parseInt(e.target.value) || options.length)}
                                    className="bg-slate-950/50 border-slate-800 text-slate-200 focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    )}

                    {/* Scale labels */}
                    {type === "scale" && (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-400">
                                量表范围：1 - 10 分
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="scaleMinLabel" className="text-slate-400">左端标签 (1分)</Label>
                                    <Input
                                        id="scaleMinLabel"
                                        placeholder="例如：非常不满意"
                                        value={scaleMinLabel}
                                        onChange={(e) => setScaleMinLabel(e.target.value)}
                                        maxLength={50}
                                        className="bg-slate-950/50 border-slate-800 text-slate-200 focus:border-indigo-500"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="scaleMaxLabel" className="text-slate-400">右端标签 (10分)</Label>
                                    <Input
                                        id="scaleMaxLabel"
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
                        className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
                    >
                        取消
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!isValid()}
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

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, GripVertical, Trash2, Edit2, CheckCircle, AlertCircle, Copy, ArrowUp, ArrowDown, HelpCircle, MessageSquare, List } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";
import { QuestionEditor } from "../../components/QuestionEditor";
import { tasksApi, type Question, type QuestionType, type QuestionnaireData, type RecommendQuestion } from "../../api-client";

interface QuestionnaireDesignProps {
    onNext: () => void;
}

const questionTypeLabels: Record<QuestionType, string> = {
    boolean: "判断题",
    single: "单选题",
    multiple: "多选题",
    scale: "量表",
};

const questionTypeColors: Record<QuestionType, string> = {
    boolean: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    single: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    multiple: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    scale: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

function generateId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function QuestionnaireDesign({ onNext }: QuestionnaireDesignProps) {
    const { experiment, saveExperiment } = useExperiment();

    // Initialize from experiment data
    const initialData = experiment?.questionnaire as QuestionnaireData | null;

    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [title, setTitle] = useState(initialData?.title ?? "");
    const [welcomeText, setWelcomeText] = useState(initialData?.welcomeText ?? "");
    const [endingText, setEndingText] = useState(initialData?.endingText ?? "");
    const [questions, setQuestions] = useState<Question[]>(initialData?.questions ?? []);

    // Editor state
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question | undefined>();
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
    const [confirmNextOpen, setConfirmNextOpen] = useState(false);
    const [restoreDraftOpen, setRestoreDraftOpen] = useState(false);
    const [pendingDraft, setPendingDraft] = useState<QuestionnaireData | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [recommendQuestions, setRecommendQuestions] = useState<RecommendQuestion[]>([]);
    const draftKey = experiment?.taskId ? `student_questionnaire_draft_${experiment.taskId}` : null;

    useEffect(() => {
        async function loadRecommendQuestions() {
            if (!experiment?.taskId) return;
            try {
                const res = await tasksApi.get(experiment.taskId);
                if (res.success && res.data?.recommendQuestions) {
                    setRecommendQuestions(res.data.recommendQuestions);
                }
            } catch {
                // ignore
            }
        }
        loadRecommendQuestions();
    }, [experiment?.taskId]);


    // Auto-save when data changes
    const saveData = useCallback(async () => {
        const questionnaireData: QuestionnaireData = {
            title,
            welcomeText,
            endingText,
            questions,
        };
        await saveExperiment({ questionnaire: questionnaireData });
    }, [title, welcomeText, endingText, questions, saveExperiment]);

    // Restore draft from localStorage
    useEffect(() => {
        if (!draftKey) return;
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) return;
            const draft = JSON.parse(raw) as QuestionnaireData;
            const hasServerData = Boolean(initialData?.title || initialData?.questions?.length);
            if (hasServerData) {
                const different = JSON.stringify(draft) !== JSON.stringify(initialData);
                if (different) {
                    setPendingDraft(draft);
                    setRestoreDraftOpen(true);
                }
            } else {
                setPendingDraft(draft);
                setRestoreDraftOpen(true);
            }
        } catch {
            // ignore invalid draft
        }
    }, [draftKey, initialData]);

    const steps = [
        { num: 1, title: "欢迎语设置" },
        { num: 2, title: "题目设计" },
        { num: 3, title: "结束语设置" },
        { num: 4, title: "预览确认" },
    ];

    // Question management
    const handleAddQuestion = () => {
        setEditingQuestion(undefined);
        setEditorOpen(true);
    };

    const handleEditQuestion = (question: Question) => {
        setEditingQuestion(question);
        setEditorOpen(true);
    };

    const handleSaveQuestion = (question: Question) => {
        if (editingQuestion) {
            // Update existing
            setQuestions(questions.map((q) => (q.id === question.id ? question : q)));
        } else {
            // Add new
            setQuestions([...questions, question]);
        }
    };

    const handleDeleteQuestion = (id: string) => {
        setQuestionToDelete(id);
        setDeleteConfirmOpen(true);
    };

    const confirmDelete = () => {
        if (questionToDelete) {
            setQuestions(questions.filter((q) => q.id !== questionToDelete));
            setQuestionToDelete(null);
        }
        setDeleteConfirmOpen(false);
    };

    const handleDuplicateQuestion = (question: Question) => {
        const duplicate: Question = {
            ...question,
            id: generateId(),
            content: question.content + " (复制)",
        };
        const index = questions.findIndex((q) => q.id === question.id);
        const newQuestions = [...questions];
        newQuestions.splice(index + 1, 0, duplicate);
        setQuestions(newQuestions);
    };

    const moveQuestion = (index: number, direction: "up" | "down") => {
        const nextIndex = direction === "up" ? index - 1 : index + 1;
        if (nextIndex < 0 || nextIndex >= questions.length) return;
        const newQuestions = [...questions];
        const [item] = newQuestions.splice(index, 1);
        if (!item) return;
        newQuestions.splice(nextIndex, 0, item);
        setQuestions(newQuestions);
    };

    const handleDragStart = (id: string) => (event: React.DragEvent<HTMLDivElement>) => {
        setDraggingId(id);
        setDragOverId(null);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
        // Create drag ghost image if needed, or let browser handle it
    };

    const handleDragOver = (id: string) => (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (id !== dragOverId) {
            setDragOverId(id);
        }
        event.dataTransfer.dropEffect = "move";
    };

    const handleDragLeave = (id: string) => () => {
        if (dragOverId === id) {
            setDragOverId(null);
        }
    };

    const handleDrop = (id: string) => (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
        setDragOverId(null);
        if (!sourceId || sourceId === id) {
            setDraggingId(null);
            return;
        }
        setQuestions((prev) => {
            const fromIndex = prev.findIndex((q) => q.id === sourceId);
            const toIndex = prev.findIndex((q) => q.id === id);
            if (fromIndex < 0 || toIndex < 0) return prev;
            const next = [...prev];
            const [item] = next.splice(fromIndex, 1);
            if (!item) return prev;
            next.splice(toIndex, 0, item);
            return next;
        });
        setDraggingId(null);
    };

    const handleDragEnd = () => {
        setDraggingId(null);
        setDragOverId(null);
    };

    const mapRecommendQuestion = (rq: RecommendQuestion): Question => {
        const typeMap: Record<number, QuestionType> = {
            1: "boolean",
            2: "single",
            3: "multiple",
            4: "scale",
        };
        const mappedType = typeMap[rq.questionType] ?? "single";
        const options = Array.isArray(rq.options)
            ? (rq.options as string[])
            : typeof rq.options === "string"
                ? (() => { try { return JSON.parse(rq.options) as string[]; } catch { return []; } })()
                : [];

        return {
            id: generateId(),
            type: mappedType,
            content: rq.content,
            options: mappedType === "single" || mappedType === "multiple" ? options : undefined,
            minSelect: mappedType === "multiple" ? 1 : undefined,
            maxSelect: mappedType === "multiple" ? Math.min(3, Math.max(2, options.length)) : undefined,
            scaleMin: mappedType === "scale" ? 1 : undefined,
            scaleMax: mappedType === "scale" ? 10 : undefined,
        };
    };

    const handleUseRecommend = (rq: RecommendQuestion) => {
        setQuestions((prev) => [...prev, mapRecommendQuestion(rq)]);
    };

    // Validation
    const validation = {
        title: title.trim().length >= 1 && title.length <= 100,
        welcomeText: welcomeText.trim().length >= 20,
        endingText: endingText.trim().length >= 20,
        questionCount: questions.length >= 5 && questions.length <= 50,
        questionTypes: new Set(questions.map((q) => q.type)).size >= 2,
    };

    const canProceed = validation.title && validation.welcomeText && validation.endingText && validation.questionCount;

    const handleConfirmComplete = async () => {
        // Save final data
        await saveData();
        // Move to next stage
        await saveExperiment({ currentStage: 2 });
        onNext();
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <Card className="lg:col-span-2 rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-slate-100">
                                    <MessageSquare className="w-5 h-5 text-indigo-500" />
                                    欢迎语设置
                                </CardTitle>
                                <CardDescription className="text-slate-400">设置问卷的标题和欢迎语，让受访者了解调查目的</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="title" className="text-slate-300">问卷标题 *</Label>
                                    <Input
                                        id="title"
                                        placeholder="请输入问卷标题"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        maxLength={100}
                                        className="bg-slate-950/50 border-slate-800 focus:border-indigo-500"
                                    />
                                    <p className="text-xs text-slate-500 text-right">{title.length}/100</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="welcome" className="text-slate-300">欢迎语 *（至少20字）</Label>
                                    <Textarea
                                        id="welcome"
                                        placeholder="请输入欢迎语，说明调查目的、预计用时等"
                                        value={welcomeText}
                                        onChange={(e) => setWelcomeText(e.target.value)}
                                        rows={8}
                                        maxLength={1000}
                                        className="bg-slate-950/50 border-slate-800 focus:border-indigo-500 resize-none"
                                    />
                                    <div className="flex justify-between text-xs">
                                        <span className={welcomeText.length < 20 ? "text-rose-400" : "text-emerald-400"}>
                                            {welcomeText.length < 20 ? `还需 ${20 - welcomeText.length} 字` : "✓ 符合要求"}
                                        </span>
                                        <span className="text-slate-500">{welcomeText.length}/1000</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl border-indigo-500/20 bg-indigo-500/5 shadow-sm h-fit">
                            <CardHeader>
                                <CardTitle className="text-base text-indigo-300 flex items-center gap-2">
                                    <HelpCircle className="w-4 h-4" />
                                    小贴士
                                </CardTitle>
                                <CardDescription className="text-indigo-300/70">好的欢迎语能提高数据质量。</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm text-indigo-200/80 leading-relaxed">
                                <p>建议说明调查目的、预计用时与隐私保护方式。</p>
                                <p>保持简洁友好，最好控制在 200 字以内。</p>
                                <div className="rounded-xl bg-indigo-950/50 border border-indigo-500/20 p-3 text-xs text-indigo-300">
                                    <span className="font-semibold block mb-1">示例：</span>
                                    感谢参与本次调查，本问卷约 3 分钟完成，数据仅用于教学分析。
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );

            case 2:
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800 pb-4">
                                    <div>
                                        <CardTitle className="text-slate-100 flex items-center gap-2">
                                            <List className="w-5 h-5 text-indigo-500" />
                                            题目列表
                                        </CardTitle>
                                        <CardDescription className="text-slate-400 mt-1">
                                            已添加 {questions.length} 道题目（最少5题，最多50题）
                                        </CardDescription>
                                    </div>
                                    <Button onClick={handleAddQuestion} disabled={questions.length >= 50} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                        <Plus className="w-4 h-4 mr-1" />
                                        添加题目
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-6">
                                    {questions.length === 0 ? (
                                        <div className="text-center py-16 text-slate-500 bg-slate-950/30 rounded-xl border border-dashed border-slate-800">
                                            <p>暂无题目，点击「添加题目」开始设计问卷</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {questions.map((q, index) => (
                                                <div
                                                    key={q.id}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all group hover:bg-slate-800 ${dragOverId === q.id && draggingId !== q.id
                                                        ? "border-indigo-500 ring-1 ring-indigo-500/50 bg-indigo-500/10"
                                                        : "border-slate-800 bg-slate-950/50"
                                                        } ${draggingId === q.id ? "opacity-50" : ""}`}
                                                    draggable
                                                    onDragStart={handleDragStart(q.id)}
                                                    onDragOver={handleDragOver(q.id)}
                                                    onDragLeave={handleDragLeave(q.id)}
                                                    onDrop={handleDrop(q.id)}
                                                    onDragEnd={handleDragEnd}
                                                >
                                                    <GripVertical className="w-4 h-4 text-slate-600 cursor-grab hover:text-slate-400" />
                                                    <span className="text-sm font-bold text-slate-400 w-8">Q{index + 1}</span>
                                                    <Badge variant="outline" className={`${questionTypeColors[q.type]} px-2 py-0.5 text-xs whitespace-nowrap`}>
                                                        {questionTypeLabels[q.type]}
                                                    </Badge>
                                                    <span className="flex-1 text-sm text-slate-300 truncate font-medium">{q.content}</span>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700"
                                                            onClick={() => moveQuestion(index, "up")}
                                                            disabled={index === 0}
                                                        >
                                                            <ArrowUp className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700"
                                                            onClick={() => moveQuestion(index, "down")}
                                                            disabled={index === questions.length - 1}
                                                        >
                                                            <ArrowDown className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700"
                                                            onClick={() => handleDuplicateQuestion(q)}
                                                        >
                                                            <Copy className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700"
                                                            onClick={() => handleEditQuestion(q)}
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                                            onClick={() => handleDeleteQuestion(q.id)}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {questions.length < 5 && (
                                <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    还需添加 {5 - questions.length} 道题目才能继续
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-base text-slate-200">推荐题目</CardTitle>
                                    <CardDescription className="text-slate-400">可直接引用教师提供的推荐题目</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {recommendQuestions.length === 0 && (
                                        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-500 text-center">
                                            暂无推荐题目
                                        </div>
                                    )}
                                    {recommendQuestions.map((rq) => (
                                        <div key={rq.id} className="flex flex-col gap-2 p-3 rounded-xl border border-slate-800 bg-slate-950/30 hover:bg-slate-900 transition-colors">
                                            <div className="space-y-1">
                                                <div className="text-sm font-medium text-slate-300 line-clamp-2">{rq.content}</div>
                                                <div className="text-xs text-slate-500">
                                                    类型：{questionTypeLabels[{ 1: "boolean", 2: "single", 3: "multiple", 4: "scale" }[rq.questionType] as QuestionType]}
                                                </div>
                                            </div>
                                            <Button size="sm" variant="outline" className="w-full mt-1 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => handleUseRecommend(rq)}>
                                                使用此题
                                            </Button>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-base text-slate-200">设计建议</CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm text-slate-400 space-y-2">
                                    <p>• 建议至少包含 2 种题型，提升回答质量。</p>
                                    <p>• 同一类型的题目控制在 10 题以内。</p>
                                    <p>• 题目表述应清晰无歧义。</p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                );

            case 3:
                return (
                    <div className="flex justify-center animate-in fade-in slide-in-from-right-4 duration-300">
                        <Card className="w-full max-w-2xl rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-slate-100">结束语设置</CardTitle>
                                <CardDescription className="text-slate-400">设置问卷的结束语，感谢受访者参与</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="ending" className="text-slate-300">结束语 *（至少20字）</Label>
                                    <Textarea
                                        id="ending"
                                        placeholder="请输入结束语，如致谢词等"
                                        value={endingText}
                                        onChange={(e) => setEndingText(e.target.value)}
                                        rows={8}
                                        maxLength={1000}
                                        className="bg-slate-950/50 border-slate-800 focus:border-indigo-500 resize-none"
                                    />
                                    <div className="flex justify-between text-xs">
                                        <span className={endingText.length < 20 ? "text-rose-400" : "text-emerald-400"}>
                                            {endingText.length < 20 ? `还需 ${20 - endingText.length} 字` : "✓ 符合要求"}
                                        </span>
                                        <span className="text-slate-500">{endingText.length}/1000</span>
                                    </div>
                                </div>
                                <div className="rounded-xl bg-indigo-900/20 border border-indigo-500/20 p-3 text-xs text-indigo-300 flex items-start gap-2">
                                    <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    提示：感谢语中可以提示下一步操作或后续联系信息。
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );

            case 4:
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-slate-100">问卷预览</CardTitle>
                                <CardDescription className="text-slate-400">展示给受访者的效果预览</CardDescription>
                            </CardHeader>
                            <CardContent className="flex justify-center bg-slate-950/30 py-8 rounded-xl inner-shadow">
                                <div className="w-full max-w-xs rounded-3xl border border-slate-200 bg-white p-5 shadow-xl text-slate-800">
                                    <div className="text-base font-bold text-slate-900 text-center">{title || "问卷标题"}</div>
                                    <div className="mt-3 text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                                        {welcomeText || "欢迎语将在这里展示"}
                                    </div>
                                    <div className="mt-5 space-y-3">
                                        {questions.slice(0, 3).map((q, index) => (
                                            <div key={q.id} className="rounded-xl bg-slate-50 p-3 text-xs border border-slate-100">
                                                <span className="font-semibold text-slate-700">Q{index + 1}.</span> <span className="text-slate-600">{q.content}</span>
                                            </div>
                                        ))}
                                        {questions.length > 3 && (
                                            <div className="text-center text-xs text-slate-400 py-1">... 更多题目 ...</div>
                                        )}
                                        {questions.length === 0 && (
                                            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-400 text-center italic">
                                                还没有题目
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-5 pt-3 border-t border-slate-100 text-[10px] text-slate-500 whitespace-pre-line text-center">
                                        {endingText || "结束语将在这里展示"}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm h-fit">
                            <CardHeader>
                                <CardTitle className="text-slate-100">校验清单</CardTitle>
                                <CardDescription className="text-slate-400">确认问卷信息完善后再进入下一阶段</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className={`flex items-center gap-3 p-3 rounded-xl border ${validation.title ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.title ? (
                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-rose-500" />
                                    )}
                                    <span className={`text-sm ${validation.title ? "text-emerald-400" : "text-rose-400"}`}>
                                        问卷标题：{title ? "已填写" : "未填写"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-3 p-3 rounded-xl border ${validation.welcomeText ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.welcomeText ? (
                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-rose-500" />
                                    )}
                                    <span className={`text-sm ${validation.welcomeText ? "text-emerald-400" : "text-rose-400"}`}>
                                        欢迎语：{welcomeText.length} 字 {validation.welcomeText ? "" : "(至少20字)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-3 p-3 rounded-xl border ${validation.questionCount ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.questionCount ? (
                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-rose-500" />
                                    )}
                                    <span className={`text-sm ${validation.questionCount ? "text-emerald-400" : "text-rose-400"}`}>
                                        题目数量：{questions.length} 道 {validation.questionCount ? "" : "(需要5-50道)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-3 p-3 rounded-xl border ${validation.questionTypes ? "bg-emerald-500/10 border-emerald-500/20" : "bg-amber-500/10 border-amber-500/20"}`}>
                                    {validation.questionTypes ? (
                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-amber-500" />
                                    )}
                                    <span className={`text-sm ${validation.questionTypes ? "text-emerald-400" : "text-amber-400"}`}>
                                        题型多样性：{new Set(questions.map((q) => q.type)).size} 种题型
                                        {validation.questionTypes ? "" : " (建议至少2种)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-3 p-3 rounded-xl border ${validation.endingText ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.endingText ? (
                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-rose-500" />
                                    )}
                                    <span className={`text-sm ${validation.endingText ? "text-emerald-400" : "text-rose-400"}`}>
                                        结束语：{endingText.length} 字 {validation.endingText ? "" : "(至少20字)"}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );
        }
    };

    return (
        <div className="space-y-8 pb-12">
            <Card className="rounded-3xl border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/20 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-500 opacity-20"></div>
                <CardContent className="py-6 px-8">
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <div className="text-xs text-indigo-400 uppercase tracking-widest font-semibold mb-1">问卷设计进度</div>
                                <div className="text-xl font-bold text-slate-100 flex items-center gap-2">
                                    <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-indigo-500/30">
                                        {step}
                                    </span>
                                    {steps[step - 1]?.title}
                                </div>
                            </div>
                            <div className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 text-sm font-semibold text-indigo-400 shadow-sm">
                                {Math.round((step / 4) * 100)}% 完成度
                            </div>
                        </div>

                        <div className="relative pt-2">
                            <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-0.5 bg-slate-800 -z-10" />
                            <div className="flex items-start justify-between relative">
                                {steps.map((s) => {
                                    const isCompleted = step > s.num;
                                    const isCurrent = step === s.num;

                                    return (
                                        <button
                                            key={s.num}
                                            onClick={() => setStep(s.num as 1 | 2 | 3 | 4)}
                                            className="flex flex-col items-center gap-2 group"
                                        >
                                            <span
                                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${isCurrent
                                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/40 scale-110 ring-4 ring-slate-900"
                                                    : isCompleted
                                                        ? "bg-emerald-500 text-white ring-4 ring-slate-900"
                                                        : "bg-slate-800 text-slate-500 border border-slate-700 ring-4 ring-slate-900"
                                                    }`}
                                            >
                                                {isCompleted ? <CheckCircle className="w-4 h-4" /> : s.num}
                                            </span>
                                            <span className={`text-xs font-medium transition-colors duration-200 ${isCurrent ? "text-indigo-400" : isCompleted ? "text-emerald-500" : "text-slate-500 group-hover:text-slate-400"}`}>
                                                {s.title}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {renderStep()}

            <div className="flex justify-between pt-4 border-t border-slate-800/50">
                <Button
                    variant="outline"
                    onClick={() => step > 1 && setStep((step - 1) as 1 | 2 | 3 | 4)}
                    disabled={step === 1}
                    className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                    上一步
                </Button>
                {step < 4 ? (
                    <Button onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
                        下一步
                    </Button>
                ) : (
                    <Button onClick={() => setConfirmNextOpen(true)} disabled={!canProceed} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        确认完成，进入下一阶段
                    </Button>
                )}
            </div>

            {/* Question Editor Dialog */}
            <QuestionEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                question={editingQuestion}
                onSave={handleSaveQuestion}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">确认删除</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            确定要删除这道题目吗？此操作无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-rose-600 hover:bg-rose-700 text-white">删除</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">确认完成问卷设计</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400 text-base leading-relaxed">
                            确认后问卷设计将被<strong className="text-indigo-400">锁定</strong>。如需修改，您需要返回本阶段重新设计，届时后续阶段的数据将被<strong className="text-rose-400">清空</strong>。
                            <br /><br />
                            确定继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmComplete} className="bg-emerald-600 hover:bg-emerald-700 text-white">确认完成</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={restoreDraftOpen} onOpenChange={setRestoreDraftOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">恢复草稿</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            检测到本地草稿，是否恢复？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
                            onClick={() => {
                                if (draftKey) localStorage.removeItem(draftKey);
                                setRestoreDraftOpen(false);
                            }}
                        >
                            放弃草稿
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => {
                                if (!pendingDraft) return;
                                setTitle(pendingDraft.title ?? "");
                                setWelcomeText(pendingDraft.welcomeText ?? "");
                                setEndingText(pendingDraft.endingText ?? "");
                                setQuestions(pendingDraft.questions ?? []);
                                setRestoreDraftOpen(false);
                            }}
                        >
                            恢复草稿
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default QuestionnaireDesign;

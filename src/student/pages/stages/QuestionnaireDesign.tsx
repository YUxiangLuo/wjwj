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
import { Plus, GripVertical, Trash2, Edit2, CheckCircle, AlertCircle, Copy, ArrowUp, ArrowDown } from "lucide-react";
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
    boolean: "bg-indigo-100 text-indigo-700",
    single: "bg-teal-100 text-teal-700",
    multiple: "bg-emerald-100 text-emerald-700",
    scale: "bg-amber-100 text-amber-700",
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
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card className="lg:col-span-2 rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                            <CardHeader>
                                <CardTitle>欢迎语设置</CardTitle>
                                <CardDescription>设置问卷的标题和欢迎语，让受访者了解调查目的</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="title">问卷标题 *</Label>
                                    <Input
                                        id="title"
                                        placeholder="请输入问卷标题"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        maxLength={100}
                                    />
                                    <p className="text-xs text-muted-foreground text-right">{title.length}/100</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="welcome">欢迎语 *（至少20字）</Label>
                                    <Textarea
                                        id="welcome"
                                        placeholder="请输入欢迎语，说明调查目的、预计用时等"
                                        value={welcomeText}
                                        onChange={(e) => setWelcomeText(e.target.value)}
                                        rows={8}
                                        maxLength={1000}
                                    />
                                    <div className="flex justify-between text-xs">
                                        <span className={welcomeText.length < 20 ? "text-red-500" : "text-muted-foreground"}>
                                            {welcomeText.length < 20 ? `还需 ${20 - welcomeText.length} 字` : "✓ 符合要求"}
                                        </span>
                                        <span className="text-muted-foreground">{welcomeText.length}/1000</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl border-white/70 bg-gradient-to-b from-teal-50 via-cyan-50 to-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                            <CardHeader>
                                <CardTitle className="text-base">小贴士</CardTitle>
                                <CardDescription>好的欢迎语能提高数据质量。</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-muted-foreground">
                                <p>建议说明调查目的、预计用时与隐私保护方式。</p>
                                <p>保持简洁友好，最好控制在 200 字以内。</p>
                                <div className="rounded-xl bg-white/80 p-3 text-xs text-slate-600">
                                    示例：感谢参与本次调查，本问卷约 3 分钟完成，数据仅用于教学分析。
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );

            case 2:
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle>题目列表</CardTitle>
                                        <CardDescription>
                                            已添加 {questions.length} 道题目（最少5题，最多50题）
                                        </CardDescription>
                                    </div>
                                    <Button onClick={handleAddQuestion} disabled={questions.length >= 50}>
                                        <Plus className="w-4 h-4 mr-1" />
                                        添加题目
                                    </Button>
                                </CardHeader>
                                <CardContent>
                                    {questions.length === 0 ? (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <p>暂无题目，点击「添加题目」开始设计问卷</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {questions.map((q, index) => (
                                                <div
                                                    key={q.id}
                                                    className={`flex items-center gap-2 p-3 rounded-2xl border bg-white/90 transition-colors group hover:bg-white ${
                                                        dragOverId === q.id && draggingId !== q.id
                                                            ? "border-teal-300 ring-2 ring-teal-200"
                                                            : "border-white/60"
                                                    } ${draggingId === q.id ? "opacity-60" : ""}`}
                                                    draggable
                                                    onDragStart={handleDragStart(q.id)}
                                                    onDragOver={handleDragOver(q.id)}
                                                    onDragLeave={handleDragLeave(q.id)}
                                                    onDrop={handleDrop(q.id)}
                                                    onDragEnd={handleDragEnd}
                                                >
                                                    <GripVertical className="w-4 h-4 text-slate-400 cursor-grab" />
                                                    <span className="text-sm font-medium w-8">Q{index + 1}</span>
                                                    <span className={`text-xs px-2 py-0.5 rounded ${questionTypeColors[q.type]}`}>
                                                        {questionTypeLabels[q.type]}
                                                    </span>
                                                    <span className="flex-1 text-sm truncate">{q.content}</span>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => moveQuestion(index, "up")}
                                                            disabled={index === 0}
                                                        >
                                                            <ArrowUp className="w-4 h-4 text-slate-400" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => moveQuestion(index, "down")}
                                                            disabled={index === questions.length - 1}
                                                        >
                                                            <ArrowDown className="w-4 h-4 text-slate-400" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => handleDuplicateQuestion(q)}
                                                        >
                                                            <Copy className="w-4 h-4 text-slate-400" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => handleEditQuestion(q)}
                                                        >
                                                            <Edit2 className="w-4 h-4 text-slate-400" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={() => handleDeleteQuestion(q.id)}
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-400" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {questions.length < 5 && (
                                <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    还需添加 {5 - questions.length} 道题目才能继续
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                                <CardHeader>
                                    <CardTitle>推荐题目</CardTitle>
                                    <CardDescription>可直接引用教师提供的推荐题目</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {recommendQuestions.length === 0 && (
                                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-muted-foreground">
                                            暂无推荐题目，可先创建自己的题目。
                                        </div>
                                    )}
                                    {recommendQuestions.map((rq) => (
                                        <div key={rq.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-white/60 bg-white/90">
                                            <div className="space-y-1">
                                                <div className="text-sm font-medium">{rq.content}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    类型：{questionTypeLabels[{ 1: "boolean", 2: "single", 3: "multiple", 4: "scale" }[rq.questionType] as QuestionType]}
                                                </div>
                                            </div>
                                            <Button size="sm" variant="outline" onClick={() => handleUseRecommend(rq)}>
                                                使用
                                            </Button>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                            <Card className="rounded-2xl border-white/70 bg-gradient-to-b from-orange-50 via-amber-50 to-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                                <CardHeader>
                                    <CardTitle className="text-base">设计建议</CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm text-muted-foreground space-y-2">
                                    <p>建议至少包含 2 种题型，提升回答质量。</p>
                                    <p>同一类型的题目控制在 10 题以内。</p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                );

            case 3:
                return (
                    <div className="flex justify-center">
                        <Card className="w-full max-w-2xl rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                            <CardHeader>
                                <CardTitle>结束语设置</CardTitle>
                                <CardDescription>设置问卷的结束语，感谢受访者参与</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="ending">结束语 *（至少20字）</Label>
                                    <Textarea
                                        id="ending"
                                        placeholder="请输入结束语，如致谢词等"
                                        value={endingText}
                                        onChange={(e) => setEndingText(e.target.value)}
                                        rows={8}
                                        maxLength={1000}
                                    />
                                    <div className="flex justify-between text-xs">
                                        <span className={endingText.length < 20 ? "text-red-500" : "text-muted-foreground"}>
                                            {endingText.length < 20 ? `还需 ${20 - endingText.length} 字` : "✓ 符合要求"}
                                        </span>
                                        <span className="text-muted-foreground">{endingText.length}/1000</span>
                                    </div>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3 text-xs text-muted-foreground">
                                    小提示：感谢语中可以提示下一步操作或后续联系信息。
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );

            case 4:
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                            <CardHeader>
                                <CardTitle>问卷预览</CardTitle>
                                <CardDescription>展示给受访者的效果预览</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="mx-auto w-full max-w-xs rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="text-sm font-semibold text-foreground">{title || "问卷标题"}</div>
                                    <div className="mt-2 text-xs text-muted-foreground whitespace-pre-line">
                                        {welcomeText || "欢迎语将在这里展示"}
                                    </div>
                                    <div className="mt-4 space-y-2">
                                        {questions.slice(0, 4).map((q, index) => (
                                            <div key={q.id} className="rounded-2xl bg-slate-50 p-2 text-xs text-muted-foreground">
                                                Q{index + 1}. {q.content}
                                            </div>
                                        ))}
                                        {questions.length === 0 && (
                                            <div className="rounded-2xl bg-slate-50 p-2 text-xs text-muted-foreground">
                                                还没有题目
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-4 text-[11px] text-muted-foreground whitespace-pre-line">
                                        {endingText || "结束语将在这里展示"}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                            <CardHeader>
                                <CardTitle>校验清单</CardTitle>
                                <CardDescription>确认问卷信息完善后再进入下一阶段</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className={`flex items-center gap-2 p-3 rounded-2xl ${validation.title ? "bg-emerald-50" : "bg-red-50"}`}>
                                    {validation.title ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                    )}
                                    <span className="text-sm">问卷标题：{title || "(未填写)"}</span>
                                </div>
                                <div className={`flex items-center gap-2 p-3 rounded-2xl ${validation.welcomeText ? "bg-emerald-50" : "bg-red-50"}`}>
                                    {validation.welcomeText ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                    )}
                                    <span className="text-sm">欢迎语：{welcomeText.length} 字 {validation.welcomeText ? "" : "(至少20字)"}</span>
                                </div>
                                <div className={`flex items-center gap-2 p-3 rounded-2xl ${validation.questionCount ? "bg-emerald-50" : "bg-red-50"}`}>
                                    {validation.questionCount ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                    )}
                                    <span className="text-sm">题目数量：{questions.length} 道 {validation.questionCount ? "" : "(需要5-50道)"}</span>
                                </div>
                                <div className={`flex items-center gap-2 p-3 rounded-2xl ${validation.questionTypes ? "bg-emerald-50" : "bg-amber-50"}`}>
                                    {validation.questionTypes ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-amber-500" />
                                    )}
                                    <span className="text-sm">
                                        题型多样性：{new Set(questions.map((q) => q.type)).size} 种题型
                                        {validation.questionTypes ? "" : " (建议至少2种)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2 p-3 rounded-2xl ${validation.endingText ? "bg-emerald-50" : "bg-red-50"}`}>
                                    {validation.endingText ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                    )}
                                    <span className="text-sm">结束语：{endingText.length} 字 {validation.endingText ? "" : "(至少20字)"}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );
        }
    };

    return (
        <div className="space-y-6">
            <Card className="rounded-3xl border-white/70 bg-gradient-to-r from-white via-slate-50 to-white shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
                <CardContent className="py-5">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-xs text-muted-foreground">问卷设计进度</div>
                                <div className="text-base font-semibold text-foreground">第 {step} 步：{steps[step - 1]?.title}</div>
                            </div>
                            <div className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                                {Math.round((step / 4) * 100)}%
                            </div>
                        </div>

                        <div className="relative">
                            <div className="absolute left-6 right-6 top-4 h-1 rounded-full bg-slate-200" />
                            <div
                                className="absolute left-6 top-4 h-1 rounded-full bg-gradient-to-r from-teal-400 to-indigo-400"
                                style={{ width: `calc(${(step / 4) * 100}% - 12px)` }}
                            />
                            <div className="relative flex items-start justify-between">
                                {steps.map((s) => {
                                    const isCompleted = step > s.num;
                                    const isCurrent = step === s.num;

                                    return (
                                        <button
                                            key={s.num}
                                            onClick={() => setStep(s.num as 1 | 2 | 3 | 4)}
                                            className="flex flex-col items-center gap-2"
                                        >
                                            <span
                                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                                                    isCurrent
                                                        ? "bg-teal-500 text-white shadow-[0_0_0_4px_rgba(20,184,166,0.15)]"
                                                        : isCompleted
                                                            ? "bg-emerald-100 text-emerald-700"
                                                            : "bg-slate-100 text-slate-500"
                                                }`}
                                            >
                                                {s.num}
                                            </span>
                                            <span className={`text-xs ${isCurrent ? "font-medium text-teal-700" : isCompleted ? "text-emerald-600" : "text-slate-500"}`}>
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

            <div className="flex justify-between">
                <Button
                    variant="outline"
                    onClick={() => step > 1 && setStep((step - 1) as 1 | 2 | 3 | 4)}
                    disabled={step === 1}
                >
                    上一步
                </Button>
                {step < 4 ? (
                    <Button onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}>
                        下一步
                    </Button>
                ) : (
                    <Button onClick={() => setConfirmNextOpen(true)} disabled={!canProceed}>
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
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认删除</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除这道题目吗？此操作无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认完成问卷设计</AlertDialogTitle>
                        <AlertDialogDescription>
                            确认后问卷设计将被锁定。如需修改，您需要返回本阶段重新设计，届时后续阶段的数据将被清空。
                            <br /><br />
                            确定继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmComplete}>确认完成</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={restoreDraftOpen} onOpenChange={setRestoreDraftOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>恢复草稿</AlertDialogTitle>
                        <AlertDialogDescription>
                            检测到本地草稿，是否恢复？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => {
                                if (draftKey) localStorage.removeItem(draftKey);
                                setRestoreDraftOpen(false);
                            }}
                        >
                            放弃草稿
                        </AlertDialogCancel>
                        <AlertDialogAction
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

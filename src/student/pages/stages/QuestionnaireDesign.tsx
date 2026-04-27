import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, GripVertical, Trash2, Edit2, CheckCircle, AlertCircle, Copy, ArrowUp, ArrowDown, HelpCircle, MessageSquare, List, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { useExperiment } from "../ExperimentLayout";
import { QuestionEditor } from "../../components/QuestionEditor";
import { RichTextEditor } from "../../components/RichTextEditor";
import { ImmersiveQuestionnairePreview } from "../../components/ImmersiveQuestionnairePreview";
import { tasksApi, type Question, type QuestionType, type QuestionnaireData } from "../../api-client";
import { calculateQuestionnaireScoreSummary, getInvalidOptionQuestionIndexes } from "./questionnaire-scoring";

const questionTypeLabels: Record<QuestionType, string> = {
    boolean: "判断题",
    single: "单选题",
    multiple: "多选题",
    scale: "量表",
};

interface QuestionnaireStepValidation {
    title: boolean;
    welcomeText: boolean;
    endingText: boolean;
    questionCount: boolean;
    optionCount: boolean;
    previewCompleted: boolean;
}

type ValidationTone = "pass" | "warning" | "fail";

const validationToneClasses: Record<ValidationTone, string> = {
    pass: "border-primary/20 bg-primary/10 text-primary",
    warning: "border-border bg-muted/40 text-muted-foreground",
    fail: "border-destructive/20 bg-destructive/10 text-destructive",
};

function getValidationTone(isValid: boolean, warning = false): ValidationTone {
    if (isValid) return "pass";
    return warning ? "warning" : "fail";
}

export function canAdvanceQuestionnaireStep(step: 1 | 2 | 3 | 4, validation: QuestionnaireStepValidation) {
    switch (step) {
        case 1:
            return validation.title && validation.welcomeText;
        case 2:
            return validation.questionCount && validation.optionCount;
        case 3:
            return validation.endingText;
        case 4:
            return validation.previewCompleted;
    }
}

export function getPreviewCompletionState(contentFingerprint: string) {
    return {
        previewCompleted: true,
        previewContentHash: contentFingerprint,
        previewOpen: false,
    };
}

function generateId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function QuestionnaireDesign() {
    const { experiment, registerStageSave, saveExperiment } = useExperiment();

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
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [recommendQuestions, setRecommendQuestions] = useState<Question[]>([]);
    const [recommendCollapsed, setRecommendCollapsed] = useState(false);

    // Immersive preview state
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewCompleted, setPreviewCompleted] = useState(false);
    const [previewContentHash, setPreviewContentHash] = useState("");

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
    const questionnaireData = useMemo<QuestionnaireData>(() => ({
        title,
        welcomeText,
        endingText,
        questions,
    }), [title, welcomeText, endingText, questions]);

    // Content fingerprint for detecting changes after preview completion
    const contentFingerprint = useMemo(
        () => `${title}|${welcomeText}|${endingText}|${questions.map(q =>
            q.id + q.type + q.content
            + (q.options ?? []).join(";")
            + (q.minSelect ?? "") + (q.maxSelect ?? "")
            + (q.scaleMin ?? "") + (q.scaleMax ?? "")
            + (q.scaleMinLabel ?? "") + (q.scaleMaxLabel ?? "")
        ).join(",")}`,
        [title, welcomeText, endingText, questions],
    );
    const isPreviewValid = previewCompleted && previewContentHash === contentFingerprint;
    const handlePreviewComplete = useCallback(() => {
        setPreviewCompleted(true);
        setPreviewContentHash(contentFingerprint);
        setPreviewOpen(false);
    }, [contentFingerprint]);

    const saveQuestionnaire = useCallback(async (nextData: QuestionnaireData) => {
        return saveExperiment({ questionnaire: nextData });
    }, [saveExperiment]);

    useEffect(() => {
        registerStageSave(() => saveQuestionnaire(questionnaireData));
        return () => {
            registerStageSave(null);
        };
    }, [questionnaireData, registerStageSave, saveQuestionnaire]);

    const steps = [
        { num: 1, title: "欢迎语设置" },
        { num: 2, title: "题目设计" },
        { num: 3, title: "结束语设置" },
        { num: 4, title: "模拟填写" },
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
            recommendSourceId: undefined,
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

    const handleUseRecommend = (rq: Question) => {
        let duplicate = false;
        setQuestions((prev) => {
            if (prev.some((q) => q.recommendSourceId === rq.id)) {
                duplicate = true;
                return prev;
            }
            return [...prev, { ...rq, id: generateId(), recommendSourceId: rq.id }];
        });
        if (duplicate) {
            toast.error("该推荐题目已在问卷中，请勿重复添加");
        }
    };

    const invalidOptionQuestions = useMemo(() => getInvalidOptionQuestionIndexes(questions), [questions]);

    const welcomeTextLength = useMemo(() => getRichTextPlainLength(welcomeText), [welcomeText]);
    const endingTextLength = useMemo(() => getRichTextPlainLength(endingText), [endingText]);

    // Validation
    const validation = {
        title: title.trim().length >= 1 && title.length <= 100,
        welcomeText: welcomeTextLength >= 20 && welcomeTextLength <= 1000,
        endingText: endingTextLength >= 20 && endingTextLength <= 1000,
        questionCount: questions.length >= 5 && questions.length <= 50,
        optionCount: invalidOptionQuestions.length === 0,
        questionTypes: new Set(questions.map((q) => q.type)).size >= 2,
        previewCompleted: isPreviewValid,
    };

    const basicValidationPassed =
        validation.title &&
        validation.welcomeText &&
        validation.endingText &&
        validation.questionCount &&
        validation.optionCount;

    const canProceed = basicValidationPassed && validation.previewCompleted;
    const canAdvanceToNextStep = canAdvanceQuestionnaireStep(step, validation);

    const { scoreItems, preliminaryScore } = useMemo(() => calculateQuestionnaireScoreSummary({
        title,
        welcomeText,
        endingText,
        questions,
        invalidOptionQuestions,
    }), [endingText, invalidOptionQuestions, questions, title, welcomeText]);

    const requiredFailCount = [
        validation.title,
        validation.welcomeText,
        validation.endingText,
        validation.questionCount,
        validation.optionCount,
        validation.previewCompleted,
    ].filter(Boolean).length;
    const requiredMissingCount = 6 - requiredFailCount;
    const warningCount = validation.questionTypes ? 0 : 1;

    const handleConfirmComplete = async () => {
        await saveExperiment({
            questionnaire: questionnaireData,
            currentStage: 2,
        });
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-right-4 duration-300 lg:grid-cols-3">
                        <Card className="lg:col-span-2">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-foreground">
                                    <MessageSquare className="size-5 text-primary" />
                                    欢迎语设置
                                </CardTitle>
                                <CardDescription>设置问卷的标题和欢迎语，让受访者了解调查目的</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-6">
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="title">问卷标题 *</Label>
                                    <Input
                                        id="title"
                                        placeholder="请输入问卷标题"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        maxLength={100}
                                        data-testid="student-questionnaire-title"
                                    />
                                    <p className="text-right text-xs text-muted-foreground">{title.length}/100</p>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="welcome">欢迎语 *（至少20字）</Label>
                                    <RichTextEditor
                                        dataTestId="student-questionnaire-welcome"
                                        editorTestId="student-questionnaire-welcome-editor"
                                        id="welcome"
                                        placeholder="请输入欢迎语，说明调查目的、预计用时等"
                                        value={welcomeText}
                                        onChange={setWelcomeText}
                                        editorClassName="min-h-[220px]"
                                    />
                                    <div className="flex justify-between text-xs">
                                        <span className={welcomeTextLength < 20 || welcomeTextLength > 1000 ? "text-destructive" : "text-primary"}>
                                            {welcomeTextLength > 1000
                                                ? `已超出 ${welcomeTextLength - 1000} 字`
                                                : welcomeTextLength < 20
                                                    ? `还需 ${20 - welcomeTextLength} 字`
                                                    : "✓ 符合要求"}
                                        </span>
                                        <span className="text-muted-foreground">{welcomeTextLength}/1000</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="h-fit">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base text-foreground">
                                    <HelpCircle className="size-4 text-primary" />
                                    小贴士
                                </CardTitle>
                                <CardDescription>好的欢迎语能提高数据质量。</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
                                <p>建议说明调查目的、预计用时与隐私保护方式。</p>
                                <p>保持简洁友好，最好控制在 200 字以内。</p>
                                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground">
                                    <span className="mb-1 block font-semibold">示例：</span>
                                    感谢参与本次调查，本问卷约 3 分钟完成，数据仅用于教学分析。
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );

            case 2:
                return (
                    <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-right-4 duration-300 lg:grid-cols-3">
                        <div className="flex flex-col gap-4 lg:col-span-2">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                                    <div>
                                        <CardTitle className="flex items-center gap-2 text-foreground">
                                            <List className="size-5 text-primary" />
                                            题目列表
                                        </CardTitle>
                                        <CardDescription className="mt-1">
                                            已添加 {questions.length} 道题目（最少5题，最多50题）
                                        </CardDescription>
                                    </div>
                                    <Button
                                        onClick={handleAddQuestion}
                                        disabled={questions.length >= 50}
                                        data-testid="student-questionnaire-add-question"
                                    >
                                        <Plus data-icon="inline-start" />
                                        添加题目
                                    </Button>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4 pt-6" data-testid="student-questionnaire-list">
                                    {questions.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center text-muted-foreground">
                                            <p>暂无题目，点击「添加题目」开始设计问卷</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            {questions.map((q, index) => (
                                                <div
                                                    key={q.id}
                                                    data-testid={`student-questionnaire-item-${q.id}`}
                                                    className={cn(
                                                        "group flex items-center gap-3 rounded-lg border p-3 transition-all hover:bg-muted/40",
                                                        dragOverId === q.id && draggingId !== q.id
                                                            ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                                                            : "border-border bg-card/70",
                                                        draggingId === q.id && "opacity-50",
                                                    )}
                                                    draggable
                                                    onDragStart={handleDragStart(q.id)}
                                                    onDragOver={handleDragOver(q.id)}
                                                    onDragLeave={handleDragLeave(q.id)}
                                                    onDrop={handleDrop(q.id)}
                                                    onDragEnd={handleDragEnd}
                                                >
                                                    <GripVertical className="size-4 cursor-grab text-muted-foreground hover:text-foreground" />
                                                    <span className="w-8 text-sm font-bold text-muted-foreground">Q{index + 1}</span>
                                                    <Badge variant="outline" className="whitespace-nowrap">
                                                        {questionTypeLabels[q.type]}
                                                    </Badge>
                                                    <span className="flex-1 truncate text-sm font-medium text-foreground">{q.content}</span>
                                                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            data-testid={`student-questionnaire-move-up-${q.id}`}
                                                            onClick={() => moveQuestion(index, "up")}
                                                            disabled={index === 0}
                                                        >
                                                            <ArrowUp />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            data-testid={`student-questionnaire-move-down-${q.id}`}
                                                            onClick={() => moveQuestion(index, "down")}
                                                            disabled={index === questions.length - 1}
                                                        >
                                                            <ArrowDown />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            data-testid={`student-questionnaire-duplicate-${q.id}`}
                                                            onClick={() => handleDuplicateQuestion(q)}
                                                        >
                                                            <Copy />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            data-testid={`student-questionnaire-edit-${q.id}`}
                                                            onClick={() => handleEditQuestion(q)}
                                                        >
                                                            <Edit2 />
                                                        </Button>
                                                        <Button
                                                            variant="destructive"
                                                            size="icon-xs"
                                                            data-testid={`student-questionnaire-delete-${q.id}`}
                                                            onClick={() => handleDeleteQuestion(q.id)}
                                                        >
                                                            <Trash2 />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {questions.length < 5 && (
                                <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                                    <AlertCircle className="size-4" />
                                    还需添加 {5 - questions.length} 道题目才能继续
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col gap-4">
                            <Card>
                                <CardHeader className="cursor-pointer select-none" onClick={() => setRecommendCollapsed(!recommendCollapsed)}>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-foreground">推荐题目</CardTitle>
                                        <span className={cn("text-muted-foreground transition-transform duration-200", !recommendCollapsed && "rotate-180")}>▲</span>
                                    </div>
                                    <CardDescription>可直接引用教师提供的推荐题目</CardDescription>
                                </CardHeader>
                                {!recommendCollapsed && (
                                    <CardContent className="custom-scrollbar flex max-h-[400px] flex-col gap-3 overflow-y-auto pr-2">
                                        {recommendQuestions.length === 0 && (
                                            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                                                暂无推荐题目
                                            </div>
                                        )}
                                        {recommendQuestions.map((rq) => {
                                            const recommendAlreadyInQuestionnaire = questions.some((q) => q.recommendSourceId === rq.id);
                                            return (
                                            <div key={rq.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card/70 p-3 transition-colors hover:bg-muted/30">
                                                <div className="flex flex-col gap-1">
                                                    <div className="line-clamp-2 text-sm font-medium text-foreground">{rq.content}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        类型：{questionTypeLabels[rq.type]}
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={recommendAlreadyInQuestionnaire}
                                                    className="mt-1 w-full"
                                                    onClick={() => handleUseRecommend(rq)}
                                                >
                                                    {recommendAlreadyInQuestionnaire ? "已在问卷中" : "使用此题"}
                                                </Button>
                                            </div>
                                            );
                                        })}
                                    </CardContent>
                                )}
                            </Card>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base text-foreground">设计建议</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
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
                        <Card className="w-full max-w-2xl">
                            <CardHeader>
                                <CardTitle>结束语设置</CardTitle>
                                <CardDescription>设置问卷的结束语，感谢受访者参与</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-6">
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="ending">结束语 *（至少20字）</Label>
                                    <RichTextEditor
                                        dataTestId="student-questionnaire-ending"
                                        editorTestId="student-questionnaire-ending-editor"
                                        id="ending"
                                        placeholder="请输入结束语，如致谢词等"
                                        value={endingText}
                                        onChange={setEndingText}
                                        editorClassName="min-h-[220px]"
                                    />
                                    <div className="flex justify-between text-xs">
                                        <span className={endingTextLength < 20 || endingTextLength > 1000 ? "text-destructive" : "text-primary"}>
                                            {endingTextLength > 1000
                                                ? `已超出 ${endingTextLength - 1000} 字`
                                                : endingTextLength < 20
                                                    ? `还需 ${20 - endingTextLength} 字`
                                                    : "✓ 符合要求"}
                                        </span>
                                        <span className="text-muted-foreground">{endingTextLength}/1000</span>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                                    <HelpCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                                    提示：感谢语中可以提示下一步操作或后续联系信息。
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );

            case 4:
                return (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                        {/* Immersive preview CTA */}
                        <Card className="overflow-hidden">
                            {isPreviewValid ? (
                                <CardContent className="py-5">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                                                <CheckCircle className="size-5 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-semibold text-foreground">模拟填写已完成</h3>
                                                <p className="text-sm text-muted-foreground">您已体验了受访者视角的问卷填写过程</p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            onClick={() => setPreviewOpen(true)}
                                            data-testid="student-questionnaire-redo-preview"
                                            className="shrink-0"
                                        >
                                            <RotateCcw data-icon="inline-start" />
                                            重新模拟填写
                                        </Button>
                                    </div>
                                </CardContent>
                            ) : (
                                <div>
                                    <div className="border-b border-border bg-muted/30 px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                                                <Play className="size-5 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-semibold text-foreground">模拟填写体验</h3>
                                                <p className="mt-0.5 text-xs text-muted-foreground">请以受访者身份完整体验一次问卷填写</p>
                                            </div>
                                        </div>
                                    </div>
                                    <CardContent className="py-8">
                                        <div className="flex flex-col items-center gap-5">
                                            <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
                                                在进入下一阶段之前，您需要以受访者的视角完整填写一次自己设计的问卷。
                                                这将帮助您发现问卷中可能存在的问题，提升问卷质量。
                                            </p>
                                            <Button
                                                onClick={() => setPreviewOpen(true)}
                                                disabled={!basicValidationPassed}
                                                size="lg"
                                                data-testid="student-questionnaire-start-preview"
                                                className="px-8"
                                            >
                                                <Play data-icon="inline-start" />
                                                开始模拟填写
                                            </Button>
                                            {!basicValidationPassed && (
                                                <p className="text-xs text-muted-foreground">请先完成下方校验清单中的必填项</p>
                                            )}
                                        </div>
                                    </CardContent>
                                </div>
                            )}
                        </Card>

                        {/* Validation checklist and score */}
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <Card className="h-fit">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">校验清单</CardTitle>
                                <CardDescription>确认问卷信息完善后再进入下一阶段</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-1.5">
                                <div className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", validationToneClasses[getValidationTone(validation.title)])}>
                                    {validation.title ? (
                                        <CheckCircle className="size-4 shrink-0" />
                                    ) : (
                                        <AlertCircle className="size-4 shrink-0" />
                                    )}
                                    <span className="text-sm">
                                        问卷标题：{title ? "已填写" : "未填写"}
                                    </span>
                                </div>
                                <div className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", validationToneClasses[getValidationTone(validation.welcomeText)])}>
                                    {validation.welcomeText ? (
                                        <CheckCircle className="size-4 shrink-0" />
                                    ) : (
                                        <AlertCircle className="size-4 shrink-0" />
                                    )}
                                    <span className="text-sm">
                                        欢迎语：{welcomeTextLength} 字 {validation.welcomeText ? "" : "(20-1000字)"}
                                    </span>
                                </div>
                                <div className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", validationToneClasses[getValidationTone(validation.questionCount)])}>
                                    {validation.questionCount ? (
                                        <CheckCircle className="size-4 shrink-0" />
                                    ) : (
                                        <AlertCircle className="size-4 shrink-0" />
                                    )}
                                    <span className="text-sm">
                                        题目数量：{questions.length} 道 {validation.questionCount ? "" : "(需要5-50道)"}
                                    </span>
                                </div>
                                <div className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", validationToneClasses[getValidationTone(validation.questionTypes, true)])}>
                                    {validation.questionTypes ? (
                                        <CheckCircle className="size-4 shrink-0" />
                                    ) : (
                                        <AlertCircle className="size-4 shrink-0" />
                                    )}
                                    <span className="text-sm">
                                        题型多样性：{new Set(questions.map((q) => q.type)).size} 种题型
                                        {validation.questionTypes ? "" : " (建议至少2种)"}
                                    </span>
                                </div>
                                <div className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", validationToneClasses[getValidationTone(validation.optionCount)])}>
                                    {validation.optionCount ? (
                                        <CheckCircle className="size-4 shrink-0" />
                                    ) : (
                                        <AlertCircle className="size-4 shrink-0" />
                                    )}
                                    <span className="text-sm">
                                        选项数量：{validation.optionCount ? "配置有效" : `Q${invalidOptionQuestions.slice(0, 5).join("、")} 需检查`}
                                    </span>
                                </div>
                                <div className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", validationToneClasses[getValidationTone(validation.endingText)])}>
                                    {validation.endingText ? (
                                        <CheckCircle className="size-4 shrink-0" />
                                    ) : (
                                        <AlertCircle className="size-4 shrink-0" />
                                    )}
                                    <span className="text-sm">
                                        结束语：{endingTextLength} 字 {validation.endingText ? "" : "(20-1000字)"}
                                    </span>
                                </div>
                                <div className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", validationToneClasses[getValidationTone(validation.previewCompleted)])}>
                                    {validation.previewCompleted ? (
                                        <CheckCircle className="size-4 shrink-0" />
                                    ) : (
                                        <AlertCircle className="size-4 shrink-0" />
                                    )}
                                    <span className="text-sm">
                                        模拟填写：{validation.previewCompleted ? "已完成" : "未完成（必须以受访者身份完整填写一次）"}
                                    </span>
                                </div>
                                {requiredMissingCount === 0 ? (
                                    <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                                        问卷结构完整，可进入下一阶段。
                                        {warningCount > 0 ? ` 另有 ${warningCount} 项建议优化。` : ""}
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                        仍有 {requiredMissingCount} 项必填检测未通过，需修复后才能继续。
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="h-fit">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">初步评分（机器评分）</CardTitle>
                                <CardDescription>供参考，满分100分</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-3">
                                <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 px-4 py-3">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xs uppercase tracking-wider text-primary">当前得分</span>
                                        <span className="text-2xl font-bold text-foreground">{preliminaryScore}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {preliminaryScore >= 90
                                            ? "问卷结构优秀"
                                            : preliminaryScore >= 75
                                                ? "问卷结构良好"
                                                : preliminaryScore >= 60
                                                    ? "可继续优化"
                                                    : "建议先完善基础项"}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    {scoreItems.map((item) => (
                                        <div key={item.label} className="flex items-baseline justify-between rounded-lg border border-border bg-card/70 px-3 py-2">
                                            <div className="min-w-0">
                                                <span className="text-sm text-foreground">{item.label}</span>
                                                <span
                                                    className={cn(
                                                        "ml-2 text-xs",
                                                        item.status === "pass"
                                                            ? "text-primary"
                                                            : item.status === "warning"
                                                                ? "text-muted-foreground"
                                                                : "text-destructive",
                                                    )}
                                                >
                                                    {item.message}
                                                </span>
                                            </div>
                                            <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">{item.points} 分</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="flex flex-col gap-8 pb-12" data-testid="student-stage-questionnaire">
            {/* Compact sub-step indicator */}
            <div className="flex items-center gap-2 px-1" data-testid="student-questionnaire-steps">
                {steps.map((s, idx) => {
                    const isCompleted = step > s.num;
                    const isCurrent = step === s.num;

                    return (
                        <div key={s.num} className="flex items-center gap-2">
                            {idx > 0 && (
                                <div className={cn("h-px w-6", isCompleted || isCurrent ? "bg-primary/40" : "bg-border")} />
                            )}
                            <button
                                onClick={() => {
                                    if (s.num <= step) {
                                        setStep(s.num as 1 | 2 | 3 | 4);
                                    }
                                }}
                                disabled={s.num > step}
                                data-testid={`student-questionnaire-step-${s.num}`}
                                aria-label={`第 ${s.num} 步: ${s.title}`}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 disabled:cursor-not-allowed",
                                    isCurrent
                                        ? "border border-primary/30 bg-primary/15 text-primary"
                                        : isCompleted
                                            ? "cursor-pointer text-primary hover:bg-primary/10"
                                            : "text-muted-foreground",
                                )}
                            >
                                {isCompleted ? (
                                    <CheckCircle className="size-3.5 shrink-0 text-primary" />
                                ) : (
                                    <span className={cn(
                                        "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                                        isCurrent
                                            ? "bg-primary text-primary-foreground"
                                            : "border border-border bg-muted text-muted-foreground",
                                    )}>
                                        {s.num}
                                    </span>
                                )}
                                <span className="hidden whitespace-nowrap sm:inline">{s.title}</span>
                            </button>
                        </div>
                    );
                })}
            </div>

            {renderStep()}

            <div className="flex flex-col gap-4">
                <Separator />
                <div className="flex items-center justify-between gap-3">
                    <Button
                        variant="outline"
                        onClick={() => step > 1 && setStep((step - 1) as 1 | 2 | 3 | 4)}
                        disabled={step === 1}
                        data-testid="student-questionnaire-prev"
                    >
                        上一步
                    </Button>
                    {step < 4 ? (
                    <Button
                        onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
                        disabled={!canAdvanceToNextStep}
                        data-testid="student-questionnaire-next"
                    >
                        下一步
                    </Button>
                    ) : (
                    <Button
                        onClick={() => setConfirmNextOpen(true)}
                        disabled={!canProceed}
                        data-testid="student-questionnaire-complete"
                    >
                        <CheckCircle data-icon="inline-start" />
                        确认完成，进入下一阶段
                    </Button>
                    )}
                </div>
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
                <AlertDialogContent data-testid="student-questionnaire-delete-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认删除</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除这道题目吗？此操作无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDelete} data-testid="student-questionnaire-delete-confirm">删除</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent data-testid="student-questionnaire-complete-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认完成问卷设计</AlertDialogTitle>
                        <AlertDialogDescription className="text-base leading-relaxed">
                            确认后问卷设计将被<strong className="text-primary">锁定</strong>。如需修改，您需要返回本阶段重新设计，届时后续阶段的数据将被<strong className="text-destructive">清空</strong>。
                            <br /><br />
                            确定继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmComplete} data-testid="student-questionnaire-complete-confirm">确认完成</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Immersive Questionnaire Preview Overlay */}
            {previewOpen && (
                <ImmersiveQuestionnairePreview
                    questionnaire={questionnaireData}
                    onComplete={handlePreviewComplete}
                    onClose={() => setPreviewOpen(false)}
                />
            )}
        </div>
    );
}

export default QuestionnaireDesign;

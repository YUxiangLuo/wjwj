import { DraftSaveStatus } from "../../components/DraftSaveStatus";
import { StageActions } from "../../components/StageActions";
import { PageHeader } from "@/components/PageHeader";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useControlledOverlayFocusRestore } from "@/components/ui/controlled-overlay-focus";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { Plus, GripVertical, Trash2, Edit2, CheckCircle, AlertCircle, Copy, ArrowUp, ArrowDown, BookOpen, HelpCircle, MessageSquare, List, Play, RotateCcw, Loader2, ArrowRight, ChevronDown } from "lucide-react";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { useExperiment } from "../ExperimentLayout";
import { QuestionEditor } from "@/components/questionnaire/QuestionEditor";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ImmersiveQuestionnairePreview } from "../../components/ImmersiveQuestionnairePreview";
import { tasksApi } from "../../api-client";
import type { Question, QuestionType, QuestionnaireData } from "@/lib/questionnaire-types";
import { calculateQuestionnaireScoreSummary, getInvalidOptionQuestionIndexes } from "./questionnaire-scoring";
import {
    readExperimentDraft,
    useExperimentDraft,
} from "../../experiment/experiment-draft";
import { QUESTIONNAIRE_TEMPLATES, QUESTION_SECTION_LABELS, type QuestionnaireTemplate } from "@/lib/questionnaire-templates";

const questionTypeLabels: Record<QuestionType, string> = {
    boolean: "是/否题",
    single: "单选题",
    multiple: "多选题",
    scale: "评分题",
};

const questionTypeColors: Record<QuestionType, string> = {
    boolean: "bg-primary-muted text-primary border-primary-border",
    single: "bg-info-muted text-info border-info-border",
    multiple: "bg-success-muted text-success border-success-border",
    scale: "bg-warning-muted text-warning border-warning-border",
};

interface QuestionnaireStepValidation {
    title: boolean;
    welcomeText: boolean;
    endingText: boolean;
    questionCount: boolean;
    optionCount: boolean;
    previewCompleted: boolean;
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
    const { experiment, completeStage } = useExperiment();

    const restoredDraft = useMemo(() => readExperimentDraft<{
        questionnaire: QuestionnaireData;
        step: 1 | 2 | 3 | 4;
        previewCompleted: boolean;
        previewContentHash: string;
    }>({
        experimentId: experiment?.id,
        experimentVersion: experiment?.version,
        stage: 1,
    }), [experiment?.id, experiment?.version]);

    // Prefer the version-matched browser draft, then fall back to server data.
    const initialData = restoredDraft?.questionnaire
        ?? experiment?.questionnaire as QuestionnaireData | null;

    const [step, setStep] = useState<1 | 2 | 3 | 4>(restoredDraft?.step ?? 1);
    const [title, setTitle] = useState(initialData?.title ?? "");
    const [welcomeText, setWelcomeText] = useState(initialData?.welcomeText ?? "");
    const [endingText, setEndingText] = useState(initialData?.endingText ?? "");
    const [questions, setQuestions] = useState<Question[]>(initialData?.questions ?? []);

    // Editor state
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question | undefined>();
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
    const [isCompleting, setIsCompleting] = useState(false);
    const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
    const [pendingTemplate, setPendingTemplate] = useState<QuestionnaireTemplate | null>(null);
    const [templateHintOpen, setTemplateHintOpen] = useState(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [recommendQuestions, setRecommendQuestions] = useState<Question[]>([]);
    const [recommendCollapsed, setRecommendCollapsed] = useState(false);

    // Immersive preview state
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewCompleted, setPreviewCompleted] = useState(restoredDraft?.previewCompleted ?? false);
    const [previewContentHash, setPreviewContentHash] = useState(restoredDraft?.previewContentHash ?? "");
    const previewTriggerRef = useRef<HTMLButtonElement>(null);
    useControlledOverlayFocusRestore(previewOpen, previewTriggerRef);

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
            q.id + q.type + (q.section ?? "main") + q.content
            + (q.options ?? []).join(";")
            + (q.minSelect ?? "") + (q.maxSelect ?? "")
            + (q.scaleMin ?? "") + (q.scaleMax ?? "")
            + (q.scaleMinLabel ?? "") + (q.scaleMaxLabel ?? "")
        ).join(",")}`,
        [title, welcomeText, endingText, questions],
    );
    const isPreviewValid = previewCompleted && previewContentHash === contentFingerprint;
    const questionnaireDraft = useMemo(() => ({
        questionnaire: questionnaireData,
        step,
        previewCompleted: isPreviewValid,
        previewContentHash: isPreviewValid ? previewContentHash : "",
    }), [isPreviewValid, previewContentHash, questionnaireData, step]);
    const clearDraft = useExperimentDraft({
        experimentId: experiment?.id,
        experimentVersion: experiment?.version,
        stage: 1,
        data: questionnaireDraft,
        enabled: Boolean(experiment),
    });
    const handlePreviewComplete = useCallback(() => {
        setPreviewCompleted(true);
        setPreviewContentHash(contentFingerprint);
        setPreviewOpen(false);
    }, [contentFingerprint]);

    const steps = [
        { num: 1, title: "问卷开场" },
        { num: 2, title: "设计题目" },
        { num: 3, title: "结束语" },
        { num: 4, title: "检查与试填" },
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

    const applyTemplate = (template: QuestionnaireTemplate) => {
        setTitle(template.questionnaire.title);
        setWelcomeText(template.questionnaire.welcomeText);
        setEndingText(template.questionnaire.endingText);
        setQuestions(template.questionnaire.questions.map((question) => ({ ...question, id: generateId() })));
        setPreviewCompleted(false);
        setPreviewContentHash("");
        setPendingTemplate(null);
        setTemplateHintOpen(true);
        toast.success(`已套用“${template.name}”问卷骨架，可继续修改`);
    };

    const requestTemplate = (template: QuestionnaireTemplate) => {
        setTemplatePickerOpen(false);
        const hasExistingContent = Boolean(title.trim() || welcomeTextLength > 0 || endingTextLength > 0 || questions.length > 0);
        if (hasExistingContent) setPendingTemplate(template);
        else applyTemplate(template);
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
    const stepHint = step === 1
        ? !validation.title ? "请填写 1–100 字的问卷标题。" : !validation.welcomeText ? "欢迎语需 20–1000 字，说明调查目的与填写方式。" : "开场已就绪，可以继续设计题目。"
        : step === 2 ? !validation.questionCount ? "本实验需要 5–50 道题，请先补齐题目。" : !validation.optionCount ? "部分题目的选项不完整，请先编辑修正。" : "题目已就绪，可以继续写结束语。"
            : step === 3 ? !validation.endingText ? "结束语需 20–1000 字，感谢受访者并说明调查结束。" : "结束语已就绪，接下来检查并试填。"
                : !basicValidationPassed ? "请先修正校验清单中的必填项，再开始试填。" : !isPreviewValid ? "请完整试填当前版本，检查题意和作答方式。" : "检查已完成，可以保存问卷并规划样本量。";

    const { scoreItems, structureScore } = useMemo(() => calculateQuestionnaireScoreSummary({
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
    const warningCount = scoreItems.filter((item) => item.status === "warning").length;

    const handleConfirmComplete = async () => {
        if (!canProceed || isCompleting) return;
        setIsCompleting(true);
        try {
            if (clearDraft.save(questionnaireDraft) === "conflict") return;
            const completed = await completeStage(1, { questionnaire: questionnaireData });
            if (completed) clearDraft.clear();
        } finally { setIsCompleting(false); }
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="flex flex-wrap items-start gap-5">
                        <Card className="min-w-0 flex-[3_1_36rem] rounded-surface border-border bg-card">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-foreground">
                                    <MessageSquare className="w-5 h-5 text-primary" />
                                    问卷开场
                                </CardTitle>
                                <CardDescription className="text-muted-foreground">设置问卷的标题和欢迎语，让受访者了解调查目的</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="title" className="text-foreground">问卷标题 *</Label>
                                    <Input
                                        id="title"
                                        placeholder="请输入问卷标题"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        maxLength={100}
                                        data-testid="student-questionnaire-title"
                                        className="bg-card border-input focus:border-ring"
                                    />
                                    <p className="text-meta text-muted-foreground text-right">{title.length}/100</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="welcome" className="text-foreground">欢迎语 *（至少20字）</Label>
                                    <RichTextEditor
                                        dataTestId="student-questionnaire-welcome"
                                        editorTestId="student-questionnaire-welcome-editor"
                                        id="welcome"
                                        ariaLabel="欢迎语"
                                        showWordCount={false}
                                        placeholder="请输入欢迎语，说明调查目的、预计用时等"
                                        value={welcomeText}
                                        onChange={setWelcomeText}
                                        editorClassName="min-h-[220px]"
                                    />
                                    <div className="flex justify-between text-meta">
                                        <span className={welcomeTextLength > 1000 ? "text-destructive" : welcomeTextLength < 20 ? "text-muted-foreground" : "text-success"}>
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
                        <Card className="min-w-0 flex-[1_1_18rem] h-fit rounded-surface border-border bg-card">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-body text-info">
                                    <HelpCircle className="w-4 h-4" />
                                    小贴士
                                </CardTitle>
                                <CardDescription className="text-info">让受访者知道为什么填写、如何作答。</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 text-label leading-relaxed text-info">
                                <p>建议说明调查目的、预计用时与隐私保护方式。</p>
                                <p>保持简洁友好，最好控制在 200 字以内。</p>
                                <div className="rounded-surface border border-info-border bg-background p-3 text-meta text-info ">
                                    <span className="font-semibold block mb-1">示例：</span>
                                    感谢参与本次调查，本问卷约 3 分钟完成，数据仅用于教学分析。
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );

            case 2:
                return (
                    <div className="flex flex-wrap items-start gap-5">
                        <div className="min-w-0 flex-[3_1_36rem] space-y-4">
                            <Card className="rounded-surface border-border bg-card ">
                                <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                                    <div>
                                        <CardTitle className="text-foreground flex items-center gap-2">
                                            <List className="w-5 h-5 text-primary" />
                                            题目列表
                                        </CardTitle>
                                        <CardDescription className="text-muted-foreground mt-1">
                                            已添加 {questions.length} 道题目（本实验要求：5-50题）
                                        </CardDescription>
                                    </div>
                                    <Button
                                        onClick={handleAddQuestion}
                                        disabled={questions.length >= 50}
                                        data-testid="student-questionnaire-add-question"
                                        className="bg-primary hover:bg-primary-hover text-primary-foreground"
                                    >
                                        <Plus className="w-4 h-4 mr-1" />
                                        添加题目
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-6" data-testid="student-questionnaire-list">
                                    {questions.length === 0 ? (
                                        <div className="text-center py-16 text-muted-foreground bg-background rounded-surface border border-dashed border-border">
                                            <p>暂无题目，点击「添加题目」开始设计问卷</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {questions.map((q, index) => (
                                                <div
                                                    key={q.id}
                                                    data-testid={`student-questionnaire-item-${q.id}`}
                                                    className={`flex flex-wrap items-start gap-3 p-4 rounded-surface border transition-none group hover:bg-muted ${dragOverId === q.id && draggingId !== q.id
                                                        ? "border-primary ring-1 ring-ring bg-primary-muted"
                                                        : "border-border bg-background"
                                                        } ${draggingId === q.id ? "opacity-50" : ""}`}
                                                    draggable
                                                    onDragStart={handleDragStart(q.id)}
                                                    onDragOver={handleDragOver(q.id)}
                                                    onDragLeave={handleDragLeave(q.id)}
                                                    onDrop={handleDrop(q.id)}
                                                    onDragEnd={handleDragEnd}
                                                >
                                                    <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-label="拖动可调整题目顺序"/>
                                                    <span className="mt-0.5 w-8 shrink-0 text-label font-semibold text-muted-foreground">Q{index + 1}</span>
                                                    <div className="min-w-0 flex-[1_1_24rem] space-y-2">
                                                        <button type="button" onClick={() => handleEditQuestion(q)} className="w-full break-words text-left text-body font-semibold text-foreground hover:text-primary">{q.content}</button>
                                                        <div className="flex flex-wrap gap-2">
                                                            <Badge variant="outline" className={`${questionTypeColors[q.type]} px-2 py-0.5 text-meta whitespace-nowrap`}>
                                                                {questionTypeLabels[q.type]}
                                                            </Badge>
                                                            <Badge variant="outline" className="whitespace-nowrap border-border bg-card px-2 py-0.5 text-meta text-muted-foreground">
                                                                {QUESTION_SECTION_LABELS[q.section ?? "main"]}
                                                            </Badge>
                                                        </div>
                                                        {q.options && q.options.length > 0 && <p className="text-meta leading-relaxed text-muted-foreground">选项：{q.options.join("；")}</p>}
                                                    </div>
                                                    <div className="ml-auto flex shrink-0 flex-wrap gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`上移第 ${index + 1} 题`}
                                                            data-testid={`student-questionnaire-move-up-${q.id}`}
                                                            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                            onClick={() => moveQuestion(index, "up")}
                                                            disabled={index === 0}
                                                        >
                                                            <ArrowUp className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`下移第 ${index + 1} 题`}
                                                            data-testid={`student-questionnaire-move-down-${q.id}`}
                                                            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                            onClick={() => moveQuestion(index, "down")}
                                                            disabled={index === questions.length - 1}
                                                        >
                                                            <ArrowDown className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`复制第 ${index + 1} 题`}
                                                            data-testid={`student-questionnaire-duplicate-${q.id}`}
                                                            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                            onClick={() => handleDuplicateQuestion(q)}
                                                            disabled={questions.length >= 50}
                                                        >
                                                            <Copy className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`编辑第 ${index + 1} 题`}
                                                            data-testid={`student-questionnaire-edit-${q.id}`}
                                                            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                            onClick={() => handleEditQuestion(q)}
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`删除第 ${index + 1} 题`}
                                                            data-testid={`student-questionnaire-delete-${q.id}`}
                                                            className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive-muted"
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
                                <div className="p-3 bg-warning-muted text-warning border border-warning-border rounded-surface text-label flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    按本实验要求，还需添加 {5 - questions.length} 道题目才能继续
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-[1_1_18rem] space-y-4">
                            <Card className="rounded-surface border-border bg-card ">
                                <CardHeader
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={!recommendCollapsed}
                                    aria-controls="student-recommended-question-list"
                                    className="cursor-pointer select-none"
                                    onClick={() => setRecommendCollapsed(!recommendCollapsed)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            setRecommendCollapsed(!recommendCollapsed);
                                        }
                                    }}
                                >
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-body text-foreground">推荐题目</CardTitle>
                                        <ChevronDown className={`h-4 w-4 text-muted-foreground ${recommendCollapsed ? "" : "rotate-180"}`}/>
                                    </div>
                                    <CardDescription className="text-muted-foreground">可直接引用教师提供的推荐题目</CardDescription>
                                </CardHeader>
                                {!recommendCollapsed && (
                                    <CardContent
                                        id="student-recommended-question-list"
                                        role="region"
                                        tabIndex={0}
                                        aria-label="教师推荐题目列表"
                                        className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar"
                                    >
                                        {recommendQuestions.length === 0 && (
                                            <div className="rounded-surface border border-dashed border-input bg-card p-4 text-label text-muted-foreground text-center">
                                                暂无推荐题目
                                            </div>
                                        )}
                                        {recommendQuestions.map((rq) => {
                                            const recommendAlreadyInQuestionnaire = questions.some((q) => q.recommendSourceId === rq.id);
                                            return (
                                            <div key={rq.id} className="flex flex-col gap-2 p-3 rounded-surface border border-border bg-background">
                                                <div className="space-y-1">
                                                    <div className="text-label font-medium text-foreground line-clamp-2">{rq.content}</div>
                                                    <div className="text-meta text-muted-foreground">
                                                        类型：{questionTypeLabels[rq.type]}
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={recommendAlreadyInQuestionnaire || questions.length >= 50}
                                                    className="w-full mt-1 border-input text-foreground hover:bg-muted hover:text-foreground disabled:bg-muted disabled:text-muted-foreground disabled:border-border"
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
                            <Card className="rounded-surface border-border bg-card ">
                                <CardHeader>
                                    <CardTitle className="text-body text-foreground">设计建议</CardTitle>
                                </CardHeader>
                                <CardContent className="text-label text-muted-foreground space-y-2">
                                    <p>• 每题只询问一个明确概念，并说明必要的时间范围。</p>
                                    <p>• 使用目标人群能理解的简短、中性措辞，避免诱导。</p>
                                    <p>• 封闭题选项应尽量互斥、穷尽并按逻辑排序。</p>
                                    <p>• 题型和题量应由测量目标决定；提交前请完成一次受访者视角试填。预试答案不进入抽样或分析。</p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                );

            case 3:
                return (
                    <div className="min-w-0">
                        <Card className="w-full rounded-surface border-border bg-card ">
                            <CardHeader>
                                <CardTitle className="text-foreground">结束语设置</CardTitle>
                                <CardDescription className="text-muted-foreground">设置问卷的结束语，感谢受访者参与</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="ending" className="text-foreground">结束语 *（至少20字）</Label>
                                    <RichTextEditor
                                        dataTestId="student-questionnaire-ending"
                                        editorTestId="student-questionnaire-ending-editor"
                                        id="ending"
                                        ariaLabel="结束语"
                                        showWordCount={false}
                                        placeholder="请输入结束语，如致谢词等"
                                        value={endingText}
                                        onChange={setEndingText}
                                        editorClassName="min-h-[220px]"
                                    />
                                    <div className="flex justify-between text-meta">
                                        <span className={endingTextLength > 1000 ? "text-destructive" : endingTextLength < 20 ? "text-muted-foreground" : "text-success"}>
                                            {endingTextLength > 1000
                                                ? `已超出 ${endingTextLength - 1000} 字`
                                                : endingTextLength < 20
                                                    ? `还需 ${20 - endingTextLength} 字`
                                                    : "✓ 符合要求"}
                                        </span>
                                        <span className="text-muted-foreground">{endingTextLength}/1000</span>
                                    </div>
                                </div>
                                <div className="rounded-surface bg-primary-muted border border-primary-border p-3 text-meta text-primary flex items-start gap-2">
                                    <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    提示：感谢语中可以提示下一步操作或后续联系信息。
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );

            case 4:
                return (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-4">
                        <Card className="rounded-surface border-border bg-card overflow-hidden h-fit">
                            {isPreviewValid ? (
                                <CardContent className="py-5">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-surface bg-success-muted border border-success-border flex items-center justify-center shrink-0">
                                                <CheckCircle className="w-5 h-5 text-success" />
                                            </div>
                                            <div>
                                                <h3 className="text-body font-semibold text-success">受访者视角试填已完成</h3>
                                                <p className="text-label text-muted-foreground">已完成交互自检；这不代表已验证题意、信度或效度。正式认知预试还需邀请目标人群代表，记录理解偏差与修订依据。</p>
                                            </div>
                                        </div>
                                        <Button
                                            ref={previewTriggerRef}
                                            variant="outline"
                                            onClick={() => setPreviewOpen(true)}
                                            data-testid="student-questionnaire-redo-preview"
                                            className="border-input text-foreground hover:bg-muted hover:text-foreground shrink-0"
                                        >
                                            <RotateCcw className="w-4 h-4 mr-2" />
                                            重新预试
                                        </Button>
                                    </div>
                                </CardContent>
                            ) : (
                                <div>
                                    <div className="border-b border-primary-border bg-primary-muted px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-surface bg-primary-muted flex items-center justify-center">
                                                <Play className="w-5 h-5 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="text-body font-semibold text-primary">受访者视角试填</h3>
                                                <p className="text-meta text-primary mt-0.5">请以受访者身份完整体验一次问卷填写</p>
                                            </div>
                                        </div>
                                    </div>
                                    <CardContent className="py-5">
                                        <div className="flex flex-col items-start gap-4">
                                            <p className="text-label text-muted-foreground leading-relaxed">
                                                在进入下一阶段之前，您需要以受访者的视角完整填写一次自己设计的问卷。
                                                这将帮助您发现问卷中可能存在的问题，提升问卷质量。
                                            </p>
                                            <Button
                                                ref={previewTriggerRef}
                                                onClick={() => setPreviewOpen(true)}
                                                disabled={!basicValidationPassed}
                                                size="lg"
                                                data-testid="student-questionnaire-start-preview"
                                                className="bg-primary px-8 text-primary-foreground hover:bg-primary-hover"
                                            >
                                                <Play className="w-5 h-5 mr-2" />
                                                开始受访者视角试填
                                            </Button>
                                            {!basicValidationPassed && (
                                                <p className="text-meta text-warning">请先完成校验清单中的必填项</p>
                                            )}
                                        </div>
                                    </CardContent>
                                </div>
                            )}
                        </Card>

                        <Card className="rounded-surface border-border bg-card h-fit">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-label text-foreground">校验清单</CardTitle>
                                <CardDescription className="text-muted-foreground">确认问卷信息完善后再进入下一阶段</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-1.5">
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-surface border ${validation.title ? "bg-success-muted border-success-border" : "bg-destructive-muted border-destructive-border"}`}>
                                    {validation.title ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-label ${validation.title ? "text-success" : "text-destructive"}`}>
                                        问卷标题：{title ? "已填写" : "未填写"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-surface border ${validation.welcomeText ? "bg-success-muted border-success-border" : "bg-destructive-muted border-destructive-border"}`}>
                                    {validation.welcomeText ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-label ${validation.welcomeText ? "text-success" : "text-destructive"}`}>
                                        欢迎语：{welcomeTextLength} 字 {validation.welcomeText ? "" : "(20-1000字)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-surface border ${validation.questionCount ? "bg-success-muted border-success-border" : "bg-destructive-muted border-destructive-border"}`}>
                                    {validation.questionCount ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-label ${validation.questionCount ? "text-success" : "text-destructive"}`}>
                                        题目数量：{questions.length} 道 {validation.questionCount ? "" : "(本实验要求5-50道)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-surface border ${validation.optionCount ? "bg-success-muted border-success-border" : "bg-destructive-muted border-destructive-border"}`}>
                                    {validation.optionCount ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-label ${validation.optionCount ? "text-success" : "text-destructive"}`}>
                                        选项数量：{validation.optionCount ? "配置有效" : `Q${invalidOptionQuestions.slice(0, 5).join("、")} 需检查`}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-surface border ${validation.endingText ? "bg-success-muted border-success-border" : "bg-destructive-muted border-destructive-border"}`}>
                                    {validation.endingText ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-label ${validation.endingText ? "text-success" : "text-destructive"}`}>
                                        结束语：{endingTextLength} 字 {validation.endingText ? "" : "(20-1000字)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-surface border ${validation.previewCompleted ? "bg-success-muted border-success-border" : "bg-destructive-muted border-destructive-border"}`}>
                                    {validation.previewCompleted ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-label ${validation.previewCompleted ? "text-success" : "text-destructive"}`}>
                                        受访者视角试填：{validation.previewCompleted ? "已完成" : "未完成（必须以受访者身份完整填写一次；答案不进入估计）"}
                                    </span>
                                </div>
                                {requiredMissingCount === 0 ? (
                                    <div className="rounded-surface border border-success-border bg-success-muted px-3 py-2 text-label text-success">
                                        问卷结构完整，可进入下一阶段。
                                        {warningCount > 0 ? ` 另有 ${warningCount} 项建议优化。` : ""}
                                    </div>
                                ) : (
                                    <div className="rounded-surface border border-destructive-border bg-destructive-muted px-3 py-2 text-label text-destructive" data-testid="student-questionnaire-blocking-summary">
                                        仍有 {requiredMissingCount} 项必填检测未通过，需修复后才能继续。
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        </div>

                        <Card className="rounded-surface border-border bg-card h-fit">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-label text-foreground">结构完整度检查</CardTitle>
                                <CardDescription className="text-muted-foreground">仅检查可机械验证的格式，满分100分</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="rounded-surface border border-primary-border bg-primary-muted px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-meta uppercase tracking-wider text-primary">结构完整度</span>
                                        <span className="text-page-title font-bold text-primary">{structureScore}</span>
                                    </div>
                                    <div className="text-meta text-primary">
                                        {structureScore === 100
                                            ? "自动格式检查通过"
                                            : structureScore >= 70
                                                ? "仍有格式项待完善"
                                                : "请先完善基础结构"}
                                    </div>
                                </div>
                                <p className="rounded-surface border border-info-border bg-info-muted px-3 py-2 text-meta leading-relaxed text-info">
                                    100分不代表问卷具有良好效度、信度或无偏措辞。单一概念、题序、选项互斥与穷尽等仍需人工复核和预测试。
                                </p>
                                <div className="space-y-1.5">
                                    {scoreItems.map((item) => (
                                        <div key={item.label} className="flex items-baseline justify-between rounded-surface border border-border bg-background px-3 py-2">
                                            <div className="min-w-0">
                                                <span className="text-label text-foreground">{item.label}</span>
                                                <span
                                                    className={`text-meta ml-2 ${item.status === "pass"
                                                        ? "text-success"
                                                        : item.status === "warning"
                                                            ? "text-warning"
                                                            : "text-destructive"
                                                        }`}
                                                >
                                                    {item.message}
                                                </span>
                                            </div>
                                            <span className="text-meta font-mono text-muted-foreground shrink-0 ml-2">{item.points} 分</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );
        }
    };

    const templateResearchQuestion = experiment?.studyContract?.contract.researchQuestion?.trim() ?? "";

    return (
        <div className="min-w-0 space-y-5" data-testid="student-stage-questionnaire">
            <PageHeader border={false} className="flex-wrap">
                <nav aria-label="问卷设计步骤" data-testid="student-questionnaire-steps" className="flex flex-wrap gap-2">
                    {steps.map(s => {
                        const isCurrent = step === s.num;
                        const isCompleted = canAdvanceQuestionnaireStep(s.num as 1 | 2 | 3 | 4, validation);
                        return <button key={s.num} type="button" onClick={() => setStep(s.num as 1 | 2 | 3 | 4)}
                            data-testid={`student-questionnaire-step-${s.num}`} aria-current={isCurrent ? "step" : undefined} aria-label={`第 ${s.num} 步: ${s.title}`}
                            className={`flex min-h-11 items-center gap-2 rounded-control border px-3 text-label font-medium ${isCurrent ? "border-primary-border bg-primary-muted text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                            {isCompleted ? <CheckCircle className="h-4 w-4 text-success"/> : <span className="tabular-nums">{s.num}</span>}{s.title}
                        </button>;
                    })}
                </nav>
                <Button type="button" variant="outline" onClick={() => setTemplatePickerOpen(true)}><BookOpen className="mr-2 h-4 w-4"/>使用问卷模板</Button>
            </PageHeader>

            {templateHintOpen && (
                <div role="status" className="flex flex-wrap items-start justify-between gap-3 rounded-surface border border-info-border bg-info-muted p-3 text-label text-info" data-testid="student-questionnaire-template-hint">
                    <p>{templateResearchQuestion
                        ? `已套用通用骨架。「目标行为」「类别一」等是占位措辞，请改成研究目标中的具体对象：${templateResearchQuestion}`
                        : "已套用通用骨架。「目标行为」「类别一」等是占位措辞，请对照页面上方的研究目标修改。"}</p>
                    <Button type="button" variant="ghost" size="sm" className="shrink-0 text-info hover:bg-info-muted hover:text-info" onClick={() => setTemplateHintOpen(false)}>知道了</Button>
                </div>
            )}

            {renderStep()}

            <StageActions>
                <div className="min-w-0 space-y-2">
                    <DraftSaveStatus status={clearDraft.status} onRetry={clearDraft.retry}/>
                    <p className="text-meta text-muted-foreground" role="status">{stepHint}</p>
                </div>
                <div className="flex items-center gap-3">
                    {step > 1 && <Button type="button" variant="outline" onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4)} disabled={isCompleting} data-testid="student-questionnaire-prev">上一步</Button>}
                    {step < 4 ? <Button onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)} disabled={!canAdvanceToNextStep} data-testid="student-questionnaire-next">继续：{steps[step]?.title}<ArrowRight className="ml-2 h-4 w-4"/></Button>
                        : <Button onClick={() => void handleConfirmComplete()} disabled={!canProceed || isCompleting || clearDraft.status === "conflict"} data-testid="student-questionnaire-complete">
                            {isCompleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-2 h-4 w-4"/>}保存并规划样本量
                        </Button>}
                </div>
            </StageActions>

            <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
                <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto" data-testid="student-questionnaire-templates">
                    <DialogHeader><DialogTitle>选择一个问卷起点</DialogTitle><DialogDescription>模板提供开场、甄别题、主体题、背景资料和结束语。请按你的研究目标修改，套用模板不等于完成设计。</DialogDescription></DialogHeader>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
                        {QUESTIONNAIRE_TEMPLATES.map(template => <section key={template.id} className="flex flex-col rounded-surface border border-border bg-card p-4">
                            <h3 className="text-subheading font-semibold">{template.name}</h3><p className="my-3 flex-1 text-label leading-relaxed text-muted-foreground">{template.description}</p>
                            <Button type="button" variant="outline" onClick={() => requestTemplate(template)}>使用此模板</Button>
                        </section>)}
                    </div>
                    <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                        <Button asChild variant="outline"><a href="/templates/调查问卷设计规范与模板.pdf" target="_blank" rel="noreferrer">查看设计规范</a></Button>
                        <Button asChild variant="outline"><a href="/templates/调查问卷设计规范与模板.docx" download>下载 DOCX 模板</a></Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Question Editor Dialog */}
            <QuestionEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                question={editingQuestion}
                onSave={handleSaveQuestion}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogContent className="bg-card border-border text-foreground" data-testid="student-questionnaire-delete-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">确认删除</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            确定要删除这道题目吗？此操作无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} data-testid="student-questionnaire-delete-confirm" variant="destructive">删除</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={pendingTemplate !== null} onOpenChange={(open) => !open && setPendingTemplate(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>替换当前问卷内容？</AlertDialogTitle>
                        <AlertDialogDescription>套用“{pendingTemplate?.name ?? ""}”会替换当前标题、欢迎语、全部题目和结束语。此操作不能自动合并现有内容。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => pendingTemplate && applyTemplate(pendingTemplate)}>确认替换</AlertDialogAction></AlertDialogFooter>
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

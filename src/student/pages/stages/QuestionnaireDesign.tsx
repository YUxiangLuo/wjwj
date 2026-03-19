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
import { Plus, GripVertical, Trash2, Edit2, CheckCircle, AlertCircle, Copy, ArrowUp, ArrowDown, HelpCircle, MessageSquare, List, Play, RotateCcw } from "lucide-react";
import { RichTextContent } from "@/components/RichTextContent";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { useExperiment } from "../ExperimentLayout";
import { QuestionEditor } from "../../components/QuestionEditor";
import { RichTextEditor } from "../../components/RichTextEditor";
import { ImmersiveQuestionnairePreview } from "../../components/ImmersiveQuestionnairePreview";
import { useDraftSync } from "../../draft-sync";
import { experimentApi, tasksApi, type Question, type QuestionType, type QuestionnaireData, type RecommendQuestion } from "../../api-client";

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
    boolean: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    single: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    multiple: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    scale: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

type ScoreStatus = "pass" | "warning" | "fail";

interface ScoreItem {
    label: string;
    points: number;
    status: ScoreStatus;
    message: string;
}

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

export function QuestionnaireDesign({ onNext }: QuestionnaireDesignProps) {
    const { experiment, saveExperiment, setStageUnsavedChanges } = useExperiment();

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
    const [recommendQuestions, setRecommendQuestions] = useState<RecommendQuestion[]>([]);
    const [recommendCollapsed, setRecommendCollapsed] = useState(false);

    // Immersive preview state
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewCompleted, setPreviewCompleted] = useState(false);
    const [previewContentHash, setPreviewContentHash] = useState("");
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

    const normalizeQuestionnaireData = useCallback((raw: unknown): QuestionnaireData => {
        const data = raw && typeof raw === "object" ? (raw as Partial<QuestionnaireData>) : {};
        return {
            title: data.title ?? "",
            welcomeText: data.welcomeText ?? "",
            endingText: data.endingText ?? "",
            questions: Array.isArray(data.questions) ? data.questions : [],
        };
    }, []);

    const applyQuestionnaireData = useCallback((data: QuestionnaireData) => {
        setTitle(data.title ?? "");
        setWelcomeText(data.welcomeText ?? "");
        setEndingText(data.endingText ?? "");
        setQuestions(Array.isArray(data.questions) ? data.questions : []);
    }, []);

    const serverQuestionnaire = useMemo(
        () => normalizeQuestionnaireData(initialData),
        [initialData, normalizeQuestionnaireData]
    );

    const parseQuestionnaireDraft = useCallback((raw: string) => {
        try {
            return normalizeQuestionnaireData(JSON.parse(raw) as QuestionnaireData);
        } catch {
            return null;
        }
    }, [normalizeQuestionnaireData]);
    const isMeaningfulQuestionnaireDraft = useCallback(
        (draft: QuestionnaireData) => Boolean(draft.title || draft.questions.length > 0),
        []
    );
    const serializeQuestionnaire = useCallback((value: QuestionnaireData) => JSON.stringify(value), []);

    const saveQuestionnaire = useCallback(async (nextData: QuestionnaireData) => {
        return saveExperiment({ questionnaire: nextData });
    }, [saveExperiment]);

    const loadLatestQuestionnaire = useCallback(async () => {
        if (!experiment?.taskId) return null;
        const res = await experimentApi.get(experiment.taskId);
        if (!res.success || !res.data) return null;
        return normalizeQuestionnaireData(res.data.questionnaire);
    }, [experiment?.taskId, normalizeQuestionnaireData]);

    const {
        clearLocalDraft,
        discardPendingDraft,
        handleRestoreDraftOpenChange,
        handleSyncConflictOpenChange,
        hasUnsavedLocalChanges,
        isOnline,
        keepLocalDraft,
        keepServerDraft,
        networkNotice,
        restoreDraftOpen,
        restorePendingDraft,
        saveNow,
        syncConflictOpen,
    } = useDraftSync<QuestionnaireData>({
        applyValue: applyQuestionnaireData,
        currentValue: questionnaireData,
        draftKey,
        initialServerValue: serverQuestionnaire,
        isMeaningfulDraft: isMeaningfulQuestionnaireDraft,
        loadServerLatest: loadLatestQuestionnaire,
        parseDraft: parseQuestionnaireDraft,
        saveToServer: saveQuestionnaire,
        serialize: serializeQuestionnaire,
    });

    useEffect(() => {
        setStageUnsavedChanges(1, hasUnsavedLocalChanges);
        return () => {
            setStageUnsavedChanges(1, false);
        };
    }, [hasUnsavedLocalChanges, setStageUnsavedChanges]);

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

    const invalidOptionQuestions = useMemo(() => {
        const invalidIndexes: number[] = [];

        questions.forEach((question, index) => {
            if (question.type !== "single" && question.type !== "multiple") {
                return;
            }

            const options = (question.options ?? [])
                .map((option) => String(option ?? "").trim())
                .filter((option) => option.length > 0);

            if (options.length < 2) {
                invalidIndexes.push(index + 1);
                return;
            }

            if (question.type === "multiple") {
                const minSelect = question.minSelect ?? 1;
                const maxSelect = question.maxSelect ?? options.length;
                if (minSelect < 1 || maxSelect < minSelect || maxSelect > options.length) {
                    invalidIndexes.push(index + 1);
                }
            }
        });

        return invalidIndexes;
    }, [questions]);

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

    const scoreItems = useMemo<ScoreItem[]>(() => {
        const items: ScoreItem[] = [];

        // 1. Title completeness (10 points)
        items.push({
            label: "标题完整性",
            points: validation.title ? 10 : 0,
            status: validation.title ? "pass" : "fail",
            message: validation.title ? "标题长度符合要求" : "标题需为1-100字",
        });

        // 2. Welcome text quality (10 points, progressive)
        const welcomeScore = !validation.welcomeText ? 0 : welcomeTextLength >= 150 ? 10 : welcomeTextLength >= 80 ? 8 : 6;
        items.push({
            label: "欢迎语质量",
            points: welcomeScore,
            status: !validation.welcomeText ? "fail" : welcomeTextLength >= 80 ? "pass" : "warning",
            message: !validation.welcomeText ? "欢迎语需在20-1000字之间" : welcomeTextLength >= 150 ? "欢迎语详细完整" : welcomeTextLength >= 80 ? "欢迎语内容较好" : "建议丰富欢迎语内容（≥80字更佳）",
        });

        // 3. Ending text quality (10 points, progressive)
        const endingScore = !validation.endingText ? 0 : endingTextLength >= 150 ? 10 : endingTextLength >= 80 ? 8 : 6;
        items.push({
            label: "结束语质量",
            points: endingScore,
            status: !validation.endingText ? "fail" : endingTextLength >= 80 ? "pass" : "warning",
            message: !validation.endingText ? "结束语需在20-1000字之间" : endingTextLength >= 150 ? "结束语详细完整" : endingTextLength >= 80 ? "结束语内容较好" : "建议丰富结束语内容（≥80字更佳）",
        });

        // 4. Question count (15 points, progressive)
        const qCount = questions.length;
        const countScore = !validation.questionCount ? 0 : qCount >= 15 ? 15 : qCount >= 10 ? 12 : 8;
        items.push({
            label: "题目数量",
            points: countScore,
            status: !validation.questionCount ? "fail" : qCount >= 10 ? "pass" : "warning",
            message: !validation.questionCount ? "题目数量需在5-50题" : qCount >= 15 ? "题目数量丰富" : qCount >= 10 ? "题目数量良好" : "建议增加至10题以上",
        });

        // 5. Option configuration (10 points)
        items.push({
            label: "选项配置",
            points: validation.optionCount ? 10 : 0,
            status: validation.optionCount ? "pass" : "fail",
            message: validation.optionCount
                ? "单选/多选题选项配置有效"
                : `Q${invalidOptionQuestions.slice(0, 5).join("、")} 配置无效`,
        });

        // 6. Type diversity (15 points, based on number of types used)
        const usedTypes = new Set(questions.map((q) => q.type));
        const typeCount = usedTypes.size;
        const typeScore = !validation.questionCount ? 0 : typeCount >= 4 ? 15 : typeCount >= 3 ? 12 : typeCount >= 2 ? 8 : 4;
        items.push({
            label: "题型多样性",
            points: typeScore,
            status: !validation.questionCount ? "fail" : typeCount >= 3 ? "pass" : "warning",
            message: !validation.questionCount
                ? "请先满足题目数量要求"
                : typeCount >= 4 ? "使用了全部4种题型" : typeCount >= 3 ? `使用了${typeCount}种题型` : "建议至少使用3种题型（含量表题）",
        });

        // 7. Scale question usage (10 points) - Customer feedback: encourage Likert scale questions
        const scaleQuestions = questions.filter((q) => q.type === "scale");
        const hasScaleQ = scaleQuestions.length > 0;
        const scaleScore = !validation.questionCount ? 0 : scaleQuestions.length >= 2 ? 10 : hasScaleQ ? 7 : 0;
        items.push({
            label: "量表题使用",
            points: scaleScore,
            status: !validation.questionCount ? "fail" : scaleQuestions.length >= 2 ? "pass" : hasScaleQ ? "warning" : "fail",
            message: !validation.questionCount
                ? "请先满足题目数量要求"
                : scaleQuestions.length >= 2 ? `已包含${scaleQuestions.length}道量表题` : hasScaleQ ? "建议包含至少2道量表题" : "建议添加量表题（如 Likert 量表）",
        });

        // 8. Question content quality (10 points) - check average content length
        const avgContentLen = questions.length > 0 ? questions.reduce((sum, q) => sum + q.content.trim().length, 0) / questions.length : 0;
        const contentScore = !validation.questionCount ? 0 : avgContentLen >= 20 ? 10 : avgContentLen >= 10 ? 7 : 4;
        items.push({
            label: "题目表述质量",
            points: contentScore,
            status: !validation.questionCount ? "fail" : avgContentLen >= 20 ? "pass" : "warning",
            message: !validation.questionCount
                ? "请先满足题目数量要求"
                : avgContentLen >= 20 ? "题目表述清晰完整" : avgContentLen >= 10 ? "建议完善题目描述" : "题目表述过于简短",
        });

        // 9. Option richness for choice questions (10 points) - average options per choice question
        const choiceQuestions = questions.filter((q) => q.type === "single" || q.type === "multiple");
        const avgOptions = choiceQuestions.length > 0 ? choiceQuestions.reduce((sum, q) => sum + (q.options?.length ?? 0), 0) / choiceQuestions.length : 0;

        let optionRichnessScore: number;
        if (!validation.questionCount) {
            optionRichnessScore = 0;
        } else if (choiceQuestions.length === 0) {
            optionRichnessScore = 10; // full points when all questions are boolean/scale
        } else if (avgOptions >= 4) {
            optionRichnessScore = 10;
        } else if (avgOptions >= 3) {
            optionRichnessScore = 7;
        } else {
            optionRichnessScore = 5;
        }
        items.push({
            label: "选项丰富度",
            points: optionRichnessScore,
            status: !validation.questionCount ? "fail" : avgOptions >= 4 || choiceQuestions.length === 0 ? "pass" : "warning",
            message: !validation.questionCount
                ? "请先满足题目数量要求"
                : choiceQuestions.length === 0 ? "无选择类题目" : avgOptions >= 4 ? "选项设置丰富" : "建议每题设置4个以上选项",
        });

        return items;
    }, [
        invalidOptionQuestions,
        questions,
        validation.title,
        validation.welcomeText,
        validation.endingText,
        validation.questionCount,
        validation.optionCount,
        welcomeTextLength,
        endingTextLength,
    ]);

    const preliminaryScore = useMemo(() => {
        const total = scoreItems.reduce((sum, item) => sum + item.points, 0);
        return Math.max(0, Math.min(100, Math.round(total)));
    }, [scoreItems]);

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
        const success = await saveExperiment({
            questionnaire: questionnaireData,
            currentStage: 2,
        });
        if (success) {
            clearLocalDraft();
        }
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <Card className="lg:col-span-2 rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                                    <MessageSquare className="w-5 h-5 text-indigo-500" />
                                    欢迎语设置
                                </CardTitle>
                                <CardDescription className="text-slate-600 dark:text-slate-400">设置问卷的标题和欢迎语，让受访者了解调查目的</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="title" className="text-slate-700 dark:text-slate-300">问卷标题 *</Label>
                                    <Input
                                        id="title"
                                        placeholder="请输入问卷标题"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        maxLength={100}
                                        data-testid="student-questionnaire-title"
                                        className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 focus:border-indigo-500"
                                    />
                                    <p className="text-xs text-slate-500 text-right">{title.length}/100</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="welcome" className="text-slate-700 dark:text-slate-300">欢迎语 *（至少20字）</Label>
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
                                        <span className={welcomeTextLength < 20 || welcomeTextLength > 1000 ? "text-rose-600" : "text-emerald-600"}>
                                            {welcomeTextLength > 1000
                                                ? `已超出 ${welcomeTextLength - 1000} 字`
                                                : welcomeTextLength < 20
                                                    ? `还需 ${20 - welcomeTextLength} 字`
                                                    : "✓ 符合要求"}
                                        </span>
                                        <span className="text-slate-500">{welcomeTextLength}/1000</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="h-fit rounded-2xl border-sky-200 bg-sky-50/80 shadow-sm dark:border-sky-500/20 dark:bg-sky-500/10">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base text-sky-900 dark:text-sky-200">
                                    <HelpCircle className="w-4 h-4" />
                                    小贴士
                                </CardTitle>
                                <CardDescription className="text-sky-700 dark:text-sky-300">好的欢迎语能提高数据质量。</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm leading-relaxed text-sky-950/80 dark:text-sky-100/80">
                                <p>建议说明调查目的、预计用时与隐私保护方式。</p>
                                <p>保持简洁友好，最好控制在 200 字以内。</p>
                                <div className="rounded-xl border border-sky-200 bg-white/80 p-3 text-xs text-sky-800 shadow-sm dark:border-sky-400/20 dark:bg-sky-950/40 dark:text-sky-200">
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
                            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                                <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                                    <div>
                                        <CardTitle className="text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                            <List className="w-5 h-5 text-indigo-500" />
                                            题目列表
                                        </CardTitle>
                                        <CardDescription className="text-slate-600 dark:text-slate-400 mt-1">
                                            已添加 {questions.length} 道题目（最少5题，最多50题）
                                        </CardDescription>
                                    </div>
                                    <Button
                                        onClick={handleAddQuestion}
                                        disabled={questions.length >= 50}
                                        data-testid="student-questionnaire-add-question"
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                                    >
                                        <Plus className="w-4 h-4 mr-1" />
                                        添加题目
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-6" data-testid="student-questionnaire-list">
                                    {questions.length === 0 ? (
                                        <div className="text-center py-16 text-slate-500 bg-white/30 dark:bg-slate-950/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                            <p>暂无题目，点击「添加题目」开始设计问卷</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {questions.map((q, index) => (
                                                <div
                                                    key={q.id}
                                                    data-testid={`student-questionnaire-item-${q.id}`}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all group hover:bg-slate-200 dark:hover:bg-slate-800 ${dragOverId === q.id && draggingId !== q.id
                                                        ? "border-indigo-500 ring-1 ring-indigo-500/50 bg-indigo-500/10"
                                                        : "border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50"
                                                        } ${draggingId === q.id ? "opacity-50" : ""}`}
                                                    draggable
                                                    onDragStart={handleDragStart(q.id)}
                                                    onDragOver={handleDragOver(q.id)}
                                                    onDragLeave={handleDragLeave(q.id)}
                                                    onDrop={handleDrop(q.id)}
                                                    onDragEnd={handleDragEnd}
                                                >
                                                    <GripVertical className="w-4 h-4 text-slate-500 cursor-grab hover:text-slate-600 dark:hover:text-slate-400" />
                                                    <span className="text-sm font-bold text-slate-600 dark:text-slate-400 w-8">Q{index + 1}</span>
                                                    <Badge variant="outline" className={`${questionTypeColors[q.type]} px-2 py-0.5 text-xs whitespace-nowrap`}>
                                                        {questionTypeLabels[q.type]}
                                                    </Badge>
                                                    <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate font-medium">{q.content}</span>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            data-testid={`student-questionnaire-move-up-${q.id}`}
                                                            className="h-8 w-8 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700"
                                                            onClick={() => moveQuestion(index, "up")}
                                                            disabled={index === 0}
                                                        >
                                                            <ArrowUp className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            data-testid={`student-questionnaire-move-down-${q.id}`}
                                                            className="h-8 w-8 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700"
                                                            onClick={() => moveQuestion(index, "down")}
                                                            disabled={index === questions.length - 1}
                                                        >
                                                            <ArrowDown className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            data-testid={`student-questionnaire-duplicate-${q.id}`}
                                                            className="h-8 w-8 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700"
                                                            onClick={() => handleDuplicateQuestion(q)}
                                                        >
                                                            <Copy className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            data-testid={`student-questionnaire-edit-${q.id}`}
                                                            className="h-8 w-8 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700"
                                                            onClick={() => handleEditQuestion(q)}
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            data-testid={`student-questionnaire-delete-${q.id}`}
                                                            className="h-8 w-8 text-rose-600 hover:text-rose-500 hover:bg-rose-500/10"
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
                                <div className="p-3 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-xl text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    还需添加 {5 - questions.length} 道题目才能继续
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                                <CardHeader className="cursor-pointer select-none" onClick={() => setRecommendCollapsed(!recommendCollapsed)}>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-slate-800 dark:text-slate-200">推荐题目</CardTitle>
                                        <span className={`text-slate-600 dark:text-slate-400 transition-transform duration-200 ${recommendCollapsed ? "" : "rotate-180"}`}>▲</span>
                                    </div>
                                    <CardDescription className="text-slate-600 dark:text-slate-400">可直接引用教师提供的推荐题目</CardDescription>
                                </CardHeader>
                                {!recommendCollapsed && (
                                    <CardContent className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {recommendQuestions.length === 0 && (
                                            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-4 text-sm text-slate-500 text-center">
                                                暂无推荐题目
                                            </div>
                                        )}
                                        {recommendQuestions.map((rq) => (
                                            <div key={rq.id} className="flex flex-col gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/30 dark:bg-slate-950/30 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300 line-clamp-2">{rq.content}</div>
                                                    <div className="text-xs text-slate-500">
                                                        类型：{questionTypeLabels[{ 1: "boolean", 2: "single", 3: "multiple", 4: "scale" }[rq.questionType] as QuestionType]}
                                                    </div>
                                                </div>
                                                <Button size="sm" variant="outline" className="w-full mt-1 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100" onClick={() => handleUseRecommend(rq)}>
                                                    使用此题
                                                </Button>
                                            </div>
                                        ))}
                                    </CardContent>
                                )}
                            </Card>
                            <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-base text-slate-800 dark:text-slate-200">设计建议</CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
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
                        <Card className="w-full max-w-2xl rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-slate-900 dark:text-slate-100">结束语设置</CardTitle>
                                <CardDescription className="text-slate-600 dark:text-slate-400">设置问卷的结束语，感谢受访者参与</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="ending" className="text-slate-700 dark:text-slate-300">结束语 *（至少20字）</Label>
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
                                        <span className={endingTextLength < 20 || endingTextLength > 1000 ? "text-rose-600" : "text-emerald-600"}>
                                            {endingTextLength > 1000
                                                ? `已超出 ${endingTextLength - 1000} 字`
                                                : endingTextLength < 20
                                                    ? `还需 ${20 - endingTextLength} 字`
                                                    : "✓ 符合要求"}
                                        </span>
                                        <span className="text-slate-500">{endingTextLength}/1000</span>
                                    </div>
                                </div>
                                <div className="rounded-xl bg-indigo-900/20 border border-indigo-500/20 p-3 text-xs text-indigo-700 dark:text-indigo-300 flex items-start gap-2">
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
                        {/* Immersive preview CTA */}
                        <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm overflow-hidden">
                            {isPreviewValid ? (
                                <CardContent className="py-5">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-semibold text-emerald-600 dark:text-emerald-400">模拟填写已完成</h3>
                                                <p className="text-sm text-slate-600 dark:text-slate-400">您已体验了受访者视角的问卷填写过程</p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            onClick={() => setPreviewOpen(true)}
                                            data-testid="student-questionnaire-redo-preview"
                                            className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 shrink-0"
                                        >
                                            <RotateCcw className="w-4 h-4 mr-2" />
                                            重新模拟填写
                                        </Button>
                                    </div>
                                </CardContent>
                            ) : (
                                <div>
                                    <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border-b border-indigo-500/20 px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                                                <Play className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-semibold text-indigo-800 dark:text-indigo-200">模拟填写体验</h3>
                                                <p className="text-xs text-indigo-700/70 dark:text-indigo-300/70 mt-0.5">请以受访者身份完整体验一次问卷填写</p>
                                            </div>
                                        </div>
                                    </div>
                                    <CardContent className="py-8">
                                        <div className="flex flex-col items-center gap-5">
                                            <p className="text-sm text-slate-600 dark:text-slate-400 text-center max-w-md leading-relaxed">
                                                在进入下一阶段之前，您需要以受访者的视角完整填写一次自己设计的问卷。
                                                这将帮助您发现问卷中可能存在的问题，提升问卷质量。
                                            </p>
                                            <Button
                                                onClick={() => setPreviewOpen(true)}
                                                disabled={!basicValidationPassed}
                                                size="lg"
                                                data-testid="student-questionnaire-start-preview"
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 px-8"
                                            >
                                                <Play className="w-5 h-5 mr-2" />
                                                开始模拟填写
                                            </Button>
                                            {!basicValidationPassed && (
                                                <p className="text-xs text-amber-500">请先完成下方校验清单中的必填项</p>
                                            )}
                                        </div>
                                    </CardContent>
                                </div>
                            )}
                        </Card>

                        {/* Validation checklist and score */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm h-fit">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-slate-900 dark:text-slate-100">校验清单</CardTitle>
                                <CardDescription className="text-slate-600 dark:text-slate-400">确认问卷信息完善后再进入下一阶段</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-1.5">
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.title ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.title ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.title ? "text-emerald-600" : "text-rose-600"}`}>
                                        问卷标题：{title ? "已填写" : "未填写"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.welcomeText ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.welcomeText ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.welcomeText ? "text-emerald-600" : "text-rose-600"}`}>
                                        欢迎语：{welcomeTextLength} 字 {validation.welcomeText ? "" : "(20-1000字)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.questionCount ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.questionCount ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.questionCount ? "text-emerald-600" : "text-rose-600"}`}>
                                        题目数量：{questions.length} 道 {validation.questionCount ? "" : "(需要5-50道)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.questionTypes ? "bg-emerald-500/10 border-emerald-500/20" : "bg-amber-500/10 border-amber-500/20"}`}>
                                    {validation.questionTypes ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.questionTypes ? "text-emerald-600" : "text-amber-600"}`}>
                                        题型多样性：{new Set(questions.map((q) => q.type)).size} 种题型
                                        {validation.questionTypes ? "" : " (建议至少2种)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.optionCount ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.optionCount ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.optionCount ? "text-emerald-600" : "text-rose-600"}`}>
                                        选项数量：{validation.optionCount ? "配置有效" : `Q${invalidOptionQuestions.slice(0, 5).join("、")} 需检查`}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.endingText ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.endingText ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.endingText ? "text-emerald-600" : "text-rose-600"}`}>
                                        结束语：{endingTextLength} 字 {validation.endingText ? "" : "(20-1000字)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.previewCompleted ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.previewCompleted ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.previewCompleted ? "text-emerald-600" : "text-rose-600"}`}>
                                        模拟填写：{validation.previewCompleted ? "已完成" : "未完成（必须以受访者身份完整填写一次）"}
                                    </span>
                                </div>
                                {requiredMissingCount === 0 ? (
                                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                                        问卷结构完整，可进入下一阶段。
                                        {warningCount > 0 ? ` 另有 ${warningCount} 项建议优化。` : ""}
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
                                        仍有 {requiredMissingCount} 项必填检测未通过，需修复后才能继续。
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm h-fit">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-slate-900 dark:text-slate-100">初步评分（机器评分）</CardTitle>
                                <CardDescription className="text-slate-600 dark:text-slate-400">供参考，满分100分</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-300">当前得分</span>
                                        <span className="text-2xl font-bold text-indigo-800 dark:text-indigo-200">{preliminaryScore}</span>
                                    </div>
                                    <div className="text-xs text-indigo-700/80 dark:text-indigo-300/80">
                                        {preliminaryScore >= 90
                                            ? "问卷结构优秀"
                                            : preliminaryScore >= 75
                                                ? "问卷结构良好"
                                                : preliminaryScore >= 60
                                                    ? "可继续优化"
                                                    : "建议先完善基础项"}
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    {scoreItems.map((item) => (
                                        <div key={item.label} className="flex items-baseline justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/40 px-3 py-2">
                                            <div className="min-w-0">
                                                <span className="text-sm text-slate-800 dark:text-slate-200">{item.label}</span>
                                                <span
                                                    className={`text-xs ml-2 ${item.status === "pass"
                                                        ? "text-emerald-600"
                                                        : item.status === "warning"
                                                            ? "text-amber-600"
                                                            : "text-rose-600"
                                                        }`}
                                                >
                                                    {item.message}
                                                </span>
                                            </div>
                                            <span className="text-xs font-mono text-slate-600 dark:text-slate-400 shrink-0 ml-2">{item.points} 分</span>
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
        <div className="space-y-8 pb-12" data-testid="student-stage-questionnaire">
            {networkNotice && (
                <Card
                    data-testid="student-questionnaire-network-notice"
                    className={`rounded-2xl border shadow-sm ${syncConflictOpen
                        ? "border-amber-500/30 bg-amber-500/10"
                        : isOnline
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : "border-rose-500/30 bg-rose-500/10"
                        }`}
                >
                    <CardContent className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm">
                            {syncConflictOpen ? (
                                <AlertCircle className="h-4 w-4 text-amber-600" />
                            ) : isOnline ? (
                                <CheckCircle className="h-4 w-4 text-emerald-600" />
                            ) : (
                                <AlertCircle className="h-4 w-4 text-rose-600" />
                            )}
                            <span
                                className={syncConflictOpen
                                    ? "text-amber-700 dark:text-amber-300"
                                    : isOnline
                                        ? "text-emerald-700 dark:text-emerald-300"
                                        : "text-rose-500"
                                }
                            >
                                {networkNotice}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Compact sub-step indicator */}
            <div className="flex items-center gap-2 px-1" data-testid="student-questionnaire-steps">
                {steps.map((s, idx) => {
                    const isCompleted = step > s.num;
                    const isCurrent = step === s.num;

                    return (
                        <div key={s.num} className="flex items-center gap-2">
                            {idx > 0 && (
                                <div className={`w-6 h-px ${isCompleted || isCurrent ? "bg-indigo-500/40" : "bg-slate-200 dark:bg-slate-800"}`} />
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
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 disabled:cursor-not-allowed ${
                                    isCurrent
                                        ? "bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30"
                                        : isCompleted
                                            ? "text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                                            : "text-slate-500"
                                }`}
                            >
                                {isCompleted ? (
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                ) : (
                                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                        isCurrent
                                            ? "bg-indigo-600 text-white"
                                            : "bg-slate-200 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700"
                                    }`}>
                                        {s.num}
                                    </span>
                                )}
                                <span className="hidden sm:inline whitespace-nowrap">{s.title}</span>
                            </button>
                        </div>
                    );
                })}
            </div>

            {renderStep()}

            <div className="flex justify-between items-center pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
                <Button
                    variant="outline"
                    onClick={() => step > 1 && setStep((step - 1) as 1 | 2 | 3 | 4)}
                    disabled={step === 1}
                    data-testid="student-questionnaire-prev"
                    className="border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
                >
                    上一步
                </Button>
                {step < 4 ? (
                    <Button
                        onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
                        disabled={!canAdvanceToNextStep}
                        data-testid="student-questionnaire-next"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
                    >
                        下一步
                    </Button>
                ) : (
                    <Button
                        onClick={() => setConfirmNextOpen(true)}
                        disabled={!canProceed}
                        data-testid="student-questionnaire-complete"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
                    >
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
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200" data-testid="student-questionnaire-delete-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">确认删除</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
                            确定要删除这道题目吗？此操作无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} data-testid="student-questionnaire-delete-confirm" className="bg-rose-600 hover:bg-rose-700 text-white">删除</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200" data-testid="student-questionnaire-complete-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">确认完成问卷设计</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
                            确认后问卷设计将被<strong className="text-indigo-500">锁定</strong>。如需修改，您需要返回本阶段重新设计，届时后续阶段的数据将被<strong className="text-rose-600">清空</strong>。
                            <br /><br />
                            确定继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmComplete} data-testid="student-questionnaire-complete-confirm" className="bg-emerald-600 hover:bg-emerald-700 text-white">确认完成</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={restoreDraftOpen} onOpenChange={handleRestoreDraftOpenChange}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200" data-testid="student-questionnaire-restore-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">恢复草稿</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
                            检测到本地草稿，是否恢复？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction
                            className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                            data-testid="student-questionnaire-restore-discard"
                            onClick={discardPendingDraft}
                        >
                            放弃草稿
                        </AlertDialogAction>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            data-testid="student-questionnaire-restore-apply"
                            onClick={restorePendingDraft}
                        >
                            恢复草稿
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={syncConflictOpen} onOpenChange={handleSyncConflictOpenChange}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200" data-testid="student-questionnaire-conflict-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">检测到草稿冲突</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400 leading-relaxed">
                            本地草稿和服务器草稿都发生了变化。请选择要保留的版本。
                            <br />
                            <span className="text-slate-500">保留本地版本将覆盖服务器当前草稿。</span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction
                            className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                            data-testid="student-questionnaire-conflict-server"
                            onClick={keepServerDraft}
                        >
                            保留服务器版本
                        </AlertDialogAction>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            data-testid="student-questionnaire-conflict-local"
                            onClick={() => {
                                void keepLocalDraft();
                            }}
                        >
                            保留本地版本
                        </AlertDialogAction>
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

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
import { toast } from "sonner";
import { Plus, GripVertical, Trash2, Edit2, CheckCircle, AlertCircle, Copy, ArrowUp, ArrowDown, HelpCircle, MessageSquare, List, Play, RotateCcw } from "lucide-react";
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

const questionTypeColors: Record<QuestionType, string> = {
    boolean: "bg-primary/10 text-primary border-primary/20",
    single: "bg-info/10 text-info border-info/20",
    multiple: "bg-success/10 text-success border-success/20",
    scale: "bg-warning/10 text-warning border-warning/20",
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
        await completeStage(1, { questionnaire: questionnaireData });
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <Card className="lg:col-span-2 rounded-2xl border-border bg-card/50 shadow-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-foreground">
                                    <MessageSquare className="w-5 h-5 text-primary" />
                                    欢迎语设置
                                </CardTitle>
                                <CardDescription className="text-muted-foreground">设置问卷的标题和欢迎语，让受访者了解调查目的</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="title" className="text-foreground/90">问卷标题 *</Label>
                                    <Input
                                        id="title"
                                        placeholder="请输入问卷标题"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        maxLength={100}
                                        data-testid="student-questionnaire-title"
                                        className="bg-background/50 border-border focus:border-ring"
                                    />
                                    <p className="text-xs text-muted-foreground text-right">{title.length}/100</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="welcome" className="text-foreground/90">欢迎语 *（至少20字）</Label>
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
                                        <span className={welcomeTextLength < 20 || welcomeTextLength > 1000 ? "text-destructive" : "text-success"}>
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
                        <Card className="h-fit rounded-2xl border-info/20 bg-info/10 shadow-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base text-info">
                                    <HelpCircle className="w-4 h-4" />
                                    小贴士
                                </CardTitle>
                                <CardDescription className="text-info">好的欢迎语能提高数据质量。</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 text-sm leading-relaxed text-info">
                                <p>建议说明调查目的、预计用时与隐私保护方式。</p>
                                <p>保持简洁友好，最好控制在 200 字以内。</p>
                                <div className="rounded-xl border border-info/20 bg-background/80 p-3 text-xs text-info shadow-sm">
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
                            <Card className="rounded-2xl border-border bg-card/50 shadow-sm">
                                <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
                                    <div>
                                        <CardTitle className="text-foreground flex items-center gap-2">
                                            <List className="w-5 h-5 text-primary" />
                                            题目列表
                                        </CardTitle>
                                        <CardDescription className="text-muted-foreground mt-1">
                                            已添加 {questions.length} 道题目（最少5题，最多50题）
                                        </CardDescription>
                                    </div>
                                    <Button
                                        onClick={handleAddQuestion}
                                        disabled={questions.length >= 50}
                                        data-testid="student-questionnaire-add-question"
                                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                    >
                                        <Plus className="w-4 h-4 mr-1" />
                                        添加题目
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-6" data-testid="student-questionnaire-list">
                                    {questions.length === 0 ? (
                                        <div className="text-center py-16 text-muted-foreground bg-background/30 rounded-xl border border-dashed border-border">
                                            <p>暂无题目，点击「添加题目」开始设计问卷</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {questions.map((q, index) => (
                                                <div
                                                    key={q.id}
                                                    data-testid={`student-questionnaire-item-${q.id}`}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all group hover:bg-muted ${dragOverId === q.id && draggingId !== q.id
                                                        ? "border-primary ring-1 ring-primary/50 bg-primary/10"
                                                        : "border-border bg-background/50"
                                                        } ${draggingId === q.id ? "opacity-50" : ""}`}
                                                    draggable
                                                    onDragStart={handleDragStart(q.id)}
                                                    onDragOver={handleDragOver(q.id)}
                                                    onDragLeave={handleDragLeave(q.id)}
                                                    onDrop={handleDrop(q.id)}
                                                    onDragEnd={handleDragEnd}
                                                >
                                                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab hover:text-muted-foreground" />
                                                    <span className="text-sm font-bold text-muted-foreground w-8">Q{index + 1}</span>
                                                    <Badge variant="outline" className={`${questionTypeColors[q.type]} px-2 py-0.5 text-xs whitespace-nowrap`}>
                                                        {questionTypeLabels[q.type]}
                                                    </Badge>
                                                    <span className="flex-1 text-sm text-foreground/90 truncate font-medium">{q.content}</span>
                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            data-testid={`student-questionnaire-move-up-${q.id}`}
                                                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                            onClick={() => moveQuestion(index, "up")}
                                                            disabled={index === 0}
                                                        >
                                                            <ArrowUp className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            data-testid={`student-questionnaire-move-down-${q.id}`}
                                                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                            onClick={() => moveQuestion(index, "down")}
                                                            disabled={index === questions.length - 1}
                                                        >
                                                            <ArrowDown className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            data-testid={`student-questionnaire-duplicate-${q.id}`}
                                                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                            onClick={() => handleDuplicateQuestion(q)}
                                                        >
                                                            <Copy className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            data-testid={`student-questionnaire-edit-${q.id}`}
                                                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                            onClick={() => handleEditQuestion(q)}
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            data-testid={`student-questionnaire-delete-${q.id}`}
                                                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
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
                                <div className="p-3 bg-warning/10 text-warning border border-warning/20 rounded-xl text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    还需添加 {5 - questions.length} 道题目才能继续
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <Card className="rounded-2xl border-border bg-card/50 shadow-sm">
                                <CardHeader className="cursor-pointer select-none" onClick={() => setRecommendCollapsed(!recommendCollapsed)}>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-foreground">推荐题目</CardTitle>
                                        <span className={`text-muted-foreground transition-transform duration-200 ${recommendCollapsed ? "" : "rotate-180"}`}>▲</span>
                                    </div>
                                    <CardDescription className="text-muted-foreground">可直接引用教师提供的推荐题目</CardDescription>
                                </CardHeader>
                                {!recommendCollapsed && (
                                    <CardContent className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {recommendQuestions.length === 0 && (
                                            <div className="rounded-xl border border-dashed border-input bg-card/50 p-4 text-sm text-muted-foreground text-center">
                                                暂无推荐题目
                                            </div>
                                        )}
                                        {recommendQuestions.map((rq) => {
                                            const recommendAlreadyInQuestionnaire = questions.some((q) => q.recommendSourceId === rq.id);
                                            return (
                                            <div key={rq.id} className="flex flex-col gap-2 p-3 rounded-xl border border-border bg-background/30 hover:bg-card transition-colors">
                                                <div className="space-y-1">
                                                    <div className="text-sm font-medium text-foreground/90 line-clamp-2">{rq.content}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        类型：{questionTypeLabels[rq.type]}
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={recommendAlreadyInQuestionnaire}
                                                    className="w-full mt-1 border-input text-foreground/90 hover:bg-muted hover:text-foreground disabled:opacity-50"
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
                            <Card className="rounded-2xl border-border bg-card/50 shadow-sm">
                                <CardHeader>
                                    <CardTitle className="text-base text-foreground">设计建议</CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm text-muted-foreground space-y-2">
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
                        <Card className="w-full max-w-2xl rounded-2xl border-border bg-card/50 shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-foreground">结束语设置</CardTitle>
                                <CardDescription className="text-muted-foreground">设置问卷的结束语，感谢受访者参与</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="ending" className="text-foreground/90">结束语 *（至少20字）</Label>
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
                                        <span className={endingTextLength < 20 || endingTextLength > 1000 ? "text-destructive" : "text-success"}>
                                            {endingTextLength > 1000
                                                ? `已超出 ${endingTextLength - 1000} 字`
                                                : endingTextLength < 20
                                                    ? `还需 ${20 - endingTextLength} 字`
                                                    : "✓ 符合要求"}
                                        </span>
                                        <span className="text-muted-foreground">{endingTextLength}/1000</span>
                                    </div>
                                </div>
                                <div className="rounded-xl bg-primary/20 border border-primary/20 p-3 text-xs text-primary flex items-start gap-2">
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
                        <Card className="rounded-2xl border-border bg-card/50 shadow-sm overflow-hidden">
                            {isPreviewValid ? (
                                <CardContent className="py-5">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-success/15 border border-success/20 flex items-center justify-center shrink-0">
                                                <CheckCircle className="w-5 h-5 text-success" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-semibold text-success">模拟填写已完成</h3>
                                                <p className="text-sm text-muted-foreground">您已体验了受访者视角的问卷填写过程</p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            onClick={() => setPreviewOpen(true)}
                                            data-testid="student-questionnaire-redo-preview"
                                            className="border-input text-foreground/90 hover:bg-muted hover:text-foreground shrink-0"
                                        >
                                            <RotateCcw className="w-4 h-4 mr-2" />
                                            重新模拟填写
                                        </Button>
                                    </div>
                                </CardContent>
                            ) : (
                                <div>
                                    <div className="bg-gradient-to-r from-primary/20 to-auxiliary/20 border-b border-primary/20 px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                                                <Play className="w-5 h-5 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-semibold text-primary">模拟填写体验</h3>
                                                <p className="text-xs text-primary mt-0.5">请以受访者身份完整体验一次问卷填写</p>
                                            </div>
                                        </div>
                                    </div>
                                    <CardContent className="py-8">
                                        <div className="flex flex-col items-center gap-5">
                                            <p className="text-sm text-muted-foreground text-center max-w-md leading-relaxed">
                                                在进入下一阶段之前，您需要以受访者的视角完整填写一次自己设计的问卷。
                                                这将帮助您发现问卷中可能存在的问题，提升问卷质量。
                                            </p>
                                            <Button
                                                onClick={() => setPreviewOpen(true)}
                                                disabled={!basicValidationPassed}
                                                size="lg"
                                                data-testid="student-questionnaire-start-preview"
                                                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 px-8"
                                            >
                                                <Play className="w-5 h-5 mr-2" />
                                                开始模拟填写
                                            </Button>
                                            {!basicValidationPassed && (
                                                <p className="text-xs text-warning">请先完成下方校验清单中的必填项</p>
                                            )}
                                        </div>
                                    </CardContent>
                                </div>
                            )}
                        </Card>

                        {/* Validation checklist and score */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card className="rounded-2xl border-border bg-card/50 shadow-sm h-fit">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-foreground">校验清单</CardTitle>
                                <CardDescription className="text-muted-foreground">确认问卷信息完善后再进入下一阶段</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-1.5">
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.title ? "bg-success/10 border-success/20" : "bg-destructive/10 border-destructive/20"}`}>
                                    {validation.title ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.title ? "text-success" : "text-destructive"}`}>
                                        问卷标题：{title ? "已填写" : "未填写"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.welcomeText ? "bg-success/10 border-success/20" : "bg-destructive/10 border-destructive/20"}`}>
                                    {validation.welcomeText ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.welcomeText ? "text-success" : "text-destructive"}`}>
                                        欢迎语：{welcomeTextLength} 字 {validation.welcomeText ? "" : "(20-1000字)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.questionCount ? "bg-success/10 border-success/20" : "bg-destructive/10 border-destructive/20"}`}>
                                    {validation.questionCount ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.questionCount ? "text-success" : "text-destructive"}`}>
                                        题目数量：{questions.length} 道 {validation.questionCount ? "" : "(需要5-50道)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.questionTypes ? "bg-success/10 border-success/20" : "bg-warning/10 border-warning/20"}`}>
                                    {validation.questionTypes ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-warning shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.questionTypes ? "text-success" : "text-warning"}`}>
                                        题型多样性：{new Set(questions.map((q) => q.type)).size} 种题型
                                        {validation.questionTypes ? "" : " (建议至少2种)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.optionCount ? "bg-success/10 border-success/20" : "bg-destructive/10 border-destructive/20"}`}>
                                    {validation.optionCount ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.optionCount ? "text-success" : "text-destructive"}`}>
                                        选项数量：{validation.optionCount ? "配置有效" : `Q${invalidOptionQuestions.slice(0, 5).join("、")} 需检查`}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.endingText ? "bg-success/10 border-success/20" : "bg-destructive/10 border-destructive/20"}`}>
                                    {validation.endingText ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.endingText ? "text-success" : "text-destructive"}`}>
                                        结束语：{endingTextLength} 字 {validation.endingText ? "" : "(20-1000字)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${validation.previewCompleted ? "bg-success/10 border-success/20" : "bg-destructive/10 border-destructive/20"}`}>
                                    {validation.previewCompleted ? (
                                        <CheckCircle className="w-4 h-4 text-success shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                                    )}
                                    <span className={`text-sm ${validation.previewCompleted ? "text-success" : "text-destructive"}`}>
                                        模拟填写：{validation.previewCompleted ? "已完成" : "未完成（必须以受访者身份完整填写一次）"}
                                    </span>
                                </div>
                                {requiredMissingCount === 0 ? (
                                    <div className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
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

                        <Card className="rounded-2xl border-border bg-card/50 shadow-sm h-fit">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-foreground">初步评分（机器评分）</CardTitle>
                                <CardDescription className="text-muted-foreground">供参考，满分100分</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xs uppercase tracking-wider text-primary">当前得分</span>
                                        <span className="text-2xl font-bold text-primary">{preliminaryScore}</span>
                                    </div>
                                    <div className="text-xs text-primary">
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
                                        <div key={item.label} className="flex items-baseline justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
                                            <div className="min-w-0">
                                                <span className="text-sm text-foreground">{item.label}</span>
                                                <span
                                                    className={`text-xs ml-2 ${item.status === "pass"
                                                        ? "text-success"
                                                        : item.status === "warning"
                                                            ? "text-warning"
                                                            : "text-destructive"
                                                        }`}
                                                >
                                                    {item.message}
                                                </span>
                                            </div>
                                            <span className="text-xs font-mono text-muted-foreground shrink-0 ml-2">{item.points} 分</span>
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
            {/* Compact sub-step indicator */}
            <div className="flex items-center gap-2 px-1" data-testid="student-questionnaire-steps">
                {steps.map((s, idx) => {
                    const isCompleted = step > s.num;
                    const isCurrent = step === s.num;

                    return (
                        <div key={s.num} className="flex items-center gap-2">
                            {idx > 0 && (
                                <div className={`w-6 h-px ${isCompleted || isCurrent ? "bg-primary/40" : "bg-muted"}`} />
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
                                        ? "bg-primary/15 text-primary border border-primary/30"
                                        : isCompleted
                                            ? "text-success hover:bg-success/10 cursor-pointer"
                                            : "text-muted-foreground"
                                }`}
                            >
                                {isCompleted ? (
                                    <CheckCircle className="w-3.5 h-3.5 text-success flex-shrink-0" />
                                ) : (
                                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                        isCurrent
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground border border-input"
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

            <div className="flex justify-between items-center pt-4 border-t border-border/50">
                <Button
                    variant="outline"
                    onClick={() => step > 1 && setStep((step - 1) as 1 | 2 | 3 | 4)}
                    disabled={step === 1}
                    data-testid="student-questionnaire-prev"
                    className="border-input bg-muted text-foreground/90 hover:bg-muted hover:text-foreground"
                >
                    上一步
                </Button>
                {step < 4 ? (
                    <Button
                        onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
                        disabled={!canAdvanceToNextStep}
                        data-testid="student-questionnaire-next"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                    >
                        下一步
                    </Button>
                ) : (
                    <Button
                        onClick={() => setConfirmNextOpen(true)}
                        disabled={!canProceed}
                        data-testid="student-questionnaire-complete"
                        className="bg-success hover:bg-success/90 text-success-foreground shadow-lg shadow-success/20"
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
                <AlertDialogContent className="bg-card border-border text-foreground" data-testid="student-questionnaire-delete-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">确认删除</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            确定要删除这道题目吗？此操作无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-background border-border text-foreground/90 hover:bg-muted hover:text-foreground">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} data-testid="student-questionnaire-delete-confirm" className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">删除</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent className="bg-card border-border text-foreground" data-testid="student-questionnaire-complete-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">确认完成问卷设计</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground text-base leading-relaxed">
                            确认后问卷设计将被<strong className="text-primary">锁定</strong>。如需修改，您需要返回本阶段重新设计，届时后续阶段的数据将被<strong className="text-destructive">清空</strong>。
                            <br /><br />
                            确定继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-background border-border text-foreground/90 hover:bg-muted hover:text-foreground">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmComplete} data-testid="student-questionnaire-complete-confirm" className="bg-success hover:bg-success/90 text-success-foreground">确认完成</AlertDialogAction>
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

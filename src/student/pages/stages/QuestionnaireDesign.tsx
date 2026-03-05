import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { Plus, GripVertical, Trash2, Edit2, CheckCircle, AlertCircle, Copy, ArrowUp, ArrowDown, HelpCircle, MessageSquare, List } from "lucide-react";
import { RichTextContent } from "@/components/RichTextContent";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { useExperiment } from "../ExperimentLayout";
import { QuestionEditor } from "../../components/QuestionEditor";
import { RichTextEditor } from "../../components/RichTextEditor";
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
    boolean: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    single: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    multiple: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    scale: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

type ScoreStatus = "pass" | "warning" | "fail";

interface ScoreItem {
    label: string;
    points: number;
    status: ScoreStatus;
    message: string;
}

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
    const [previewAnswers, setPreviewAnswers] = useState<Record<string, string | string[] | number>>({});
    const [isOnline, setIsOnline] = useState(
        typeof navigator === "undefined" ? true : navigator.onLine
    );
    const [networkNotice, setNetworkNotice] = useState<string | null>(null);
    const [syncConflictOpen, setSyncConflictOpen] = useState(false);
    const [serverConflictDraft, setServerConflictDraft] = useState<QuestionnaireData | null>(null);
    const [localConflictDraft, setLocalConflictDraft] = useState<QuestionnaireData | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [recommendCollapsed, setRecommendCollapsed] = useState(false);
    const draftKey = experiment?.taskId ? `student_questionnaire_draft_${experiment.taskId}` : null;
    const serverSnapshotRef = useRef("");
    const saveInFlightRef = useRef(false);
    const reconnectSyncingRef = useRef(false);
    const draftResolvedRef = useRef(false);

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


    const buildQuestionnaireData = useCallback((): QuestionnaireData => {
        return {
            title,
            welcomeText,
            endingText,
            questions,
        };
    }, [title, welcomeText, endingText, questions]);

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

    useEffect(() => {
        const serverQuestionnaire = normalizeQuestionnaireData(initialData);
        serverSnapshotRef.current = JSON.stringify(serverQuestionnaire);
    }, [initialData, normalizeQuestionnaireData]);

    const saveData = useCallback(async () => {
        const questionnaireData = buildQuestionnaireData();
        const snapshot = JSON.stringify(questionnaireData);

        if (snapshot === serverSnapshotRef.current || saveInFlightRef.current) return;
        if (typeof navigator !== "undefined" && !navigator.onLine) return;

        saveInFlightRef.current = true;
        try {
            const success = await saveExperiment({ questionnaire: questionnaireData });
            if (success) {
                serverSnapshotRef.current = snapshot;
                setLastSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
                setNetworkNotice((prev) => (prev === "网络已恢复，正在同步本地数据..." ? "网络已恢复，本地草稿已同步到服务器" : prev));
            }
        } finally {
            saveInFlightRef.current = false;
        }
    }, [buildQuestionnaireData, saveExperiment]);

    // Restore draft from localStorage
    useEffect(() => {
        if (!draftKey) return;
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) { draftResolvedRef.current = true; return; }
            const draft = JSON.parse(raw) as QuestionnaireData;
            // Skip empty/trivial drafts
            const hasDraftContent = Boolean(draft.title || (draft.questions && draft.questions.length > 0));
            if (!hasDraftContent) { draftResolvedRef.current = true; return; }
            const hasServerData = Boolean(initialData?.title || initialData?.questions?.length);
            if (hasServerData) {
                const serverNorm = { title: initialData?.title ?? "", welcomeText: initialData?.welcomeText ?? "", endingText: initialData?.endingText ?? "", questions: initialData?.questions ?? [] };
                const different = JSON.stringify(draft) !== JSON.stringify(serverNorm);
                if (different) {
                    setPendingDraft(draft);
                    setRestoreDraftOpen(true);
                } else {
                    draftResolvedRef.current = true;
                }
            } else {
                setPendingDraft(draft);
                setRestoreDraftOpen(true);
            }
        } catch {
            draftResolvedRef.current = true;
            // ignore invalid draft
        }
    }, [draftKey, initialData]);

    // Save draft to localStorage (guard: only after draft recovery dialog resolved)
    useEffect(() => {
        if (!draftKey || !draftResolvedRef.current) return;
        try {
            localStorage.setItem(draftKey, JSON.stringify(buildQuestionnaireData()));
        } catch {
            // ignore write errors
        }
    }, [draftKey, buildQuestionnaireData]);

    // Keep a ref to the latest saveData so the 30-second interval doesn't reset on every keystroke
    const saveDataRef = useRef(saveData);
    useEffect(() => { saveDataRef.current = saveData; }, [saveData]);

    // Debounce: save 3 seconds after user stops editing
    useEffect(() => {
        const debounceTimer = window.setTimeout(() => {
            void saveData();
        }, 3000);

        return () => {
            window.clearTimeout(debounceTimer);
        };
    }, [saveData]);

    // Fixed 30-second interval: uses ref so the interval is never reset by content changes
    useEffect(() => {
        const intervalTimer = window.setInterval(() => {
            void saveDataRef.current();
        }, 30 * 1000);

        return () => {
            window.clearInterval(intervalTimer);
        };
    }, []);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            const currentSnapshot = JSON.stringify(buildQuestionnaireData());
            if (currentSnapshot === serverSnapshotRef.current) return;
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", onBeforeUnload);
        return () => {
            window.removeEventListener("beforeunload", onBeforeUnload);
        };
    }, [buildQuestionnaireData]);

    useEffect(() => {
        setPreviewAnswers((prev) => {
            const allowed = new Set(questions.map((q) => q.id));
            const next: Record<string, string | string[] | number> = {};
            Object.entries(prev).forEach(([key, value]) => {
                if (allowed.has(key)) {
                    next[key] = value;
                }
            });
            return next;
        });
    }, [questions]);

    const syncAfterReconnect = useCallback(async () => {
        if (!experiment?.taskId || reconnectSyncingRef.current) return;
        reconnectSyncingRef.current = true;
        setNetworkNotice("网络已恢复，正在同步本地数据...");

        try {
            const localData = buildQuestionnaireData();
            const localSnapshot = JSON.stringify(localData);
            const lastSyncedSnapshot = serverSnapshotRef.current;

            const res = await experimentApi.get(experiment.taskId);
            if (!res.success || !res.data) {
                setNetworkNotice("网络已恢复，但自动同步失败，请稍后重试");
                return;
            }

            const serverData = normalizeQuestionnaireData(res.data.questionnaire);
            const serverSnapshot = JSON.stringify(serverData);
            const localChanged = localSnapshot !== lastSyncedSnapshot;
            const serverChanged = serverSnapshot !== lastSyncedSnapshot;

            if (localSnapshot === serverSnapshot) {
                serverSnapshotRef.current = serverSnapshot;
                setNetworkNotice("网络已恢复，数据已同步");
                return;
            }

            if (localChanged && serverChanged) {
                setLocalConflictDraft(localData);
                setServerConflictDraft(serverData);
                setSyncConflictOpen(true);
                setNetworkNotice("检测到本地与服务器草稿冲突，请选择保留版本");
                return;
            }

            if (localChanged) {
                const success = await saveExperiment({ questionnaire: localData });
                if (success) {
                    serverSnapshotRef.current = localSnapshot;
                    setNetworkNotice("网络已恢复，本地草稿已同步到服务器");
                } else {
                    setNetworkNotice("网络已恢复，但自动同步失败，请稍后重试");
                }
                return;
            }

            applyQuestionnaireData(serverData);
            serverSnapshotRef.current = serverSnapshot;
            if (draftKey) {
                try {
                    localStorage.setItem(draftKey, serverSnapshot);
                } catch {
                    // ignore write errors
                }
            }
            setNetworkNotice("检测到服务器有更新，已同步最新草稿");
        } catch {
            setNetworkNotice("网络已恢复，但自动同步失败，请稍后重试");
        } finally {
            reconnectSyncingRef.current = false;
        }
    }, [
        applyQuestionnaireData,
        buildQuestionnaireData,
        draftKey,
        experiment?.taskId,
        normalizeQuestionnaireData,
        saveExperiment,
    ]);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            void syncAfterReconnect();
        };
        const handleOffline = () => {
            setIsOnline(false);
            setNetworkNotice("网络已断开，数据将保存在本地");
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [syncAfterReconnect]);

    useEffect(() => {
        if (!isOnline) {
            setNetworkNotice("网络已断开，数据将保存在本地");
        }
    }, [isOnline]);

    useEffect(() => {
        if (!networkNotice || syncConflictOpen || !isOnline) return;
        const timer = window.setTimeout(() => {
            setNetworkNotice(null);
        }, 5000);
        return () => {
            window.clearTimeout(timer);
        };
    }, [isOnline, networkNotice, syncConflictOpen]);

    const handleKeepServerDraft = useCallback(() => {
        if (!serverConflictDraft) {
            setSyncConflictOpen(false);
            return;
        }

        applyQuestionnaireData(serverConflictDraft);
        const serverSnapshot = JSON.stringify(serverConflictDraft);
        serverSnapshotRef.current = serverSnapshot;
        if (draftKey) {
            try {
                localStorage.setItem(draftKey, serverSnapshot);
            } catch {
                // ignore write errors
            }
        }
        setSyncConflictOpen(false);
        setNetworkNotice("已保留服务器草稿版本");
    }, [applyQuestionnaireData, draftKey, serverConflictDraft]);

    const handleKeepLocalDraft = useCallback(async () => {
        const localData = localConflictDraft ?? buildQuestionnaireData();
        const localSnapshot = JSON.stringify(localData);
        const success = await saveExperiment({ questionnaire: localData });

        if (success) {
            serverSnapshotRef.current = localSnapshot;
            if (draftKey) {
                try {
                    localStorage.setItem(draftKey, localSnapshot);
                } catch {
                    // ignore write errors
                }
            }
            setNetworkNotice("已保留本地草稿并同步到服务器");
        } else {
            setNetworkNotice("保留本地草稿失败，请稍后重试");
        }

        setSyncConflictOpen(false);
    }, [buildQuestionnaireData, draftKey, localConflictDraft, saveExperiment]);

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
    };

    const canProceed =
        validation.title &&
        validation.welcomeText &&
        validation.endingText &&
        validation.questionCount &&
        validation.optionCount;

    const scoreItems = useMemo<ScoreItem[]>(() => {
        const items: ScoreItem[] = [];

        items.push({
            label: "标题完整性",
            points: validation.title ? 10 : 0,
            status: validation.title ? "pass" : "fail",
            message: validation.title ? "标题长度符合要求" : "标题需为1-100字",
        });

        items.push({
            label: "欢迎语质量",
            points: validation.welcomeText ? (welcomeTextLength >= 80 ? 15 : 12) : 0,
            status: validation.welcomeText ? "pass" : "fail",
            message: validation.welcomeText ? "欢迎语字数符合要求" : "欢迎语需在20-1000字之间",
        });

        items.push({
            label: "结束语质量",
            points: validation.endingText ? (endingTextLength >= 80 ? 15 : 12) : 0,
            status: validation.endingText ? "pass" : "fail",
            message: validation.endingText ? "结束语字数符合要求" : "结束语需在20-1000字之间",
        });

        items.push({
            label: "题目数量",
            points: validation.questionCount ? 20 : 0,
            status: validation.questionCount ? "pass" : "fail",
            message: validation.questionCount ? "题目数量在5-50题范围内" : "题目数量需在5-50题",
        });

        items.push({
            label: "选项配置",
            points: validation.optionCount ? 20 : 0,
            status: validation.optionCount ? "pass" : "fail",
            message: validation.optionCount
                ? "单选/多选题选项配置有效"
                : `Q${invalidOptionQuestions.slice(0, 5).join("、")} 配置无效`,
        });

        const diversityScore = validation.questionCount
            ? (validation.questionTypes ? 20 : 12)
            : 0;
        items.push({
            label: "题型多样性",
            points: diversityScore,
            status: validation.questionCount
                ? (validation.questionTypes ? "pass" : "warning")
                : "fail",
            message: validation.questionCount
                ? (validation.questionTypes ? "题型结构较均衡" : "建议至少包含2种题型")
                : "请先满足题目数量要求",
        });

        return items;
    }, [
        invalidOptionQuestions,
        validation.title,
        validation.welcomeText,
        validation.endingText,
        validation.questionCount,
        validation.optionCount,
        validation.questionTypes,
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
    ].filter(Boolean).length;
    const requiredMissingCount = 5 - requiredFailCount;
    const warningCount = validation.questionTypes ? 0 : 1;

    const handleConfirmComplete = async () => {
        // Save final data
        await saveData();
        // Move to next stage
        await saveExperiment({ currentStage: 2 });
        // Clear localStorage draft after successful stage completion
        if (draftKey) localStorage.removeItem(draftKey);
        onNext();
    };

    const answeredCount = questions.filter((q) => {
        const answer = previewAnswers[q.id];
        if (answer === undefined || answer === null) return false;
        if (Array.isArray(answer)) return answer.length > 0;
        if (typeof answer === "number") return true;
        return String(answer).trim().length > 0;
    }).length;

    const setSingleAnswer = (questionId: string, value: string) => {
        setPreviewAnswers((prev) => ({ ...prev, [questionId]: value }));
    };

    const toggleMultipleAnswer = (question: Question, option: string) => {
        setPreviewAnswers((prev) => {
            const current = Array.isArray(prev[question.id]) ? (prev[question.id] as string[]) : [];
            if (current.includes(option)) {
                return { ...prev, [question.id]: current.filter((item) => item !== option) };
            }

            const maxSelect = question.maxSelect ?? question.options?.length ?? 10;
            if (current.length >= maxSelect) {
                return prev;
            }
            return { ...prev, [question.id]: [...current, option] };
        });
    };

    const renderPreviewQuestion = (question: Question, index: number) => {
        const answer = previewAnswers[question.id];

        return (
            <div key={question.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
                <div className="flex items-start gap-2">
                    <span className="font-semibold text-neutral-700">Q{index + 1}.</span>
                    <div className="flex-1 space-y-2">
                        <div className="text-sm text-neutral-700 font-medium leading-relaxed">{question.content}</div>
                        <Badge variant="outline" className={`text-[10px] ${questionTypeColors[question.type]}`}>
                            {questionTypeLabels[question.type]}
                        </Badge>
                    </div>
                </div>

                {question.type === "boolean" && (
                    <div className="space-y-2 pl-6">
                        {["是", "否"].map((option) => (
                            <label key={option} className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                                <input
                                    type="radio"
                                    name={`preview_${question.id}`}
                                    checked={answer === option}
                                    onChange={() => setSingleAnswer(question.id, option)}
                                />
                                {option}
                            </label>
                        ))}
                    </div>
                )}

                {question.type === "single" && (
                    <div className="space-y-2 pl-6">
                        {(question.options ?? []).map((option) => (
                            <label key={option} className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                                <input
                                    type="radio"
                                    name={`preview_${question.id}`}
                                    checked={answer === option}
                                    onChange={() => setSingleAnswer(question.id, option)}
                                />
                                {option}
                            </label>
                        ))}
                    </div>
                )}

                {question.type === "multiple" && (
                    <div className="space-y-2 pl-6">
                        <div className="text-xs text-neutral-500">
                            最少选择 {question.minSelect ?? 1} 项，最多选择 {question.maxSelect ?? question.options?.length ?? 10} 项
                        </div>
                        {(question.options ?? []).map((option) => {
                            const selected = Array.isArray(answer) ? answer.includes(option) : false;
                            const selectedCount = Array.isArray(answer) ? answer.length : 0;
                            const maxSelect = question.maxSelect ?? question.options?.length ?? 10;
                            const disabled = !selected && selectedCount >= maxSelect;

                            return (
                                <label key={option} className={`flex items-center gap-2 text-sm ${disabled ? "text-neutral-400" : "text-neutral-700"} ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        disabled={disabled}
                                        onChange={() => toggleMultipleAnswer(question, option)}
                                    />
                                    {option}
                                </label>
                            );
                        })}
                    </div>
                )}

                {question.type === "scale" && (
                    <div className="space-y-2 pl-6">
                        <div className="flex justify-between text-xs text-neutral-500">
                            <span>{question.scaleMinLabel || "最低"}</span>
                            <span>{question.scaleMaxLabel || "最高"}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {Array.from({
                                length: (question.scaleMax ?? 10) - (question.scaleMin ?? 1) + 1,
                            }).map((_, i) => {
                                const value = (question.scaleMin ?? 1) + i;
                                const selected = answer === value;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setPreviewAnswers((prev) => ({ ...prev, [question.id]: value }))}
                                        className={`h-8 min-w-8 rounded-md border text-xs font-medium transition-colors ${selected
                                            ? "bg-indigo-600 border-indigo-600 text-white"
                                            : "bg-white border-neutral-300 text-neutral-700 hover:bg-indigo-50 hover:border-indigo-300"}`}
                                    >
                                        {value}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
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
                                    <RichTextEditor
                                        id="welcome"
                                        placeholder="请输入欢迎语，说明调查目的、预计用时等"
                                        value={welcomeText}
                                        onChange={setWelcomeText}
                                        editorClassName="min-h-[220px]"
                                    />
                                    <div className="flex justify-between text-xs">
                                        <span className={welcomeTextLength < 20 || welcomeTextLength > 1000 ? "text-rose-400" : "text-emerald-400"}>
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
                                                            className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-700"
                                                            onClick={() => moveQuestion(index, "up")}
                                                            disabled={index === 0}
                                                        >
                                                            <ArrowUp className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-700"
                                                            onClick={() => moveQuestion(index, "down")}
                                                            disabled={index === questions.length - 1}
                                                        >
                                                            <ArrowDown className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-700"
                                                            onClick={() => handleDuplicateQuestion(q)}
                                                        >
                                                            <Copy className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-slate-100 hover:bg-slate-700"
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
                                <CardHeader className="cursor-pointer select-none" onClick={() => setRecommendCollapsed(!recommendCollapsed)}>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base text-slate-200">推荐题目</CardTitle>
                                        <span className={`text-slate-400 transition-transform duration-200 ${recommendCollapsed ? "" : "rotate-180"}`}>▲</span>
                                    </div>
                                    <CardDescription className="text-slate-400">可直接引用教师提供的推荐题目</CardDescription>
                                </CardHeader>
                                {!recommendCollapsed && (
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
                                                <Button size="sm" variant="outline" className="w-full mt-1 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100" onClick={() => handleUseRecommend(rq)}>
                                                    使用此题
                                                </Button>
                                            </div>
                                        ))}
                                    </CardContent>
                                )}
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
                                    <RichTextEditor
                                        id="ending"
                                        placeholder="请输入结束语，如致谢词等"
                                        value={endingText}
                                        onChange={setEndingText}
                                        editorClassName="min-h-[220px]"
                                    />
                                    <div className="flex justify-between text-xs">
                                        <span className={endingTextLength < 20 || endingTextLength > 1000 ? "text-rose-400" : "text-emerald-400"}>
                                            {endingTextLength > 1000
                                                ? `已超出 ${endingTextLength - 1000} 字`
                                                : endingTextLength < 20
                                                    ? `还需 ${20 - endingTextLength} 字`
                                                    : "✓ 符合要求"}
                                        </span>
                                        <span className="text-slate-500">{endingTextLength}/1000</span>
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
                                <CardDescription className="text-slate-400">完整交互式预览，可直接测试题目作答体验</CardDescription>
                            </CardHeader>
                            <CardContent className="bg-slate-950/30 py-6 px-4 sm:px-6 rounded-xl inner-shadow">
                                <div className="w-full max-w-2xl mx-auto rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl text-neutral-800">
                                    <div className="space-y-3 border-b border-neutral-200 pb-4">
                                        <div className="text-base font-bold text-neutral-900">{title || "问卷标题"}</div>
                                        <RichTextContent
                                            html={welcomeText}
                                            className="text-xs text-neutral-600 leading-relaxed"
                                            emptyFallback="欢迎语将在这里展示"
                                        />
                                        <div className="text-[11px] text-neutral-500">
                                            已试填 {answeredCount} / {questions.length} 题
                                        </div>
                                    </div>

                                    <div className="mt-4 max-h-[520px] overflow-y-auto pr-1 space-y-3">
                                        {questions.length === 0 ? (
                                            <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-400 text-center italic border border-neutral-200">
                                                还没有题目
                                            </div>
                                        ) : (
                                            questions.map((q, index) => renderPreviewQuestion(q, index))
                                        )}
                                    </div>

                                    <div className="mt-5 pt-3 border-t border-neutral-200">
                                        <RichTextContent
                                            html={endingText}
                                            className="text-xs text-neutral-600 leading-relaxed"
                                            emptyFallback="结束语将在这里展示"
                                        />
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
                                        欢迎语：{welcomeTextLength} 字 {validation.welcomeText ? "" : "(20-1000字)"}
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
                                <div className={`flex items-center gap-3 p-3 rounded-xl border ${validation.optionCount ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.optionCount ? (
                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-rose-500" />
                                    )}
                                    <span className={`text-sm ${validation.optionCount ? "text-emerald-400" : "text-rose-400"}`}>
                                        选项数量：{validation.optionCount ? "配置有效" : `Q${invalidOptionQuestions.slice(0, 5).join("、")} 需检查`}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-3 p-3 rounded-xl border ${validation.endingText ? "bg-emerald-500/10 border-emerald-500/20" : "bg-rose-500/10 border-rose-500/20"}`}>
                                    {validation.endingText ? (
                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-rose-500" />
                                    )}
                                    <span className={`text-sm ${validation.endingText ? "text-emerald-400" : "text-rose-400"}`}>
                                        结束语：{endingTextLength} 字 {validation.endingText ? "" : "(20-1000字)"}
                                    </span>
                                </div>
                                {requiredMissingCount === 0 ? (
                                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                                        问卷结构完整，可进入下一阶段。
                                        {warningCount > 0 ? ` 另有 ${warningCount} 项建议优化。` : ""}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
                                        仍有 {requiredMissingCount} 项必填检测未通过，需修复后才能继续。
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm h-fit">
                            <CardHeader>
                                <CardTitle className="text-slate-100">初步评分（机器评分）</CardTitle>
                                <CardDescription className="text-slate-400">供参考，满分100分</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4 flex items-center justify-between">
                                    <div>
                                        <div className="text-xs uppercase tracking-wider text-indigo-300">当前得分</div>
                                        <div className="text-3xl font-bold text-indigo-200">{preliminaryScore}</div>
                                    </div>
                                    <div className="text-xs text-indigo-300/80">
                                        {preliminaryScore >= 90
                                            ? "问卷结构优秀"
                                            : preliminaryScore >= 75
                                                ? "问卷结构良好"
                                                : preliminaryScore >= 60
                                                    ? "可继续优化"
                                                    : "建议先完善基础项"}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {scoreItems.map((item) => (
                                        <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-200">{item.label}</span>
                                                <span className="text-xs font-mono text-slate-400">{item.points} 分</span>
                                            </div>
                                            <div
                                                className={`text-xs mt-1 ${item.status === "pass"
                                                    ? "text-emerald-400"
                                                    : item.status === "warning"
                                                        ? "text-amber-400"
                                                        : "text-rose-400"
                                                    }`}
                                            >
                                                {item.message}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );
        }
    };

    return (
        <div className="space-y-8 pb-12">
            {networkNotice && (
                <Card
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
                                <AlertCircle className="h-4 w-4 text-amber-400" />
                            ) : isOnline ? (
                                <CheckCircle className="h-4 w-4 text-emerald-400" />
                            ) : (
                                <AlertCircle className="h-4 w-4 text-rose-400" />
                            )}
                            <span
                                className={syncConflictOpen
                                    ? "text-amber-300"
                                    : isOnline
                                        ? "text-emerald-300"
                                        : "text-rose-300"
                                }
                            >
                                {networkNotice}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="rounded-2xl border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/20 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-500 opacity-20"></div>
                <CardContent className="py-3 px-6">
                    <div className="flex flex-col gap-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                                <div className="text-xs text-indigo-400 uppercase tracking-widest font-semibold">问卷设计进度</div>
                                <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-md shadow-indigo-500/30">
                                        {step}
                                    </span>
                                    {steps[step - 1]?.title}
                                </div>
                            </div>
                            <div className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-0.5 text-xs font-semibold text-indigo-400">
                                {Math.round((step / 4) * 100)}% 完成度
                            </div>
                        </div>

                        <div className="relative">
                            <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-0.5 bg-slate-800 -z-10" />
                            <div className="flex items-center justify-between relative">
                                {steps.map((s) => {
                                    const isCompleted = step > s.num;
                                    const isCurrent = step === s.num;

                                    return (
                                        <button
                                            key={s.num}
                                            onClick={() => {
                                                if (s.num <= step) {
                                                    setStep(s.num as 1 | 2 | 3 | 4);
                                                }
                                            }}
                                            disabled={s.num > step}
                                            className="flex flex-col items-center gap-1 group disabled:cursor-not-allowed"
                                        >
                                            <span
                                                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${isCurrent
                                                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/40 scale-110 ring-2 ring-slate-900"
                                                    : isCompleted
                                                        ? "bg-emerald-500 text-white ring-2 ring-slate-900"
                                                        : "bg-slate-800 text-slate-500 border border-slate-700 ring-2 ring-slate-900"
                                                    }`}
                                            >
                                                {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : s.num}
                                            </span>
                                            <span className={`text-[10px] font-medium transition-colors duration-200 ${isCurrent ? "text-indigo-400" : isCompleted ? "text-emerald-500" : "text-slate-500 group-hover:text-slate-400"}`}>
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

            <div className="flex justify-between items-center pt-4 border-t border-slate-800/50">
                <Button
                    variant="outline"
                    onClick={() => step > 1 && setStep((step - 1) as 1 | 2 | 3 | 4)}
                    disabled={step === 1}
                    className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                >
                    上一步
                </Button>
                {lastSavedAt && (
                    <span className="text-xs text-slate-500">已自动保存于 {lastSavedAt}</span>
                )}
                {step < 4 ? (
                    <Button
                        onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
                        disabled={step === 2 && questions.length < 5}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
                    >
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
                        <AlertDialogCancel className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100">取消</AlertDialogCancel>
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
                        <AlertDialogCancel className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100">取消</AlertDialogCancel>
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
                            className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                            onClick={() => {
                                if (draftKey) localStorage.removeItem(draftKey);
                                draftResolvedRef.current = true;
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
                                draftResolvedRef.current = true;
                                setRestoreDraftOpen(false);
                            }}
                        >
                            恢复草稿
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={syncConflictOpen} onOpenChange={setSyncConflictOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">检测到草稿冲突</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400 leading-relaxed">
                            本地草稿和服务器草稿都发生了变化。请选择要保留的版本。
                            <br />
                            <span className="text-slate-500">保留本地版本将覆盖服务器当前草稿。</span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                            onClick={handleKeepServerDraft}
                        >
                            保留服务器版本
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => {
                                void handleKeepLocalDraft();
                            }}
                        >
                            保留本地版本
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default QuestionnaireDesign;

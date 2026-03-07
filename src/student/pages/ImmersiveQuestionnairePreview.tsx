import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    ChevronLeft,
    CheckCircle2,
    Loader2,
    FileText,
    Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RichTextContent } from "@/components/RichTextContent";
import { experimentApi, tasksApi, type ExperimentData, type TaskDetail, type Question } from "../api-client";
import { TopicDeletedState } from "../components/TopicDeletedState";

/* ─── slide direction for transitions ─── */
type SlideDir = "next" | "prev";

/* ─── Individual question card (paper style) ─── */
function ImmersiveQuestion({ question, index, total }: { question: Question; index: number; total: number }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] w-full animate-in fade-in duration-500">
            <div className="w-full max-w-2xl mx-auto">
                {/* Question number badge */}
                <div className="flex items-center gap-3 mb-8">
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-indigo-600 text-white font-bold text-lg shadow-lg shadow-indigo-500/30">
                        {index + 1}
                    </span>
                    <span className="text-sm font-medium text-neutral-400">
                        第 {index + 1} 题 / 共 {total} 题
                    </span>
                </div>

                {/* Question text */}
                <h2 className="text-2xl sm:text-3xl font-bold text-neutral-800 leading-relaxed mb-10">
                    {question.content}
                </h2>

                {/* Question type specific preview */}
                {question.type === "boolean" && (
                    <div className="space-y-3">
                        {["是", "否"].map((label) => (
                            <div
                                key={label}
                                className="flex items-center gap-4 p-4 rounded-xl border-2 border-neutral-200 bg-neutral-50/50 cursor-default transition-all duration-200 hover:border-indigo-300 hover:bg-indigo-50/30"
                            >
                                <div className="w-5 h-5 rounded-full border-2 border-neutral-300 flex-shrink-0" />
                                <span className="text-lg text-neutral-700">{label}</span>
                            </div>
                        ))}
                    </div>
                )}

                {(question.type === "single" || question.type === "multiple") && (
                    <div className="space-y-3">
                        {(question.options ?? []).map((opt, i) => (
                            <div
                                key={`${question.id}-opt-${i}`}
                                className="flex items-center gap-4 p-4 rounded-xl border-2 border-neutral-200 bg-neutral-50/50 cursor-default transition-all duration-200 hover:border-indigo-300 hover:bg-indigo-50/30"
                            >
                                {question.type === "single" ? (
                                    <div className="w-5 h-5 rounded-full border-2 border-neutral-300 flex-shrink-0" />
                                ) : (
                                    <div className="w-5 h-5 rounded-md border-2 border-neutral-300 flex-shrink-0" />
                                )}
                                <span className="text-lg text-neutral-700">{opt}</span>
                            </div>
                        ))}
                    </div>
                )}

                {question.type === "scale" && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm text-neutral-500 mb-2">
                            <span>{question.scaleMinLabel ?? `${question.scaleMin ?? 1}`}</span>
                            <span>{question.scaleMaxLabel ?? `${question.scaleMax ?? 10}`}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
                            {Array.from(
                                { length: (question.scaleMax ?? 10) - (question.scaleMin ?? 1) + 1 },
                                (_, i) => (question.scaleMin ?? 1) + i
                            ).map((val) => (
                                <div
                                    key={val}
                                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl border-2 border-neutral-200 bg-neutral-50/50 flex items-center justify-center text-neutral-600 font-semibold text-sm cursor-default transition-all duration-200 hover:border-indigo-300 hover:bg-indigo-50/30"
                                >
                                    {val}
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-between text-xs text-neutral-400 mt-1">
                            <span>{question.scaleMinLabel || ""}</span>
                            <span>{question.scaleMaxLabel || ""}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Cover page ─── */
function CoverSlide({
    title,
    welcomeText,
    questionCount,
    taskName,
}: {
    title: string;
    welcomeText: string;
    questionCount: number;
    taskName: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] w-full text-center animate-in fade-in duration-700">
            <div className="w-full max-w-2xl mx-auto space-y-8">
                {/* Decorative icon */}
                <div className="flex justify-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30">
                        <FileText className="w-10 h-10 text-white" />
                    </div>
                </div>

                {/* Questionnaire title */}
                <h1 className="text-3xl sm:text-4xl font-bold text-neutral-800 leading-tight">
                    {title || "未命名问卷"}
                </h1>

                {/* Task name */}
                <p className="text-base text-neutral-500">
                    课题：{taskName}
                </p>

                {/* Welcome text */}
                {welcomeText && (
                    <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200/80 text-left">
                        <RichTextContent
                            html={welcomeText}
                            className="text-base text-neutral-600 leading-relaxed [&_p]:mb-2"
                        />
                    </div>
                )}

                {/* Question count badge */}
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-sm font-medium">
                    <Eye className="w-4 h-4" />
                    共 {questionCount} 道题目，请逐题预览
                </div>
            </div>
        </div>
    );
}

/* ─── Ending slide ─── */
function EndingSlide({ endingText }: { endingText: string }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] w-full text-center animate-in fade-in duration-700">
            <div className="w-full max-w-2xl mx-auto space-y-8">
                <div className="flex justify-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
                        <CheckCircle2 className="w-10 h-10 text-white" />
                    </div>
                </div>

                <h2 className="text-3xl font-bold text-neutral-800">
                    问卷结束
                </h2>

                {endingText && (
                    <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200/80 text-left">
                        <RichTextContent
                            html={endingText}
                            className="text-base text-neutral-600 leading-relaxed [&_p]:mb-2"
                        />
                    </div>
                )}

                <p className="text-neutral-500 text-sm">
                    您已浏览完全部题目，请确认问卷内容无误后继续
                </p>
            </div>
        </div>
    );
}

/* ─── Dot nav indicator ─── */
function DotNav({
    total,
    current,
    visited,
    onDotClick,
}: {
    total: number;
    current: number;
    visited: Set<number>;
    onDotClick: (index: number) => void;
}) {
    if (total <= 1) return null;

    // For large questionnaires, collapse the middle dots
    const MAX_VISIBLE = 11;
    const showCollapsed = total > MAX_VISIBLE;

    const visibleIndices: (number | "ellipsis")[] = [];
    if (!showCollapsed) {
        for (let i = 0; i < total; i++) visibleIndices.push(i);
    } else {
        // Always show first, last, and neighbors of current
        const neighborhood = new Set<number>();
        neighborhood.add(0);
        neighborhood.add(total - 1);
        for (let d = -2; d <= 2; d++) {
            const idx = current + d;
            if (idx >= 0 && idx < total) neighborhood.add(idx);
        }
        const sorted = Array.from(neighborhood).sort((a, b) => a - b);
        for (let i = 0; i < sorted.length; i++) {
            const cur = sorted[i];
            const prev = sorted[i - 1];
            if (i > 0 && cur !== undefined && prev !== undefined && cur - prev > 1) {
                visibleIndices.push("ellipsis");
            }
            if (cur !== undefined) visibleIndices.push(cur);
        }
    }

    return (
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {visibleIndices.map((item, i) => {
                if (item === "ellipsis") {
                    return (
                        <span key={`ellipsis-${i}`} className="text-neutral-300 text-xs px-1">
                            ···
                        </span>
                    );
                }
                const idx = item;
                const isCurrent = idx === current;
                const isVisited = visited.has(idx);
                return (
                    <button
                        key={idx}
                        onClick={() => onDotClick(idx)}
                        aria-label={`前往第 ${idx + 1} 页`}
                        className={`transition-all duration-300 rounded-full flex-shrink-0 ${
                            isCurrent
                                ? "w-7 h-2.5 bg-indigo-600 shadow-sm shadow-indigo-500/30"
                                : isVisited
                                    ? "w-2.5 h-2.5 bg-indigo-300 hover:bg-indigo-400 cursor-pointer"
                                    : "w-2.5 h-2.5 bg-neutral-300 hover:bg-neutral-400 cursor-pointer"
                        }`}
                    />
                );
            })}
        </div>
    );
}

/* ═══ Main Component ═══ */
export function ImmersiveQuestionnairePreview() {
    const { taskId } = useParams();
    const navigate = useNavigate();

    const [task, setTask] = useState<TaskDetail | null>(null);
    const [experiment, setExperiment] = useState<ExperimentData | null>(null);
    const [loading, setLoading] = useState(true);
    const [topicDeleted, setTopicDeleted] = useState(false);

    // Slide state
    const [currentSlide, setCurrentSlide] = useState(0);
    const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
    const [slideDir, setSlideDir] = useState<SlideDir>("next");
    const containerRef = useRef<HTMLDivElement>(null);

    // Load data
    useEffect(() => {
        async function loadData() {
            if (!taskId) return;
            setLoading(true);
            setTopicDeleted(false);
            try {
                const [taskRes, expRes] = await Promise.all([
                    tasksApi.get(Number(taskId)),
                    experimentApi.get(Number(taskId)),
                ]);

                if (taskRes.error?.code === "TOPIC_DELETED" || expRes.error?.code === "TOPIC_DELETED") {
                    setTask(null);
                    setExperiment(null);
                    setTopicDeleted(true);
                    return;
                }

                if (taskRes.success && taskRes.data) setTask(taskRes.data);
                if (expRes.success && expRes.data) setExperiment(expRes.data);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [taskId]);

    const questionnaire = experiment?.questionnaire;
    const questions = questionnaire?.questions ?? [];

    /* Build slide list: cover + questions + ending */
    const totalSlides = useMemo(
        () => 1 + questions.length + 1,
        [questions.length],
    );

    const allVisited = visited.size >= totalSlides;

    /* Navigation helpers */
    const goTo = useCallback(
        (index: number, dir?: SlideDir) => {
            const clamped = Math.max(0, Math.min(totalSlides - 1, index));
            setSlideDir(dir ?? (clamped > currentSlide ? "next" : "prev"));
            setCurrentSlide(clamped);
            setVisited((prev) => {
                const next = new Set(prev);
                next.add(clamped);
                return next;
            });
        },
        [totalSlides, currentSlide],
    );

    const goNext = useCallback(() => goTo(currentSlide + 1, "next"), [currentSlide, goTo]);
    const goPrev = useCallback(() => goTo(currentSlide - 1, "prev"), [currentSlide, goTo]);

    /* Keyboard navigation */
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            // Ignore keyboard navigation when focus is on interactive elements
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;

            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                goNext();
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                goPrev();
            }
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [goNext, goPrev]);

    /* Proceed to submission preview */
    const handleProceed = useCallback(() => {
        if (taskId) {
            navigate(`/task/${taskId}/preview`);
        }
    }, [taskId, navigate]);

    /* Go back to experiment */
    const handleBack = useCallback(() => {
        if (taskId) {
            navigate(`/task/${taskId}/experiment`);
        }
    }, [taskId, navigate]);

    /* ─── Loading state ─── */
    if (loading) {
        return (
            <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (topicDeleted) {
        return <TopicDeletedState />;
    }

    if (!task || !experiment || !questionnaire) {
        return (
            <div className="text-center text-neutral-500 mt-20">
                未找到问卷数据
                <Button variant="ghost" className="mt-4 block mx-auto" onClick={handleBack}>
                    返回实验
                </Button>
            </div>
        );
    }

    const progress = ((currentSlide + 1) / totalSlides) * 100;
    const isFirst = currentSlide === 0;
    const isLast = currentSlide === totalSlides - 1;

    /* ─── Render current slide ─── */
    const renderSlide = () => {
        if (currentSlide === 0) {
            return (
                <CoverSlide
                    title={questionnaire.title}
                    welcomeText={questionnaire.welcomeText}
                    questionCount={questions.length}
                    taskName={task.name}
                />
            );
        }
        if (currentSlide === totalSlides - 1) {
            return <EndingSlide endingText={questionnaire.endingText} />;
        }
        const qIndex = currentSlide - 1;
        const question = questions[qIndex];
        if (!question) return null;
        return (
            <ImmersiveQuestion
                question={question}
                index={qIndex}
                total={questions.length}
            />
        );
    };

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-50 bg-white flex flex-col immersive-preview"
        >
            {/* ─ Top bar ─ */}
            <div className="flex-shrink-0 border-b border-neutral-100 bg-white/90 backdrop-blur-sm">
                {/* Progress bar */}
                <Progress value={progress} className="h-1 rounded-none [&>div]:bg-indigo-500 [&>div]:transition-all [&>div]:duration-500" />

                {/* Navigation header */}
                <div className="flex items-center justify-between px-4 sm:px-8 py-3">
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-800 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">返回实验</span>
                    </button>

                    <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                        <Eye className="w-4 h-4 text-indigo-500" />
                        <span>问卷预览</span>
                        <span className="text-neutral-400 font-normal">
                            {currentSlide + 1} / {totalSlides}
                        </span>
                    </div>

                    {/* Proceed button (visible when all visited) */}
                    <div className="min-w-[120px] flex justify-end">
                        {allVisited ? (
                            <Button
                                size="sm"
                                onClick={handleProceed}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 gap-1.5"
                                data-testid="immersive-preview-proceed"
                            >
                                确认无误
                                <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                        ) : (
                            <span className="text-xs text-neutral-400">
                                请浏览全部页面
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ─ Slide area ─ */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
                <div
                    key={currentSlide}
                    className={`immersive-slide ${slideDir === "next" ? "immersive-slide-enter-next" : "immersive-slide-enter-prev"}`}
                >
                    {renderSlide()}
                </div>
            </div>

            {/* ─ Bottom bar ─ */}
            <div className="flex-shrink-0 border-t border-neutral-100 bg-white/90 backdrop-blur-sm px-4 sm:px-8 py-4">
                <div className="max-w-3xl mx-auto space-y-3">
                    {/* Dot navigation */}
                    <DotNav
                        total={totalSlides}
                        current={currentSlide}
                        visited={visited}
                        onDotClick={(idx) => goTo(idx)}
                    />

                    {/* Navigation buttons */}
                    <div className="flex items-center justify-between">
                        <Button
                            variant="ghost"
                            onClick={goPrev}
                            disabled={isFirst}
                            className="gap-2 text-neutral-600 hover:text-neutral-900 disabled:opacity-30"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            上一页
                        </Button>

                        {isLast && allVisited ? (
                            <Button
                                onClick={handleProceed}
                                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 px-8"
                                data-testid="immersive-preview-proceed-bottom"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                确认无误，前往提交
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                onClick={goNext}
                                disabled={isLast}
                                className="gap-2 text-neutral-600 hover:text-neutral-900 disabled:opacity-30"
                            >
                                下一页
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ImmersiveQuestionnairePreview;

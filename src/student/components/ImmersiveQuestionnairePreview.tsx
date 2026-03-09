import { useState, useMemo, useCallback, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Check, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichTextContent } from "@/components/RichTextContent";
import type { Question, QuestionnaireData } from "../api-client";

const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function isQuestionAnswered(question: Question, answer: unknown): boolean {
    if (answer === undefined || answer === null) return false;
    switch (question.type) {
        case "boolean":
        case "single":
            return typeof answer === "string" && answer.trim().length > 0;
        case "multiple": {
            if (!Array.isArray(answer)) return false;
            return answer.length >= (question.minSelect ?? 1);
        }
        case "scale":
            return typeof answer === "number";
        default:
            return false;
    }
}

type PageState =
    | { type: "welcome" }
    | { type: "question"; index: number }
    | { type: "ending" }
    | { type: "complete" };

interface Props {
    questionnaire: QuestionnaireData;
    onComplete: () => void;
    onClose: () => void;
}

export function ImmersiveQuestionnairePreview({ questionnaire, onComplete, onClose }: Props) {
    const { title, welcomeText, endingText, questions } = questionnaire;
    const [page, setPage] = useState<PageState>({ type: "welcome" });
    const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
    const [direction, setDirection] = useState<"forward" | "backward">("forward");

    const totalQuestions = questions.length;
    const estimatedMinutes = Math.max(1, Math.ceil(totalQuestions * 0.4));

    const currentQuestion = page.type === "question" ? questions[page.index] ?? null : null;

    const isCurrentAnswered = useMemo(() => {
        if (!currentQuestion) return false;
        return isQuestionAnswered(currentQuestion, answers[currentQuestion.id]);
    }, [currentQuestion, answers]);

    const answeredCount = useMemo(
        () => questions.filter((q) => isQuestionAnswered(q, answers[q.id])).length,
        [questions, answers],
    );

    const totalPages = totalQuestions + 2;
    const currentPageNum =
        page.type === "welcome" ? 0
            : page.type === "question" ? page.index + 1
                : page.type === "ending" ? totalQuestions + 1
                    : totalPages;
    const progress = page.type === "complete" ? 100 : (currentPageNum / totalPages) * 100;

    const pageKey =
        page.type === "welcome" ? "welcome"
            : page.type === "question" ? `q-${page.index}`
                : page.type === "ending" ? "ending"
                    : "complete";

    const goNext = useCallback(() => {
        setDirection("forward");
        if (page.type === "welcome") {
            setPage({ type: "question", index: 0 });
        } else if (page.type === "question") {
            if (page.index + 1 < totalQuestions) {
                setPage({ type: "question", index: page.index + 1 });
            } else {
                setPage({ type: "ending" });
            }
        } else if (page.type === "ending") {
            setPage({ type: "complete" });
            onComplete();
        } else if (page.type === "complete") {
            onClose();
        }
    }, [page, totalQuestions, onComplete]);

    const goPrev = useCallback(() => {
        setDirection("backward");
        if (page.type === "question") {
            if (page.index > 0) {
                setPage({ type: "question", index: page.index - 1 });
            } else {
                setPage({ type: "welcome" });
            }
        } else if (page.type === "ending") {
            setPage({ type: "question", index: totalQuestions - 1 });
        }
    }, [page, totalQuestions]);

    // Keyboard: Enter advances, Escape closes
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && page.type !== "complete") {
                onClose();
            } else if (e.key === "Enter" && page.type === "question" && isCurrentAnswered) {
                goNext();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose, page, isCurrentAnswered, goNext]);

    // Prevent body scroll while overlay is open
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    const setSingleAnswer = (qId: string, value: string) => {
        setAnswers((prev) => ({ ...prev, [qId]: value }));
    };

    const toggleMultipleAnswer = (question: Question, option: string) => {
        setAnswers((prev) => {
            const current = Array.isArray(prev[question.id]) ? (prev[question.id] as string[]) : [];
            if (current.includes(option)) {
                return { ...prev, [question.id]: current.filter((v) => v !== option) };
            }
            const maxSelect = question.maxSelect ?? question.options?.length ?? 10;
            if (current.length >= maxSelect) return prev;
            return { ...prev, [question.id]: [...current, option] };
        });
    };

    const setScaleAnswer = (qId: string, value: number) => {
        setAnswers((prev) => ({ ...prev, [qId]: value }));
    };

    const questionTypeHint: Record<string, string> = {
        boolean: "请选择一项",
        single: "请选择一项",
        multiple: "可选择多项",
        scale: "请在量表上选择",
    };

    const renderQuestionBody = (question: Question) => {
        const answer = answers[question.id];

        switch (question.type) {
            case "boolean":
                return (
                    <div className="space-y-3">
                        {["是", "否"].map((option, i) => {
                            const selected = answer === option;
                            return (
                                <button
                                    key={option}
                                    onClick={() => setSingleAnswer(question.id, option)}
                                    className={`w-full flex items-center gap-4 p-4 sm:p-5 rounded-xl border-2 transition-all text-left ${
                                        selected
                                            ? "border-indigo-500 bg-indigo-50 shadow-sm"
                                            : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                                    }`}
                                >
                                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                                        selected ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
                                    }`}>
                                        {OPTION_LETTERS[i]}
                                    </span>
                                    <span className={`text-base ${selected ? "text-indigo-700 font-medium" : "text-gray-700"}`}>
                                        {option}
                                    </span>
                                    {selected && <Check className="w-5 h-5 text-indigo-500 ml-auto" />}
                                </button>
                            );
                        })}
                    </div>
                );

            case "single":
                return (
                    <div className="space-y-3">
                        {(question.options ?? []).map((option, i) => {
                            const selected = answer === option;
                            return (
                                <button
                                    key={option}
                                    onClick={() => setSingleAnswer(question.id, option)}
                                    className={`w-full flex items-center gap-4 p-4 sm:p-5 rounded-xl border-2 transition-all text-left ${
                                        selected
                                            ? "border-indigo-500 bg-indigo-50 shadow-sm"
                                            : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                                    }`}
                                >
                                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                                        selected ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
                                    }`}>
                                        {OPTION_LETTERS[i]}
                                    </span>
                                    <span className={`text-base ${selected ? "text-indigo-700 font-medium" : "text-gray-700"}`}>
                                        {option}
                                    </span>
                                    {selected && <Check className="w-5 h-5 text-indigo-500 ml-auto" />}
                                </button>
                            );
                        })}
                    </div>
                );

            case "multiple": {
                const selectedArr = Array.isArray(answer) ? answer : [];
                const maxSelect = question.maxSelect ?? question.options?.length ?? 10;
                return (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-400">
                            请选择 {question.minSelect ?? 1} ~ {maxSelect} 项
                        </p>
                        {(question.options ?? []).map((option, i) => {
                            const selected = selectedArr.includes(option);
                            const disabled = !selected && selectedArr.length >= maxSelect;
                            return (
                                <button
                                    key={option}
                                    onClick={() => !disabled && toggleMultipleAnswer(question, option)}
                                    disabled={disabled}
                                    className={`w-full flex items-center gap-4 p-4 sm:p-5 rounded-xl border-2 transition-all text-left ${
                                        selected
                                            ? "border-indigo-500 bg-indigo-50 shadow-sm"
                                            : disabled
                                                ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                                                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                                    }`}
                                >
                                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                                        selected ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500"
                                    }`}>
                                        {selected ? <Check className="w-4 h-4" /> : OPTION_LETTERS[i]}
                                    </span>
                                    <span className={`text-base ${selected ? "text-indigo-700 font-medium" : "text-gray-700"}`}>
                                        {option}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                );
            }

            case "scale": {
                const min = question.scaleMin ?? 1;
                const max = question.scaleMax ?? 10;
                const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
                return (
                    <div className="space-y-4">
                        <div className="flex justify-between text-sm text-gray-400">
                            <span>{question.scaleMinLabel || "最低"}</span>
                            <span>{question.scaleMaxLabel || "最高"}</span>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                            {values.map((val) => {
                                const selected = answer === val;
                                return (
                                    <button
                                        key={val}
                                        onClick={() => setScaleAnswer(question.id, val)}
                                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl text-base font-bold transition-all ${
                                            selected
                                                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 scale-110"
                                                : "bg-white border-2 border-gray-200 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50"
                                        }`}
                                    >
                                        {val}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            }
        }
    };

    const animationClass = direction === "forward"
        ? "animate-in fade-in slide-in-from-right-4 duration-300"
        : "animate-in fade-in slide-in-from-left-4 duration-300";

    return (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-50 dark:from-slate-950 via-white dark:via-slate-900 to-indigo-50/40 dark:to-indigo-950/40" data-testid="immersive-questionnaire-preview">
            {/* Progress bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gray-100 z-10">
                <div
                    className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 sm:px-6 pt-4 z-10">
                <div className="text-sm font-medium text-gray-400">
                    {page.type === "question" && `${page.index + 1} / ${totalQuestions}`}
                </div>
                {page.type !== "complete" && (
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        aria-label="关闭预览"
                        data-testid="immersive-preview-close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="h-full flex flex-col items-center justify-center overflow-y-auto px-4 sm:px-6 pt-14 pb-28">
                <div key={pageKey} className={`w-full max-w-lg ${animationClass}`}>
                    {/* Welcome Page */}
                    {page.type === "welcome" && (
                        <div className="text-center space-y-8">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-600 text-sm font-medium">
                                <ClipboardList className="w-4 h-4" />
                                模拟填写体验
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
                                {title || "未命名问卷"}
                            </h1>
                            <div className="text-left mx-auto max-w-md bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                                <RichTextContent
                                    html={welcomeText}
                                    className="text-gray-600 leading-relaxed text-sm [&_*]:!text-gray-600"
                                    emptyFallback="欢迎语将在这里展示"
                                />
                            </div>
                            <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
                                <span>共 {totalQuestions} 题</span>
                                <span className="w-1 h-1 rounded-full bg-gray-300" />
                                <span>约 {estimatedMinutes} 分钟</span>
                            </div>
                            <Button
                                onClick={goNext}
                                size="lg"
                                data-testid="immersive-preview-start"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-base px-10 py-6 rounded-xl shadow-lg shadow-indigo-500/20"
                            >
                                开始填写
                                <ChevronRight className="w-5 h-5 ml-2" />
                            </Button>
                        </div>
                    )}

                    {/* Question Page */}
                    {page.type === "question" && currentQuestion && (
                        <div className="space-y-8">
                            <div>
                                <p className="text-sm text-gray-400 font-medium mb-3">
                                    {questionTypeHint[currentQuestion.type]}
                                </p>
                                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 leading-snug">
                                    {currentQuestion.content}
                                </h2>
                            </div>
                            {renderQuestionBody(currentQuestion)}
                            {isCurrentAnswered && (
                                <p className="text-xs text-gray-400 text-center animate-in fade-in duration-300">
                                    按 Enter 继续 →
                                </p>
                            )}
                        </div>
                    )}

                    {/* Ending Page */}
                    {page.type === "ending" && (
                        <div className="text-center space-y-8">
                            <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 flex items-center justify-center">
                                <ClipboardList className="w-8 h-8 text-indigo-500" />
                            </div>
                            <div className="text-left mx-auto max-w-md bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                                <RichTextContent
                                    html={endingText}
                                    className="text-gray-600 leading-relaxed text-sm [&_*]:!text-gray-600"
                                    emptyFallback="结束语将在这里展示"
                                />
                            </div>
                            <div className="text-sm text-gray-400">
                                已回答 {answeredCount} / {totalQuestions} 道题目
                            </div>
                            <Button
                                onClick={goNext}
                                size="lg"
                                data-testid="immersive-preview-submit"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-base px-10 py-6 rounded-xl shadow-lg shadow-indigo-500/20"
                            >
                                提交问卷
                            </Button>
                        </div>
                    )}

                    {/* Complete Page */}
                    {page.type === "complete" && (
                        <div className="text-center space-y-8">
                            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-50 flex items-center justify-center animate-in zoom-in duration-500">
                                <Check className="w-10 h-10 text-emerald-500" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-2xl font-bold text-gray-900">模拟填写完成！</h2>
                                <p className="text-gray-500">您已成功模拟了受访者的问卷填写体验</p>
                            </div>
                            <div className="flex justify-center gap-4">
                                <div className="px-6 py-4 bg-gray-50 rounded-2xl">
                                    <div className="text-2xl font-bold text-indigo-600">{totalQuestions}</div>
                                    <div className="text-xs text-gray-500 mt-1">题目总数</div>
                                </div>
                                <div className="px-6 py-4 bg-gray-50 rounded-2xl">
                                    <div className="text-2xl font-bold text-emerald-600">{answeredCount}</div>
                                    <div className="text-xs text-gray-500 mt-1">已回答</div>
                                </div>
                            </div>
                            <Button
                                onClick={onClose}
                                size="lg"
                                data-testid="immersive-preview-return"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-base px-10 py-6 rounded-xl shadow-lg shadow-indigo-500/20"
                            >
                                返回问卷设计
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation footer for question pages */}
            {page.type === "question" && (
                <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-gray-100 px-4 sm:px-6 py-4 z-10">
                    <div className="max-w-lg mx-auto flex items-center justify-between">
                        <Button
                            variant="ghost"
                            onClick={goPrev}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            上一题
                        </Button>
                        {totalQuestions <= 15 ? (
                            <div className="flex gap-1">
                                {questions.map((q, i) => (
                                    <div
                                        key={q.id}
                                        className={`h-1.5 rounded-full transition-all ${
                                            i === page.index
                                                ? "bg-indigo-500 w-4"
                                                : isQuestionAnswered(q, answers[q.id])
                                                    ? "bg-indigo-300 w-1.5"
                                                    : "bg-gray-200 w-1.5"
                                        }`}
                                    />
                                ))}
                            </div>
                        ) : (
                            <span className="text-sm text-gray-400 font-mono tabular-nums">
                                {page.index + 1} / {totalQuestions}
                            </span>
                        )}
                        <Button
                            onClick={goNext}
                            disabled={!isCurrentAnswered}
                            data-testid="immersive-preview-next"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40"
                        >
                            {page.index + 1 === totalQuestions ? "完成" : "下一题"}
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Navigation footer for ending page */}
            {page.type === "ending" && (
                <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-gray-100 px-4 sm:px-6 py-4 z-10">
                    <div className="max-w-lg mx-auto flex items-center justify-start">
                        <Button
                            variant="ghost"
                            onClick={goPrev}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            返回上一题
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

import { useState, useMemo, useCallback, useEffect, useRef, useId } from "react";
import { X, ChevronLeft, ChevronRight, Check, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { RichTextContent } from "@/components/RichTextContent";
import type { Question, QuestionnaireData } from "../api-client";

const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 与 focusTrap / 切页聚焦逻辑共用，避免选择器漂移 */
const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type AnswerValue = string | string[] | number;

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

function hasDuplicateQuestionIds(list: Question[]): boolean {
    const seen = new Set<string>();
    for (const q of list) {
        if (seen.has(q.id)) return true;
        seen.add(q.id);
    }
    return false;
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
    /** 按下标存答案，避免题目 id 重复时答案串题 */
    const [answersByIndex, setAnswersByIndex] = useState<Record<number, AnswerValue>>({});
    const [direction, setDirection] = useState<"forward" | "backward">("forward");
    const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

    const overlayRef = useRef<HTMLDivElement>(null);
    const pageBeforeEffectRef = useRef<PageState>({ type: "welcome" });
    const titleId = useId();

    const totalQuestions = questions.length;
    const estimatedMinutes = Math.max(1, Math.ceil(totalQuestions * 0.4));
    const duplicateIds = useMemo(() => hasDuplicateQuestionIds(questions), [questions]);

    const currentQuestion = page.type === "question" ? questions[page.index] ?? null : null;

    const isCurrentAnswered = useMemo(() => {
        if (page.type !== "question") return false;
        const q = questions[page.index];
        if (!q) return false;
        return isQuestionAnswered(q, answersByIndex[page.index]);
    }, [page, questions, answersByIndex]);

    const answeredCount = useMemo(
        () => questions.filter((q, i) => isQuestionAnswered(q, answersByIndex[i])).length,
        [questions, answersByIndex],
    );

    const hasProgress = useMemo(() => {
        if (page.type !== "welcome") return true;
        return Object.keys(answersByIndex).length > 0;
    }, [page.type, answersByIndex]);

    const totalPages = Math.max(totalQuestions + 2, 2);
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
        setPage((prev) => {
            if (prev.type === "welcome") {
                if (totalQuestions === 0) return { type: "ending" };
                return { type: "question", index: 0 };
            }
            if (prev.type === "question") {
                if (prev.index + 1 < totalQuestions) {
                    return { type: "question", index: prev.index + 1 };
                }
                return { type: "ending" };
            }
            if (prev.type === "ending") {
                return { type: "complete" };
            }
            return prev;
        });
    }, [totalQuestions]);

    const goPrev = useCallback(() => {
        setDirection("backward");
        setPage((prev) => {
            if (prev.type === "question") {
                if (prev.index > 0) {
                    return { type: "question", index: prev.index - 1 };
                }
                return { type: "welcome" };
            }
            if (prev.type === "ending") {
                if (totalQuestions === 0) {
                    return { type: "welcome" };
                }
                return { type: "question", index: totalQuestions - 1 };
            }
            return prev;
        });
    }, [totalQuestions]);

    // 从结束语提交进入完成页时通知父组件（避免在 setState updater 里调副作用，也避免 goNext 闭包读到陈旧 page）
    useEffect(() => {
        const prev = pageBeforeEffectRef.current;
        pageBeforeEffectRef.current = page;
        if (prev.type === "ending" && page.type === "complete") {
            onComplete();
        }
    }, [page, onComplete]);

    const requestClose = useCallback(() => {
        if (page.type === "complete") {
            onClose();
            return;
        }
        if (hasProgress) {
            setExitConfirmOpen(true);
        } else {
            onClose();
        }
    }, [hasProgress, page.type, onClose]);

    const confirmExit = useCallback(() => {
        setExitConfirmOpen(false);
        onClose();
    }, [onClose]);

    // 题目列表变化时校正当前题号，避免越界
    useEffect(() => {
        if (page.type !== "question") return;
        if (totalQuestions === 0) {
            setPage({ type: "welcome" });
            return;
        }
        if (page.index >= totalQuestions) {
            setPage({ type: "question", index: totalQuestions - 1 });
        }
    }, [totalQuestions, page]);

    // 切页后将焦点移入对话框容器本身，避免空格误触发首个可点击控件
    useEffect(() => {
        if (exitConfirmOpen) return;
        const root = overlayRef.current;
        if (!root) return;
        const t = window.setTimeout(() => {
            root.focus();
        }, 0);
        return () => window.clearTimeout(t);
    }, [pageKey, exitConfirmOpen]);

    // Escape：有进度则确认关闭
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (exitConfirmOpen) return;
            if (page.type === "complete") return;
            e.preventDefault();
            requestClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [exitConfirmOpen, page.type, requestClose]);

    // Prevent body scroll while overlay is open
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    const focusTrap = useCallback((e: React.KeyboardEvent) => {
        if (exitConfirmOpen) return;
        if (e.key !== "Tab" || !overlayRef.current) return;
        const root = overlayRef.current;
        const focusables = Array.from(
            root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((el) => !el.hasAttribute("data-focus-trap-ignore") && el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (document.activeElement === root) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
            return;
        }
        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }, [exitConfirmOpen]);

    const setSingleAnswer = useCallback((qIndex: number, value: string) => {
        setAnswersByIndex((prev) => ({ ...prev, [qIndex]: value }));
        goNext();
    }, [goNext]);

    const toggleMultipleAnswer = (qIndex: number, question: Question, option: string) => {
        setAnswersByIndex((prev) => {
            const current = Array.isArray(prev[qIndex]) ? (prev[qIndex] as string[]) : [];
            if (current.includes(option)) {
                return { ...prev, [qIndex]: current.filter((v) => v !== option) };
            }
            const maxSelect = question.maxSelect ?? question.options?.length ?? 10;
            if (current.length >= maxSelect) return prev;
            return { ...prev, [qIndex]: [...current, option] };
        });
    };

    const setScaleAnswer = useCallback((qIndex: number, value: number) => {
        setAnswersByIndex((prev) => ({ ...prev, [qIndex]: value }));
        goNext();
    }, [goNext]);

    const jumpToQuestion = (index: number) => {
        if (index < 0 || index >= totalQuestions) return;
        setDirection(index > (page.type === "question" ? page.index : 0) ? "forward" : "backward");
        setPage({ type: "question", index });
    };

    const questionTypeHint: Record<string, string> = {
        boolean: "请选择一项",
        single: "请选择一项",
        multiple: "可选择多项",
        scale: "请在量表上选择",
    };

    const cardClass =
        "text-left mx-auto max-w-md rounded-2xl border p-5 shadow-sm bg-white border-gray-100 dark:bg-slate-900 dark:border-slate-800";

    const renderQuestionBody = (question: Question, qIndex: number) => {
        const answer = answersByIndex[qIndex];

        switch (question.type) {
            case "boolean":
                return (
                    <div className="space-y-3">
                        {["是", "否"].map((option, i) => {
                            const selected = answer === option;
                            return (
                                <button
                                    key={`bool-${i}`}
                                    type="button"
                                    onClick={() => setSingleAnswer(qIndex, option)}
                                    className={`w-full flex items-center gap-4 p-4 sm:p-5 rounded-xl border-2 transition-all text-left ${
                                        selected
                                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 shadow-sm"
                                            : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                                    }`}
                                >
                                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                                        selected ? "bg-indigo-500 text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-500"
                                    }`}>
                                        {OPTION_LETTERS[i]}
                                    </span>
                                    <span className={`text-base ${selected ? "text-indigo-700 dark:text-indigo-300 font-medium" : "text-gray-700 dark:text-slate-200"}`}>
                                        {option}
                                    </span>
                                    {selected && <Check className="w-5 h-5 text-indigo-500 ml-auto" />}
                                </button>
                            );
                        })}
                    </div>
                );

            case "single": {
                const opts = question.options ?? [];
                if (opts.length === 0) {
                    return (
                        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                            <p className="text-sm text-amber-800 dark:text-amber-200">本题暂无选项，无法作答。</p>
                            <Button type="button" variant="outline" onClick={goNext} className="w-full">
                                跳过本题
                            </Button>
                        </div>
                    );
                }
                return (
                    <div className="space-y-3">
                        {opts.map((option, i) => {
                            const selected = answer === option;
                            return (
                                <button
                                    key={`${question.id}-opt-${i}`}
                                    type="button"
                                    onClick={() => setSingleAnswer(qIndex, option)}
                                    className={`w-full flex items-center gap-4 p-4 sm:p-5 rounded-xl border-2 transition-all text-left ${
                                        selected
                                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 shadow-sm"
                                            : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                                    }`}
                                >
                                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                                        selected ? "bg-indigo-500 text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-500"
                                    }`}>
                                        {OPTION_LETTERS[i]}
                                    </span>
                                    <span className={`text-base ${selected ? "text-indigo-700 dark:text-indigo-300 font-medium" : "text-gray-700 dark:text-slate-200"}`}>
                                        {option}
                                    </span>
                                    {selected && <Check className="w-5 h-5 text-indigo-500 ml-auto" />}
                                </button>
                            );
                        })}
                    </div>
                );
            }

            case "multiple": {
                const selectedArr = Array.isArray(answer) ? answer : [];
                const maxSelect = question.maxSelect ?? question.options?.length ?? 10;
                const opts = question.options ?? [];
                if (opts.length === 0) {
                    return (
                        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                            <p className="text-sm text-amber-800 dark:text-amber-200">本题暂无选项，无法作答。</p>
                            <Button type="button" variant="outline" onClick={goNext} className="w-full">
                                跳过本题
                            </Button>
                        </div>
                    );
                }
                return (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-400 dark:text-slate-500">
                            请选择 {question.minSelect ?? 1} ~ {maxSelect} 项
                        </p>
                        {opts.map((option, i) => {
                            const selected = selectedArr.includes(option);
                            const disabled = !selected && selectedArr.length >= maxSelect;
                            return (
                                <button
                                    key={`${question.id}-mopt-${i}`}
                                    type="button"
                                    onClick={() => !disabled && toggleMultipleAnswer(qIndex, question, option)}
                                    disabled={disabled}
                                    className={`w-full flex items-center gap-4 p-4 sm:p-5 rounded-xl border-2 transition-all text-left ${
                                        selected
                                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 shadow-sm"
                                            : disabled
                                                ? "border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 opacity-50 cursor-not-allowed"
                                                : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                                    }`}
                                >
                                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                                        selected ? "bg-indigo-500 text-white" : "bg-gray-100 dark:bg-slate-800 text-gray-500"
                                    }`}>
                                        {selected ? <Check className="w-4 h-4" /> : OPTION_LETTERS[i]}
                                    </span>
                                    <span className={`text-base ${selected ? "text-indigo-700 dark:text-indigo-300 font-medium" : "text-gray-700 dark:text-slate-200"}`}>
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
                if (min >= max || min < 1 || max > 10) {
                    return (
                        <div className="space-y-4 rounded-xl border border-rose-200 bg-rose-50/80 p-4 dark:border-rose-900 dark:bg-rose-950/30">
                            <p className="text-sm text-rose-800 dark:text-rose-200">本题量表范围无效，无法作答。</p>
                            <Button type="button" variant="outline" onClick={goNext} className="w-full">
                                跳过本题
                            </Button>
                        </div>
                    );
                }
                const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
                return (
                    <div className="space-y-4">
                        <div className="flex justify-between text-sm text-gray-400 dark:text-slate-500">
                            <span>{question.scaleMinLabel || "最低"}</span>
                            <span>{question.scaleMaxLabel || "最高"}</span>
                        </div>
                        <div className="flex w-full gap-2">
                            {values.map((val) => {
                                const selected = answer === val;
                                return (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => setScaleAnswer(qIndex, val)}
                                        className={`h-11 min-w-0 flex-1 basis-0 rounded-xl text-base font-bold transition-all sm:h-12 ${
                                            selected
                                                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 ring-2 ring-indigo-400 ring-offset-2 dark:ring-offset-slate-950 z-10"
                                                : "bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
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

            default:
                return (
                    <div className="space-y-4 rounded-xl border border-rose-200 bg-rose-50/80 p-4 dark:border-rose-900 dark:bg-rose-950/30">
                        <p className="text-sm text-rose-800 dark:text-rose-200">
                            不支持题型「{String((question as Question).type)}」，请返回修改问卷。
                        </p>
                        <Button type="button" variant="outline" onClick={goNext} className="w-full">
                            跳过本题
                        </Button>
                    </div>
                );
        }
    };

    const animationClass = direction === "forward"
        ? "animate-in fade-in slide-in-from-right-4 duration-300"
        : "animate-in fade-in slide-in-from-left-4 duration-300";

    return (
        <>
            <div
                ref={overlayRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                data-testid="immersive-questionnaire-preview"
                className="fixed inset-0 z-50 bg-gradient-to-br from-slate-50 dark:from-slate-950 via-white dark:via-slate-900 to-indigo-50/40 dark:to-indigo-950/40 outline-none"
                onKeyDown={focusTrap}
                tabIndex={-1}
            >
                {duplicateIds && (
                    <div className="absolute top-12 left-0 right-0 z-20 px-4 sm:px-6">
                        <div className="mx-auto max-w-lg rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-100">
                            检测到题目 ID 重复，预览按题序区分答案；提交至服务器时仍依赖唯一 ID，请在设计器中修正。
                        </div>
                    </div>
                )}

                {/* Progress bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gray-100 dark:bg-slate-800 z-10">
                    <div
                        className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Header */}
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 sm:px-6 pt-4 z-10">
                    <div className="text-sm font-medium text-gray-400 dark:text-slate-500">
                        {page.type === "question" && totalQuestions > 0 && `${page.index + 1} / ${totalQuestions}`}
                    </div>
                    {page.type !== "complete" && (
                        <button
                            type="button"
                            onClick={requestClose}
                            className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                            aria-label="关闭预览"
                            data-testid="immersive-preview-close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="h-full flex flex-col items-center justify-center overflow-y-auto px-4 sm:px-6 pt-14 pb-20">
                    <div key={pageKey} className={`w-full max-w-lg ${animationClass}`}>
                        {/* Welcome Page */}
                        {page.type === "welcome" && (
                            <div className="text-center space-y-8">
                                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 text-sm font-medium">
                                    <ClipboardList className="w-4 h-4" />
                                    模拟填写体验
                                </div>
                                <h1 id={titleId} className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-100 leading-tight">
                                    {title || "未命名问卷"}
                                </h1>
                                <div className={`${cardClass}`}>
                                    <RichTextContent
                                        html={welcomeText}
                                        className="text-gray-600 dark:text-slate-300 leading-relaxed text-sm [&_h2]:!text-gray-900 dark:[&_h2]:!text-slate-100 [&_h3]:!text-gray-900 dark:[&_h3]:!text-slate-100 [&_h4]:!text-gray-900 dark:[&_h4]:!text-slate-100"
                                        emptyFallback="欢迎语将在这里展示"
                                    />
                                </div>
                                <div className="flex items-center justify-center gap-4 text-sm text-gray-400 dark:text-slate-500">
                                    <span>共 {totalQuestions} 题</span>
                                    <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
                                    <span>约 {estimatedMinutes} 分钟</span>
                                </div>
                                {totalQuestions === 0 ? (
                                    <p className="text-sm text-amber-700 dark:text-amber-300">
                                        当前没有题目，将直接进入结束语页；也可关闭预览返回编辑。
                                    </p>
                                ) : null}
                                <Button
                                    type="button"
                                    onClick={goNext}
                                    size="lg"
                                    data-testid="immersive-preview-start"
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-base px-10 py-6 rounded-xl shadow-lg shadow-indigo-500/20"
                                >
                                    {totalQuestions === 0 ? "继续" : "开始填写"}
                                    <ChevronRight className="w-5 h-5 ml-2" />
                                </Button>
                            </div>
                        )}

                        {/* Question Page */}
                        {page.type === "question" && currentQuestion && (
                            <div className="space-y-8">
                                <div>
                                    <p className="text-sm text-gray-400 dark:text-slate-500 font-medium mb-3">
                                        {questionTypeHint[currentQuestion.type] ?? "题目"}
                                    </p>
                                    <h2 id={titleId} className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-slate-100 leading-snug">
                                        {currentQuestion.content}
                                    </h2>
                                </div>
                                {renderQuestionBody(currentQuestion, page.index)}
                                {currentQuestion.type === "multiple" && (
                                    <div className="space-y-3 pt-2">
                                        <p className="text-sm text-center text-gray-500 dark:text-slate-400 leading-relaxed">
                                            {isCurrentAnswered
                                                ? "选择已完成，请点击下方按钮进入下一题"
                                                : `请至少选择 ${currentQuestion.minSelect ?? 1} 项，完成后点击「下一题」继续`}
                                        </p>
                                        <div className="flex justify-center">
                                            <Button
                                                type="button"
                                                onClick={goNext}
                                                disabled={!isCurrentAnswered}
                                                size="lg"
                                                data-testid="immersive-preview-multiple-next"
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-base px-8 rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:shadow-none"
                                            >
                                                下一题
                                                <ChevronRight className="w-5 h-5 ml-2" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {page.type === "question" && !currentQuestion && totalQuestions > 0 && (
                            <div className="text-center space-y-4 text-rose-600 dark:text-rose-400 text-sm">
                                <p>题目加载异常，请关闭预览后重试。</p>
                                <Button type="button" variant="outline" onClick={requestClose}>
                                    关闭
                                </Button>
                            </div>
                        )}

                        {/* Ending Page */}
                        {page.type === "ending" && (
                            <div className="text-center space-y-8">
                                <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
                                    <ClipboardList className="w-8 h-8 text-indigo-500" />
                                </div>
                                <div className={`${cardClass}`}>
                                    <RichTextContent
                                        html={endingText}
                                        className="text-gray-600 dark:text-slate-300 leading-relaxed text-sm [&_h2]:!text-gray-900 dark:[&_h2]:!text-slate-100 [&_h3]:!text-gray-900 dark:[&_h3]:!text-slate-100 [&_h4]:!text-gray-900 dark:[&_h4]:!text-slate-100"
                                        emptyFallback="结束语将在这里展示"
                                    />
                                </div>
                                <div className="text-sm text-gray-400 dark:text-slate-500">
                                    {totalQuestions === 0
                                        ? "暂无题目"
                                        : `已回答 ${answeredCount} / ${totalQuestions} 道题目`}
                                </div>
                                <Button
                                    type="button"
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
                                <div className="w-20 h-20 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center animate-in zoom-in duration-500">
                                    <Check className="w-10 h-10 text-emerald-500" />
                                </div>
                                <div className="space-y-2">
                                    <h2 id={titleId} className="text-2xl font-bold text-gray-900 dark:text-slate-100">模拟填写完成！</h2>
                                    <p className="text-gray-500 dark:text-slate-400">您已成功模拟了受访者的问卷填写体验</p>
                                </div>
                                <div className="flex justify-center gap-4">
                                    <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/80 rounded-2xl">
                                        <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{totalQuestions}</div>
                                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">题目总数</div>
                                    </div>
                                    <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/80 rounded-2xl">
                                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{answeredCount}</div>
                                        <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">已回答</div>
                                    </div>
                                </div>
                                <Button
                                    type="button"
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

                {/* Side navigation buttons for question pages */}
                {page.type === "question" && totalQuestions > 0 && (
                    <>
                        <button
                            type="button"
                            onClick={goPrev}
                            className="fixed top-1/2 -translate-y-1/2 left-[max(0.75rem,calc(50%-21rem))] z-10 w-11 h-11 sm:w-12 sm:h-12 rounded-full border border-gray-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm shadow-sm flex items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-300 transition-colors"
                            aria-label="上一题"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="fixed bottom-4 left-0 right-0 flex justify-center z-10">
                            {totalQuestions <= 15 ? (
                                <div
                                    className="flex gap-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-full px-3 py-2 shadow-sm border border-gray-100 dark:border-slate-800"
                                    role="tablist"
                                    aria-label="题目进度，可点击跳转"
                                >
                                    {questions.map((q, i) => (
                                        <button
                                            key={`progress-${i}`}
                                            type="button"
                                            onClick={() => jumpToQuestion(i)}
                                            title={`第 ${i + 1} 题`}
                                            className={`h-1.5 rounded-full transition-all min-w-[6px] ${
                                                i === page.index
                                                    ? "bg-indigo-500 w-4"
                                                    : isQuestionAnswered(q, answersByIndex[i])
                                                        ? "bg-indigo-300 dark:bg-indigo-600 w-1.5"
                                                        : "bg-gray-200 dark:bg-slate-600 w-1.5"
                                            }`}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <span className="text-sm text-gray-400 dark:text-slate-500 font-mono tabular-nums bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm border border-gray-100 dark:border-slate-800">
                                    {page.index + 1} / {totalQuestions}
                                </span>
                            )}
                        </div>
                    </>
                )}

                {page.type === "ending" && (
                    <button
                        type="button"
                        onClick={goPrev}
                        className="fixed top-1/2 -translate-y-1/2 left-[max(0.75rem,calc(50%-21rem))] z-10 w-11 h-11 sm:w-12 sm:h-12 rounded-full border border-gray-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm shadow-sm flex items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-300 transition-colors"
                        aria-label="返回上一题"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                )}
            </div>

            <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
                <AlertDialogContent className="z-[60]">
                    <AlertDialogHeader>
                        <AlertDialogTitle>退出模拟填写？</AlertDialogTitle>
                        <AlertDialogDescription>
                            当前进度将不会保存。确定要关闭预览吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel type="button">取消</AlertDialogCancel>
                        <AlertDialogAction type="button" onClick={confirmExit} className="bg-rose-600 hover:bg-rose-700">
                            确定退出
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

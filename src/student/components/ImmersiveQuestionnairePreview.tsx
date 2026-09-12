import { useState, useMemo, useCallback, useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
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
import type { Question, QuestionnaireData } from "@/lib/questionnaire-types";
import { QUESTION_SECTION_LABELS } from "@/lib/questionnaire-templates";

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
    const [pendingAutoAdvance, setPendingAutoAdvance] = useState<number | null>(null);
    const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

    const overlayRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
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
        setPendingAutoAdvance(null);
        setPage((prev) => {
            // 同一页的连点或自动推进与手动推进相遇时，只前进一次。
            if (prev !== page) return prev;
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
                if (answeredCount !== totalQuestions) return prev;
                return { type: "complete" };
            }
            return prev;
        });
    }, [answeredCount, totalQuestions, page]);

    const goPrev = useCallback(() => {
        setPendingAutoAdvance(null);
        setPage((prev) => {
            if (prev !== page) return prev;
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
    }, [totalQuestions, page]);

    // 留出短暂的选中反馈；修改选择时重新计时，导航、退出和卸载均取消推进。
    useEffect(() => {
        if (exitConfirmOpen || page.type !== "question" || pendingAutoAdvance !== page.index || !isCurrentAnswered) return;
        const timer = window.setTimeout(goNext, 300);
        return () => window.clearTimeout(timer);
    }, [answersByIndex, exitConfirmOpen, goNext, isCurrentAnswered, page, pendingAutoAdvance, questions]);

    useEffect(() => { setPendingAutoAdvance(null); }, [questions]);

    // 从结束语提交进入完成页时通知父组件（避免在 setState updater 里调副作用，也避免 goNext 闭包读到陈旧 page）
    useEffect(() => {
        const prev = pageBeforeEffectRef.current;
        pageBeforeEffectRef.current = page;
        if (prev.type === "ending" && page.type === "complete") {
            onComplete();
        }
    }, [page, onComplete]);

    const requestClose = useCallback(() => {
        setPendingAutoAdvance(null);
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
            if (contentRef.current) contentRef.current.scrollTop = 0;
            root.focus();
        }, 0);
        return () => window.clearTimeout(t);
    }, [pageKey, exitConfirmOpen]);

    // Escape：有进度则确认关闭
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
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
        const previous = document.body.style.overflow;
        const opener = document.activeElement;
        const background = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlayRef.current && !element.contains(overlayRef.current)).map(element => ({ element, inert: element.inert }));
        background.forEach(({ element }) => { element.inert = true; });
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
            background.forEach(({ element, inert }) => { element.inert = inert; });
            if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        };
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
            const firstAnswer = root.querySelector<HTMLElement>('[data-preview-answer]:not([disabled])');
            (e.shiftKey ? last : firstAnswer ?? first).focus();
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

    const setChoiceAnswer = useCallback((qIndex: number, value: string | number) => {
        const question = questions[qIndex];
        if (!question) return;
        // 返回已答题时停留在原题，便于核对和修改。
        if (!isQuestionAnswered(question, answersByIndex[qIndex]) || pendingAutoAdvance === qIndex) {
            setPendingAutoAdvance(qIndex);
        }
        setAnswersByIndex((prev) => ({ ...prev, [qIndex]: value }));
    }, [answersByIndex, pendingAutoAdvance, questions]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        focusTrap(e);
        if (e.defaultPrevented || exitConfirmOpen || page.type !== "question" || e.key !== "Enter" || e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.repeat) { e.preventDefault(); return; }
        const target = e.target instanceof HTMLElement ? e.target : null;
        // 不抢占未选选项、链接、题号或关闭按钮的原生键盘操作。
        if (isCurrentAnswered && (target === overlayRef.current || target?.closest('[data-preview-answer][aria-pressed="true"]'))) {
            e.preventDefault();
            goNext();
        }
    };

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

    const jumpToQuestion = (index: number) => {
        if (index < 0 || index >= totalQuestions) return;
        setPendingAutoAdvance(null);
        setPage({ type: "question", index });
    };

    const questionTypeHint: Record<string, string> = {
        boolean: "请选择一项",
        single: "请选择一项",
        multiple: "可选择多项",
        scale: "请在量表上选择",
    };

    const cardClass =
        "text-left mx-auto max-w-md rounded-surface border p-5 bg-background border-input";

    const renderQuestionBody = (question: Question, qIndex: number) => {
        const answer = answersByIndex[qIndex];

        switch (question.type) {
            case "boolean":
            case "single":
            case "multiple": {
                const opts = question.type === "boolean" ? ["是", "否"] : question.options ?? [];
                const multiple = question.type === "multiple";
                const selectedArr = Array.isArray(answer) ? answer : [];
                const maxSelect = question.maxSelect ?? opts.length;
                if (opts.length === 0) {
                    return (
                        <div className="space-y-4 rounded-surface border border-warning-border bg-warning-muted p-4">
                            <p className="text-label text-warning">本题暂无选项，无法作答。</p>
                            <Button type="button" variant="outline" onClick={goNext} className="w-full">跳过本题</Button>
                        </div>
                    );
                }
                return (
                    <div className="grid grid-cols-2 gap-3">
                        {multiple && <p className="col-span-2 text-label text-muted-foreground">请选择 {question.minSelect ?? 1} ~ {maxSelect} 项</p>}
                        {opts.map((option, i) => {
                            const selected = multiple ? selectedArr.includes(option) : answer === option;
                            const disabled = multiple && !selected && selectedArr.length >= maxSelect;
                            return (
                                <button
                                    key={`${question.id}-opt-${i}`}
                                    type="button"
                                    data-preview-answer
                                    onClick={() => multiple ? toggleMultipleAnswer(qIndex, question, option) : setChoiceAnswer(qIndex, option)}
                                    disabled={disabled}
                                    aria-pressed={selected}
                                    className={`flex min-w-0 items-center gap-3 rounded-surface border-2 p-3 text-left ${selected
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : disabled ? "cursor-not-allowed border-input bg-muted text-muted-foreground"
                                            : "border-border bg-background text-foreground hover:border-input hover:bg-muted"}`}
                                >
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-label font-bold ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                        {multiple && selected ? <Check className="h-4 w-4" /> : OPTION_LETTERS[i]}
                                    </span>
                                    <span className="min-w-0 break-words text-body">{option}</span>
                                    {!multiple && selected && <Check className="ml-auto h-5 w-5 shrink-0" />}
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
                        <div className="space-y-4 rounded-surface border border-destructive-border bg-destructive-muted p-4">
                            <p className="text-label text-destructive">本题量表范围无效，无法作答。</p>
                            <Button type="button" variant="outline" onClick={goNext} className="w-full">
                                跳过本题
                            </Button>
                        </div>
                    );
                }
                const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
                return (
                    <div className="space-y-4">
                        <div className="flex justify-between text-label text-muted-foreground">
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
                                        data-preview-answer
                                        onClick={() => setChoiceAnswer(qIndex, val)}
                                        aria-pressed={selected}
                                        className={`min-w-0 flex-1 basis-0 rounded-surface text-body font-bold transition-none h-12 ${
                                            selected
                                                ? "bg-primary text-primary-foreground  ring-2 ring-primary ring-offset-2 z-10"
                                                : "bg-background border-2 border-border text-muted-foreground hover:border-primary hover:bg-primary-muted"
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
                    <div className="space-y-4 rounded-surface border border-destructive-border bg-destructive-muted p-4">
                        <p className="text-label text-destructive">
                            不支持题型「{String((question as Question).type)}」，请返回修改问卷。
                        </p>
                        <Button type="button" variant="outline" onClick={goNext} className="w-full">
                            跳过本题
                        </Button>
                    </div>
                );
        }
    };

    return createPortal(
        <>
            <div
                ref={overlayRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                data-testid="immersive-questionnaire-preview"
                className="fixed inset-0 z-50 flex flex-col bg-background outline-none"
                onKeyDown={handleKeyDown}
                tabIndex={-1}
            >
                {duplicateIds && (
                    <div className="shrink-0 px-6 pt-3">
                        <div className="mx-auto max-w-lg rounded-surface border border-warning-border bg-warning-muted px-3 py-2 text-meta text-warning">
                            检测到题目 ID 重复，预览按题序区分答案；提交至服务器时仍依赖唯一 ID，请在设计器中修正。
                        </div>
                    </div>
                )}

                {/* Progress bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-muted z-10">
                    <div
                        className="h-full bg-primary transition-[width] duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
                    <div className="text-label font-medium text-muted-foreground">
                        问卷试填{page.type === "question" && totalQuestions > 0 && ` · 第 ${page.index + 1} / ${totalQuestions} 题`}
                    </div>
                    {page.type !== "complete" && (
                        <button
                            type="button"
                            onClick={requestClose}
                            className="w-10 h-10 rounded-control flex items-center justify-center text-muted-foreground hover:text-muted-foreground hover:bg-muted transition-none"
                            aria-label="关闭预览"
                            data-testid="immersive-preview-close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div ref={contentRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6" data-testid="questionnaire-preview-content">
                    <div key={pageKey} className={`mx-auto w-full max-w-2xl shrink-0 ${page.type === "question" ? "" : "my-auto"}`}>
                        {/* Welcome Page */}
                        {page.type === "welcome" && (
                            <div className="text-center space-y-8">
                                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-control bg-primary-muted text-primary text-label font-medium">
                                    <ClipboardList className="w-4 h-4" />
                                    模拟填写体验
                                </div>
                                <h1 id={titleId} className="text-display font-bold text-foreground leading-tight">
                                    {title || "未命名问卷"}
                                </h1>
                                <div className={`${cardClass}`}>
                                    <RichTextContent
                                        html={welcomeText}
                                        className="text-muted-foreground leading-relaxed text-label [&_h2]:!text-foreground [&_h3]:!text-foreground [&_h4]:!text-foreground"
                                        emptyFallback="欢迎语将在这里展示"
                                    />
                                </div>
                                <div className="flex items-center justify-center gap-4 text-label text-muted-foreground">
                                    <span>共 {totalQuestions} 题</span>
                                    <span className="w-1 h-1 rounded-circle bg-input" />
                                    <span>约 {estimatedMinutes} 分钟</span>
                                </div>
                                {totalQuestions === 0 ? (
                                    <p className="text-label text-warning">
                                        当前没有题目，将直接进入结束语页；也可关闭预览返回编辑。
                                    </p>
                                ) : null}
                                <Button
                                    type="button"
                                    onClick={goNext}
                                    size="lg"
                                    data-testid="immersive-preview-start"
                                    className="bg-primary hover:bg-primary-hover text-primary-foreground text-body px-10 py-6 rounded-surface "
                                >
                                    {totalQuestions === 0 ? "继续" : "开始填写"}
                                    <ChevronRight className="w-5 h-5 ml-2" />
                                </Button>
                            </div>
                        )}

                        {/* Question Page */}
                        {page.type === "question" && currentQuestion && (
                            <div className="space-y-5">
                                <div>
                                    <p className="text-label text-muted-foreground font-medium mb-3">
                                        {QUESTION_SECTION_LABELS[currentQuestion.section ?? "main"]} · {questionTypeHint[currentQuestion.type] ?? "题目"}
                                    </p>
                                    <h2 id={titleId} className="text-page-title font-semibold text-foreground leading-snug">
                                        {currentQuestion.content}
                                    </h2>
                                </div>
                                <p className="text-label text-muted-foreground" role="status">
                                    {pendingAutoAdvance === page.index ? "已选择，即将继续；可返回上一题修改。"
                                        : currentQuestion.type === "multiple" ? "选好后点击下方按钮或按 Enter 继续；空格可切换选项。"
                                            : isCurrentAnswered ? "可在本题修改答案，确认后点击下方按钮或按 Enter 继续。"
                                                : "首次选择后自动继续，无需点击下一题；可随时返回修改。"}
                                </p>
                                {renderQuestionBody(currentQuestion, page.index)}
                                <div className="flex items-center justify-between gap-3 border-t border-border pt-4" data-testid="questionnaire-preview-actions">
                                    <Button type="button" variant="outline" onClick={goPrev} aria-label="上一题"><ChevronLeft className="mr-2 h-4 w-4"/>上一题</Button>
                                    <Button type="button" onClick={goNext} disabled={!isCurrentAnswered} data-testid={currentQuestion.type === "multiple" ? "immersive-preview-multiple-next" : "immersive-preview-next"}>
                                        {page.index === totalQuestions - 1 ? "查看结束语" : currentQuestion.type === "multiple" ? "选好了，下一题" : "下一题"}<ChevronRight className="ml-2 h-4 w-4"/>
                                    </Button>
                                </div>
                            </div>
                        )}

                        {page.type === "question" && !currentQuestion && totalQuestions > 0 && (
                            <div className="text-center space-y-4 text-destructive text-label">
                                <p>题目加载异常，请关闭预览后重试。</p>
                                <Button type="button" variant="outline" onClick={requestClose}>
                                    关闭
                                </Button>
                            </div>
                        )}

                        {/* Ending Page */}
                        {page.type === "ending" && (
                            <div className="text-center space-y-8">
                                <h2 id={titleId} className="text-page-title font-semibold">问卷结束</h2>
                                <div className="w-16 h-16 mx-auto rounded-surface bg-primary flex items-center justify-center">
                                    <ClipboardList className="w-8 h-8 text-primary-foreground" />
                                </div>
                                <div className={`${cardClass}`}>
                                    <RichTextContent
                                        html={endingText}
                                        className="text-muted-foreground leading-relaxed text-label [&_h2]:!text-foreground [&_h3]:!text-foreground [&_h4]:!text-foreground"
                                        emptyFallback="结束语将在这里展示"
                                    />
                                </div>
                                <div className="text-label text-muted-foreground">
                                    {totalQuestions === 0
                                        ? "暂无题目"
                                        : `已回答 ${answeredCount} / ${totalQuestions} 道题目`}
                                </div>
                                <Button
                                    type="button"
                                    onClick={goNext}
                                    disabled={answeredCount !== totalQuestions}
                                    size="lg"
                                    data-testid="immersive-preview-submit"
                                    className="bg-primary hover:bg-primary-hover text-primary-foreground text-body px-10 py-6 rounded-surface "
                                >
                                    完成试填
                                </Button>
                                {answeredCount !== totalQuestions && (() => {
                                    const jumpTo = jumpToQuestion;
                                    const missing = questions
                                        .map((question, index) => ({ question, index }))
                                        .filter(({ question, index }) => !isQuestionAnswered(question, answersByIndex[index]));
                                    return (
                                        <div className="space-y-3">
                                            <p role="status" className="text-body text-warning">还有 {missing.length} 道题未完成，请补充作答后提交：</p>
                                            <ul className="mx-auto flex max-w-xl flex-col gap-2 text-left">
                                                {missing.map(({ question, index }) => (
                                                    <li key={question.id ?? index}>
                                                        <button
                                                            type="button"
                                                            data-testid={`immersive-preview-missing-${index + 1}`}
                                                            onClick={() => jumpTo(index)}
                                                            className="w-full rounded-control border border-warning-border bg-warning-muted px-3 py-2 text-label text-warning"
                                                        >
                                                            第 {index + 1} 题：{question.content?.trim() || "（未填写题干）"}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                            <Button type="button" variant="outline" onClick={() => {
                                                const index = questions.findIndex((question, i) => !isQuestionAnswered(question, answersByIndex[i]));
                                                if (index >= 0) jumpTo(index);
                                            }}>返回未答题</Button>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Complete Page */}
                        {page.type === "complete" && (
                            <div className="text-center space-y-8">
                                <div className="w-20 h-20 mx-auto rounded-control bg-success flex items-center justify-center animate-in zoom-in duration-500">
                                    <Check className="w-10 h-10 text-success-foreground" />
                                </div>
                                <div className="space-y-2">
                                    <h2 id={titleId} className="text-page-title font-bold text-foreground">模拟填写完成！</h2>
                                    <p className="text-muted-foreground">您已成功模拟了受访者的问卷填写体验</p>
                                </div>
                                <div className="flex justify-center gap-4">
                                    <div className="px-6 py-4 bg-card rounded-surface">
                                        <div className="text-page-title font-bold text-primary">{totalQuestions}</div>
                                        <div className="text-meta text-muted-foreground mt-1">题目总数</div>
                                    </div>
                                    <div className="px-6 py-4 bg-card rounded-surface">
                                        <div className="text-page-title font-bold text-success">{answeredCount}</div>
                                        <div className="text-meta text-muted-foreground mt-1">已回答</div>
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    onClick={onClose}
                                    size="lg"
                                    data-testid="immersive-preview-return"
                                    className="bg-primary hover:bg-primary-hover text-primary-foreground text-body px-10 py-6 rounded-surface "
                                >
                                    返回问卷预试
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {page.type === "question" && totalQuestions > 0 && <footer className="flex shrink-0 items-center justify-center border-t border-border bg-card px-6 py-3" data-testid="questionnaire-preview-progress">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-meta text-muted-foreground">已答 {answeredCount} / {totalQuestions}</span>
                        {totalQuestions <= 15 ? <nav className="flex flex-wrap gap-1" aria-label="题目进度，可点击跳转">{questions.map((q, i) => <button key={i} type="button" onClick={() => jumpToQuestion(i)} title={"第 " + (i + 1) + " 题"} aria-current={i === page.index ? "step" : undefined}
                            className={"flex h-9 w-9 items-center justify-center rounded-control border text-meta " + (i === page.index ? "border-primary bg-primary text-primary-foreground" : isQuestionAnswered(q, answersByIndex[i]) ? "border-success-border bg-success-muted text-success" : "border-border bg-background text-muted-foreground")}>{i + 1}</button>)}</nav>
                        : <select aria-label="跳转到题目" value={page.index} onChange={event => jumpToQuestion(Number(event.target.value))} className="min-h-11 rounded-control border border-input bg-background px-3 text-label">{questions.map((question, i) => <option key={i} value={i}>{"第 " + (i + 1) + " 题 · " + (isQuestionAnswered(question, answersByIndex[i]) ? "已答" : "待答")}</option>)}</select>}
                    </div>
                </footer>}
                {page.type === "ending" && <footer className="shrink-0 border-t border-border px-6 py-4"><Button type="button" variant="outline" onClick={goPrev} aria-label="返回上一题"><ChevronLeft className="mr-2 h-4 w-4"/>返回上一题</Button></footer>}
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
                        <AlertDialogAction type="button" onClick={confirmExit} variant="destructive">
                            确定退出
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>, document.body
    );
}

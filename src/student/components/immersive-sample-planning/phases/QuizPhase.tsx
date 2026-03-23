import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, Check, X as XIcon, SkipForward } from "lucide-react";

interface Props {
    questionIndex: number;
    onNext: () => void;
    onSkip: () => void;
}

interface QuizQuestion {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
}

const QUESTIONS: QuizQuestion[] = [
    {
        question: "如果将置信水平从 95% 提高到 99%，所需样本量会？",
        options: ["增加", "减少", "不变"],
        correctIndex: 0,
        explanation: "置信水平越高，Z 值越大，n₀ = Z²×p(1-p)/E² 中分子增大，所以样本量增加。",
    },
    {
        question: "总体规模从 2,000 增加到 200,000，对所需样本量的影响是？",
        options: ["大幅增加", "略有增加", "几乎不变"],
        correctIndex: 2,
        explanation: "有限总体校正 n₁ = n₀/(1+(n₀-1)/N) 中，当 N 很大时 (n₀-1)/N → 0，校正几乎不起作用。大总体所需样本量趋近于无限总体下的 n₀。",
    },
    {
        question: "设计效应 deff = 2 意味着？",
        options: [
            "需要的样本是简单随机抽样的 2 倍",
            "需要的样本减半",
            "与简单随机抽样一样",
        ],
        correctIndex: 0,
        explanation: "deff 是方差膨胀系数，最终样本量 n = n₁ × deff。deff=2 表示复杂抽样的方差是 SRS 的 2 倍，需要 2 倍样本来弥补。",
    },
];

export function QuizPhase({ questionIndex, onNext, onSkip }: Props) {
    const [selected, setSelected] = useState<number | null>(null);
    const [submitted, setSubmitted] = useState(false);

    // Parent may advance questionIndex via bottom nav without going through handleNext — reset local UI state.
    useEffect(() => {
        setSelected(null);
        setSubmitted(false);
    }, [questionIndex]);

    const q = QUESTIONS[questionIndex];
    if (!q) return null;

    const isCorrect = selected === q.correctIndex;
    const isLast = questionIndex >= QUESTIONS.length - 1;

    const handleSubmit = useCallback(() => {
        if (selected == null) return;
        setSubmitted(true);
    }, [selected]);

    const handleNext = useCallback(() => {
        setSelected(null);
        setSubmitted(false);
        onNext();
    }, [onNext]);

    return (
        <div className="space-y-8">
            <div className="text-center space-y-2">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-100 dark:bg-sky-950/50 text-xs font-medium text-sky-700 dark:text-sky-300">
                    快速自检　{questionIndex + 1} / {QUESTIONS.length}
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-100 leading-snug">
                    {q.question}
                </h2>
            </div>

            <div className="max-w-md mx-auto space-y-3">
                {q.options.map((option, i) => {
                    let borderClass = "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-gray-300 dark:hover:bg-slate-800";
                    if (submitted && i === q.correctIndex) {
                        borderClass = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 shadow-sm";
                    } else if (submitted && i === selected && !isCorrect) {
                        borderClass = "border-rose-500 bg-rose-50 dark:bg-rose-950/30";
                    } else if (!submitted && i === selected) {
                        borderClass = "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 shadow-sm";
                    }

                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => !submitted && setSelected(i)}
                            disabled={submitted}
                            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${borderClass}`}
                        >
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                                submitted && i === q.correctIndex
                                    ? "bg-emerald-500 text-white"
                                    : submitted && i === selected && !isCorrect
                                        ? "bg-rose-500 text-white"
                                        : !submitted && i === selected
                                            ? "bg-indigo-500 text-white"
                                            : "bg-gray-100 dark:bg-slate-800 text-gray-500"
                            }`}>
                                {submitted && i === q.correctIndex ? <Check className="w-4 h-4" />
                                    : submitted && i === selected && !isCorrect ? <XIcon className="w-4 h-4" />
                                        : String.fromCharCode(65 + i)}
                            </span>
                            <span className={`text-base ${
                                !submitted && i === selected ? "text-indigo-700 dark:text-indigo-300 font-medium" : "text-gray-700 dark:text-slate-200"
                            }`}>
                                {option}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Explanation after submission */}
            {submitted && (
                <div className={`max-w-md mx-auto rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                    isCorrect
                        ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
                        : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
                }`}>
                    <p className={`text-sm font-medium mb-1 ${isCorrect ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                        {isCorrect ? "正确！" : "不太对 —"}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{q.explanation}</p>
                </div>
            )}

            <div className="flex justify-center gap-3">
                {!submitted ? (
                    <>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onSkip}
                            className="text-slate-400 hover:text-slate-600"
                        >
                            <SkipForward className="w-4 h-4 mr-1" />
                            跳过自检
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSubmit}
                            disabled={selected == null}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-40"
                        >
                            提交答案
                        </Button>
                    </>
                ) : (
                    <Button
                        type="button"
                        onClick={handleNext}
                        data-testid="immersive-sp-quiz-next"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-5 rounded-xl shadow-lg shadow-indigo-500/20"
                    >
                        {isLast ? "完成自检" : "下一题"}
                        <ChevronRight className="w-5 h-5 ml-2" />
                    </Button>
                )}
            </div>
        </div>
    );
}

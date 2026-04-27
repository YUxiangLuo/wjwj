import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

export const QUIZ_QUESTION_COUNT = 7;

const QUESTIONS: QuizQuestion[] = [
    {
        question: "标准误差 (SE)、误差限 (ME)、变异系数 (CV) 之间的关系是？",
        options: [
            "ME = Z × SE，CV = SE / 估计值",
            "SE = Z × ME，CV = ME / 估计值",
            "CV = Z × SE，ME = SE / 估计值",
        ],
        correctIndex: 0,
        explanation: "ME（误差限）= Z × SE（标准误差），表示置信区间的半宽；CV（变异系数）= SE / 估计值，是无量纲的相对精度指标。",
    },
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
    {
        question: "需要对 3 个互斥子总体分别做精度为 ±5% 的估计，相比仅做整体估计，总样本量通常会？",
        options: [
            "保持不变",
            "增加为约 2-3 倍",
            "减少",
        ],
        correctIndex: 1,
        explanation: "每个互斥子总体都需要达到 ±5% 的精度要求，各层都要有足够样本量。按 Σn_h 求和后，所需总样本量通常显著高于仅做整体估计，可能增加 2-3 倍甚至更多。",
    },
    {
        question: "奈曼分配（Neyman allocation）相比按比例分配的优势是？",
        options: [
            "计算更简单",
            "变异大的层分配更多样本，总体精度更高",
            "每层获得相同的样本量",
        ],
        correctIndex: 1,
        explanation: "奈曼分配使 nₕ ∝ Nₕ × Sₕ，即变异大的层获得更多样本。这样做能最小化总体估计的方差，精度优于按比例分配。",
    },
    {
        question: "当误差限从 5% 减小到 1% 时，样本量会增加约多少倍？",
        options: [
            "约 5 倍",
            "约 25 倍",
            "约 10 倍",
        ],
        correctIndex: 1,
        explanation: "n₀ ∝ 1/E²，所以 E 减小 5 倍（从 5% 到 1%），n₀ 增加 5² = 25 倍。精度提升的成本呈平方增长，这就是边际递减效应。",
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
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2 text-center">
                <span className="inline-flex items-center gap-2 self-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    快速自检　{questionIndex + 1} / {QUESTIONS.length}
                </span>
                <h2 className="text-xl font-bold leading-snug text-foreground sm:text-2xl">
                    {q.question}
                </h2>
                <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
                    最后用几道题快速确认一下：你是否抓住了样本量规划里最关键的概念。
                </p>
            </div>

            <div className="mx-auto flex max-w-md flex-col gap-3">
                {q.options.map((option, i) => {
                    let optionClass = "border-border bg-card text-card-foreground hover:bg-muted";
                    if (submitted && i === q.correctIndex) {
                        optionClass = "border-chart-3 bg-chart-3/10 shadow-sm";
                    } else if (submitted && i === selected && !isCorrect) {
                        optionClass = "border-destructive bg-destructive/10";
                    } else if (!submitted && i === selected) {
                        optionClass = "border-primary bg-primary/10 shadow-sm";
                    }

                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => !submitted && setSelected(i)}
                            disabled={submitted}
                            className={cn("flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition-all", optionClass)}
                        >
                            <span
                                className={cn(
                                    "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                                    submitted && i === q.correctIndex
                                        ? "bg-chart-3 text-primary-foreground"
                                        : submitted && i === selected && !isCorrect
                                            ? "bg-destructive text-destructive-foreground"
                                            : !submitted && i === selected
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-muted-foreground",
                                )}
                            >
                                {submitted && i === q.correctIndex ? <Check className="size-4" />
                                    : submitted && i === selected && !isCorrect ? <XIcon className="size-4" />
                                        : String.fromCharCode(65 + i)}
                            </span>
                            <span className={cn("text-base text-foreground", !submitted && i === selected && "font-medium text-primary")}>
                                {option}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Explanation after submission */}
            {submitted && (
                <div
                    className={cn(
                        "animate-in fade-in slide-in-from-bottom-2 mx-auto max-w-md rounded-xl border p-4 duration-300",
                        isCorrect ? "border-chart-3/20 bg-chart-3/10" : "border-chart-4/20 bg-chart-4/10",
                    )}
                >
                    <p className={cn("mb-1 text-sm font-medium", isCorrect ? "text-chart-3" : "text-chart-4")}>
                        {isCorrect ? "正确！" : "不太对 —"}
                    </p>
                    <p className="text-sm text-foreground">{q.explanation}</p>
                </div>
            )}

            <div className="flex justify-center gap-3">
                {!submitted ? (
                    <>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onSkip}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <SkipForward data-icon="inline-start" />
                            跳过，直接去确认
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSubmit}
                            disabled={selected == null}
                            className="rounded-xl px-6 shadow-lg shadow-primary/20 disabled:opacity-40"
                        >
                            提交答案
                        </Button>
                    </>
                ) : (
                    <Button
                        type="button"
                        onClick={handleNext}
                        data-testid="immersive-sp-quiz-next"
                        size="lg"
                        className="rounded-xl px-8 shadow-lg shadow-primary/20"
                    >
                        {isLast ? "完成自检，去确认" : "下一题"}
                        <ChevronRight data-icon="inline-end" />
                    </Button>
                )}
            </div>
        </div>
    );
}

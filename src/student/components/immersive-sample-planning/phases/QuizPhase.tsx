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

export const QUIZ_QUESTION_COUNT = 3;

const QUESTIONS: QuizQuestion[] = [
    {
        question: "标准误差 (SE)、误差限 (ME)、变异系数 (CV) 之间的关系是？",
        options: [
            "ME = Z × SE，CV = SE / 估计值",
            "SE = Z × ME，CV = ME / 估计值",
            "CV = Z × SE，ME = SE / 估计值",
        ],
        correctIndex: 0,
        explanation: "ME（误差限）= Z × SE（标准误差），表示置信区间的半宽；当估计值非零且尺度零点有意义时，CV=SE/|估计值| 可作为相对精度指标，接近零时不稳定。",
    },
    {
        question: "在 95%、±5% 的常用规划下，总体规模从 2,000 增加到 200,000，所需样本量大约会？",
        options: ["大幅增加", "略有增加", "几乎不变"],
        correctIndex: 1,
        explanation: "有限总体校正 n = n₀N/(N−1+n₀)。以 n₀≈385 为例，N=2,000 时约 322，N=200,000 时约 384，大约增加两成，所以是略有增加。只有当 N 已经很大时，校正才几乎消失。",
    },
    {
        question: "设计效应 deff = 2 意味着？",
        options: [
            "同一估计量下，该复杂设计的方差约为简单随机抽样的 2 倍",
            "有限总体下所需样本量一定恰好是简单随机抽样的 2 倍",
            "需要的样本减半",
        ],
        correctIndex: 0,
        explanation: "deff 是同一估计量下复杂设计方差与 SRS 方差之比。有限总体校正不可忽略时，目标完成量是 n = deff·n₀·N / (N−1+deff·n₀)，不是把 FPC 后的 n 再乘 2。只有 FPC 可忽略时，所需样本量才近似为 SRS 的 2 倍。",
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
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-info/10 text-xs font-medium text-info">
                    快速自检　{questionIndex + 1} / {QUESTIONS.length}
                </span>
                <h2 className="text-2xl font-bold text-foreground leading-snug">
                    {q.question}
                </h2>
                <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                    最后用几道题快速确认一下：你是否抓住了样本量规划里最关键的概念。
                </p>
            </div>

            <div className="max-w-md mx-auto space-y-3">
                {q.options.map((option, i) => {
                    let borderClass = "border-border bg-background hover:border-input";
                    if (submitted && i === q.correctIndex) {
                        borderClass = "border-success bg-success shadow-sm";
                    } else if (submitted && i === selected && !isCorrect) {
                        borderClass = "border-destructive bg-destructive";
                    } else if (!submitted && i === selected) {
                        borderClass = "border-primary bg-primary shadow-sm";
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
                                    ? "bg-success text-success-foreground"
                                    : submitted && i === selected && !isCorrect
                                        ? "bg-destructive text-destructive-foreground"
                                        : !submitted && i === selected
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground"
                            }`}>
                                {submitted && i === q.correctIndex ? <Check className="w-4 h-4" />
                                    : submitted && i === selected && !isCorrect ? <XIcon className="w-4 h-4" />
                                        : String.fromCharCode(65 + i)}
                            </span>
                            <span className={`text-base ${
                                submitted && i === q.correctIndex
                                    ? "text-success-foreground font-medium"
                                    : submitted && i === selected && !isCorrect
                                        ? "text-destructive-foreground font-medium"
                                        : !submitted && i === selected
                                            ? "text-primary-foreground font-medium"
                                            : "text-foreground/90"
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
                        ? "bg-success/10 border border-success/20"
                        : "bg-warning/10 border border-warning/20"
                }`}>
                    <p className={`text-sm font-medium mb-1 ${isCorrect ? "text-success" : "text-warning"}`}>
                        {isCorrect ? "正确！" : "不太对 —"}
                    </p>
                    <p className="text-sm text-muted-foreground">{q.explanation}</p>
                </div>
            )}

            <div className="flex justify-center gap-3">
                {!submitted ? (
                    <>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onSkip}
                            className="text-muted-foreground hover:text-muted-foreground"
                        >
                            <SkipForward className="w-4 h-4 mr-1" />
                            跳过，直接去确认
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSubmit}
                            disabled={selected == null}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 rounded-xl shadow-lg shadow-primary/20 disabled:opacity-40"
                        >
                            提交答案
                        </Button>
                    </>
                ) : (
                    <Button
                        type="button"
                        onClick={handleNext}
                        data-testid="immersive-sp-quiz-next"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-5 rounded-xl shadow-lg shadow-primary/20"
                    >
                        {isLast ? "完成自检，去确认" : "下一题"}
                        <ChevronRight className="w-5 h-5 ml-2" />
                    </Button>
                )}
            </div>
        </div>
    );
}

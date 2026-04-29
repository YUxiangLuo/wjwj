import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronRight, Users } from "lucide-react";
import { formatMarginOfError } from "../../../experiment/sample-plan-display";
import { PopulationDots } from "../visualizations/PopulationDots";
import type { EstimationType } from "../types";

interface Props {
    populationSize: number;
    /** 与当前推荐样本量计算一致的置信水平（百分比字符串，如 "95"） */
    confidenceLevel: string;
    /** 与当前推荐样本量计算一致的误差限 */
    estimationType: EstimationType;
    marginOfError: number;
    recommendedSize: number;
    guess: number | null;
    revealed: boolean;
    /** Single update: records guess and reveals — avoids batched setState races on parent. */
    onCommitGuess: (guess: number) => void;
    onNext: () => void;
}

export function ChallengePhase({
    populationSize,
    confidenceLevel,
    estimationType,
    marginOfError,
    recommendedSize,
    guess,
    revealed,
    onCommitGuess,
    onNext,
}: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [inputValue, setInputValue] = useState(guess?.toString() ?? "");

    const handleSubmitGuess = useCallback(() => {
        const v = Number.parseInt(inputValue, 10);
        if (Number.isNaN(v) || v <= 0) return;
        onCommitGuess(Math.min(v, populationSize));
    }, [inputValue, populationSize, onCommitGuess]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !revealed) {
                e.preventDefault();
                handleSubmitGuess();
            }
        },
        [revealed, handleSubmitGuess],
    );

    // Auto-focus input
    useEffect(() => {
        if (!revealed) inputRef.current?.focus();
    }, [revealed]);

    const guessDelta = guess != null ? guess - recommendedSize : 0;
    const guessLabel =
        guessDelta > recommendedSize * 0.3 ? "你猜高了！大多数人第一次都会高估。"
            : guessDelta < -recommendedSize * 0.3 ? "你猜低了！统计学会告诉你为什么需要更多。"
                : "很接近！你的直觉不错。";

    const parsedInput = Number.parseInt(inputValue, 10);
    const canSubmitGuess = inputValue.trim() !== "" && !Number.isNaN(parsedInput) && parsedInput > 0;

    return (
        <div className="flex flex-col gap-8 text-center">
            {!revealed ? (
                <>
                    <div className="inline-flex items-center gap-2 self-center rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                        <Users className="size-4" />
                        样本量规划起点
                    </div>

                    <div className="flex flex-col gap-3">
                        <h2 className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">
                            现在开始规划你的样本量
                        </h2>
                        <p className="text-lg text-muted-foreground">
                            你的调查总体共有 <span className="tabular-nums text-primary">{populationSize.toLocaleString()}</span> 人。<br />
                            先凭直觉猜一猜：至少调查多少人，结果才算“有代表性”？
                        </p>
                    </div>

                    <PopulationDots total={populationSize} highlighted={0} />

                    <div className="mx-auto flex max-w-xs flex-col gap-3">
                        <Input
                            ref={inputRef}
                            type="number"
                            placeholder="先猜一个样本量…"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            min={1}
                            max={populationSize}
                            data-testid="immersive-sp-guess-input"
                            className="h-14 text-center text-xl font-bold"
                        />
                        <Button
                            type="button"
                            onClick={handleSubmitGuess}
                            disabled={!canSubmitGuess}
                            data-testid="immersive-sp-guess-submit"
                            size="lg"
                            className="h-12 w-full rounded-xl text-base shadow-lg shadow-primary/20"
                        >
                            提交我的直觉判断
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    <div className="animate-in fade-in flex flex-col gap-4 duration-500">
                        <h2 className="text-2xl font-bold text-foreground">
                            你的直觉判断 vs 统计学建议
                        </h2>
                        <p className="text-muted-foreground">{guessLabel}</p>
                    </div>

                    <div className="animate-in fade-in slide-in-from-bottom-4 mx-auto flex max-w-md flex-col gap-4 duration-500" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
                        <ComparisonBar
                            label="你的猜测"
                            value={guess ?? 0}
                            max={populationSize}
                            barClassName="bg-warning"
                            valueClassName="text-warning"
                        />
                        <ComparisonBar
                            label={`统计学建议 (${confidenceLevel}% 置信, ${formatMarginOfError(marginOfError, estimationType)})`}
                            value={recommendedSize}
                            max={populationSize}
                            barClassName="bg-success"
                            valueClassName="text-success"
                        />
                    </div>

                    <PopulationDots total={populationSize} highlighted={recommendedSize} />

                    <div className="animate-in fade-in flex flex-col items-center gap-3 duration-500" style={{ animationDelay: "600ms", animationFillMode: "both" }}>
                        <p className="text-lg text-foreground">
                            但这个 <span className="font-bold tabular-nums text-primary">{recommendedSize}</span> 是怎么算出来的？
                        </p>
                        <p className="mx-auto max-w-md text-sm text-muted-foreground">
                            你已经进入样本量规划学习阶段。接下来会依次看到精度指标、关键影响因素、公式推导和最终决策，弄清楚这个建议值为什么成立。
                        </p>
                        <Button
                            type="button"
                            onClick={onNext}
                            data-testid="immersive-sp-challenge-next"
                            size="lg"
                            className="rounded-xl px-8 text-base shadow-lg shadow-primary/20"
                        >
                            开始拆解样本量规划
                            <ChevronRight data-icon="inline-end" />
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}

function ComparisonBar({
    label,
    value,
    max,
    barClassName,
    valueClassName,
}: {
    label: string;
    value: number;
    max: number;
    barClassName: string;
    valueClassName: string;
}) {
    const pct = Math.max(2, (value / max) * 100);
    return (
        <div className="flex flex-col gap-1 text-left">
            <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className={cn("text-lg font-bold tabular-nums", valueClassName)}>{value.toLocaleString()} 人</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div
                    className={cn("h-full rounded-full transition-all duration-700 ease-out", barClassName)}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

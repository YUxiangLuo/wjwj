import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { LEARNING_QUESTIONS, type LearningCheckId } from "./learning";

interface Props {
    id: LearningCheckId;
    completed: boolean;
    onComplete: (id: LearningCheckId) => void;
    title?: string;
}

export function LearningCheck({ id, completed, onComplete, title = "理解检查" }: Props) {
    const name = useId();
    const [selected, setSelected] = useState<number | null>(null);
    const [incorrect, setIncorrect] = useState(false);
    const question = LEARNING_QUESTIONS[id];
    return <section className="mt-6 space-y-4 rounded-surface border border-primary-border bg-card p-5" data-testid={`learning-check-${id}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-subheading font-semibold">{title}</h3>
            <StatusBadge intent={completed ? "success" : "info"}>{completed ? "已掌握" : "完成后继续"}</StatusBadge>
        </div>
        <fieldset disabled={completed} className="space-y-3">
            <legend className="mb-3 text-body font-medium">{question.question}</legend>
            {question.options.map((option, index) => {
                const checked = completed ? index === question.correctIndex : selected === index;
                return <label key={option} className={`flex cursor-pointer items-start gap-3 rounded-control border p-4 text-body ${checked ? "border-primary-border bg-primary-muted text-foreground" : "border-border bg-background text-foreground"}`}>
                    <input type="radio" name={name} value={index} checked={checked} onChange={() => { setSelected(index); setIncorrect(false); }} className="mt-1 h-4 w-4 shrink-0 accent-primary"/>
                    <span>{option}</span>
                </label>;
            })}
        </fieldset>
        {(incorrect || completed) && <div role="status" className={`space-y-1 rounded-control border p-4 ${completed ? "border-success-border bg-success-muted" : "border-warning-border bg-warning-muted"}`}>
            <p className={`text-label font-semibold ${completed ? "text-success" : "text-warning"}`}>{completed ? "理解正确" : "再想一想，可以重新选择"}</p>
            <p className="text-label leading-relaxed text-foreground">{question.explanation}</p>
        </div>}
        {!completed && <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={selected === null} onClick={() => {
                if (selected === question.correctIndex) onComplete(id);
                else setIncorrect(true);
            }}>检查答案</Button>
            <p className="text-meta text-muted-foreground">不计分；答错后可根据提示重试。</p>
        </div>}
    </section>;
}

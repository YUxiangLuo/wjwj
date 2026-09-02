import { RichTextContent } from "@/components/RichTextContent";
import type { QuestionnaireData, QuestionType } from "@/lib/questionnaire-types";
import { QUESTION_SECTION_LABELS } from "@/lib/questionnaire-templates";

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    boolean: "是/否题",
    single: "单选题",
    multiple: "多选题",
    scale: "评分题",
};

export function QuestionnaireSnapshot({
    questionnaire,
    emptyText = "暂无问卷内容",
}: {
    questionnaire: QuestionnaireData | null | undefined;
    emptyText?: string;
}) {
    if (!questionnaire) {
        return <p className="text-label text-muted-foreground">{emptyText}</p>;
    }

    const questions = Array.isArray(questionnaire.questions) ? questionnaire.questions : [];

    return (
        <div className="space-y-5" data-testid="questionnaire-snapshot">
            <div className="space-y-2 border-b border-border pb-4">
                <h3 className="text-subheading font-semibold">{questionnaire.title || "未命名问卷"}</h3>
                <RichTextContent
                    html={questionnaire.welcomeText ?? ""}
                    className="text-label text-muted-foreground"
                    emptyFallback="无欢迎语"
                />
            </div>

            {questions.length === 0 ? (
                <p className="rounded-surface border border-dashed border-border py-8 text-center text-label text-muted-foreground">
                    暂无题目
                </p>
            ) : (
                <ol className="space-y-3">
                    {questions.map((question, index) => (
                        <li key={question.id || index} className="rounded-surface border border-border bg-muted p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <p className="text-label font-medium">{index + 1}. {question.content}</p>
                                <span className="rounded-control bg-muted px-2 py-0.5 text-meta text-muted-foreground">
                                    {QUESTION_SECTION_LABELS[question.section ?? "main"]} · {QUESTION_TYPE_LABELS[question.type] ?? question.type}
                                </span>
                            </div>

                            {question.options?.length ? (
                                <ul className="mt-3 list-disc space-y-1 pl-5 text-label text-muted-foreground">
                                    {question.options.map((option, optionIndex) => (
                                        <li key={`${question.id}-${optionIndex}`}>{option}</li>
                                    ))}
                                </ul>
                            ) : null}

                            {question.type === "boolean" && (
                                <p className="mt-3 text-label text-muted-foreground">选项：是 / 否</p>
                            )}
                            {question.type === "scale" && (
                                <p className="mt-3 text-label text-muted-foreground">
                                    评分范围：{question.scaleMin ?? 1}–{question.scaleMax ?? 10}
                                    {(question.scaleMinLabel || question.scaleMaxLabel)
                                        ? `（${question.scaleMinLabel ?? "最低"} ～ ${question.scaleMaxLabel ?? "最高"}）`
                                        : ""}
                                </p>
                            )}
                            {question.type === "multiple" && (question.minSelect || question.maxSelect) && (
                                <p className="mt-2 text-meta text-muted-foreground">
                                    选择数量：{question.minSelect ?? 0}–{question.maxSelect ?? question.options?.length ?? 0} 项
                                </p>
                            )}
                        </li>
                    ))}
                </ol>
            )}

            <RichTextContent
                html={questionnaire.endingText ?? ""}
                className="border-t border-border pt-4 text-label text-muted-foreground"
                emptyFallback="无结束语"
            />
        </div>
    );
}

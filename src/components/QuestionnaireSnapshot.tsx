import { questionnaireOptionFormatError } from "@/lib/questionnaire-options";
import { NumericQuestionSummary } from "@/components/questionnaire/NumericQuestionSummary";
import { RichTextContent } from "@/components/RichTextContent";
import { parseQuestionVariableBinding, questionAnswers } from "@/domain/experiment/question-variable-binding";
import { parseVariableDictionary, type VariableDictionaryV1 } from "@/domain/experiment/variable-dictionary";
import type { Question } from "@/lib/questionnaire-types";
import type { QuestionnaireData, QuestionType } from "@/lib/questionnaire-types";
import { QUESTION_SECTION_LABELS } from "@/lib/questionnaire-templates";

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
    boolean: "是/否题",
    single: "单选题",
    multiple: "多选题",
    scale: "评分题",
    numeric: "数值题",
};

export function QuestionnaireSnapshot({
    questionnaire,
    variableDictionary,
    emptyText = "暂无问卷内容",
}: {
    questionnaire: QuestionnaireData | null | undefined;
    variableDictionary?: VariableDictionaryV1 | null;
    emptyText?: string;
}) {
    if (!questionnaire) {
        return <p className="text-label text-muted-foreground">{emptyText}</p>;
    }

    const formatError = questionnaireOptionFormatError(questionnaire);
    if (formatError) return <p role="alert" className="text-label text-destructive">问卷快照格式无效：{formatError}。原记录未修改，请联系管理员检查。</p>;
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

                            <NumericQuestionSummary question={question} />
                            <QuestionBindingSnapshot question={question} dictionary={variableDictionary} />
                            {question.options?.length ? (
                                <ul className="mt-3 list-disc space-y-1 pl-5 text-label text-muted-foreground">
                                    {question.options.map(option => (
                                        <li key={option.id}>{option.label}</li>
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

function QuestionBindingSnapshot({ question, dictionary }: { question: Question; dictionary?: VariableDictionaryV1 | null }) {
    if (question.variableBinding === undefined) return <p className="mt-2 text-meta text-muted-foreground">仅认知预试，未关联已有变量。</p>;
    if (!dictionary) return <p className="mt-2 text-meta text-info">存在变量关联声明；请在关联编辑器或包含字典的提交快照中核对。</p>;
    const source = parseVariableDictionary(dictionary);
    if (!source.ok) return <p role="alert" className="mt-2 text-meta text-destructive">提交字典版本无法核对，请联系教师检查。</p>;
    dictionary = source.value;
    const parsed = parseQuestionVariableBinding(question.variableBinding, question, dictionary);
    if (!parsed.ok) return <p role="alert" className="mt-2 text-meta text-destructive">关联无法核对：{parsed.error}</p>;
    const answers = questionAnswers(question);
    const binding = parsed.value;
    return <div className="mt-3 space-y-1 border-t border-border pt-2 text-meta">
        <p className="font-medium">语义对应 · 提交字典修订 {dictionary.revision}（不是采集来源）</p>
        {binding.kind === "continuous" ? <p className="break-words text-muted-foreground">连续变量 → {JSON.stringify(dictionary.variables.find(v => v.id === binding.variableId)!.sourceField)}；原数据未按试填规则裁剪或换算。</p> : binding.answers.map((entry, index) => <p key={entry.answerId} className="break-words text-muted-foreground">{answers[index]!.label} → {JSON.stringify(dictionary.variables.find(v => v.id === entry.variableId)!.sourceField)} · {typeof entry.value === "string" ? "文本" : typeof entry.value === "number" ? "数值" : "布尔"} {JSON.stringify(entry.value)}</p>)}
    </div>;
}

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { tasksApi } from "../api-client";
import type { Question } from "@/lib/questionnaire-types";
import { parseVariableDictionary, variableValueKey, type VariableDictionaryV1 } from "@/domain/experiment/variable-dictionary";
import { parseQuestionVariableBinding, questionAnswers, questionBindingSignature } from "@/domain/experiment/question-variable-binding";

interface Props { taskId: number; question: Question; onApply: (question: Question) => void; onClose: () => void }
const selectClass = "h-10 w-full min-w-0 rounded-control border border-input bg-card px-3 text-label text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export function QuestionVariableBindingDialog(props: Props) {
    return <BindingSession key={`${props.taskId}:${questionBindingSignature(props.question)}`} {...props} />;
}
function BindingSession({ taskId, question: original, onApply, onClose }: Props) {
    const [question] = useState(original);
    const [dictionary, setDictionary] = useState<VariableDictionaryV1 | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);
    const [selection, setSelection] = useState<Record<string, { variableId: string; codeKey: string }>>({});
    const [dirty, setDirty] = useState(false);
    const [discard, setDiscard] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError(null); setDictionary(null); setSelection({}); setDirty(false);
        void (async () => {
            const response = await tasksApi.getVariables(taskId, controller.signal);
            if (controller.signal.aborted) return;
            if (!response.success || !response.data) throw new Error(response.error?.message ?? "无法读取变量字典");
            if (response.data.dictionary === null) return;
            const parsed = parseVariableDictionary(response.data.dictionary);
            if (!parsed.ok || parsed.value.revision < 1) throw new Error("变量字典响应无效，不能使用未确认建议建立关联");
            setDictionary(parsed.value);
            if (question.variableBinding) {
                const binding = parseQuestionVariableBinding(question.variableBinding, question, parsed.value, taskId);
                if (binding.ok) setSelection(Object.fromEntries(binding.value.answers.map(entry => [entry.answerId, { variableId: entry.variableId, codeKey: variableValueKey(entry.value) }])));
                else setError(`${binding.error}；不会沿用旧映射，请重新选择，或取消数据关联。`);
            }
        })().catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "读取失败，请重试"); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [taskId, question, reload]);
    const answers = questionAnswers(question);
    const invalidIdentity = answers.some(answer => !answer.id) || new Set(answers.map(answer => answer.id)).size !== answers.length;
    const multiple = question.type === "multiple";
    const variables = dictionary?.variables.filter(v => (v.measurementLevel === "nominal" || v.measurementLevel === "ordinal")
        && (multiple ? v.categories.length === 2 : v.categories.length === answers.length)
        && (question.type !== "scale" || v.measurementLevel === "ordinal")) ?? [];
    const candidate = dictionary ? parseQuestionVariableBinding({
        schemaVersion: 1, taskId, datasetRevision: dictionary.datasetRevision, dictionaryRevision: dictionary.revision,
        questionSignature: questionBindingSignature(question), kind: multiple ? "multiple-binary" : "categorical",
        answers: answers.map(answer => {
            const chosen = selection[answer.id];
            const variable = dictionary.variables.find(v => v.id === chosen?.variableId);
            return { answerId: answer.id, variableId: chosen?.variableId, value: variable?.categories.find(c => variableValueKey(c.value) === chosen?.codeKey)?.value };
        }),
    }, question, dictionary, taskId) : null;
    function chooseVariable(answerId: string, variableId: string) {
        setDirty(true);
        setSelection(prev => multiple ? { ...prev, [answerId]: { variableId, codeKey: "" } }
            : Object.fromEntries(answers.map(answer => [answer.id, { variableId, codeKey: "" }])));
    }
    function close() { if (dirty) setDiscard(true); else onClose(); }
    return <Dialog open onOpenChange={open => { if (!open) close(); }}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col" data-testid="question-variable-binding" showCloseButton={false} onInteractOutside={e => e.preventDefault()}>
            <DialogHeader><DialogTitle>题目与已有变量关联</DialogTitle><DialogDescription>只声明含义对应：既有总体数据不是由这份问卷采集。未关联题目仅用于认知预试，不生成样本答案。</DialogDescription></DialogHeader>
            <p className="shrink-0 break-words text-label font-semibold">{question.content}</p>
            <div className="min-h-0 space-y-4 overflow-y-auto">
                {loading ? <p role="status" className="text-label text-muted-foreground">正在读取教师确认的变量字典…</p> : <>
                    {error && <p role="alert" className="break-words text-label text-destructive">{error}</p>}
                    {!dictionary ? <p className="text-label text-muted-foreground">{error ? "读取失败时不能建立数据关联。" : "教师尚未确认变量字典。"}可以保持仅认知预试，不影响完成实验。</p> : invalidIdentity ? <p role="alert" className="text-label text-destructive">选项缺少独立身份或身份重复，请先编辑并保存题目，再确认关联。</p> : <>
                        <p className="text-meta text-muted-foreground">字典修订 {dictionary.revision} · 来源 {dictionary.datasetRevision.slice(0, 12)}。{multiple ? "每个选项对应独立的二值字段；另一有效编码表示未选中，缺失仍为缺失。" : "选项必须与同一个变量的全部有效类别一一对应；缺失编码不能充当答案。"}</p>
                        {!variables.length && <p role="status" className="text-label text-warning">没有与本题兼容的已确认变量。连续数值不能强行关联为选项；评分题需有序类别，多选题需逐选项二值列。</p>}
                        {!multiple && <label className="block space-y-2 text-label"><span>已有变量</span><select aria-label="关联变量" className={selectClass} value={selection[answers[0]?.id ?? ""]?.variableId ?? ""} onChange={e => chooseVariable("", e.target.value)}>
                            <option value="">请选择变量，不自动猜测</option>{variables.map(v => <option key={v.id} value={v.id}>{v.label} · 源字段 {JSON.stringify(v.sourceField)}</option>)}
                        </select></label>}
                        {answers.map((answer, index) => {
                            const chosen = selection[answer.id]; const variable = variables.find(v => v.id === chosen?.variableId);
                            return <div key={answer.id} className="space-y-2 rounded-surface border border-border p-3">
                                <p className="break-words text-label">{index + 1}. {answer.label}</p>
                                {multiple && <select aria-label={`选项 ${index + 1} 的二值变量`} className={selectClass} value={chosen?.variableId ?? ""} onChange={e => chooseVariable(answer.id, e.target.value)}><option value="">请选择独立二值字段</option>{variables.map(v => <option key={v.id} value={v.id}>{v.label} · {JSON.stringify(v.sourceField)}</option>)}</select>}
                                <select aria-label={`选项 ${index + 1} 对应原值`} className={selectClass} value={chosen?.codeKey ?? ""} disabled={!variable} onChange={e => {
                                    setDirty(true); setSelection(prev => ({ ...prev, [answer.id]: { variableId: variable!.id, codeKey: e.target.value } }));
                                }}><option value="">请选择{multiple ? "选中时的" : "对应"}原值</option>{variable?.categories.map(c => <option key={variableValueKey(c.value)} value={variableValueKey(c.value)}>{typeof c.value === "string" ? "文本" : typeof c.value === "number" ? "数值" : "布尔"} {JSON.stringify(c.value)} · {c.label}</option>)}</select>
                            </div>;
                        })}
                        {dirty && candidate && !candidate.ok && <p role="alert" className="text-meta text-destructive">{candidate.error}</p>}
                    </>}
                </>}
            </div>
            {discard && <div role="alert" className="shrink-0 space-y-2 rounded-surface border border-warning-border bg-warning-muted p-3 text-label text-warning"><p>尚有未应用的关联修改，确认放弃吗？</p><div className="flex gap-2"><Button variant="outline" onClick={() => setDiscard(false)}>继续编辑</Button><Button variant="destructive" onClick={onClose}>放弃并关闭</Button></div></div>}
            <DialogFooter className="shrink-0 flex-wrap border-t border-border pt-3">
                {!dictionary && !loading && <Button variant="outline" onClick={() => setReload(n => n + 1)}>重新读取</Button>}
                <Button variant="outline" onClick={close} disabled={discard}>取消</Button>
                <Button variant="outline" disabled={discard} onClick={() => { const { variableBinding: _removed, ...unbound } = original; onApply(unbound); onClose(); }}>仅认知预试，不关联数据</Button>
                <Button disabled={loading || !candidate?.ok || discard} data-testid="question-binding-apply" onClick={() => { if (candidate?.ok) { onApply({ ...question, variableBinding: candidate.value }); onClose(); } }}>确认关联到问卷草稿</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>;
}

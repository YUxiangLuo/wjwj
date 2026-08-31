import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AnalysisTarget, StudyContract } from "@/lib/analysis-target";

export interface FieldMappingState {
    identifier?: string;
    stratified: string[];
    numeric: string[];
    others: string[];
    analysisTarget?: AnalysisTarget;
    studyContract?: StudyContract;
}

export function buildDefaultResearchQuestion(topicName: string, target: AnalysisTarget) {
    const subject = topicName.trim() || "本课题";
    return target.kind === "mean"
        ? `${subject}中${target.field}的平均水平是多少？`
        : `${subject}中${target.field}为“${target.value || "目标类别"}”的单位占比是多少？`;
}

export function resolveResearchQuestionForTargetChange(params: {
    topicName: string;
    previousTarget?: AnalysisTarget;
    previousQuestion?: string;
    nextTarget: AnalysisTarget;
}) {
    const previousQuestion = params.previousQuestion ?? "";
    const previousDefault = params.previousTarget
        ? buildDefaultResearchQuestion(params.topicName, params.previousTarget)
        : "";
    if (!previousQuestion.trim() || (previousDefault && previousQuestion.trim() === previousDefault)) {
        return buildDefaultResearchQuestion(params.topicName, params.nextTarget);
    }
    return previousQuestion;
}

export function StudyContractEditor({
    value,
    onChange,
    topicName,
    categoricalFields,
    categoryValues,
    disabled,
}: {
    value: FieldMappingState;
    onChange: (value: FieldMappingState | ((previous: FieldMappingState) => FieldMappingState)) => void;
    topicName: string;
    categoricalFields: string[];
    categoryValues: string[];
    disabled: boolean;
}) {
    const contract = value.studyContract;
    const target = contract?.target ?? value.analysisTarget;
    const updateTarget = (next: AnalysisTarget | undefined) => {
        onChange((previous) => ({
            ...previous,
            analysisTarget: next,
            studyContract: next ? {
                version: 1,
                researchQuestion: resolveResearchQuestionForTargetChange({
                    topicName,
                    previousTarget: previous.studyContract?.target ?? previous.analysisTarget,
                    previousQuestion: previous.studyContract?.researchQuestion,
                    nextTarget: next,
                }),
                targetPopulation: previous.studyContract?.targetPopulation || "上传总体数据中的全部单位",
                unitOfAnalysis: previous.studyContract?.unitOfAnalysis || "总体数据中的一行记录",
                target: next,
            } : undefined,
        }));
    };
    const updateContractText = (key: "researchQuestion" | "targetPopulation" | "unitOfAnalysis", text: string) => {
        onChange((previous) => previous.studyContract ? {
            ...previous,
            studyContract: { ...previous.studyContract, [key]: text },
        } : previous);
    };

    return (
        <div className="space-y-3 rounded-lg border border-border bg-background p-4">
            <div>
                <Label className="text-foreground/90">研究合同（必填）</Label>
                <p className="mt-1 text-xs text-muted-foreground">研究问题、总体、分析单位和估计量会贯穿学生四个阶段。问卷是认知预试，答案不进入估计。</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">估计类型</Label>
                    <Select
                        value={target?.kind ?? ""}
                        disabled={disabled}
                        onValueChange={(kind) => {
                            if (kind === "mean") {
                                const field = value.numeric.includes(target?.field ?? "") ? target!.field : value.numeric[0] ?? "";
                                updateTarget(field ? { kind: "mean", field } : undefined);
                            } else {
                                const field = categoricalFields.includes(target?.field ?? "") ? target!.field : categoricalFields[0] ?? "";
                                updateTarget(field ? { kind: "proportion", field, value: "" } : undefined);
                            }
                        }}
                    >
                        <SelectTrigger aria-label="选择对照估计类型" data-testid="teacher-topic-analysis-kind"><SelectValue placeholder="选择均值或比例" /></SelectTrigger>
                        <SelectContent><SelectItem value="mean">均值</SelectItem><SelectItem value="proportion" disabled={categoricalFields.length === 0}>比例</SelectItem></SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">字段</Label>
                    <Select
                        value={target?.field ?? ""}
                        disabled={disabled || !target}
                        onValueChange={(field) => updateTarget(target?.kind === "proportion" ? { kind: "proportion", field, value: "" } : { kind: "mean", field })}
                    >
                        <SelectTrigger aria-label="选择对照字段" data-testid="teacher-topic-analysis-field"><SelectValue placeholder="选择对照字段" /></SelectTrigger>
                        <SelectContent>{(target?.kind === "proportion" ? categoricalFields : value.numeric).map((field) => <SelectItem key={field} value={field}>{field}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </div>
            {target?.kind === "proportion" && (
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">成功类别</Label>
                    <Select value={target.value} disabled={disabled || categoryValues.length === 0} onValueChange={(category) => updateTarget({ ...target, value: category })}>
                        <SelectTrigger aria-label="选择比例对照类别" data-testid="teacher-topic-analysis-value"><SelectValue placeholder="选择要估计的类别" /></SelectTrigger>
                        <SelectContent>{categoryValues.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            )}
            <div className="space-y-1.5">
                <Label htmlFor="teacher-topic-research-question" className="text-xs text-muted-foreground">研究问题</Label>
                <Textarea id="teacher-topic-research-question" data-testid="teacher-topic-research-question" value={contract?.researchQuestion ?? ""} disabled={disabled || !contract} maxLength={300} placeholder="例如：本校学生每周学习时长的平均水平是多少？" className="min-h-20" onChange={(event) => updateContractText("researchQuestion", event.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="teacher-topic-target-population" className="text-xs text-muted-foreground">目标总体</Label><Input id="teacher-topic-target-population" data-testid="teacher-topic-target-population" value={contract?.targetPopulation ?? ""} disabled={disabled || !contract} maxLength={200} placeholder="例如：总体数据中的全部在校学生" onChange={(event) => updateContractText("targetPopulation", event.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="teacher-topic-unit-of-analysis" className="text-xs text-muted-foreground">分析单位</Label><Input id="teacher-topic-unit-of-analysis" data-testid="teacher-topic-unit-of-analysis" value={contract?.unitOfAnalysis ?? ""} disabled={disabled || !contract} maxLength={100} placeholder="例如：一名学生" onChange={(event) => updateContractText("unitOfAnalysis", event.target.value)} /></div>
            </div>
        </div>
    );
}

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    buildDefaultResearchQuestion,
    resemblesGeneratedResearchQuestion,
    type AnalysisTarget,
    type StudyContract,
} from "@/lib/analysis-target";

export { buildDefaultResearchQuestion } from "@/lib/analysis-target";

export interface FieldMappingState {
    identifier?: string;
    stratified: string[];
    numeric: string[];
    others: string[];
    analysisTarget?: AnalysisTarget;
    studyContract?: StudyContract;
}

/**
 * 对照变量变化时同步研究问题：仅当教师没有手写（为空或仍是上一份默认值）时才重新生成，
 * 避免覆盖教师的自定义表述。
 */
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
    if (
        !previousQuestion.trim()
        || (previousDefault && previousQuestion.trim() === previousDefault)
        || (params.previousTarget && resemblesGeneratedResearchQuestion(previousQuestion, params.previousTarget))
    ) {
        return buildDefaultResearchQuestion(params.topicName, params.nextTarget);
    }
    return previousQuestion;
}

export function buildDefaultStudyContract(topicName: string, target: AnalysisTarget): StudyContract {
    return {
        version: 1,
        researchQuestion: buildDefaultResearchQuestion(topicName, target),
        targetPopulation: "上传总体数据中的全部单位",
        unitOfAnalysis: "总体数据中的一行记录",
        target,
    };
}

/** 研究合同完整性检查（与 lib/analysis-target.ts 的 validateStudyContract 长度约束一致）。 */
export function isStudyContractComplete(contract: StudyContract | null | undefined): boolean {
    if (!contract) return false;
    const target = contract.target;
    const targetOk = target?.kind === "mean"
        ? Boolean(target.field)
        : Boolean(target?.kind === "proportion" && target.field && target.value);
    const questionLength = contract.researchQuestion?.trim().length ?? 0;
    const populationLength = contract.targetPopulation?.trim().length ?? 0;
    const unitLength = contract.unitOfAnalysis?.trim().length ?? 0;
    return Boolean(targetOk)
        && questionLength >= 5 && questionLength <= 300
        && populationLength >= 2 && populationLength <= 200
        && unitLength >= 1 && unitLength <= 100;
}

/**
 * 研究合同编辑器：在对照变量之外补齐研究问题、目标总体和分析单位。
 * 同时维护 fieldMapping.studyContract 与旧版 analysisTarget（两者 target 保持一致），
 * 保证学生端与历史数据读取始终兼容。
 */
export function StudyContractEditor({
    value,
    onChange,
    topicName,
    categoricalFields,
    analysisCategoryValues,
    disabled,
}: {
    value: FieldMappingState;
    onChange: (value: FieldMappingState | ((previous: FieldMappingState) => FieldMappingState)) => void;
    topicName: string;
    categoricalFields: string[];
    analysisCategoryValues: string[];
    disabled: boolean;
}) {
    const contract = value.studyContract;
    const target = contract?.target ?? value.analysisTarget;

    const writeContract = (next: StudyContract) => {
        onChange((previous) => ({
            ...previous,
            analysisTarget: next.target,
            studyContract: next,
        }));
    };

    const currentContract = (): StudyContract | null => {
        if (value.studyContract) return value.studyContract;
        return target ? buildDefaultStudyContract(topicName, target) : null;
    };

    const updateTarget = (next: AnalysisTarget | undefined) => {
        if (!next) {
            onChange((previous) => {
                const { analysisTarget: _legacy, studyContract: _contract, ...rest } = previous;
                return rest;
            });
            return;
        }
        const previous = currentContract();
        const researchQuestion = resolveResearchQuestionForTargetChange({
            topicName,
            previousTarget: previous?.target,
            previousQuestion: previous?.researchQuestion,
            nextTarget: next,
        });
        writeContract({
            version: 1,
            researchQuestion,
            targetPopulation: previous?.targetPopulation ?? "上传总体数据中的全部单位",
            unitOfAnalysis: previous?.unitOfAnalysis ?? "总体数据中的一行记录",
            target: next,
        });
    };

    const updateText = (key: "researchQuestion" | "targetPopulation" | "unitOfAnalysis", text: string) => {
        const previous = currentContract();
        if (!previous) return;
        writeContract({ ...previous, [key]: text });
    };

    return (
        <div className="space-y-3 rounded-lg border border-border bg-background p-4" data-testid="teacher-study-contract-editor">
            <div>
                <Label className="text-foreground/90">研究合同（必选）</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                    学生的规划与分析都钉在这份研究目标上。问卷是预试，答案不进入估计。PPS 规模变量不能与对照变量相同。
                </p>
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">研究问题</Label>
                <Textarea
                    value={contract?.researchQuestion ?? (target ? buildDefaultResearchQuestion(topicName, target) : "")}
                    disabled={disabled || !target}
                    rows={2}
                    maxLength={300}
                    placeholder="本课题要回答的研究问题（5-300 字）"
                    aria-label="研究问题"
                    data-testid="teacher-contract-question"
                    onChange={(e) => updateText("researchQuestion", e.target.value)}
                    className="bg-background border-border text-foreground"
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">目标总体</Label>
                    <Input
                        value={contract?.targetPopulation ?? "上传总体数据中的全部单位"}
                        disabled={disabled || !target}
                        maxLength={200}
                        placeholder="例如：某高校全体本科生"
                        aria-label="目标总体"
                        data-testid="teacher-contract-population"
                        onChange={(e) => updateText("targetPopulation", e.target.value)}
                        className="bg-background border-border text-foreground"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">分析单位</Label>
                    <Input
                        value={contract?.unitOfAnalysis ?? "总体数据中的一行记录"}
                        disabled={disabled || !target}
                        maxLength={100}
                        placeholder="例如：一名学生"
                        aria-label="分析单位"
                        data-testid="teacher-contract-unit"
                        onChange={(e) => updateText("unitOfAnalysis", e.target.value)}
                        className="bg-background border-border text-foreground"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">估计类型</Label>
                    <Select
                        value={target?.kind ?? ""}
                        disabled={disabled}
                        onValueChange={(kind) => {
                            if (kind === "mean") {
                                const field = value.numeric.includes(target?.field ?? "")
                                    ? target!.field
                                    : (value.numeric[0] ?? "");
                                updateTarget(field ? { kind: "mean", field } : undefined);
                                return;
                            }
                            const field = categoricalFields.includes(target?.field ?? "")
                                ? target!.field
                                : (categoricalFields[0] ?? "");
                            updateTarget(field ? { kind: "proportion", field, value: "" } : undefined);
                        }}
                    >
                        <SelectTrigger aria-label="选择对照估计类型" data-testid="teacher-topic-analysis-kind" className="bg-background border-border">
                            <SelectValue placeholder="选择均值或比例" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="mean">均值</SelectItem>
                            <SelectItem value="proportion" disabled={categoricalFields.length === 0}>比例</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">字段</Label>
                    <Select
                        value={target?.field ?? ""}
                        disabled={disabled || !target?.kind}
                        onValueChange={(field) => {
                            if (target?.kind === "proportion") {
                                updateTarget({ kind: "proportion", field, value: "" });
                            } else {
                                updateTarget({ kind: "mean", field });
                            }
                        }}
                    >
                        <SelectTrigger aria-label="选择对照字段" data-testid="teacher-topic-analysis-field" className="bg-background border-border">
                            <SelectValue placeholder="选择对照字段" />
                        </SelectTrigger>
                        <SelectContent>
                            {(target?.kind === "proportion" ? categoricalFields : value.numeric).map((field) => (
                                <SelectItem key={field} value={field}>{field}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {target?.kind === "proportion" && (
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">成功类别</Label>
                    <Select
                        value={target.value}
                        disabled={disabled || analysisCategoryValues.length === 0}
                        onValueChange={(category) => {
                            if (target.kind === "proportion") {
                                updateTarget({ ...target, value: category });
                            }
                        }}
                    >
                        <SelectTrigger aria-label="选择比例对照类别" data-testid="teacher-topic-analysis-value" className="bg-background border-border">
                            <SelectValue placeholder="选择要估计的类别" />
                        </SelectTrigger>
                        <SelectContent>
                            {analysisCategoryValues.map((category) => (
                                <SelectItem key={category} value={category}>{category}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
        </div>
    );
}

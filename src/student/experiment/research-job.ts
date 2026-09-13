import { isVariableMissing } from "@/domain/experiment/variable-dictionary";
import { parseResearchSpec, RESEARCH_METHODS, type ResearchRun, type ResearchSpec } from "@/domain/experiment/research-analysis";
import { describeVariable, DescriptiveError } from "@/domain/statistics/descriptive";
import { readVerifiedResearchInput, type CodebookJob } from "./codebook-job";
import { CodebookError } from "./codebook-workbook";
import { restoreResearchSample } from "./research-sample";
import { researchHash, researchSourceFingerprint } from "./research-source";
export interface ResearchJob { source: CodebookJob; spec: ResearchSpec; stage3CompletedAt: string; samplingRevision: number }
export type ResearchJobResult = { ok: true; run: Omit<ResearchRun, "id" | "createdAt"> } | { ok: false; message: string; code: string; status: number };
export async function runResearchJob(job: ResearchJob): Promise<ResearchJobResult> {
    try {
        if (!Number.isSafeInteger(job.samplingRevision) || job.samplingRevision < 1) throw new DescriptiveError("缺少抽样成果的单调修订，不能按时间猜测来源代次");
        const spec = parseResearchSpec(job.spec); if (typeof spec === "string") throw new DescriptiveError(spec);
        if (job.source.status !== "in_progress" && job.source.status !== "rejected") throw new DescriptiveError("只能在未提交的分析阶段运行");
        // Rejected work uses its live, reopened workspace, not its previous frozen submission.
        const input = await readVerifiedResearchInput({ ...job.source, status: "in_progress" });
        if (!input.results || typeof input.results !== "object" || Array.isArray(input.results) || Object.keys(input.results).some(k => !(RESEARCH_METHODS as readonly string[]).includes(k))) throw new DescriptiveError("抽样结果协议无效");
        const variable = input.dictionary.variables.find(v => v.id === spec.variableId);
        if (!variable) throw new DescriptiveError("变量不属于本任务的确认字典");
        const section = (input.results as Record<string, unknown>)[spec.method];
        const { rows, weights } = await restoreResearchSample(spec.method, section, input.population);
        if (spec.mode === "design-weighted" && input.population.some(row => isVariableMissing(row[variable.sourceField], variable.missingValues))) throw new DescriptiveError("总体分析字段含缺失，不能声明完整总体的设计加权点估计；请选择原始样本描述");
        const result = describeVariable(variable, rows.map(row => row[variable.sourceField]), spec.mode === "design-weighted" ? weights : null);
        const fingerprint = researchSourceFingerprint({ experimentId: input.experimentId, taskId: input.taskId, dictionary: input.dictionary, method: spec.method, section, stage3CompletedAt: job.stage3CompletedAt, samplingRevision: job.samplingRevision });
        return { ok: true, run: { schemaVersion: 1, algorithmVersion: "descriptive-v1", spec, variable, source: { fingerprint, datasetRevision: input.dictionary.datasetRevision, dictionaryRevision: input.dictionary.revision, populationFileSha256: input.populationFileSha256,
            populationSize: input.population.length, sampleRevision: researchHash({ section, stage3CompletedAt: job.stage3CompletedAt, samplingRevision: job.samplingRevision }), samplingRevision: job.samplingRevision, parserVersion: "spreadsheet-v2", samplingAlgorithmVersion: "sampling-v2" }, result } };
    } catch (cause) {
        if (cause instanceof CodebookError) return { ok: false, code: cause.code, message: cause.message, status: cause.status };
        if (cause instanceof DescriptiveError) return { ok: false, code: "INVALID_RESEARCH_ANALYSIS", message: cause.message, status: 409 };
        console.error("Research analysis failed", cause);
        return { ok: false, code: "RESEARCH_FAILED", message: "分析失败，请检查来源或稍后重试", status: 500 };
    }
}

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { experiment, researchAnalysisRun } from "@/db/schema";
import { parseResearchReferences, parseResearchSpec, ResearchAnalysisError, type ResearchRun } from "@/domain/experiment/research-analysis";
import type { VariableDictionaryV1 } from "@/domain/experiment/variable-dictionary";
import { researchHash, researchSourceFingerprint } from "./research-source";
const object = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const hash = (x: unknown) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const keys = (x: Record<string, unknown>, names: string[]) => Object.keys(x).length === names.length && Object.keys(x).every(k => names.includes(k));
const code = (x: unknown) => typeof x === "boolean" || (typeof x === "number" && Number.isFinite(x)) || (typeof x === "string" && x.length <= 200 && !!x.trim() && !x.includes("\0"));
export function readResearchRun(raw: unknown): ResearchRun {
    if (!object(raw) || Object.keys(raw).length !== 8 || raw.schemaVersion !== 1 || raw.algorithmVersion !== "descriptive-v1" || typeof parseResearchReferences([raw.id]) === "string" || typeof raw.createdAt !== "string" || !Number.isFinite(Date.parse(raw.createdAt)) || typeof parseResearchSpec(raw.spec) === "string"
        || !object(raw.source) || !hash(raw.source.fingerprint) || !hash(raw.source.sampleRevision) || !hash(raw.source.datasetRevision) || !hash(raw.source.populationFileSha256) || raw.source.parserVersion !== "spreadsheet-v2" || raw.source.samplingAlgorithmVersion !== "sampling-v2"
        || !object(raw.variable) || raw.variable.id !== raw.spec.variableId || typeof raw.variable.sourceField !== "string" || typeof raw.variable.label !== "string" || !object(raw.result) || !["numeric", "categorical"].includes(raw.result.kind)) throw new ResearchAnalysisError("分析记录存储无效，请联系管理员；不会修补结果", "INVALID_RESEARCH_STORAGE");
    const v = raw.variable, s = raw.source, r = raw.result;
    if (!keys(s, ["fingerprint", "datasetRevision", "dictionaryRevision", "populationFileSha256", "populationSize", "sampleRevision", "samplingRevision", "parserVersion", "samplingAlgorithmVersion"]) || !Number.isSafeInteger(s.dictionaryRevision) || s.dictionaryRevision < 1 || !Number.isSafeInteger(s.samplingRevision) || s.samplingRevision < 1 || !Number.isInteger(s.populationSize) || s.populationSize < 1 || s.populationSize > 100_000
        || !keys(v, ["id", "sourceField", "label", "storageType", "measurementLevel", "unit", "categories", "missingValues"]) || !v.sourceField || v.sourceField.length > 1000 || v.sourceField.includes("\0") || !v.label.trim() || v.label.length > 200 || typeof v.unit !== "string" || v.unit.length > 40
        || !["text", "number"].includes(v.storageType) || !["continuous", "nominal", "ordinal"].includes(v.measurementLevel)
        || !Array.isArray(v.categories) || v.categories.length > 50 || v.categories.some((c: unknown) => !object(c) || !keys(c, ["value", "label"]) || !code(c.value) || typeof c.label !== "string" || !c.label.trim() || c.label.length > 200)
        || !Array.isArray(v.missingValues) || v.missingValues.length > 20 || v.missingValues.some((c: unknown) => !code(c))
        || !keys(r, ["kind", "sampleCount", "validCount", "missingCount", "weightSum", "mean", "sampleSD", "min", "q1", "median", "q3", "max", "categories", "notes"])) throw new ResearchAnalysisError("分析来源或结果协议无效，请联系管理员", "INVALID_RESEARCH_STORAGE");
    if (!Number.isInteger(r.sampleCount) || r.sampleCount < 1 || r.sampleCount > s.populationSize || !Number.isInteger(r.validCount) || r.validCount < 0 || !Number.isInteger(r.missingCount) || r.missingCount < 0 || r.validCount + r.missingCount !== r.sampleCount
        || !Array.isArray(r.notes) || r.notes.length > 10 || r.notes.some((s: unknown) => typeof s !== "string" || s.length > 500) || !Array.isArray(r.categories) || r.categories.length > 50
        || r.categories.some((c: unknown) => !object(c) || !keys(c, ["value", "label", "count", "proportion"]) || !code(c.value) || typeof c.label !== "string" || !Number.isInteger(c.count) || c.count < 0 || (c.proportion !== null && (typeof c.proportion !== "number" || !Number.isFinite(c.proportion) || c.proportion < 0 || c.proportion > 1)))
        || ["mean", "sampleSD", "min", "q1", "median", "q3", "max"].some(k => r[k] !== null && (typeof r[k] !== "number" || !Number.isFinite(r[k])))
        || typeof r.weightSum !== "number" || !Number.isFinite(r.weightSum) || r.weightSum < 0) throw new ResearchAnalysisError("分析统计量存储无效，请联系管理员", "INVALID_RESEARCH_STORAGE");
    if ((v.measurementLevel === "continuous") !== (r.kind === "numeric") || (r.kind === "numeric" && (v.storageType !== "number" || r.categories.length))
        || (r.kind === "categorical" && (r.categories.length !== v.categories.length || r.categories.some((c: any, i: number) => c.value !== v.categories[i].value || typeof c.value !== typeof v.categories[i].value || c.label !== v.categories[i].label) || r.categories.reduce((n: number, c: any) => n + c.count, 0) !== r.validCount))
        || (raw.spec.mode === "raw" && r.weightSum !== r.validCount) || (raw.spec.mode === "design-weighted" && (r.missingCount !== 0 || r.weightSum < r.validCount || ["sampleSD", "min", "q1", "median", "q3", "max"].some(k => r[k] !== null)))) throw new ResearchAnalysisError("分析口径与统计量不一致", "INVALID_RESEARCH_STORAGE");
    return raw as ResearchRun;
}
export function readResearchAppendix(raw: unknown): ResearchRun[] {
    if (raw === undefined) return []; // No analyses selected for this optional report appendix.
    if (!Array.isArray(raw) || raw.length > 10) throw new ResearchAnalysisError("报告分析附录存储无效", "INVALID_RESEARCH_STORAGE");
    const runs = raw.map(readResearchRun);
    if (new Set(runs.map(run => run.id)).size !== runs.length) throw new ResearchAnalysisError("报告分析附录身份重复", "INVALID_RESEARCH_STORAGE");
    return runs;
}
export function isResearchRunCurrent(record: Pick<typeof experiment.$inferSelect, "id" | "taskId" | "samplingResults" | "stage3CompletedAt" | "samplingRevision">, dictionary: VariableDictionaryV1 | null, run: ResearchRun) {
    if (!dictionary || !record.stage3CompletedAt || !Number.isInteger(record.samplingRevision) || record.samplingRevision < 1 || !object(record.samplingResults) || !object(record.samplingResults[run.spec.method])) return false;
    if (run.source.samplingRevision !== record.samplingRevision || run.source.datasetRevision !== dictionary.datasetRevision || run.source.dictionaryRevision !== dictionary.revision || !Bun.deepEquals(run.variable, dictionary.variables.find(v => v.id === run.spec.variableId))
        || run.source.sampleRevision !== researchHash({ section: record.samplingResults[run.spec.method], stage3CompletedAt: record.stage3CompletedAt.toISOString(), samplingRevision: record.samplingRevision })) return false;
    return run.source.fingerprint === researchSourceFingerprint({ experimentId: record.id, taskId: record.taskId, dictionary, method: run.spec.method, section: record.samplingResults[run.spec.method], stage3CompletedAt: record.stage3CompletedAt.toISOString(), samplingRevision: record.samplingRevision });
}
/** References are optional, but every supplied reference must be owned and reproducible from the current source. */
export async function collectResearchReferences(record: typeof experiment.$inferSelect, dictionary: VariableDictionaryV1 | null, refs: unknown = record.analysisReferences) {
    const ids = parseResearchReferences(refs);
    if (typeof ids === "string") throw new ResearchAnalysisError(ids);
    if (!ids.length) return [];
    const rows = await db.select().from(researchAnalysisRun).where(and(eq(researchAnalysisRun.experimentId, record.id), inArray(researchAnalysisRun.id, ids)));
    const documents = new Map(rows.map(row => [row.id, readResearchRun(row.document)]));
    return ids.map(id => {
        const run = documents.get(id);
        if (!run || !isResearchRunCurrent(record, dictionary, run)) throw new ResearchAnalysisError("报告引用含不存在、非本人或过期的分析，请重新运行、替换或明确移除", "STALE_RESEARCH_REFERENCE");
        return run;
    });
}

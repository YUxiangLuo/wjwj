import type { ResearchList, ResearchRun } from "@/domain/experiment/research-analysis";
import type { VariableDictionaryV1 } from "@/domain/experiment/variable-dictionary";
import { describeVariable } from "@/domain/statistics/descriptive";
export function researchFixture() {
    const dictionary: VariableDictionaryV1 = { schemaVersion: 1, revision: 1, parserVersion: "spreadsheet-v2", datasetRevision: "a".repeat(64), variables: [
        { id: "v_1", sourceField: "编号", label: "编号", storageType: "text", measurementLevel: "id", unit: "", missingValues: [], categories: [] },
        { id: "v_2", sourceField: " 等待分钟 ", label: "等待时长", storageType: "number", measurementLevel: "continuous", unit: "分钟", missingValues: [], categories: [] },
    ] };
    const run: ResearchRun = { id: "12345678-1234-4234-8234-123456789abc", schemaVersion: 1, algorithmVersion: "descriptive-v1", createdAt: "2026-01-01T00:00:00.000Z", spec: { schemaVersion: 1, method: "simple", variableId: "v_2", mode: "raw", question: "等待时长如何分布？" }, variable: dictionary.variables[1]!,
        source: { fingerprint: "b".repeat(64), sampleRevision: "c".repeat(64), samplingRevision: 3, datasetRevision: dictionary.datasetRevision, dictionaryRevision: 1, populationSize: 4, populationFileSha256: "d".repeat(64), parserVersion: "spreadsheet-v2", samplingAlgorithmVersion: "sampling-v2" }, result: describeVariable(dictionary.variables[1]!, [1, 2, 3, 4], null) };
    const list: ResearchList = { dictionary, sourceError: null, methods: ["simple"], references: [], runs: [] };
    return { dictionary, run, list };
}

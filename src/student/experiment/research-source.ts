import type { VariableDictionaryV1 } from "@/domain/experiment/variable-dictionary";
import type { ResearchMethod } from "@/domain/experiment/research-analysis";

function canonical(value: unknown): unknown {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
    throw new Error("分析来源包含非原生JSON值");
}
export function researchHash(value: unknown) { return new Bun.CryptoHasher("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export function researchSourceFingerprint(input: { experimentId: number; taskId: number; dictionary: VariableDictionaryV1; method: ResearchMethod; section: unknown; stage3CompletedAt: string; samplingRevision: number }) {
    return researchHash({ samplingAlgorithmVersion: "sampling-v2", ...input });
}

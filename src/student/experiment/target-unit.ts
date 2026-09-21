import { resolveAnalysisTarget } from "@/lib/analysis-target";
import type { VariableDictionary } from "@/domain/variables/types";

export function resolveTargetUnit(fieldMapping: unknown, dictionary: VariableDictionary | null | undefined) {
    const target = resolveAnalysisTarget(fieldMapping)?.target;
    if (!target) return "";
    if (target.kind === "proportion") return "%";
    return dictionary?.variables.find(variable => variable.field === target.field)?.unit.trim() ?? "";
}

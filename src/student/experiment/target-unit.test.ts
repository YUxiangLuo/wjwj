import { expect, test } from "bun:test";
import type { VariableDictionary } from "@/domain/variables/types";
import { resolveTargetUnit } from "./target-unit";

const dictionary: VariableDictionary = {
    source: "fixture",
    revision: 1,
    variables: [
        { field: "weight", label: "重量", unit: " kg ", kind: "continuous", categories: [], missing: [] },
        { field: "eligible", label: "是否符合", unit: "人", kind: "nominal", categories: [], missing: [] },
    ],
};

test("mean targets use the trimmed dictionary unit", () => {
    expect(resolveTargetUnit({ analysisTarget: { kind: "mean", field: "weight" } }, dictionary)).toBe("kg");
});

test("proportion targets always use percent rather than a variable unit", () => {
    expect(resolveTargetUnit({ analysisTarget: { kind: "proportion", field: "eligible", value: "是" } }, dictionary)).toBe("%");
});

test("missing target metadata has no display unit", () => {
    expect(resolveTargetUnit(null, dictionary)).toBe("");
});

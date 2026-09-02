import { expect, test } from "bun:test";
import { buildSamplingResultsCsvExport } from "./sampling-results-export";

test("PPS export includes aligned inclusion probabilities and design weights", () => {
    const result = buildSamplingResultsCsvExport({
        pps: {
            data: [{ id: 1, size: 10 }, { id: 2, size: 20 }],
            inclusionProbabilities: [0.25, 0.5],
        },
    }, "pps");
    expect(result?.csv).toContain("__wj_inclusion_probability");
    expect(result?.csv).toContain("__wj_design_weight");
    expect(result?.csv).toContain("0.25,4");
});

test("legacy PPS export keeps working when no probability vector is stored", () => {
    const result = buildSamplingResultsCsvExport({ pps: { data: [{ id: 1 }] } }, "pps");
    expect(result?.csv).toBe("id\n1");
});

test("sampling export preserves colliding legacy metadata and neutralizes formulas", () => {
    const result = buildSamplingResultsCsvExport({
        pps: {
            data: [{
                id: "=1+1",
                __wj_method: "user-method",
                __wj_inclusion_probability: "user-probability",
                __wj_design_weight: "user-weight",
            }],
            inclusionProbabilities: [0.5],
        },
    }, "all");

    expect(result?.csv).toContain("'=1+1");
    expect(result?.csv).toContain("__wj_method_2");
    expect(result?.csv).toContain("__wj_inclusion_probability_2");
    expect(result?.csv).toContain("__wj_design_weight_2");
    expect(result?.csv).toContain("user-method,user-probability,user-weight");
});

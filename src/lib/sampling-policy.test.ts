import { describe, expect, test } from "bun:test";
import {
    buildDefaultSamplingPolicy,
    evaluateSamplingPolicy,
    getSamplingMethodState,
    parseSamplingPolicy,
    validateSamplingPolicy,
} from "./sampling-policy";

describe("sampling policy", () => {
    test("the default requires simple sampling and any second enabled method", () => {
        const policy = buildDefaultSamplingPolicy();
        expect(evaluateSamplingPolicy(policy, ["simple"]).canComplete).toBeFalse();
        expect(evaluateSamplingPolicy(policy, ["simple", "stratified"]).canComplete).toBeTrue();
    });

    test("all explicitly required methods must be completed", () => {
        const policy = buildDefaultSamplingPolicy();
        policy.methods.pps = "required";
        expect(evaluateSamplingPolicy(policy, ["simple", "systematic"]).missingRequired).toEqual(["pps"]);
        expect(evaluateSamplingPolicy(policy, ["simple", "pps"]).canComplete).toBeTrue();
        expect(evaluateSamplingPolicy(policy, ["simple", "pps"]).minimumCompleted).toBe(2);
    });

    test("minimum completed count follows teacher required methods, never below two enabled methods", () => {
        const policy = buildDefaultSamplingPolicy();
        expect(evaluateSamplingPolicy(policy, []).minimumCompleted).toBe(2);
        policy.methods.systematic = "required";
        policy.methods.pps = "required";
        expect(evaluateSamplingPolicy(policy, ["simple", "systematic"]).minimumCompleted).toBe(3);
        expect(evaluateSamplingPolicy(policy, ["simple", "systematic"]).canComplete).toBeFalse();
        expect(evaluateSamplingPolicy(policy, ["simple", "systematic", "pps"]).canComplete).toBeTrue();
    });

    test("disabled methods do not count and policies keep at least two methods", () => {
        const policy = buildDefaultSamplingPolicy({ ppsEnabled: false });
        policy.methods.systematic = "disabled";
        expect(evaluateSamplingPolicy(policy, ["simple", "pps"]).canComplete).toBeFalse();
        policy.methods.stratified = "disabled";
        expect(validateSamplingPolicy(policy)).toBe("至少需要启用两种抽样方法");
    });

    test("default capabilities can disable PPS and stratified sampling independently", () => {
        expect(buildDefaultSamplingPolicy({ ppsEnabled: false, stratifiedEnabled: false }).methods).toEqual({
            simple: "required",
            systematic: "optional",
            pps: "disabled",
            stratified: "disabled",
        });
    });

    test("parsing accepts stored JSON and rejects unknown method keys", () => {
        expect(parseSamplingPolicy(JSON.stringify(buildDefaultSamplingPolicy()))).toEqual(buildDefaultSamplingPolicy());
        expect(parseSamplingPolicy({
            ...buildDefaultSamplingPolicy(),
            methods: { ...buildDefaultSamplingPolicy().methods, cluster: "optional" },
        })).toBeNull();
    });

    test("display state distinguishes disabled, unavailable, unselected, and incomplete methods", () => {
        const policy = buildDefaultSamplingPolicy();
        expect(getSamplingMethodState(policy, "simple", undefined)).toBe("incomplete");
        expect(getSamplingMethodState(policy, "pps", undefined)).toBe("unselected");
        expect(getSamplingMethodState(policy, "pps", { unavailable: true })).toBe("unavailable");
        expect(getSamplingMethodState(policy, "pps", { completed: true })).toBe("completed");
        policy.methods.pps = "disabled";
        expect(getSamplingMethodState(policy, "pps", { completed: true })).toBe("disabled");
    });
});

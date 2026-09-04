export const SAMPLING_METHODS = ["simple", "systematic", "pps", "stratified"] as const;

export type SamplingMethod = (typeof SAMPLING_METHODS)[number];
export type SamplingMethodRequirement = "required" | "optional" | "disabled";

export interface SamplingPolicyV1 {
    version: 1;
    methods: Record<SamplingMethod, SamplingMethodRequirement>;
}

export const DEFAULT_SAMPLING_POLICY: SamplingPolicyV1 = Object.freeze({
    version: 1,
    methods: Object.freeze({
        simple: "required",
        systematic: "optional",
        pps: "optional",
        stratified: "optional",
    }),
});

export function buildDefaultSamplingPolicy(options: { ppsEnabled?: boolean; stratifiedEnabled?: boolean } = {}): SamplingPolicyV1 {
    return {
        version: 1,
        methods: {
            ...DEFAULT_SAMPLING_POLICY.methods,
            pps: options.ppsEnabled === false ? "disabled" : "optional",
            stratified: options.stratifiedEnabled === false ? "disabled" : "optional",
        },
    };
}

function parseObject(value: unknown): Record<string, unknown> | null {
    let parsed = value;
    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return null;
        }
    }
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
}

export function parseSamplingPolicy(value: unknown): SamplingPolicyV1 | null {
    const root = parseObject(value);
    if (!root || root.version !== 1) return null;
    const methods = parseObject(root.methods);
    if (!methods) return null;

    const parsed = {} as Record<SamplingMethod, SamplingMethodRequirement>;
    for (const method of SAMPLING_METHODS) {
        const requirement = methods[method];
        if (requirement !== "required" && requirement !== "optional" && requirement !== "disabled") {
            return null;
        }
        parsed[method] = requirement;
    }
    if (Object.keys(methods).some((key) => !(SAMPLING_METHODS as readonly string[]).includes(key))) {
        return null;
    }
    return { version: 1, methods: parsed };
}

export function validateSamplingPolicy(value: unknown): string | null {
    const policy = parseSamplingPolicy(value);
    if (!policy) return "抽样策略格式无效";
    if (policy.methods.simple !== "required") return "简单随机抽样必须设为必做";
    const enabledCount = SAMPLING_METHODS.filter((method) => policy.methods[method] !== "disabled").length;
    if (enabledCount < 2) return "至少需要启用两种抽样方法";
    return null;
}

export function resolveSamplingPolicy(value: unknown): SamplingPolicyV1 {
    return parseSamplingPolicy(value) ?? buildDefaultSamplingPolicy();
}

export function enabledSamplingMethods(policyValue: unknown) {
    const policy = resolveSamplingPolicy(policyValue);
    return SAMPLING_METHODS.filter((method) => policy.methods[method] !== "disabled");
}

export function requiredSamplingMethods(policyValue: unknown) {
    const policy = resolveSamplingPolicy(policyValue);
    return SAMPLING_METHODS.filter((method) => policy.methods[method] === "required");
}

export function isCompletedSamplingResult(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const result = value as Record<string, unknown>;
    return result.unavailable !== true && (result.completed === true || result.completed === 1);
}

export type SamplingMethodState = "disabled" | "unavailable" | "completed" | "unselected" | "incomplete";

export function getSamplingMethodState(
    policyValue: unknown,
    method: SamplingMethod,
    resultValue: unknown,
): SamplingMethodState {
    const policy = resolveSamplingPolicy(policyValue);
    if (policy.methods[method] === "disabled") return "disabled";
    if (resultValue && typeof resultValue === "object" && !Array.isArray(resultValue)) {
        if ((resultValue as Record<string, unknown>).unavailable === true) return "unavailable";
    }
    if (isCompletedSamplingResult(resultValue)) return "completed";
    return policy.methods[method] === "optional" ? "unselected" : "incomplete";
}

export function evaluateSamplingPolicy(
    policyValue: unknown,
    completedMethods: Iterable<SamplingMethod>,
) {
    const policy = resolveSamplingPolicy(policyValue);
    const completed = new Set(completedMethods);
    const enabled = enabledSamplingMethods(policy);
    const required = requiredSamplingMethods(policy);
    const completedEnabled = enabled.filter((method) => completed.has(method));
    const missingRequired = required.filter((method) => !completed.has(method));
    return {
        policy,
        enabled,
        required,
        completed: completedEnabled,
        missingRequired,
        canComplete: missingRequired.length === 0 && completedEnabled.length >= 2,
    };
}

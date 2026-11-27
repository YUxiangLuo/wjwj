export interface ScoringWeights {
    questionnaire: number;
    process: number;
    report: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
    questionnaire: 30,
    process: 30,
    report: 40,
};

export const SCORING_WEIGHT_TOTAL_HUNDREDTHS = 10_000;

export function isValidScore(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
        && Math.round(value * 100) / 100 === value;
}

export function isValidScoringWeightValue(value: unknown): value is number {
    return typeof value === "number"
        && Number.isFinite(value)
        && Math.round(value * 100) / 100 === value;
}

export function scoringWeightHundredths(value: number): number {
    return Math.round(value * 100);
}

export function isScoringWeightTotalValid(weights: ScoringWeights): boolean {
    return isValidScoringWeightValue(weights.questionnaire)
        && isValidScoringWeightValue(weights.process)
        && isValidScoringWeightValue(weights.report)
        && (
            scoringWeightHundredths(weights.questionnaire)
            + scoringWeightHundredths(weights.process)
            + scoringWeightHundredths(weights.report)
        ) === SCORING_WEIGHT_TOTAL_HUNDREDTHS;
}

export function formatScoringWeightTotal(weights: ScoringWeights): string {
    if (
        isValidScoringWeightValue(weights.questionnaire)
        && isValidScoringWeightValue(weights.process)
        && isValidScoringWeightValue(weights.report)
    ) {
        const hundredths = scoringWeightHundredths(weights.questionnaire)
            + scoringWeightHundredths(weights.process)
            + scoringWeightHundredths(weights.report);
        return String(hundredths / 100);
    }
    const rawSum = weights.questionnaire + weights.process + weights.report;
    return Number.isFinite(rawSum) ? String(Number(rawSum.toPrecision(12))) : "0";
}

export function sanitizeScoringWeights(weights: ScoringWeights): ScoringWeights {
    return {
        questionnaire: weights.questionnaire,
        process: weights.process,
        report: weights.report,
    };
}

// Scores are integer hundredths. Scale decimal percentage weights to integers
// too, so an exact half-cent always rounds up rather than following float error.
export function weightedScore(scores: ScoringWeights, weights: ScoringWeights): number {
    const keys = ["questionnaire", "process", "report"] as const;
    if (keys.some(key => !isValidScore(scores[key]))) throw new RangeError("Invalid score precision or range");
    const places = Math.max(...keys.map(key => String(weights[key]).split(".")[1]?.length ?? 0));
    const scale = 10n ** BigInt(places);
    const numerator = keys.reduce((sum, key) => {
        const [whole, fraction = ""] = String(weights[key]).split(".");
        const weight = BigInt(whole!) * scale + BigInt(fraction.padEnd(places, "0") || "0");
        return sum + BigInt(Math.round(scores[key] * 100)) * weight;
    }, 0n);
    const denominator = 100n * scale;
    return Number((numerator * 2n + denominator) / (denominator * 2n)) / 100;
}

export function scoringWeightsFrom(value: unknown): ScoringWeights {
    let parsed = value;
    if (typeof value === "string") {
        try {
            parsed = JSON.parse(value);
        } catch {
            return { ...DEFAULT_SCORING_WEIGHTS };
        }
    }
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SCORING_WEIGHTS };

    const candidate = parsed as Partial<ScoringWeights>;
    if (
        !isValidScoringWeightValue(candidate.questionnaire)
        || !isValidScoringWeightValue(candidate.process)
        || !isValidScoringWeightValue(candidate.report)
    ) {
        return { ...DEFAULT_SCORING_WEIGHTS };
    }
    const clean = sanitizeScoringWeights({
        questionnaire: candidate.questionnaire,
        process: candidate.process,
        report: candidate.report,
    });
    if (!isScoringWeightTotalValid(clean)) {
        return { ...DEFAULT_SCORING_WEIGHTS };
    }
    if (
        clean.questionnaire < 10
        || clean.questionnaire > 50
        || clean.process < 20
        || clean.process > 60
        || clean.report < 10
        || clean.report > 50
    ) {
        return { ...DEFAULT_SCORING_WEIGHTS };
    }

    return clean;
}

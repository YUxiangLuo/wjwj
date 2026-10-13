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

export function isValidScore(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
        && Math.round(value * 100) / 100 === value;
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
    const weights = [candidate.questionnaire, candidate.process, candidate.report];
    if (weights.some((weight) => typeof weight !== "number" || !Number.isFinite(weight))) {
        return { ...DEFAULT_SCORING_WEIGHTS };
    }
    if (candidate.questionnaire! + candidate.process! + candidate.report! !== 100) {
        return { ...DEFAULT_SCORING_WEIGHTS };
    }
    if (
        candidate.questionnaire! < 10
        || candidate.questionnaire! > 50
        || candidate.process! < 20
        || candidate.process! > 60
        || candidate.report! < 10
        || candidate.report! > 50
    ) {
        return { ...DEFAULT_SCORING_WEIGHTS };
    }

    return {
        questionnaire: candidate.questionnaire!,
        process: candidate.process!,
        report: candidate.report!,
    };
}

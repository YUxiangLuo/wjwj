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

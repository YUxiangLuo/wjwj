const SAMPLING_METHODS = ["simple", "systematic", "pps", "stratified"] as const;

type SamplingMethod = typeof SAMPLING_METHODS[number];
type SamplingSection = Record<string, unknown> & {
    data?: unknown[];
    indices?: unknown;
};
type SamplingResults = Partial<Record<SamplingMethod, SamplingSection>>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function compactSamplingMethodResult<T extends Record<string, unknown>>(result: T) {
    // Legacy records have embedded rows but no replay indices; keep those rows
    // so an in-progress pre-migration experiment can still be submitted safely.
    if (!Array.isArray(result.indices)) return { ...result };
    const { data: _data, ...compact } = result;
    return compact;
}

export function compactSamplingResults(value: unknown): SamplingResults | null {
    if (!isRecord(value)) return null;

    const compact: SamplingResults = {};
    for (const method of SAMPLING_METHODS) {
        const section = value[method];
        if (isRecord(section)) compact[method] = compactSamplingMethodResult(section);
    }
    return compact;
}

function hydrateSection(section: SamplingSection, population: Array<Record<string, unknown>>) {
    // Historical rows already contain complete samples and remain readable.
    if (Array.isArray(section.data)) return section;
    if (!Array.isArray(section.indices)) return section;

    const indices = section.indices.filter(
        (value): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < population.length,
    );
    if (indices.length !== section.indices.length) {
        return { ...section, data: [] };
    }
    return { ...section, data: indices.map((index) => population[index]!) };
}

export function hydrateSamplingResults(
    value: unknown,
    population: Array<Record<string, unknown>>,
): SamplingResults | null {
    if (!isRecord(value)) return null;

    const hydrated: SamplingResults = {};
    for (const method of SAMPLING_METHODS) {
        const section = value[method];
        if (isRecord(section)) hydrated[method] = hydrateSection(section, population);
    }
    return hydrated;
}

export function samplingResultsNeedPopulation(value: unknown) {
    if (!isRecord(value)) return false;
    return SAMPLING_METHODS.some((method) => {
        const section = value[method];
        return isRecord(section) && !Array.isArray(section.data) && Array.isArray(section.indices);
    });
}

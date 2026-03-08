export type MethodKey = "simple" | "systematic" | "stratified";
export type SampleRow = Record<string, unknown>;

export interface ChartSeries {
    key: string;
    label: string;
    color: string;
}

export interface ChartRow {
    label: string;
    values: Record<string, number>;
}

export const METHOD_META: Record<MethodKey, { label: string; color: string }> = {
    simple: { label: "简单随机", color: "#6366f1" },
    systematic: { label: "系统抽样", color: "#14b8a6" },
    stratified: { label: "分层抽样", color: "#f59e0b" },
};

export const POPULATION_SERIES: ChartSeries = { key: "population", label: "总体", color: "#94a3b8" };

export function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const normalized = value.trim().replace(/,/g, "");
        if (!normalized) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

export function calculateMean(rows: SampleRow[], field: string) {
    const values = rows
        .map((row) => toNumber(row[field]))
        .filter((value): value is number => value !== null);
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateStdError(rows: SampleRow[], field: string) {
    const values = rows
        .map((row) => toNumber(row[field]))
        .filter((value): value is number => value !== null);
    if (values.length <= 1) return 0;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
    const stdDev = Math.sqrt(variance);
    return stdDev / Math.sqrt(values.length);
}

const EXCLUDED_ID_FIELDS = new Set(["id", "_id", "序号", "编号"]);
function isExcludedIdField(field: string) {
    return EXCLUDED_ID_FIELDS.has(field.toLowerCase().trim());
}

export function collectNumericFields(rows: SampleRow[]) {
    const fieldStats = new Map<string, { numericCount: number; totalCount: number }>();

    for (const row of rows) {
        for (const key of Object.keys(row)) {
            const stat = fieldStats.get(key) ?? { numericCount: 0, totalCount: 0 };
            const rawValue = row[key];
            if (rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== "") {
                stat.totalCount += 1;
                if (toNumber(rawValue) !== null) {
                    stat.numericCount += 1;
                }
            }
            fieldStats.set(key, stat);
        }
    }

    return Array.from(fieldStats.entries())
        .filter(([field, stat]) => stat.totalCount > 0 && stat.numericCount / stat.totalCount >= 0.8 && stat.numericCount >= 2 && !isExcludedIdField(field))
        .map(([field]) => field)
        .sort();
}

export function collectCategoricalFields(
    rows: SampleRow[],
    populationStats: Record<string, Record<string, number>>
) {
    const fields = new Set<string>(Object.keys(populationStats));

    for (const row of rows) {
        for (const key of Object.keys(row)) {
            const rawValue = row[key];
            if (rawValue === null || rawValue === undefined) continue;
            if (toNumber(rawValue) === null) {
                fields.add(key);
            }
        }
    }

    return Array.from(fields).filter(f => !isExcludedIdField(f)).sort();
}

export function buildDistributionRows(
    field: string,
    methodRows: Record<MethodKey, SampleRow[]>,
    populationStats: Record<string, Record<string, number>>
) {
    if (!field) {
        return { rows: [] as ChartRow[], withPopulation: false };
    }

    const categories = new Set<string>();

    (Object.keys(methodRows) as MethodKey[]).forEach((method) => {
        for (const row of methodRows[method]) {
            const raw = row[field];
            if (raw === null || raw === undefined) continue;
            const category = String(raw).trim();
            if (category) categories.add(category);
        }
    });

    const populationFieldStats = populationStats[field];
    if (populationFieldStats) {
        Object.keys(populationFieldStats).forEach((category) => categories.add(category));
    }

    const orderedCategories = Array.from(categories).sort((a, b) => a.localeCompare(b, "zh-CN"));
    const rows = orderedCategories.map((category) => {
        const values: Record<string, number> = {};

        (Object.keys(methodRows) as MethodKey[]).forEach((method) => {
            const rowsOfMethod = methodRows[method];
            if (rowsOfMethod.length === 0) {
                values[method] = 0;
                return;
            }

            const count = rowsOfMethod.filter((row) => String(row[field] ?? "").trim() === category).length;
            values[method] = (count / rowsOfMethod.length) * 100;
        });

        if (populationFieldStats) {
            const totalPopulation = Object.values(populationFieldStats).reduce((sum, value) => sum + value, 0);
            const categoryCount = populationFieldStats[category] ?? 0;
            values.population = totalPopulation > 0 ? (categoryCount / totalPopulation) * 100 : 0;
        }

        return { label: category, values };
    });

    return { rows, withPopulation: Boolean(populationFieldStats) };
}

export function buildRepresentativenessRows(
    numericFields: string[],
    categoricalFields: string[],
    methodRows: Record<MethodKey, SampleRow[]>,
    populationStats: Record<string, Record<string, number>>
) {
    const rows: ChartRow[] = [];

    for (const field of numericFields) {
        const allValues: number[] = [];
        for (const method of Object.keys(methodRows) as MethodKey[]) {
            for (const row of methodRows[method]) {
                const v = toNumber(row[field]);
                if (v !== null) allValues.push(v);
            }
        }
        if (allValues.length === 0) continue;
        const combinedMean = allValues.reduce((s, v) => s + v, 0) / allValues.length;
        if (combinedMean === 0) continue;

        const values: Record<string, number> = {};
        for (const method of Object.keys(METHOD_META) as MethodKey[]) {
            const methodMean = calculateMean(methodRows[method], field);
            values[method] = Math.abs(methodMean - combinedMean) / Math.abs(combinedMean) * 100;
        }
        rows.push({ label: `${field}（均值偏差）`, values });
    }

    for (const field of categoricalFields) {
        const popFieldStats = populationStats[field];
        if (!popFieldStats) continue;
        const totalPop = Object.values(popFieldStats).reduce((s, v) => s + v, 0);
        if (totalPop === 0) continue;

        const categorySet = new Set<string>(Object.keys(popFieldStats));
        for (const method of Object.keys(methodRows) as MethodKey[]) {
            for (const row of methodRows[method]) {
                const val = String(row[field] ?? "").trim();
                if (val) categorySet.add(val);
            }
        }
        const categories = Array.from(categorySet);

        const values: Record<string, number> = {};

        for (const method of Object.keys(METHOD_META) as MethodKey[]) {
            const mRows = methodRows[method];
            if (mRows.length === 0) { values[method] = 0; continue; }

            const categoryCounts: Record<string, number> = {};
            for (const row of mRows) {
                const key = String(row[field] ?? "").trim();
                categoryCounts[key] = (categoryCounts[key] ?? 0) + 1;
            }

            let totalDiff = 0;
            for (const cat of categories) {
                const popProp = (popFieldStats[cat] ?? 0) / totalPop * 100;
                const sampleCount = categoryCounts[cat] ?? 0;
                const sampleProp = (sampleCount / mRows.length) * 100;
                totalDiff += Math.abs(sampleProp - popProp);
            }
            values[method] = totalDiff / categories.length;
        }
        rows.push({ label: `${field}（分布偏差）`, values });
    }

    return rows;
}

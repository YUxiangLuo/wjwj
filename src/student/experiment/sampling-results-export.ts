const SAMPLING_EXPORT_TYPES = ["simple", "systematic", "pps", "stratified", "all"] as const;

export type SamplingExportType = typeof SAMPLING_EXPORT_TYPES[number];

interface SamplingResultSection {
    data?: Record<string, unknown>[];
}

type SamplingResultsExportData = Partial<Record<Exclude<SamplingExportType, "all">, SamplingResultSection>>;

export function parseSamplingExportType(value: string | null): SamplingExportType | null {
    const candidate = value ?? "all";
    return (SAMPLING_EXPORT_TYPES as readonly string[]).includes(candidate)
        ? candidate as SamplingExportType
        : null;
}

function toCsv(data: Record<string, unknown>[], extraHeaders: string[] = []) {
    const headerSet = new Set<string>();
    data.forEach((row) => Object.keys(row).forEach((key) => headerSet.add(key)));
    extraHeaders.forEach((header) => headerSet.add(header));
    const headers = Array.from(headerSet);

    const escape = (value: unknown) => {
        if (value === null || value === undefined) return "";
        const text = typeof value === "string" ? value : JSON.stringify(value);
        if (text.includes(",") || text.includes("\n") || text.includes('"')) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    };

    return [
        headers.join(","),
        ...data.map((row) => headers.map((header) => escape(row[header])).join(",")),
    ].join("\n");
}

export function buildSamplingResultsCsvExport(value: unknown, type: SamplingExportType) {
    const results = (value ?? {}) as SamplingResultsExportData;
    const byMethod = {
        simple: results.simple?.data ?? [],
        systematic: results.systematic?.data ?? [],
        pps: results.pps?.data ?? [],
        stratified: results.stratified?.data ?? [],
    } satisfies Record<Exclude<SamplingExportType, "all">, Record<string, unknown>[]>;

    let filename: string;
    let data: Record<string, unknown>[];
    if (type === "all") {
        filename = "all_sampling.csv";
        data = Object.entries(byMethod).flatMap(([method, rows]) =>
            rows.map((row) => ({ __method: method, ...row })));
    } else {
        filename = `${type}_sampling.csv`;
        data = byMethod[type];
    }
    if (data.length === 0) return null;

    return {
        csv: toCsv(data, type === "all" ? ["__method"] : []),
        filename,
        rowCount: data.length,
    };
}

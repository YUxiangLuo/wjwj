function csvText(value: unknown) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return String(value);
    }
    return JSON.stringify(value);
}

/** Prevent spreadsheet applications from interpreting imported text as formulas. */
export function encodeCsvCell(value: unknown) {
    let text = csvText(value);
    if (typeof value === "string" && /^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(text)) {
        text = `'${text}`;
    }
    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

export function reserveCsvMetadataHeader(base: string, usedHeaders: Set<string>) {
    let candidate = base;
    let suffix = 2;
    while (usedHeaders.has(candidate)) {
        candidate = `${base}_${suffix}`;
        suffix += 1;
    }
    usedHeaders.add(candidate);
    return candidate;
}

export function collectCsvHeaders(rows: Array<Record<string, unknown>>) {
    const headers = new Set<string>();
    rows.forEach((row) => Object.keys(row).forEach((key) => headers.add(key)));
    return headers;
}

export function recordsToCsv(data: Array<Record<string, unknown>>, extraHeaders: string[] = []) {
    const headerSet = collectCsvHeaders(data);
    extraHeaders.forEach((header) => headerSet.add(header));
    const headers = [...headerSet];
    return [
        headers.map(encodeCsvCell).join(","),
        ...data.map((row) => headers.map((header) => encodeCsvCell(row[header])).join(",")),
    ].join("\n");
}

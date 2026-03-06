import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as XLSX from "xlsx";

export interface TopicFieldMapping {
    identifier?: string;
    stratified?: string[];
    numeric?: string[];
    others?: string[];
}

export async function readPopulationData(filePath: string): Promise<Record<string, any>[]> {
    let normalizedPath = filePath.replace(/\\/g, "/").trim();
    if (normalizedPath.startsWith("/")) {
        normalizedPath = normalizedPath.slice(1);
    }

    if (!normalizedPath || !normalizedPath.startsWith("storage/")) {
        console.error("Invalid population data path:", filePath);
        return [];
    }

    const storageBaseDir = path.resolve(process.cwd(), "storage");
    const fullPath = path.resolve(process.cwd(), normalizedPath);

    if (!fullPath.startsWith(storageBaseDir + path.sep) && fullPath !== storageBaseDir) {
        console.error("Path traversal attempt blocked:", filePath);
        return [];
    }

    try {
        const fileBuffer = await fs.readFile(fullPath);
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return [];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return [];
        return XLSX.utils.sheet_to_json(sheet);
    } catch (error) {
        console.error("Failed to read excel:", error);
        return [];
    }
}

export function parseTopicFieldMapping(fieldMapping: unknown): TopicFieldMapping | null {
    let parsed = fieldMapping;

    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch (error) {
            console.error("Failed to parse fieldMapping:", error);
            return null;
        }
    }

    if (!parsed || typeof parsed !== "object") {
        return null;
    }

    return parsed as TopicFieldMapping;
}

export function buildStratifiedStats(population: Array<Record<string, unknown>>, fieldMapping: unknown) {
    const mapping = parseTopicFieldMapping(fieldMapping);
    if (!mapping?.stratified?.length) {
        return {};
    }

    const stats: Record<string, Record<string, number>> = {};
    for (const field of mapping.stratified) {
        const counts: Record<string, number> = {};
        for (const row of population) {
            const value = String(row[field]);
            counts[value] = (counts[value] || 0) + 1;
        }
        stats[field] = counts;
    }

    return stats;
}

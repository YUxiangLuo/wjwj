import { parseSpreadsheetFile } from "../../lib/spreadsheet";
import { resolveStoragePath } from "../../server/storage-files";
import { parseTopicFieldMapping } from "../../domain/statistics/population";
export * from "../../domain/statistics/population";

const POPULATION_CACHE_MAX_ENTRIES = 4;
const POPULATION_CACHE_MAX_ESTIMATED_BYTES = 256 * 1024 * 1024;

type PopulationCacheEntry = {
    key: string;
    fullPath: string;
    rows: Record<string, any>[];
    estimatedBytes: number;
};

const populationCache: PopulationCacheEntry[] = [];
type PopulationFileSnapshot = { buffer: ArrayBuffer; hash: string };
const populationFileReadsInFlight = new Map<string, Promise<PopulationFileSnapshot>>();
const populationParsesInFlight = new Map<string, Promise<Record<string, any>[]>>();

async function readPopulationFile(fullPath: string) {
    const inFlight = populationFileReadsInFlight.get(fullPath);
    if (inFlight) return await inFlight;

    // Overlapping requests share one byte snapshot, including its hash. Keep it
    // only while reading: later requests must read again, even for cache hits,
    // because size/mtime can remain identical after the contents are replaced.
    const readPromise = (async () => {
        const buffer = await Bun.file(fullPath).arrayBuffer();
        return { buffer, hash: new Bun.CryptoHasher("sha256").update(buffer).digest("hex") };
    })();
    populationFileReadsInFlight.set(fullPath, readPromise);
    try {
        return await readPromise;
    } finally {
        if (populationFileReadsInFlight.get(fullPath) === readPromise) populationFileReadsInFlight.delete(fullPath);
    }
}

function getCachedPopulation(cacheKey: string) {
    const index = populationCache.findIndex((entry) => entry.key === cacheKey);
    if (index < 0) return null;
    const [cached] = populationCache.splice(index, 1);
    if (!cached) return null;
    populationCache.unshift(cached);
    return cached.rows;
}

function cachePopulation(fullPath: string, cacheKey: string, rows: Record<string, any>[], estimatedBytes: number) {
    if (estimatedBytes > POPULATION_CACHE_MAX_ESTIMATED_BYTES) return;

    // A changed file at the same path must not leave its old parsed copy resident.
    for (let index = populationCache.length - 1; index >= 0; index -= 1) {
        if (populationCache[index]?.fullPath === fullPath) populationCache.splice(index, 1);
    }
    populationCache.unshift({ key: cacheKey, fullPath, rows, estimatedBytes });

    let totalBytes = populationCache.reduce((sum, entry) => sum + entry.estimatedBytes, 0);
    while (
        populationCache.length > POPULATION_CACHE_MAX_ENTRIES
        || totalBytes > POPULATION_CACHE_MAX_ESTIMATED_BYTES
    ) {
        const removed = populationCache.pop();
        totalBytes -= removed?.estimatedBytes ?? 0;
    }
}

export function clearPopulationDataCacheForTests() {
    populationCache.length = 0;
    populationFileReadsInFlight.clear();
    populationParsesInFlight.clear();
}

export async function readPopulationData(filePath: string, fieldMapping?: unknown): Promise<Record<string, any>[]> {
    let fullPath: string;
    try {
        fullPath = resolveStoragePath(filePath);
    } catch {
        console.error("Invalid population data path:", filePath);
        return [];
    }

    try {
        const numericFields = parseTopicFieldMapping(fieldMapping)?.numeric ?? [];
        const { buffer, hash } = await readPopulationFile(fullPath);
        const cacheKey = JSON.stringify([fullPath, hash, numericFields]);
        const cached = getCachedPopulation(cacheKey);
        if (cached) return cached;

        const inFlight = populationParsesInFlight.get(cacheKey);
        if (inFlight) return await inFlight;

        const readPromise = (async () => {
            const parsed = await parseSpreadsheetFile(buffer, fullPath, {
                includeColumnValues: false,
                numericFields,
            });
            // Statistical contexts cache by population identity. Keep the parsed population
            // immutable so a caller cannot silently make those derived values stale.
            for (const row of parsed.rows) Object.freeze(row);
            Object.freeze(parsed.rows);
            const estimatedBytes = Math.max(
                buffer.byteLength * 4,
                parsed.rowCount * Math.max(1, parsed.colCount) * 64,
            );
            cachePopulation(fullPath, cacheKey, parsed.rows, estimatedBytes);
            return parsed.rows;
        })();
        populationParsesInFlight.set(cacheKey, readPromise);
        try {
            return await readPromise;
        } finally {
            if (populationParsesInFlight.get(cacheKey) === readPromise) populationParsesInFlight.delete(cacheKey);
        }
    } catch (error) {
        console.error("Failed to read population data:", error);
        return [];
    }
}

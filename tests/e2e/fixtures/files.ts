import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const projectRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

function projectPath(...parts: string[]) {
    return join(projectRoot, ...parts);
}

export function getPopulationXlsxPath() {
    const candidates = [
        projectPath("storage", "uploads", "population.xlsx"),
        projectPath("public", "templates", "population.xlsx"),
    ];

    const filePath = candidates.find((candidate) => existsSync(candidate));
    if (!filePath) {
        throw new Error("population.xlsx not found in storage/uploads or public/templates");
    }
    return filePath;
}

export async function createTempCsvFixture(prefix: string, content: string) {
    const filePath = join(tmpdir(), `${prefix}-${Date.now()}.csv`);
    await writeFile(filePath, content, "utf8");
    return filePath;
}

export function createCsvBuffer(lines: string[]) {
    return Buffer.from(lines.join("\n"), "utf8");
}

const PALETTE_COLORS = [
    "slate",
    "gray",
    "zinc",
    "neutral",
    "stone",
    "red",
    "orange",
    "amber",
    "yellow",
    "lime",
    "green",
    "emerald",
    "teal",
    "cyan",
    "sky",
    "blue",
    "indigo",
    "violet",
    "purple",
    "fuchsia",
    "pink",
    "rose",
] as const;

const COLOR_UTILITY_PREFIXES = [
    "bg",
    "text",
    "border",
    "ring",
    "from",
    "to",
    "via",
    "shadow",
    "fill",
    "stroke",
    "divide",
    "scrollbar-thumb",
    "ring-offset",
] as const;

const STATIC_COLORS = ["white", "black"] as const;

const MAX_HARDCODED_COLOR_CLASSES = 0;
const MAX_DARK_COLOR_CLASSES = 0;

const palettePattern = PALETTE_COLORS.join("|");
const prefixPattern = COLOR_UTILITY_PREFIXES.join("|");
const staticColorPattern = STATIC_COLORS.join("|");
const hardcodedColorClassPattern = new RegExp(
    `(?:${prefixPattern})-(?:(?:${palettePattern})-[0-9]+|(?:${staticColorPattern})(?:/[0-9]+)?)`,
    "g"
);
const darkColorClassPattern = new RegExp(
    `dark:(?:${prefixPattern})-(?:(?:${palettePattern})-[0-9]+|(?:${staticColorPattern})(?:/[0-9]+)?)`,
    "g"
);

type FileStats = {
    path: string;
    hardcodedColorClasses: number;
    darkColorClasses: number;
};

async function listSourceFiles() {
    const output = await Bun.$`find src '(' -name '*.tsx' -o -name '*.ts' ')'`.text();
    return output
        .split("\n")
        .map((path) => path.trim())
        .filter(Boolean);
}

function countMatches(text: string, pattern: RegExp) {
    return text.match(pattern)?.length ?? 0;
}

async function collectStats() {
    const files = await listSourceFiles();
    const stats: FileStats[] = [];

    for (const path of files) {
        const text = await Bun.file(path).text();
        stats.push({
            path,
            hardcodedColorClasses: countMatches(text, hardcodedColorClassPattern),
            darkColorClasses: countMatches(text, darkColorClassPattern),
        });
    }

    return stats;
}

function topFiles(stats: FileStats[], key: keyof Omit<FileStats, "path">, limit = 10) {
    return stats
        .filter((item) => item[key] > 0)
        .sort((a, b) => b[key] - a[key])
        .slice(0, limit)
        .map((item) => `  ${item[key].toString().padStart(5)}  ${item.path}`)
        .join("\n");
}

const stats = await collectStats();
const hardcodedColorClasses = stats.reduce((sum, item) => sum + item.hardcodedColorClasses, 0);
const darkColorClasses = stats.reduce((sum, item) => sum + item.darkColorClasses, 0);
const uiHardcodedColorClasses = stats
    .filter((item) => item.path.startsWith("src/components/ui/"))
    .reduce((sum, item) => sum + item.hardcodedColorClasses, 0);

const failures: string[] = [];

if (uiHardcodedColorClasses > 0) {
    failures.push(`src/components/ui/** contains ${uiHardcodedColorClasses} hardcoded palette color classes.`);
}

if (hardcodedColorClasses > MAX_HARDCODED_COLOR_CLASSES) {
    failures.push(
        `Hardcoded palette classes increased to ${hardcodedColorClasses}; ratchet maximum is ${MAX_HARDCODED_COLOR_CLASSES}.`
    );
}

if (darkColorClasses > MAX_DARK_COLOR_CLASSES) {
    failures.push(`dark: color classes increased to ${darkColorClasses}; ratchet maximum is ${MAX_DARK_COLOR_CLASSES}.`);
}

console.log("Style usage:");
console.log(`  hardcoded palette classes: ${hardcodedColorClasses}/${MAX_HARDCODED_COLOR_CLASSES}`);
console.log(`  dark: color classes:       ${darkColorClasses}/${MAX_DARK_COLOR_CLASSES}`);
console.log(`  ui palette classes:        ${uiHardcodedColorClasses}`);

if (failures.length > 0) {
    console.error("\nStyle check failed:");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }

    const uiTop = topFiles(stats.filter((item) => item.path.startsWith("src/components/ui/")), "hardcodedColorClasses");
    if (uiTop) {
        console.error("\nTop src/components/ui offenders:");
        console.error(uiTop);
    }

    const hardcodedTop = topFiles(stats, "hardcodedColorClasses");
    if (hardcodedTop) {
        console.error("\nTop hardcoded color files:");
        console.error(hardcodedTop);
    }

    process.exit(1);
}

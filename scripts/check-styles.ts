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
const SEMANTIC_INTENT_COLORS = ["primary", "success", "warning", "info", "destructive", "auxiliary"] as const;

const MAX_HARDCODED_COLOR_CLASSES = 0;
const MAX_DARK_CLASSES = 0;
const MAX_SAME_INTENT_FILLED_CLASSES = 0;
const MAX_SAME_INTENT_SOLID_HOVER_CLASSES = 0;
const MAX_SEMANTIC_ALPHA_TEXT_CLASSES = 0;

const palettePattern = PALETTE_COLORS.join("|");
const prefixPattern = COLOR_UTILITY_PREFIXES.join("|");
const staticColorPattern = STATIC_COLORS.join("|");
const semanticIntentPattern = SEMANTIC_INTENT_COLORS.join("|");
const hardcodedColorClassPattern = new RegExp(
    `(?:${prefixPattern})-(?:(?:${palettePattern})-[0-9]+|(?:${staticColorPattern})(?:/[0-9]+)?)`,
    "g"
);
// The project is light-only: any dark: variant is dead code.
const darkClassPattern = /(?<![\w-])dark:/g;
const sameIntentFilledClassPattern = new RegExp(
    `bg-(${semanticIntentPattern})(?![-/\\w])(?=[^\"\`\\n]*text-\\1(?!-foreground))`,
    "g"
);
const sameIntentSolidHoverClassPattern = new RegExp(
    `bg-(${semanticIntentPattern})(?![-/\\w])(?=[^\"\`\\n]*hover:bg-\\1(?![-/\\w]))`,
    "g"
);
const semanticAlphaTextClassPattern = new RegExp(`text-(?:${semanticIntentPattern})/[0-9]+`, "g");

type FileStats = {
    path: string;
    hardcodedColorClasses: number;
    darkClasses: number;
    sameIntentFilledClasses: number;
    sameIntentSolidHoverClasses: number;
    semanticAlphaTextClasses: number;
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
            darkClasses: countMatches(text, darkClassPattern),
            sameIntentFilledClasses: countMatches(text, sameIntentFilledClassPattern),
            sameIntentSolidHoverClasses: countMatches(text, sameIntentSolidHoverClassPattern),
            semanticAlphaTextClasses: countMatches(text, semanticAlphaTextClassPattern),
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
const darkClasses = stats.reduce((sum, item) => sum + item.darkClasses, 0);
const sameIntentFilledClasses = stats.reduce((sum, item) => sum + item.sameIntentFilledClasses, 0);
const sameIntentSolidHoverClasses = stats.reduce((sum, item) => sum + item.sameIntentSolidHoverClasses, 0);
const semanticAlphaTextClasses = stats.reduce((sum, item) => sum + item.semanticAlphaTextClasses, 0);
const uiHardcodedColorClasses = stats
    .filter((item) => item.path.startsWith("src/components/ui/"))
    .reduce((sum, item) => sum + item.hardcodedColorClasses, 0);

const themeCss = await Bun.file("styles/theme.css").text();
const failures: string[] = [];

if (
    themeCss.includes('source(none)')
    || !themeCss.includes('@import "tailwindcss";')
    || !themeCss.includes('@source not "../*.md";')
    || !themeCss.includes('@source not "../**/*.md";')
) {
    failures.push(
        'styles/theme.css must use Bun-compatible Tailwind import and exclude markdown sources so docs/examples cannot generate forbidden utilities.'
    );
}

if (uiHardcodedColorClasses > 0) {
    failures.push(`src/components/ui/** contains ${uiHardcodedColorClasses} hardcoded palette color classes.`);
}

if (hardcodedColorClasses > MAX_HARDCODED_COLOR_CLASSES) {
    failures.push(
        `Hardcoded palette classes increased to ${hardcodedColorClasses}; ratchet maximum is ${MAX_HARDCODED_COLOR_CLASSES}.`
    );
}

if (darkClasses > MAX_DARK_CLASSES) {
    failures.push(
        `dark: variant classes increased to ${darkClasses}; maximum is ${MAX_DARK_CLASSES}. The project is light-only.`
    );
}

if (sameIntentFilledClasses > MAX_SAME_INTENT_FILLED_CLASSES) {
    failures.push(
        `Filled semantic backgrounds with same-color text increased to ${sameIntentFilledClasses}; maximum is ${MAX_SAME_INTENT_FILLED_CLASSES}. Use *-foreground text or a /10 background tint.`
    );
}

if (sameIntentSolidHoverClasses > MAX_SAME_INTENT_SOLID_HOVER_CLASSES) {
    failures.push(
        `Solid semantic hover backgrounds increased to ${sameIntentSolidHoverClasses}; maximum is ${MAX_SAME_INTENT_SOLID_HOVER_CLASSES}. Use hover:bg-*/90 (or another visible state) instead of hover:bg-* matching the base filled background.`
    );
}

if (semanticAlphaTextClasses > MAX_SEMANTIC_ALPHA_TEXT_CLASSES) {
    failures.push(
        `Alpha semantic text classes increased to ${semanticAlphaTextClasses}; maximum is ${MAX_SEMANTIC_ALPHA_TEXT_CLASSES}. Use the full semantic text token, or move opacity to a safe background/border.`
    );
}

console.log("Style usage:");
console.log(`  hardcoded palette classes: ${hardcodedColorClasses}/${MAX_HARDCODED_COLOR_CLASSES}`);
console.log(`  dark: variant classes:     ${darkClasses}/${MAX_DARK_CLASSES}`);
console.log(`  same-intent filled pairs:  ${sameIntentFilledClasses}/${MAX_SAME_INTENT_FILLED_CLASSES}`);
console.log(`  solid same-intent hovers:  ${sameIntentSolidHoverClasses}/${MAX_SAME_INTENT_SOLID_HOVER_CLASSES}`);
console.log(`  semantic alpha text:       ${semanticAlphaTextClasses}/${MAX_SEMANTIC_ALPHA_TEXT_CLASSES}`);
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

    const sameIntentTop = topFiles(stats, "sameIntentFilledClasses");
    if (sameIntentTop) {
        console.error("\nTop same-intent filled semantic color files:");
        console.error(sameIntentTop);
    }

    const solidHoverTop = topFiles(stats, "sameIntentSolidHoverClasses");
    if (solidHoverTop) {
        console.error("\nTop solid same-intent hover files:");
        console.error(solidHoverTop);
    }

    const semanticAlphaTextTop = topFiles(stats, "semanticAlphaTextClasses");
    if (semanticAlphaTextTop) {
        console.error("\nTop alpha semantic text files:");
        console.error(semanticAlphaTextTop);
    }

    const darkTop = topFiles(stats, "darkClasses");
    if (darkTop) {
        console.error("\nTop dark: variant files:");
        console.error(darkTop);
    }

    process.exit(1);
}

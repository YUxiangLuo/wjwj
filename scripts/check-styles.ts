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
    "outline",
    "decoration",
    "caret",
    "accent",
    "placeholder",
] as const;

const STATIC_COLORS = ["white", "black"] as const;
const SEMANTIC_INTENT_COLORS = ["primary", "success", "warning", "info", "destructive", "auxiliary"] as const;

const MAX_HARDCODED_COLOR_CLASSES = 0;
const MAX_DARK_CLASSES = 0;
const MAX_SAME_INTENT_FILLED_CLASSES = 0;
const MAX_SAME_INTENT_SOLID_HOVER_CLASSES = 0;
const MAX_SEMANTIC_ALPHA_TEXT_CLASSES = 0;
const MAX_RESPONSIVE_VIEWPORT_CLASSES = 0;

const palettePattern = PALETTE_COLORS.join("|");
const prefixPattern = COLOR_UTILITY_PREFIXES
    .map((prefix) => prefix === "border" ? "border(?:-[trblxyse])?" : prefix)
    .join("|");
const staticColorPattern = STATIC_COLORS.join("|");
const semanticIntentPattern = SEMANTIC_INTENT_COLORS.join("|");
const hardcodedColorClassPattern = new RegExp(
    `(?<![\\w-])(?:${prefixPattern})-(?:(?:${palettePattern})-[0-9]+|${staticColorPattern})(?:/[0-9]+)?(?![\\w-])`,
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
const responsiveViewportClassPattern = /(?<![\w-])(?:sm|md|lg|xl|2xl|(?:min|max)-(?:sm|md|lg|xl|2xl)|(?:min|max)-\[[^\]]+\]|@(?:sm|md|lg|xl|2xl)(?:\/[\w-]+)?|@\[[^\]]+\]|portrait|landscape|(?:any-)?pointer-(?:fine|coarse)):(?=\S)/g;

type FileStats = {
    path: string;
    hardcodedColorClasses: number;
    darkClasses: number;
    sameIntentFilledClasses: number;
    sameIntentSolidHoverClasses: number;
    semanticAlphaTextClasses: number;
    responsiveViewportClasses: number;
};

async function listSourceFiles() {
    const glob = new Bun.Glob("src/**/*.{ts,tsx,js,jsx,html}");
    const files: string[] = [];
    for await (const path of glob.scan({ cwd: ".", onlyFiles: true })) files.push(path);
    return files.sort();
}

export function countMatches(text: string, pattern: RegExp) {
    return text.match(pattern)?.length ?? 0;
}

export function countHardcodedPaletteClasses(text: string) {
    return countMatches(text, hardcodedColorClassPattern);
}

export function countResponsiveViewportClasses(text: string) {
    return countMatches(text, responsiveViewportClassPattern);
}

function quotedEnd(text: string, start: number) {
    const quote = text[start];
    for (let index = start + 1; index < text.length; index += 1) {
        if (text[index] === "\\") {
            index += 1;
            continue;
        }
        if (text[index] === quote) return index;
    }
    return text.length - 1;
}

function balancedBraceEnd(text: string, start: number) {
    let depth = 0;
    for (let index = start; index < text.length; index += 1) {
        const character = text[index];
        if (character === '"' || character === "'" || character === "`") {
            index = quotedEnd(text, index);
            continue;
        }
        if (character === "{") depth += 1;
        if (character === "}" && --depth === 0) return index;
    }
    return text.length - 1;
}

function tagEnd(text: string, start: number) {
    let braceDepth = 0;
    for (let index = start + 1; index < text.length; index += 1) {
        const character = text[index];
        if (character === '"' || character === "'" || character === "`") {
            index = quotedEnd(text, index);
            continue;
        }
        if (character === "{") braceDepth += 1;
        if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
        if (character === ">" && braceDepth === 0) return index;
    }
    return -1;
}

function stringFragments(text: string) {
    const fragments: Array<{ text: string; start: number }> = [];
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character !== '"' && character !== "'" && character !== "`") continue;
        const end = quotedEnd(text, index);
        fragments.push({ text: text.slice(index + 1, end), start: index });
        index = end;
    }
    return fragments;
}

type StaticClassGroup = {
    states: string[][];
};

function conditionalOperatorIndex(text: string) {
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === '"' || character === "'" || character === "`") {
            index = quotedEnd(text, index);
            continue;
        }
        if (
            character === "?"
            && text[index + 1] !== "."
            && text[index + 1] !== "?"
            && text[index - 1] !== "?"
        ) {
            return index;
        }
    }
    return -1;
}

function tokensForFragments(fragments: string[]) {
    return fragments.flatMap((fragment) => fragment.split(/\s+/)).filter(Boolean);
}

function classExpressionStates(expression: string) {
    const fragments = stringFragments(expression);
    const conditionalIndex = conditionalOperatorIndex(expression);
    if (conditionalIndex < 0) {
        return [tokensForFragments(fragments.map((fragment) => fragment.text))];
    }

    const commonFragments = fragments
        .filter((fragment) => fragment.start < conditionalIndex)
        .map((fragment) => fragment.text);
    const branchFragments = fragments.filter((fragment) => fragment.start > conditionalIndex);
    if (branchFragments.length === 0) return [tokensForFragments(commonFragments)];

    return branchFragments.map((branch) =>
        tokensForFragments([...commonFragments, branch.text])
    );
}

function classGroupsForTag(tag: string) {
    const groups: StaticClassGroup[] = [];
    const attributePattern = /\bclass(?:Name)?\s*=/g;

    while (attributePattern.exec(tag)) {
        let valueStart = attributePattern.lastIndex;
        while (/\s/.test(tag[valueStart] ?? "")) valueStart += 1;
        const firstCharacter = tag[valueStart];

        if (firstCharacter === '"' || firstCharacter === "'") {
            const end = quotedEnd(tag, valueStart);
            groups.push({ states: [tokensForFragments([tag.slice(valueStart + 1, end)])] });
            attributePattern.lastIndex = end + 1;
            continue;
        }

        if (firstCharacter === "{") {
            const end = balancedBraceEnd(tag, valueStart);
            const expression = tag.slice(valueStart + 1, end);
            groups.push({ states: classExpressionStates(expression) });
            attributePattern.lastIndex = end + 1;
        }
    }

    return groups;
}

function classStatesForTag(tag: string) {
    const states = classGroupsForTag(tag).flatMap((group) => group.states);
    return states.length > 0 ? states : [[]];
}

function utilityName(token: string) {
    const variantSeparator = token.lastIndexOf(":");
    return token.slice(variantSeparator + 1).replace(/^!/, "").replace(/!$/, "");
}

function relevantUtilityName(token: string, baseOnly: boolean) {
    if (baseOnly && token.includes(":")) return null;
    return utilityName(token);
}

function solidSemanticBackgrounds(tokens: string[], baseOnly = false) {
    const intents = new Set<string>();
    for (const token of tokens) {
        const utility = relevantUtilityName(token, baseOnly);
        const match = utility?.match(new RegExp(`^bg-(${semanticIntentPattern})$`));
        if (match?.[1]) intents.add(match[1]);
    }
    return intents;
}

function semanticTextIntents(tokens: string[], baseOnly = false) {
    const intents = new Set<string>();
    for (const token of tokens) {
        const utility = relevantUtilityName(token, baseOnly);
        const match = utility?.match(new RegExp(`^text-(${semanticIntentPattern})$`));
        if (match?.[1]) intents.add(match[1]);
    }
    return intents;
}

function establishesBackgroundSurface(tokens: string[], baseOnly = false) {
    return tokens.some((token) => {
        const utility = relevantUtilityName(token, baseOnly);
        if (!utility) return false;
        return utility.startsWith("bg-") && utility !== "bg-transparent";
    });
}

function hasSameIntentPair(tokens: string[]) {
    const backgrounds = solidSemanticBackgrounds(tokens);
    return [...semanticTextIntents(tokens)].some((intent) => backgrounds.has(intent));
}

function commonBackgrounds(backgroundStates: ReadonlySet<string>[]) {
    const [first, ...rest] = backgroundStates;
    if (!first) return new Set<string>();
    return new Set([...first].filter((intent) =>
        rest.every((backgrounds) => backgrounds.has(intent))
    ));
}

/**
 * Count static JSX/HTML elements whose text intent matches the nearest solid semantic
 * background. Unlike the original single-line regex, this follows nested JSX
 * children and stops inheritance when a child establishes its own surface.
 */
export function countJsxSameIntentPairs(path: string, text: string) {
    if (!/\.(?:[jt]sx|html)$/.test(path)) return 0;
    let count = 0;
    const stack: Array<{ name: string; backgrounds: ReadonlySet<string> }> = [];

    for (let start = text.indexOf("<"); start >= 0; start = text.indexOf("<", start + 1)) {
        const end = tagEnd(text, start);
        if (end < 0) break;

        const rawTag = text.slice(start, end + 1);
        const fragment = rawTag === "<>" || rawTag === "</>";
        const closing = rawTag.startsWith("</");
        const selfClosing = rawTag.endsWith("/>");
        const nameMatch = rawTag.match(/^<\/?([A-Za-z][\w.:-]*)/);
        const name = fragment ? "#fragment" : nameMatch?.[1];
        if (!name) continue;

        if (closing) {
            const matchingIndex = stack.findLastIndex((frame) => frame.name === name);
            if (matchingIndex >= 0) stack.length = matchingIndex;
            start = end;
            continue;
        }

        // Ignore TypeScript generic syntax such as <T>; real non-self-closing JSX
        // elements have a corresponding closing tag later in the source.
        if (!fragment && !selfClosing && !text.includes(`</${name}`, end + 1)) continue;

        const inheritedBackgrounds = stack.at(-1)?.backgrounds ?? new Set<string>();
        const backgroundStates: ReadonlySet<string>[] = [];
        let elementHasViolation = false;

        for (const tokens of classStatesForTag(rawTag)) {
            const ownBackgrounds = solidSemanticBackgrounds(tokens, true);
            const hasOwnBackground = establishesBackgroundSurface(tokens, true);
            const activeBackgrounds = hasOwnBackground
                ? ownBackgrounds
                : inheritedBackgrounds;
            backgroundStates.push(activeBackgrounds);

            if (hasSameIntentPair(tokens)) elementHasViolation = true;
            for (const intent of semanticTextIntents(tokens, true)) {
                if (activeBackgrounds.has(intent)) elementHasViolation = true;
            }
        }

        if (elementHasViolation) count += 1;
        const activeBackgrounds = commonBackgrounds(backgroundStates);
        if (!selfClosing) stack.push({ name, backgrounds: activeBackgrounds });
        start = end;
    }

    return count;
}

async function collectStats() {
    const files = await listSourceFiles();
    const stats: FileStats[] = [];

    for (const path of files) {
        const text = await Bun.file(path).text();
        const inlineSameIntentPairs = countMatches(text, sameIntentFilledClassPattern);
        const jsxSameIntentPairs = countJsxSameIntentPairs(path, text);
        stats.push({
            path,
            hardcodedColorClasses: countMatches(text, hardcodedColorClassPattern),
            darkClasses: countMatches(text, darkClassPattern),
            sameIntentFilledClasses: Math.max(inlineSameIntentPairs, jsxSameIntentPairs),
            sameIntentSolidHoverClasses: countMatches(text, sameIntentSolidHoverClassPattern),
            semanticAlphaTextClasses: countMatches(text, semanticAlphaTextClassPattern),
            responsiveViewportClasses: countMatches(text, responsiveViewportClassPattern),
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

async function main() {
    const stats = await collectStats();
    const hardcodedColorClasses = stats.reduce((sum, item) => sum + item.hardcodedColorClasses, 0);
    const darkClasses = stats.reduce((sum, item) => sum + item.darkClasses, 0);
    const sameIntentFilledClasses = stats.reduce((sum, item) => sum + item.sameIntentFilledClasses, 0);
    const sameIntentSolidHoverClasses = stats.reduce((sum, item) => sum + item.sameIntentSolidHoverClasses, 0);
    const semanticAlphaTextClasses = stats.reduce((sum, item) => sum + item.semanticAlphaTextClasses, 0);
    const responsiveViewportClasses = stats.reduce((sum, item) => sum + item.responsiveViewportClasses, 0);
    const uiHardcodedColorClasses = stats
        .filter((item) => item.path.startsWith("src/components/ui/"))
        .reduce((sum, item) => sum + item.hardcodedColorClasses, 0);

    const themeCss = await Bun.file("styles/theme.css").text();
    const failures: string[] = [];

    if (
        themeCss.includes("source(none)")
        || !themeCss.includes('@import "tailwindcss";')
        || !themeCss.includes('@source not "../*.md";')
        || !themeCss.includes('@source not "../**/*.md";')
        || !themeCss.includes('@source not "../scripts";')
        || !themeCss.includes('@source not "../src/**/*.test.ts";')
        || !themeCss.includes('@source not "../src/**/*.test.tsx";')
        || !themeCss.includes('@source not "../src/test-utils";')
    ) {
        failures.push(
            "styles/theme.css must use the Bun-compatible Tailwind import and exclude non-runtime markdown and script sources.",
        );
    }

    if (uiHardcodedColorClasses > 0) {
        failures.push(`src/components/ui/** contains ${uiHardcodedColorClasses} hardcoded palette color classes.`);
    }
    if (hardcodedColorClasses > MAX_HARDCODED_COLOR_CLASSES) {
        failures.push(
            `Hardcoded palette classes increased to ${hardcodedColorClasses}; ratchet maximum is ${MAX_HARDCODED_COLOR_CLASSES}.`,
        );
    }
    if (darkClasses > MAX_DARK_CLASSES) {
        failures.push(
            `dark: variant classes increased to ${darkClasses}; maximum is ${MAX_DARK_CLASSES}. The project is light-only.`,
        );
    }
    if (sameIntentFilledClasses > MAX_SAME_INTENT_FILLED_CLASSES) {
        failures.push(
            `Filled semantic backgrounds with same-color text increased to ${sameIntentFilledClasses}; maximum is ${MAX_SAME_INTENT_FILLED_CLASSES}. Use *-foreground text or a /10 background tint.`,
        );
    }
    if (sameIntentSolidHoverClasses > MAX_SAME_INTENT_SOLID_HOVER_CLASSES) {
        failures.push(
            `Solid semantic hover backgrounds increased to ${sameIntentSolidHoverClasses}; maximum is ${MAX_SAME_INTENT_SOLID_HOVER_CLASSES}. Use hover:bg-*/90 (or another visible state) instead of hover:bg-* matching the base filled background.`,
        );
    }
    if (semanticAlphaTextClasses > MAX_SEMANTIC_ALPHA_TEXT_CLASSES) {
        failures.push(
            `Alpha semantic text classes increased to ${semanticAlphaTextClasses}; maximum is ${MAX_SEMANTIC_ALPHA_TEXT_CLASSES}. Use the full semantic text token, or move opacity to a safe background/border.`,
        );
    }
    if (responsiveViewportClasses > MAX_RESPONSIVE_VIEWPORT_CLASSES) {
        failures.push(
            `Viewport-responsive classes increased to ${responsiveViewportClasses}; maximum is ${MAX_RESPONSIVE_VIEWPORT_CLASSES}. The frontend is desktop-only.`,
        );
    }

    const appHtmlFiles = ["src/admin/admin.html", "src/teacher/teacher.html", "src/student/student.html"];
    for (const path of appHtmlFiles) {
        const html = await Bun.file(path).text();
        if (/<meta\s+name=["']viewport["']/i.test(html)) {
            failures.push(`${path} must not declare a mobile viewport; the frontend is desktop-only.`);
        }
    }
    if (!themeCss.includes("--breakpoint-*: initial;")) {
        failures.push("styles/theme.css must disable Tailwind's viewport breakpoints.");
    }
    if (!/html,\s*\n\s*body,\s*\n\s*#root\s*\{\s*\n\s*min-width:\s*80rem;/m.test(themeCss)) {
        failures.push("styles/theme.css must enforce the 80rem desktop minimum width on html, body, and #root.");
    }
    if (/@media\s*[^\{]*(?:(?:min|max)-width|orientation|(?:any-)?pointer|hover)|@container\b/i.test(themeCss)) {
        failures.push("styles/theme.css must not contain device-responsive media or container queries; the frontend is desktop-only.");
    }

    console.log("Style usage:");
    console.log(`  hardcoded palette classes: ${hardcodedColorClasses}/${MAX_HARDCODED_COLOR_CLASSES}`);
    console.log(`  dark: variant classes:     ${darkClasses}/${MAX_DARK_CLASSES}`);
    console.log(`  same-intent filled pairs:  ${sameIntentFilledClasses}/${MAX_SAME_INTENT_FILLED_CLASSES}`);
    console.log(`  solid same-intent hovers:  ${sameIntentSolidHoverClasses}/${MAX_SAME_INTENT_SOLID_HOVER_CLASSES}`);
    console.log(`  semantic alpha text:       ${semanticAlphaTextClasses}/${MAX_SEMANTIC_ALPHA_TEXT_CLASSES}`);
    console.log(`  responsive viewport:       ${responsiveViewportClasses}/${MAX_RESPONSIVE_VIEWPORT_CLASSES}`);
    console.log(`  ui palette classes:        ${uiHardcodedColorClasses}`);

    if (failures.length === 0) return;

    console.error("\nStyle check failed:");
    for (const failure of failures) console.error(`- ${failure}`);

    const reports: Array<[string, string]> = [
        [
            "Top src/components/ui offenders:",
            topFiles(
                stats.filter((item) => item.path.startsWith("src/components/ui/")),
                "hardcodedColorClasses",
            ),
        ],
        ["Top hardcoded color files:", topFiles(stats, "hardcodedColorClasses")],
        ["Top same-intent filled semantic color files:", topFiles(stats, "sameIntentFilledClasses")],
        ["Top solid same-intent hover files:", topFiles(stats, "sameIntentSolidHoverClasses")],
        ["Top alpha semantic text files:", topFiles(stats, "semanticAlphaTextClasses")],
        ["Top dark: variant files:", topFiles(stats, "darkClasses")],
        ["Top responsive viewport files:", topFiles(stats, "responsiveViewportClasses")],
    ];

    for (const [heading, report] of reports) {
        if (!report) continue;
        console.error(`\n${heading}`);
        console.error(report);
    }

    process.exit(1);
}

if (import.meta.main) await main();

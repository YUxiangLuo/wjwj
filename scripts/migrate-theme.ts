/**
 * Theme migration: inverted slate CSS variables → standard light-first + dark: prefix
 *
 * Slate mapping (code shade → light-mode equivalent):
 *   50→950, 100→900, 200→800, 300→700, 400→600, 500=skip,
 *   600→400, 700→300, 800→200, 900→50, 950→white
 *
 * Accent text colors (text-{color}-{shade}):
 *   200→800, 300→700, 400→600  (darker for light-mode readability)
 *
 * Usage:
 *   bun run scripts/migrate-theme.ts         # apply migration
 *   bun run scripts/migrate-theme.ts --check # verify migration is complete
 */

const SLATE_LIGHT_MAP: Record<string, string> = {
    "50": "950", "100": "900", "200": "800", "300": "700", "400": "600",
    "600": "400", "700": "300", "800": "200", "900": "50", "950": "white",
};

const ACCENT_TEXT_LIGHT_MAP: Record<string, string> = {
    "200": "800", "300": "700", "400": "600",
};

const ACCENT_COLORS = [
    "indigo", "rose", "emerald", "amber", "blue", "purple", "red",
    "cyan", "green", "yellow", "orange", "pink", "violet", "teal",
    "lime", "fuchsia", "sky",
];

// Utility prefixes that accept color values (longer variants first to avoid partial match)
const COLOR_UTILS = [
    "ring-offset", "border-t", "border-b", "border-l", "border-r", "border-x", "border-y",
    "bg", "text", "border", "ring", "divide", "outline", "shadow",
    "from", "to", "via", "placeholder", "decoration", "accent", "caret", "fill", "stroke",
];

const UTIL_RE = COLOR_UTILS.map(u => u.replace(/-/g, "\\-")).join("|");
const SHADES_RE = "50|100|200|300|400|600|700|800|900|950";
const ACCENT_RE = ACCENT_COLORS.join("|");
const OPACITY_RE = "(?:\\/(?:\\d+|\\[[\\d.%]+\\]))";

// ── Slate: any color utility ──
// (?!\d) prevents shade "50" from partially matching inside "500"
const slateRe = new RegExp(
    `((?:[^\\s"'\`{}]+:)*)((?:${UTIL_RE})\\-slate)\\-(${SHADES_RE})(?!\\d)(${OPACITY_RE})?`,
    "g",
);

// ── Accent: text- utility only, shades 200/300/400 ──
const accentTextRe = new RegExp(
    `((?:[^\\s"'\`{}]+:)*)(text\\-(?:${ACCENT_RE}))\\-(200|300|400)(?!\\d)(${OPACITY_RE})?`,
    "g",
);

const LEGACY_THEME_PATTERNS = [
    /--tw-slate-\d+/,
    /--color-slate-(?:50|100|200|300|400|500|600|700|800|900|950)\s*:/,
];
const CSS_THEME_IMPORT_RE = /@import\s+"tailwindcss"/;
const CSS_THEME_LIGHT_RE = /color-scheme:\s*light/;
const CSS_THEME_DARK_RE = /color-scheme:\s*dark/;
const CSS_THEME_VARIANT_RE = /@custom-variant\s+dark\s*\(/;
const CSS_THEME_DARK_SELECTOR_RE = /\.dark\s*\{/;
const THEME_SOURCE_GLOB = "{src,styles}/**/*.{tsx,ts,css}";
const THEME_CODE_GLOB = "src/**/*.{tsx,ts}";
// Matches quoted string/template literal segments so we can inspect Tailwind class tokens
// without trying to parse the full TSX AST. Escaped characters remain inside the match.
const STRING_LITERAL_RE = /(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g;
const RAW_SLATE_TOKEN_RE = new RegExp(
    `^((?:[^\\s"'\\\`{}]+:)*)((?:${UTIL_RE}))\\-slate\\-(50|100|200|300|400|600|700|800|900|950)(?:${OPACITY_RE})?$`,
);
const LOW_CONTRAST_ACCENT_TOKEN_RE = new RegExp(
    `^((?:[^\\s"'\\\`{}]+:)*)text\\-(?:${ACCENT_RE})\\-(200|300|400)(?:${OPACITY_RE})?$`,
);
const UNPAIRED_WHITE_GRADIENT_TOKEN_RE = new RegExp(
    `^((?:[^\\s"'\\\`{}]+:)*)((?:from|to|via))\\-white(?:${OPACITY_RE})?$`,
);

export type ThemeValidationIssue = {
    path: string;
    reason: string;
};

function replaceSlate(_m: string, mods: string, prefix: string, shade: string, opa = "") {
    if (mods.includes("dark:")) return _m;
    const lightShade = SLATE_LIGHT_MAP[shade];
    if (!lightShade) return _m;

    if (lightShade === "white") {
        // bg-slate-950 → bg-white dark:bg-slate-950
        const util = prefix.replace(/-slate$/, "");
        return `${mods}${util}-white${opa} dark:${mods}${prefix}-${shade}${opa}`;
    }
    return `${mods}${prefix}-${lightShade}${opa} dark:${mods}${prefix}-${shade}${opa}`;
}

function replaceAccentText(_m: string, mods: string, prefix: string, shade: string, opa = "") {
    if (mods.includes("dark:")) return _m;
    const lightShade = ACCENT_TEXT_LIGHT_MAP[shade];
    if (!lightShade) return _m;
    return `${mods}${prefix}-${lightShade}${opa} dark:${mods}${prefix}-${shade}${opa}`;
}

export function transformThemeSource(original: string) {
    let result = original;
    let slateDelta = 0;
    let accentDelta = 0;

    result = result.replace(slateRe, (...args) => {
        const r = replaceSlate(...(args as [string, string, string, string, string]));
        if (r !== args[0]) slateDelta++;
        return r;
    });

    result = result.replace(accentTextRe, (...args) => {
        const r = replaceAccentText(...(args as [string, string, string, string, string]));
        if (r !== args[0]) accentDelta++;
        return r;
    });

    return {
        result,
        slateDelta,
        accentDelta,
        changed: result !== original,
    };
}

function hasLegacyThemeTokens(source: string) {
    return LEGACY_THEME_PATTERNS.some((pattern) => pattern.test(source));
}

function validateCssThemeInfra(path: string, source: string) {
    const issues: ThemeValidationIssue[] = [];

    if (!CSS_THEME_IMPORT_RE.test(source)) {
        return issues;
    }

    if (CSS_THEME_LIGHT_RE.test(source) && !CSS_THEME_VARIANT_RE.test(source)) {
        issues.push({
            path,
            reason: "missing @custom-variant dark declaration",
        });
    }

    if (CSS_THEME_LIGHT_RE.test(source) && (!CSS_THEME_DARK_RE.test(source) || !CSS_THEME_DARK_SELECTOR_RE.test(source))) {
        issues.push({
            path,
            reason: "missing dark-mode CSS variable block",
        });
    }

    return issues;
}

function extractStringLiterals(source: string) {
    return [...source.matchAll(STRING_LITERAL_RE)].map((match) => match[0].slice(1, -1));
}

function hasDarkCompanionToken(tokens: string[], mods: string, util: string) {
    const prefix = `dark:${mods}${util}-`;
    return tokens.some((token) => token.startsWith(prefix));
}

function validateClassTokens(path: string, source: string) {
    const issues: ThemeValidationIssue[] = [];

    for (const literal of extractStringLiterals(source)) {
        if (!literal.includes("slate-") && !literal.includes("-white") && !literal.includes("text-")) continue;

        const tokens = literal.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
            const slateMatch = token.match(RAW_SLATE_TOKEN_RE);
            if (slateMatch) {
                const [, mods = "", util = "", slateShade = ""] = slateMatch;
                if (!mods.includes("dark:") && !hasDarkCompanionToken(tokens, mods, util)) {
                    issues.push({
                        path,
                        reason: `missing dark: pair for ${token}`,
                    });
                }

                continue;
            }

            const whiteGradientMatch = token.match(UNPAIRED_WHITE_GRADIENT_TOKEN_RE);
            const whiteGradientMods = whiteGradientMatch?.[1] ?? "";
            const whiteGradientUtil = whiteGradientMatch?.[2] ?? "";
            if (whiteGradientMatch && !whiteGradientMods.includes("dark:") && !hasDarkCompanionToken(tokens, whiteGradientMods, whiteGradientUtil)) {
                issues.push({
                    path,
                    reason: `missing dark: pair for ${token}`,
                });
                continue;
            }

            const accentMatch = token.match(LOW_CONTRAST_ACCENT_TOKEN_RE);
            const accentMods = accentMatch?.[1] ?? "";
            if (accentMatch && !accentMods.includes("dark:")) {
                issues.push({
                    path,
                    reason: `light-mode accent text still uses low-contrast shade in ${token}`,
                });
            }
        }
    }

    return issues;
}

export async function collectThemeValidationIssues(root = ".") {
    const issues: ThemeValidationIssue[] = [];

    for await (const path of new Bun.Glob(THEME_SOURCE_GLOB).scan(root)) {
        if (path.includes("migrate-theme")) continue;

        const original = await Bun.file(path).text();
        if (path.endsWith(".css")) {
            issues.push(...validateCssThemeInfra(path, original));

            if (hasLegacyThemeTokens(original)) {
                issues.push({
                    path,
                    reason: "legacy slate CSS variable indirection remains",
                });
            }

            continue;
        }

        issues.push(...validateClassTokens(path, original));
    }

    return issues;
}

async function applyMigration(root = ".") {
    let modified = 0;
    let slateCount = 0;
    let accentCount = 0;

    for await (const path of new Bun.Glob(THEME_CODE_GLOB).scan(root)) {
        if (path.endsWith(".css") || path.includes("migrate-theme")) continue;

        const original = await Bun.file(path).text();
        const { result, changed, slateDelta, accentDelta } = transformThemeSource(original);

        if (!changed) continue;

        await Bun.write(path, result);
        modified++;
        slateCount += slateDelta;
        accentCount += accentDelta;
        const tags = [slateDelta && `slate:${slateDelta}`, accentDelta && `accent:${accentDelta}`].filter(Boolean).join(" ");
        console.log(`  ✓ ${path}  (${tags})`);
    }

    console.log(`\nDone — ${modified} files modified, ${slateCount} slate + ${accentCount} accent replacements`);
}

async function main() {
    const checkOnly = Bun.argv.includes("--check");
    if (checkOnly) {
        const issues = await collectThemeValidationIssues(".");
        if (issues.length === 0) {
            console.log("Theme migration validation passed — no remaining rewrites or legacy slate CSS vars found.");
            return;
        }

        console.error("Theme migration validation failed:");
        for (const issue of issues) {
            console.error(`  - ${issue.path}: ${issue.reason}`);
        }
        process.exit(1);
    }

    await applyMigration(".");
}

if (import.meta.main) {
    await main();
}

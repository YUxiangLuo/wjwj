/**
 * Theme migration: inverted slate CSS variables → standard light-first + dark: prefix
 *
 * Slate mapping (code shade → light-mode equivalent):
 *   50→950, 100→900, 200→800, 300→700, 400→600, 500=skip,
 *   600→400, 700→300, 800→200, 900→50, 950→white
 *
 * Accent text colors (text-{color}-{shade}):
 *   200→800, 300→700, 400→600  (darker for light-mode readability)
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

// ─────────────────────────────────────────────────
async function main() {
    const glob = new Bun.Glob("src/**/*.{tsx,ts}");
    let modified = 0;
    let slateCount = 0;
    let accentCount = 0;

    for await (const path of glob.scan(".")) {
        if (path.endsWith(".css") || path.includes("migrate-theme")) continue;

        const original = await Bun.file(path).text();

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

        if (result !== original) {
            await Bun.write(path, result);
            modified++;
            slateCount += slateDelta;
            accentCount += accentDelta;
            const tags = [slateDelta && `slate:${slateDelta}`, accentDelta && `accent:${accentDelta}`].filter(Boolean).join(" ");
            console.log(`  ✓ ${path}  (${tags})`);
        }
    }

    console.log(`\nDone — ${modified} files modified, ${slateCount} slate + ${accentCount} accent replacements`);
}

main();

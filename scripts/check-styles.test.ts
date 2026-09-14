import { describe, expect, test } from "bun:test";
import {
    contrastRatio,
    countDecorativeEffectClasses,
    countHardcodedPaletteClasses,
    countJsxSameIntentPairs,
    countLegacyColoredShadowClasses,
    countLegacyRadiusClasses,
    countLegacyShadowClasses,
    countLegacyTypographyClasses,
    countNonSemanticRadiusClasses,
    countNonSemanticShadowClasses,
    countResponsiveViewportClasses,
    countSemanticAlphaClasses,
    readThemeHex,
} from "./check-styles";

describe("style guard", () => {
    test("excludes test fixtures from Tailwind production source detection", async () => {
        const themeCss = await Bun.file("styles/theme.css").text();

        expect(themeCss).toContain('@source not "../scripts";');
        expect(themeCss).toContain('@source not "../src/**/*.test.ts";');
        expect(themeCss).toContain('@source not "../src/**/*.test.tsx";');
        expect(themeCss).toContain('@source not "../src/test-utils";');
    });

    test("enforces the desktop-only document contract", async () => {
        const themeCss = await Bun.file("styles/theme.css").text();
        const appHtml = await Promise.all([
            Bun.file("src/admin/admin.html").text(),
            Bun.file("src/teacher/teacher.html").text(),
            Bun.file("src/student/student.html").text(),
        ]);

        expect(themeCss).toContain("--breakpoint-*: initial;");
        expect(themeCss).toMatch(/html,\s*\n\s*body,\s*\n\s*#root\s*\{\s*\n\s*min-width:\s*64rem;/m);
        expect(themeCss).not.toMatch(/@media\s*[^\{]*(?:(?:min|max)-width|orientation|(?:any-)?pointer|hover)|@container\b/i);
        for (const html of appHtml) expect(html).not.toMatch(/<meta\s+name=["']viewport["']/i);
    });

    test("detects viewport-responsive utilities without confusing component sizes", () => {
        expect(countResponsiveViewportClasses("grid sm:grid-cols-2 xl:grid-cols-4 min-[900px]:flex max-2xl:block @md/card:flex landscape:grid")).toBe(6);
        expect(countResponsiveViewportClasses('sm: "h-8" lg: "h-10" backdrop-blur-sm')).toBe(0);
    });

    test("requires semantic shape and elevation classes in maintained design-system files", () => {
        expect(countNonSemanticRadiusClasses("rounded-xs rounded-sm rounded-md rounded-2xl rounded-control rounded-full")).toBe(5);
        expect(countNonSemanticShadowClasses("shadow-2xs shadow-sm shadow-lg shadow-surface shadow-primary/20")).toBe(3);
    });

    test("counts legacy page shape and shadow debt for ratcheting", () => {
        expect(countLegacyRadiusClasses("rounded-xs rounded-sm rounded-md rounded-lg rounded-xl rounded-2xl rounded-feature")).toBe(6);
        expect(countLegacyShadowClasses("shadow-2xs shadow-xs shadow-sm shadow-2xl shadow-surface")).toBe(4);
        expect(countLegacyColoredShadowClasses("shadow-primary/20 shadow-info shadow-destructive/20 shadow-card")).toBe(3);
    });

    test("rejects raw typography, alpha color composition, and decorative effects", () => {
        expect(countLegacyTypographyClasses("text-xs text-sm text-[11px] text-meta text-body")).toBe(3);
        expect(countSemanticAlphaClasses("bg-primary/10 border-success/20 text-foreground/90 bg-heatmap-low/50 bg-primary-muted")).toBe(4);
        expect(countDecorativeEffectClasses("bg-gradient-to-r bg-linear-to-r bg-linear-45 bg-radial bg-conic-180 bg-[linear-gradient(to_right,red,blue)] backdrop-blur-sm hover:scale-105 disabled:opacity-50 transition-all animate-spin")).toBe(10);
        expect(countDecorativeEffectClasses("bg-primary bg-primary-muted transition-colors animate-spin")).toBe(0);
    });

    test("keeps body, muted, status, and input-boundary contrast readable", async () => {
        const themeCss = await Bun.file("styles/theme.css").text();
        const foreground = readThemeHex(themeCss, "foreground");
        const mutedForeground = readThemeHex(themeCss, "muted-foreground");
        const background = readThemeHex(themeCss, "background");
        const card = readThemeHex(themeCss, "card");
        const success = readThemeHex(themeCss, "success");
        const successMuted = readThemeHex(themeCss, "success-muted");
        const input = readThemeHex(themeCss, "input");

        expect(contrastRatio(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(mutedForeground!, background!)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(success!, successMuted!)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(input!, card!)).toBeGreaterThanOrEqual(3);
    });

    test("defines shared cursors for enabled and disabled interactive controls", async () => {
        const themeCss = await Bun.file("styles/theme.css").text();
        const richTextEditor = await Bun.file("src/components/RichTextEditor.tsx").text();

        expect(themeCss).toContain('label[for],');
        expect(themeCss).toContain('[role="button"],');
        expect(themeCss).toContain('[role="option"],');
        expect(themeCss).toContain('[data-slot="slider"]');
        expect(themeCss).toContain("cursor: pointer;");
        expect(themeCss).toContain("cursor: not-allowed;");
        expect(themeCss).toContain("@custom-variant hover");
        expect(themeCss).toContain('&:hover:not(:disabled):not([aria-disabled="true"]):not([data-disabled])');
        expect(richTextEditor).toContain('disabled && "cursor-not-allowed bg-muted text-muted-foreground"');
        expect(richTextEditor).not.toContain('disabled && "opacity-40 pointer-events-none"');
    });

    test("detects a solid semantic parent with same-intent child text", () => {
        const source = `
            export function BrokenState() {
                return (
                    <div className="bg-destructive">
                        <span className="text-destructive">不可见</span>
                    </div>
                );
            }
        `;

        expect(countJsxSameIntentPairs("BrokenState.tsx", source)).toBe(1);
    });

    test("accepts foreground text on a filled semantic surface", () => {
        const source = `
            <div className="bg-success">
                <span className="text-success-foreground">完成</span>
            </div>
        `;

        expect(countJsxSameIntentPairs("SuccessState.jsx", source)).toBe(0);
    });

    test("stops inherited background checks at a nested surface", () => {
        const source = `
            <div className="bg-primary">
                <div className="bg-card">
                    <span className="text-primary">独立卡片内容</span>
                </div>
            </div>
        `;

        expect(countJsxSameIntentPairs("NestedSurface.tsx", source)).toBe(0);
    });

    test("does not combine mutually exclusive class branches", () => {
        const source = `
            <button
                className={active
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-primary hover:bg-primary/10"}
            >切换</button>
        `;

        expect(countJsxSameIntentPairs("ConditionalClasses.tsx", source)).toBe(0);
    });

    test("detects additive cn fragments and multiline template classes", () => {
        const source = `
            <div className={cn("bg-destructive", "text-destructive")} />
            <div className={\`
                bg-success
                text-success
            \`} />
        `;

        expect(countJsxSameIntentPairs("ComposedClasses.tsx", source)).toBe(2);
    });

    test("does not let a hover-only surface hide an inherited violation", () => {
        const source = `
            <div className="bg-primary">
                <span className="text-primary hover:bg-card">默认状态不可见</span>
            </div>
        `;

        expect(countJsxSameIntentPairs("HoverSurface.tsx", source)).toBe(1);
    });

    test("does not merge correlated parent and child ternaries", () => {
        const source = `
            <div className={active ? "bg-primary" : "bg-card"}>
                <span className={active ? "text-primary-foreground" : "text-primary"}>安全</span>
            </div>
        `;

        expect(countJsxSameIntentPairs("CorrelatedBranches.tsx", source)).toBe(0);
    });

    test("checks every conditional child text state against a static parent", () => {
        const source = `
            <div className="bg-primary">
                <span className={active ? "text-primary" : "text-primary-foreground"}>状态</span>
            </div>
        `;

        expect(countJsxSameIntentPairs("ConditionalChild.tsx", source)).toBe(1);
    });

    test("keeps additive base classes across conditional states", () => {
        const sameElement = `
            <div className={cn(
                "bg-primary",
                active ? "text-primary-foreground" : "text-primary",
            )} />
        `;
        const inherited = `
            <div className={cn(
                "bg-primary",
                active ? "border-info" : "border-warning",
            )}>
                <span className="text-primary">不可见</span>
            </div>
        `;

        expect(countJsxSameIntentPairs("AdditiveBase.tsx", sameElement)).toBe(1);
        expect(countJsxSameIntentPairs("InheritedAdditiveBase.tsx", inherited)).toBe(1);
    });

    test("checks nested static HTML classes", () => {
        const source = `
            <div class="bg-info">
                <span class="text-info">不可见</span>
            </div>
        `;

        expect(countJsxSameIntentPairs("fixture.html", source)).toBe(1);
    });

    test("recognizes color utilities beyond background, text, and border", () => {
        const source = [
            "outline-red-500",
            "decoration-blue-500",
            "caret-rose-500",
            "accent-green-500",
            "placeholder-slate-500",
        ].join(" ");

        expect(countHardcodedPaletteClasses(source)).toBe(5);
    });

    test("uses strict utility boundaries and covers directional borders", () => {
        expect(countHardcodedPaletteClasses("text-whiteboard bg-red-500ish")).toBe(0);
        expect(countHardcodedPaletteClasses("border-l-red-500 border-x-blue-400/20")).toBe(2);
    });
});

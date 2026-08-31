import { describe, expect, test } from "bun:test";
import {
    countHardcodedPaletteClasses,
    countJsxSameIntentPairs,
    countResponsiveViewportClasses,
    countUnsupportedResponsiveClasses,
} from "./check-styles";

function relativeLuminance(hex: string) {
    const channels = hex.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
    const [red = 0, green = 0, blue = 0] = channels.map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
    const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
    const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
    return (lighter + 0.05) / (darker + 0.05);
}

describe("style guard", () => {
    test("excludes test fixtures from Tailwind production source detection", async () => {
        const themeCss = await Bun.file("styles/theme.css").text();

        expect(themeCss).toContain('@source not "../scripts";');
        expect(themeCss).toContain('@source not "../src/**/*.test.ts";');
        expect(themeCss).toContain('@source not "../src/**/*.test.tsx";');
        expect(themeCss).toContain('@source not "../src/test-utils";');
    });

    test("enforces the desktop-first reflow document contract", async () => {
        const themeCss = await Bun.file("styles/theme.css").text();
        const appHtml = await Promise.all([
            Bun.file("src/admin/admin.html").text(),
            Bun.file("src/teacher/teacher.html").text(),
            Bun.file("src/student/student.html").text(),
        ]);

        expect(themeCss).not.toContain("--breakpoint-*: initial;");
        expect(themeCss).not.toMatch(/html,\s*\n\s*body,\s*\n\s*#root\s*\{[^}]*min-width:/m);
        for (const html of appHtml) expect(html).toMatch(/<meta\s+name=["']viewport["'][^>]+width=device-width/i);
    });

    test("detects viewport-responsive utilities without confusing component sizes", () => {
        expect(countResponsiveViewportClasses("grid sm:grid-cols-2 xl:grid-cols-4 min-[900px]:flex max-2xl:block @md/card:flex landscape:grid")).toBe(6);
        expect(countResponsiveViewportClasses('sm: "h-8" lg: "h-10" backdrop-blur-sm')).toBe(0);
        expect(countUnsupportedResponsiveClasses("sm:grid md:flex 2xl:grid min-[900px]:flex landscape:block")).toBe(3);
    });

    test("keeps normal success text above WCAG AA contrast on tinted surfaces", async () => {
        const themeCss = await Bun.file("styles/theme.css").text();
        const success = themeCss.match(/--success:\s*(#[0-9a-f]{6});/i)?.[1];

        expect(success).toBeTruthy();
        // Effective surface behind the success text in the graded-task score strip.
        expect(contrastRatio(success!, "#dee9ed")).toBeGreaterThanOrEqual(4.5);
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
        expect(richTextEditor).toContain('disabled && "opacity-40 cursor-not-allowed"');
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

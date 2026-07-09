import { describe, expect, test } from "bun:test";
import {
    countHardcodedPaletteClasses,
    countJsxSameIntentPairs,
} from "./check-styles";

describe("style guard", () => {
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

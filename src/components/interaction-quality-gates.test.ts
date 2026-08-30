import { expect, test } from "bun:test";

async function readTsxSources() {
    const files: string[] = [];
    for await (const file of new Bun.Glob("src/**/*.tsx").scan(".")) files.push(file);
    const sources = await Promise.all(files.map(async (file) => ({
        file,
        source: await Bun.file(file).text(),
    })));
    return sources;
}

test("links and buttons are never nested as competing interactive controls", async () => {
    const violations: string[] = [];
    for (const { file, source } of await readTsxSources()) {
        if (/<Link\b[^>]*>\s*<Button\b/s.test(source)) violations.push(`${file}: Link contains Button`);
        if (/<a\b[^>]*>\s*<Button\b/s.test(source)) violations.push(`${file}: anchor contains Button`);
        if (/<Button\b(?![^>]*\basChild\b)[^>]*>\s*<(?:a|Link)\b/s.test(source)) violations.push(`${file}: Button contains link without asChild`);
    }
    expect(violations).toEqual([]);
});

test("controlled alerts and immersive sampling preserve keyboard focus", async () => {
    const alertDialog = await Bun.file("src/components/ui/alert-dialog.tsx").text();
    const samplingAnimation = await Bun.file("src/student/components/ImmersiveSamplingAnimation.tsx").text();
    expect(alertDialog).toContain("restoreFocusRef");
    expect(alertDialog).toContain("opener?.isConnected");
    expect(samplingAnimation).toContain('role="dialog"');
    expect(samplingAnimation).toContain('aria-modal="true"');
    expect(samplingAnimation).toContain("closeButtonRef.current?.focus()");
    expect(samplingAnimation).toContain("if (opener?.isConnected) opener.focus()");
});

test("the shared theme disables decorative motion for reduced-motion users", async () => {
    const theme = await Bun.file("styles/theme.css").text();
    const reducedMotionBlock = theme.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(reducedMotionBlock).toContain("animation: none !important");
    expect(reducedMotionBlock).toContain("transition: none !important");
    expect(reducedMotionBlock).toContain("scroll-behavior: auto !important");
});

test("the explicit desktop-only viewport contract remains enabled", async () => {
    const theme = await Bun.file("styles/theme.css").text();
    const styleCheck = await Bun.file("scripts/check-styles.ts").text();
    expect(theme).toContain("min-width: 80rem");
    expect(styleCheck).toContain("The frontend is desktop-only.");
});

test("the topic wizard follows the standard Escape close behavior", async () => {
    const wizard = await Bun.file("src/teacher/components/TopicWizardDialog.tsx").text();
    expect(wizard).not.toContain("onEscapeKeyDown={(e) => e.preventDefault()}");
});

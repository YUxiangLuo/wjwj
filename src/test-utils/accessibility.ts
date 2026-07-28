export async function getAccessibilityViolations(container: Element) {
    const axe = (await import("axe-core")).default;
    const result = await axe.run(container, {
        rules: {
            // happy-dom does not calculate layout/paint data reliably. Browser
            // dogfood remains responsible for contrast; structural rules run here.
            "color-contrast": { enabled: false },
        },
    });
    return result.violations;
}

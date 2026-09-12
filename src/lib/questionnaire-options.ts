/** One-based positions of repeated labels. Keep case distinctions for symbols such as X/x. */
export function getDuplicateOptionIndexes(options: readonly string[]): number[] {
    const first = new Map<string, number>();
    const duplicates = new Set<number>();
    options.forEach((option, index) => {
        // Fold full-width ASCII only: NFKC would incorrectly merge 10² with 102.
        const key = option.replace(/[\uFF01-\uFF5E]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
            .trim().replace(/\s+/gu, " ");
        if (!key) return;
        const previous = first.get(key);
        if (previous === undefined) {
            first.set(key, index + 1);
        } else {
            duplicates.add(previous);
            duplicates.add(index + 1);
        }
    });
    return [...duplicates].sort((a, b) => a - b);
}

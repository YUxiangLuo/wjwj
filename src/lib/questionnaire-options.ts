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

/** getRandomValues also works on ordinary intranet HTTP; randomUUID requires a secure context. */
export function generateOptionIdentity(): string {
    return `o_${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function validateOptionIdentities(question: { options?: unknown; optionIds?: unknown }): string | null {
    if (question.optionIds === undefined) return null;
    const ids = question.optionIds;
    return !Array.isArray(ids) || !Array.isArray(question.options) || ids.length !== question.options.length
        || ids.some(id => typeof id !== "string" || !id.trim().length || id.length > 200 || id.includes("\0"))
        || new Set(ids).size !== ids.length ? "选项身份无效或重复，请重新编辑题目" : null;
}

/**
 * Identity strings (student numbers, employee IDs) arrive from spreadsheets and
 * human input, so the same logical value can be typed with full-width digits,
 * ideographic spaces or trailing whitespace. Comparing only case-insensitively
 * (citext) lets those variants create visually identical accounts, so every
 * uniqueness decision normalizes first.
 */

/** Canonical form stored for new accounts: trimmed and Unicode-normalized. */
export function normalizeIdentityText(value: string) {
    return value.normalize("NFKC").trim();
}

/** Comparison key: the stored form, case-folded. */
export function identityKey(value: string) {
    return normalizeIdentityText(value).toLocaleLowerCase("en-US");
}

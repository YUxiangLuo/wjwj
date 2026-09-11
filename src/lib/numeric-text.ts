/**
 * CSV cells arrive as text, and a spreadsheet export can carry full-width digits
 * or thousands separators that `Number()` rejects. Validation and statistics must
 * agree on what counts as a number, otherwise a column can pass validation and
 * still be read as missing during analysis, so both go through this parser.
 *
 * Deliberately narrow: scientific notation and leading signs are supported, the
 * comma is treated as a thousands separator (zh-CN teaching data), and decimal
 * commas are not accepted.
 */

const NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Numeric value of a cell, or null when the cell is blank or not a number. */
export function parseNumericText(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "bigint") {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    }
    if (typeof value !== "string") return null;

    const normalized = value.normalize("NFKC").trim();
    if (normalized === "") return null;
    const withoutSeparators = normalized.replace(/,(?=\d{3}(?:\D|$))/g, "");
    if (!NUMERIC_PATTERN.test(withoutSeparators)) return null;
    const numeric = Number(withoutSeparators);
    return Number.isFinite(numeric) ? numeric : null;
}

/** True when the cell looks like a number (used for column-level validation). */
export function isNumericText(value: unknown) {
    return parseNumericText(value) !== null;
}

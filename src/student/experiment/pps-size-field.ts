const PPS_SIZE_FIELD_HINT = /费|收入|人口|规模|消费|支出|预算|产值|income|spending|population|size|fee|budget/i;
const PPS_WEIGHT_FIELD_HINT = /权重|weight/i;

/** Prefer a size measure; use a weight field only when no size name matches. */
export function pickDefaultPpsSizeField(eligibleFields: readonly string[]): string {
    const sizeField = eligibleFields.find((field) => PPS_SIZE_FIELD_HINT.test(field));
    if (sizeField) return sizeField;
    const weightField = eligibleFields.find((field) => PPS_WEIGHT_FIELD_HINT.test(field));
    if (weightField) return weightField;
    return eligibleFields[0] ?? "";
}

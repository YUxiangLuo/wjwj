import type { FieldMappingState } from "../components/StudyContractEditor";

/** A field has one role; changing roles must also remove hidden `others` entries. */
export function assignFieldRole(
    mapping: FieldMappingState,
    field: string,
    role: "identifier" | "numeric" | "stratified" | "others" | null,
): FieldMappingState {
    const next = {
        ...mapping,
        identifier: mapping.identifier === field ? undefined : mapping.identifier,
        numeric: mapping.numeric.filter(value => value !== field),
        stratified: mapping.stratified.filter(value => value !== field),
        others: mapping.others.filter(value => value !== field),
    };
    if (role === "identifier") next.identifier = field;
    else if (role) next[role].push(field);
    return next;
}

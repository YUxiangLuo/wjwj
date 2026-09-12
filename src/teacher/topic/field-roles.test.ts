import { expect, test } from "bun:test";
import { assignFieldRole } from "./field-roles";

const mapping = { identifier: "id", numeric: ["y"], stratified: ["g"], others: ["cat"] };

test("promoting a categorical field to identifier removes its previous role without mutating the mapping", () => {
    expect(assignFieldRole(mapping, "cat", "identifier")).toEqual({ ...mapping, identifier: "cat", others: [] });
    expect(mapping.others).toEqual(["cat"]);
});

test("role changes are exclusive, idempotent and reversible", () => {
    const numeric = assignFieldRole(mapping, "cat", "numeric");
    expect(numeric).toEqual({ ...mapping, numeric: ["y", "cat"], others: [] });
    expect(assignFieldRole(numeric, "cat", "numeric")).toEqual(numeric);
    expect(assignFieldRole(numeric, "cat", "others")).toEqual(mapping);
    expect(assignFieldRole(mapping, "cat", null).others).toEqual([]);
});

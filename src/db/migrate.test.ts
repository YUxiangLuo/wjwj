import { expect, test } from "bun:test";

import { migrationHistoryIsCurrentPrefix } from "./migrate";

test("migration history accepts only a nonempty prefix of the clean baseline", () => {
    expect(migrationHistoryIsCurrentPrefix([100], [100])).toBe(true);
    expect(migrationHistoryIsCurrentPrefix([100], [100, 200])).toBe(true);
    expect(migrationHistoryIsCurrentPrefix([], [100])).toBe(false);
    expect(migrationHistoryIsCurrentPrefix([99], [100])).toBe(false);
    expect(migrationHistoryIsCurrentPrefix([100, 200], [100])).toBe(false);
});

import { expect, test } from "bun:test";
import {
    createMeanPopulation,
    createPpsPopulation,
    resolveSeedAnchor,
    shiftDays,
} from "./dogfood-fixtures";
import { getPpsEligibleNumericFields } from "../../student/experiment/population-data";

test("seed anchor accepts an explicit ISO instant and derives relative dates", () => {
    const anchor = resolveSeedAnchor("2026-06-15T08:30:00.000Z");
    expect(anchor.toISOString()).toBe("2026-06-15T08:30:00.000Z");
    expect(shiftDays(anchor, -7).toISOString()).toBe("2026-06-08T08:30:00.000Z");
    expect(shiftDays(anchor, 30).toISOString()).toBe("2026-07-15T08:30:00.000Z");
});

test("seed anchor rejects invalid or non-zoned input", () => {
    expect(() => resolveSeedAnchor("not-a-date")).toThrow("Invalid SEED_NOW value");
    expect(() => resolveSeedAnchor("2026-02-30T08:30:00Z")).toThrow("Invalid SEED_NOW value");
    expect(() => resolveSeedAnchor("2026-06-15 08:30:00")).toThrow("Invalid SEED_NOW value");
});

test("population fixtures cover PPS-eligible and PPS-unavailable branches", () => {
    const pps = createPpsPopulation();
    const mean = createMeanPopulation();

    expect(pps).toHaveLength(200);
    expect(getPpsEligibleNumericFields(pps, ["月生活费"])).toEqual(["月生活费"]);
    expect(mean).toHaveLength(24);
    expect(mean.some((row) => row.每周阅读时长 === 0)).toBe(true);
    expect(getPpsEligibleNumericFields(mean, ["每周阅读时长"])).toEqual([]);
});

import { expect, test } from "bun:test";
import { isRecommendedSemesterName } from "./SemesterManagement";

test("semester recommendation accepts the same academic-year format used by seed data", () => {
    expect(isRecommendedSemesterName("2026-2027-1")).toBe(true);
    expect(isRecommendedSemesterName(" 2025-2026-2 ")).toBe(true);
    expect(isRecommendedSemesterName("2026-Spring")).toBe(false);
    expect(isRecommendedSemesterName("2026-2027-3")).toBe(false);
});

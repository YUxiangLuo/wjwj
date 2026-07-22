import { describe, expect, test } from "bun:test";
import { resolveStratifyBy } from "./StratifiedSamplingTab";

describe("resolveStratifyBy", () => {
    const customStats = {
        年级: { 大一: 30, 大二: 30 },
        学院: { 统计学院: 40, 计算机学院: 20 },
    };

    test("uses the first available custom field instead of a hard-coded legacy field", () => {
        expect(resolveStratifyBy(customStats)).toBe("年级");
    });

    test("keeps a persisted field only while it exists in the current population", () => {
        expect(resolveStratifyBy(customStats, "学院")).toBe("学院");
        expect(resolveStratifyBy(customStats, "gender")).toBe("年级");
    });
});

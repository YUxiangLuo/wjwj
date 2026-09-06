import { expect, test } from "bun:test";
import { formatStatistic } from "./statistic-format";
import { formatSamplePlanNumber } from "../student/experiment/sample-plan-display";

test("small nonzero measurements remain distinct from zero", () => {
    expect(formatStatistic(0.000003)).toBe("3.000e-6");
    expect(formatStatistic(-0.0000004)).toBe("-4.000e-7");
    expect(formatStatistic(0)).toBe("0.0000");
    expect(formatStatistic(-1083.333, 2)).toBe("-1083.33");
    expect(formatStatistic(Number.NaN)).toBe("—");
    expect(formatSamplePlanNumber(2e-12)).toBe("2e-12");
});

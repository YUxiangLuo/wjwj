import { describe, expect, test } from "bun:test";
import { disambiguateAxisLabels, truncateAxisLabel } from "./axis-label";

describe("axis-label helpers", () => {
    test("keeps short labels unchanged and truncates unique long labels normally", () => {
        expect(truncateAxisLabel("普通会员", 10)).toBe("普通会员");
        expect(truncateAxisLabel("新锐现制茶饮新品定价与支付意愿调研", 10)).toBe("新锐现制茶饮新品定…");
        expect(disambiguateAxisLabels(["普通会员", "银卡会员", "黑金会员"], 10)).toEqual([
            "普通会员",
            "银卡会员",
            "黑金会员",
        ]);
    });

    test("disambiguates distinct labels that would collide under prefix truncation", () => {
        const out = disambiguateAxisLabels(["2026级商业分析班", "2026级商务统计1班"], 7);
        expect(out[0]).not.toBe(out[1]);
        expect(out[0]).toContain("分析班");
        expect(out[1]).toContain("计1班");
    });

    test("preserves identical raw labels without adding artificial disambiguators", () => {
        const out = disambiguateAxisLabels(["超长重复分类名称示例一二三", "超长重复分类名称示例一二三"], 8);
        expect(out[0]).toBe(out[1]);
        expect(out[0]).toBe("超长重复分类名…");
    });
});

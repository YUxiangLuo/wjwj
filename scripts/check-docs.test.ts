import { expect, test } from "bun:test";
import { collectDocumentationIssues } from "./check-docs";
import { computeReadingPlan, DOGFOOD_COUNTS } from "../src/db/seeds/dogfood-fixtures";

const demo = await Bun.file(new URL("../docs/DEMO.md", import.meta.url)).text();
const teaching = await Bun.file(new URL("../docs/TEACHING.md", import.meta.url)).text();

test("canonical topic documents satisfy the documentation contract", () => {
    expect(collectDocumentationIssues(demo, teaching)).toEqual([]);
});

test("documentation gate rejects stale fixture counts and sample sizes", () => {
    const staleCount = demo.replace(`${DOGFOOD_COUNTS.student} 学生`, "999 学生");
    const stalePlan = demo.replace(`生产计算函数得到 ${computeReadingPlan().recommendedSize}`, "生产计算函数得到 999");
    expect(collectDocumentationIssues(staleCount, teaching).some(issue => issue.includes("当前 seed"))).toBe(true);
    expect(collectDocumentationIssues(stalePlan, teaching).some(issue => issue.includes("样本量"))).toBe(true);
});

test("documentation gate rejects removed demo accounts", () => {
    expect(collectDocumentationIssues(`${demo}\nT004`, teaching).some(issue => issue.includes("已移除"))).toBe(true);
});

test("documentation gate preserves required learning checks after README simplification", () => {
    const missingRule = teaching.replace("猜测可跳过", "猜测");
    expect(collectDocumentationIssues(demo, missingRule)).toContain("docs/TEACHING.md 缺少流程规则：猜测可跳过");
    expect(collectDocumentationIssues(demo, `${teaching}\n自检可跳过`)).toContain("docs/TEACHING.md 不得声称自检可跳过");
});

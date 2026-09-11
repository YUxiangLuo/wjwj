import { expect, test } from "bun:test";
import { describeCascadeImpact } from "./deletion-impact-copy";

test("student and task deletions describe the same cascade consistently", () => {
    const impact = { experiments: 3, submitted: 2, graded: 1 };
    expect(describeCascadeImpact(impact, "student")).toBe("将同时永久删除 3 条实验记录、已提交 2 条、已批改 1 条及其成绩与抽样记录。");
    expect(describeCascadeImpact(impact, "task")).toBe("将同时永久删除 3 条学生实验、已提交 2 条、已批改 1 条及对应成绩与抽样记录。");
});

test("deletions without hand-in work stay reassuring instead of alarming", () => {
    expect(describeCascadeImpact({ experiments: 0, submitted: 0, graded: 0 }, "student"))
        .toBe("该学生没有实验记录，删除后学号可以重新导入。");
    expect(describeCascadeImpact({ experiments: 0, submitted: 0, graded: 0 }, "task"))
        .toBe("该任务还没有学生实验记录。");
});

test("in-progress experiments are counted without overstating the damage", () => {
    expect(describeCascadeImpact({ experiments: 4, submitted: 0, graded: 0 }, "student"))
        .toBe("将同时永久删除 4 条实验记录及其成绩与抽样记录。");
});

import { expect, test } from "bun:test";
import { getTaskPrimaryAction, shouldShowTaskAvailabilityHint } from "./topic-detail-action";

test("submitted, grading, and graded task actions stay available after the editable window closes", () => {
    expect(getTaskPrimaryAction(3, "submitted", false)).toEqual({
        text: "查看提交内容",
        link: "/task/3/history",
        disabled: false,
    });
    expect(getTaskPrimaryAction(6, "grading", false)).toEqual({
        text: "查看提交内容",
        link: "/task/6/history",
        disabled: false,
    });
    expect(getTaskPrimaryAction(5, "graded", false)).toEqual({
        text: "查看成绩",
        link: "/task/5/history",
        disabled: false,
    });
});

test("editable task actions remain gated by availability windows", () => {
    expect(getTaskPrimaryAction(1, "not_started", false)).toEqual({
        text: "开始实验",
        link: "/task/1/experiment",
        disabled: true,
    });
    expect(getTaskPrimaryAction(2, "in_progress", false)).toEqual({
        text: "继续实验",
        link: "/task/2/experiment",
        disabled: true,
    });
    expect(getTaskPrimaryAction(4, "rejected", false)).toEqual({
        text: "重新开始",
        link: null,
        disabled: true,
    });
});

test("editable task actions are enabled when within availability window", () => {
    expect(getTaskPrimaryAction(1, "not_started", true)).toEqual({
        text: "开始实验",
        link: "/task/1/experiment",
        disabled: false,
    });
    expect(getTaskPrimaryAction(2, "in_progress", true)).toEqual({
        text: "继续实验",
        link: "/task/2/experiment",
        disabled: false,
    });
    expect(getTaskPrimaryAction(4, "rejected", true)).toEqual({
        text: "重新开始",
        link: null,
        disabled: false,
    });
});

test("availability hints only show for editable task states", () => {
    expect(shouldShowTaskAvailabilityHint("not_started", false)).toBe(true);
    expect(shouldShowTaskAvailabilityHint("in_progress", false)).toBe(true);
    expect(shouldShowTaskAvailabilityHint("rejected", false)).toBe(true);
    expect(shouldShowTaskAvailabilityHint("submitted", false)).toBe(false);
    expect(shouldShowTaskAvailabilityHint("grading", false)).toBe(false);
    expect(shouldShowTaskAvailabilityHint("graded", false)).toBe(false);
});

import { expect, test } from "bun:test";
import { ensureTaskIsOpen, hasTaskDeadlinePassed, ensureTaskSubmissionWindow } from "./task-timing";

// --- ensureTaskIsOpen ---

test("ensureTaskIsOpen returns null for null/undefined open time", () => {
    expect(ensureTaskIsOpen(null)).toBeNull();
    expect(ensureTaskIsOpen(undefined)).toBeNull();
});

test("ensureTaskIsOpen returns null for past open time", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(ensureTaskIsOpen(past)).toBeNull();
});

test("ensureTaskIsOpen returns failure for future open time", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const result = ensureTaskIsOpen(future);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("TASK_NOT_OPEN");
});

test("ensureTaskIsOpen returns null (safe) for invalid date strings", () => {
    expect(ensureTaskIsOpen("not-a-date")).toBeNull();
    expect(ensureTaskIsOpen("abc123")).toBeNull();
});

test("ensureTaskIsOpen accepts Date objects", () => {
    expect(ensureTaskIsOpen(new Date(Date.now() - 60_000))).toBeNull();
    const result = ensureTaskIsOpen(new Date(Date.now() + 60_000));
    expect(result).not.toBeNull();
    expect(result!.code).toBe("TASK_NOT_OPEN");
});

// --- hasTaskDeadlinePassed ---

test("hasTaskDeadlinePassed returns false for null/undefined deadline", () => {
    expect(hasTaskDeadlinePassed(null)).toBe(false);
    expect(hasTaskDeadlinePassed(undefined)).toBe(false);
});

test("hasTaskDeadlinePassed returns true for past deadline", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(hasTaskDeadlinePassed(past)).toBe(true);
});

test("hasTaskDeadlinePassed returns false for future deadline", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(hasTaskDeadlinePassed(future)).toBe(false);
});

test("hasTaskDeadlinePassed returns false (safe) for invalid date strings", () => {
    expect(hasTaskDeadlinePassed("not-a-date")).toBe(false);
    expect(hasTaskDeadlinePassed("abc123")).toBe(false);
});

// --- ensureTaskSubmissionWindow ---

test("ensureTaskSubmissionWindow returns null for null deadline", () => {
    expect(ensureTaskSubmissionWindow(null)).toBeNull();
});

test("ensureTaskSubmissionWindow rejects immediately after the deadline", () => {
    const recent = new Date(Date.now() - 5_000).toISOString();
    expect(ensureTaskSubmissionWindow(recent)?.code).toBe("TASK_DEADLINE");
});

test("ensureTaskSubmissionWindow returns failure well past deadline", () => {
    const old = new Date(Date.now() - 60_000).toISOString();
    const result = ensureTaskSubmissionWindow(old);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("TASK_DEADLINE");
});

test("ensureTaskSubmissionWindow returns null (safe) for invalid deadline", () => {
    expect(ensureTaskSubmissionWindow("not-a-date")).toBeNull();
    expect(ensureTaskSubmissionWindow("abc123")).toBeNull();
});

test("ensureTaskSubmissionWindow returns null for future deadline", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(ensureTaskSubmissionWindow(future)).toBeNull();
});

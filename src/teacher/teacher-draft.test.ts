import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { clearTeacherDraft, readTeacherDraft, writeTeacherDraft } from "./teacher-draft";

let restore: (() => void) | null = null;

beforeEach(() => {
    restore = installDomGlobals().restore;
    localStorage.clear();
});

afterEach(() => {
    localStorage.clear();
    restore?.();
    restore = null;
});

test("teacher drafts round-trip and remain isolated by teacher", () => {
    writeTeacherDraft(1, "topic:new", { name: "教师一草稿" });
    writeTeacherDraft(2, "topic:new", { name: "教师二草稿" });

    expect(readTeacherDraft<{ name: string }>(1, "topic:new")).toEqual({ name: "教师一草稿" });
    expect(readTeacherDraft<{ name: string }>(2, "topic:new")).toEqual({ name: "教师二草稿" });

    clearTeacherDraft(1, "topic:new");
    expect(readTeacherDraft(1, "topic:new")).toBeNull();
    expect(readTeacherDraft<{ name: string }>(2, "topic:new")).toEqual({ name: "教师二草稿" });
});

test("invalid or unavailable storage never blocks teacher editing", () => {
    localStorage.setItem("wj:teacher-draft:1:grading:7", "not-json");
    expect(readTeacherDraft(1, "grading:7")).toBeNull();
    expect(localStorage.getItem("wj:teacher-draft:1:grading:7")).toBeNull();

    expect(() => {
        writeTeacherDraft(null, "topic:new", { name: "ignored" });
        clearTeacherDraft(null, "topic:new");
    }).not.toThrow();
});

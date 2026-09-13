import { expect, test } from "bun:test";
import { instantiateQuestion } from "./instantiate-question";
import { bindingFor, bindingQuestion } from "@/test-utils/question-variable-binding";

test("new copies get their own option identities and never inherit source links", () => {
    const source = { ...bindingQuestion(), recommendSourceId: "teacher-source", variableBinding: bindingFor() };
    const before = structuredClone(source);
    const first = instantiateQuestion(source, "new-1"), second = instantiateQuestion(source, "new-2");
    expect(first.id).toBe("new-1"); expect(first.options).toEqual(source.options);
    expect(new Set([...first.optionIds!, ...second.optionIds!, ...source.optionIds!]).size).toBe(6);
    expect(first).not.toHaveProperty("variableBinding"); expect(first).not.toHaveProperty("recommendSourceId");
    first.options![0] = "changed"; expect(source).toEqual(before);
});
test("non-option questions do not acquire irrelevant option identities", () => {
    expect(instantiateQuestion({ id: "original", type: "boolean", content: "是否" }, "copy")).toEqual({ id: "copy", type: "boolean", content: "是否" });
});

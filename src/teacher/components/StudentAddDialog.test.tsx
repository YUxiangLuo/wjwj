import { expect, test } from "bun:test";
import { isStudentAddFormComplete } from "./student-add-form";

test("student add form requires a non-blank student ID and name", () => {
    expect(isStudentAddFormComplete({ id: "", name: "", email: "" })).toBe(false);
    expect(isStudentAddFormComplete({ id: "   ", name: "测试学生", email: "" })).toBe(false);
    expect(isStudentAddFormComplete({ id: "S009", name: "   ", email: "" })).toBe(false);
    expect(isStudentAddFormComplete({ id: " S009 ", name: " 测试学生 ", email: "" })).toBe(true);
});

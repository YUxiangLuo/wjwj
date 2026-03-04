import { expect, test } from "bun:test";
import { join } from "node:path";
import { resolveSubmissionPdfPath } from "./grading";

test("resolveSubmissionPdfPath handles leading slash", () => {
    const resolved = resolveSubmissionPdfPath("/storage/uploads/submissions/report.pdf");
    expect(resolved).toBe(join(process.cwd(), "storage/uploads/submissions/report.pdf"));
});

test("resolveSubmissionPdfPath keeps relative path", () => {
    const resolved = resolveSubmissionPdfPath("storage/uploads/submissions/report.pdf");
    expect(resolved).toBe(join(process.cwd(), "storage/uploads/submissions/report.pdf"));
});

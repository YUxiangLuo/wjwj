import { describe, expect, test } from "bun:test";
import { sanitizeRichTextHtml } from "./rich-text-html";

describe("rich-text html utils", () => {
    test("removes unsafe tags and attributes", () => {
        const sanitized = sanitizeRichTextHtml(
            '<p>安全内容</p><img src="x" onerror="alert(1)"><script>alert("xss")</script><div onclick="evil()">尾部</div>'
        );

        expect(sanitized).toContain("安全内容");
        expect(sanitized).toContain("尾部");
        expect(sanitized).toContain("<br>");
        expect(sanitized).not.toContain("<script");
        expect(sanitized).not.toContain("alert");
        expect(sanitized).not.toContain("onerror");
        expect(sanitized).not.toContain("onclick");
        expect(sanitized).not.toContain("<img");
    });

    test("preserves plain text line breaks", () => {
        const sanitized = sanitizeRichTextHtml("第一段\n第二段");

        expect(sanitized).toContain("第一段");
        expect(sanitized).toContain("第二段");
        expect(sanitized).toContain("<br>");
    });
});

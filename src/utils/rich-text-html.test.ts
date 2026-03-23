import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { sanitizeRichTextHtml } from "./rich-text-html";

describe("rich-text html utils", () => {
    let restoreDom: (() => void) | undefined;

    beforeAll(() => {
        restoreDom = installDomGlobals().restore;
    });

    afterAll(() => {
        restoreDom?.();
    });

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

    test("preserves headings and blockquote from TipTap HTML", () => {
        const sanitized = sanitizeRichTextHtml(
            "<h2>二级标题</h2><h3>三级标题</h3><p>正文</p><blockquote>引用</blockquote><hr><p>后文</p>",
        );

        expect(sanitized).toContain("<h2>");
        expect(sanitized).toContain("<h3>");
        expect(sanitized).toContain("<blockquote>");
        expect(sanitized).toContain("<hr>");
        expect(sanitized).toContain("二级标题");
        expect(sanitized).toContain("三级标题");
    });
});

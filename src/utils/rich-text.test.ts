import { describe, expect, test } from "bun:test";
import { getRichTextPlainLength, getRichTextPlainText } from "./rich-text";

describe("rich-text plain text utils", () => {
    test("strips html tags and keeps readable line breaks", () => {
        const html = "<p>第一段</p><p>第二段<br>第三行</p><ul><li>A</li><li>B</li></ul>";
        const plain = getRichTextPlainText(html);

        expect(plain).toContain("第一段");
        expect(plain).toContain("第二段");
        expect(plain).toContain("第三行");
        expect(plain).toContain("- A");
        expect(plain).toContain("- B");
    });

    test("removes script content", () => {
        const html = '<p>安全内容</p><script>alert("xss")</script><p>尾部</p>';
        const plain = getRichTextPlainText(html);

        expect(plain).toContain("安全内容");
        expect(plain).toContain("尾部");
        expect(plain).not.toContain("alert");
    });

    test("unclosed browser raw-text elements consume the remainder", () => {
        const html = `<p>可见</p><script>${"浏览器不会显示这些字符".repeat(20)}`;
        expect(getRichTextPlainText(html)).toBe("可见");
        expect(getRichTextPlainLength(html)).toBe(2);
    });

    test("length is based on plain text", () => {
        const html = "<p><strong>abc</strong><em>123</em></p>";
        expect(getRichTextPlainLength(html)).toBe(6);
    });
});

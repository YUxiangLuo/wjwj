import sanitizeHtml from "sanitize-html";

export const CANONICAL_RICH_TEXT_TAGS = [
    "p", "br", "strong", "b", "em", "i", "u", "s",
    "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "hr",
] as const;

/** Parse untrusted editor HTML and persist only the renderer's allowlisted subset. */
export function canonicalizeRichTextHtmlForStorage(value: unknown) {
    if (typeof value !== "string" || !value.trim()) return "";
    return sanitizeHtml(value, {
        allowedTags: [...CANONICAL_RICH_TEXT_TAGS],
        allowedAttributes: {},
        nonTextTags: ["script", "style", "textarea", "option", "noscript"],
        disallowedTagsMode: "discard",
        enforceHtmlBoundary: true,
    }).trim();
}

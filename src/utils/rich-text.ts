const HTML_ENTITY_MAP: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&apos;": "'",
};

function decodeHtmlEntities(input: string) {
    let output = input;
    Object.entries(HTML_ENTITY_MAP).forEach(([entity, value]) => {
        output = output.replaceAll(entity, value);
    });
    return output;
}

export function getRichTextPlainText(value: unknown): string {
    if (typeof value !== "string") return "";

    // Match through the closing tag or end-of-input. Browsers treat an
    // unclosed raw-text element as consuming the remaining document, so the
    // server-side length check must not count content the renderer will drop.
    const withoutScripts = value.replace(
        /<(script|style|noscript)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
        "",
    );

    const withLineBreaks = withoutScripts
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h[1-6]|tr)\s*>/gi, "\n")
        .replace(/<li[^>]*>/gi, "- ")
        .replace(/<\/li>/gi, "\n");

    const plain = withLineBreaks.replace(/<[^>]+>/g, "");

    return decodeHtmlEntities(plain)
        .replace(/\r\n/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function getRichTextPlainLength(value: unknown): number {
    return getRichTextPlainText(value).length;
}

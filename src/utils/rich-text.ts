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

    const withoutScripts = value
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

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


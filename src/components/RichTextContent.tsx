import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { sanitizeRichTextHtml } from "@/utils/rich-text-html";

interface RichTextContentProps {
    html: string;
    className?: string;
    emptyFallback?: string;
}

export function RichTextContent({ html, className, emptyFallback }: RichTextContentProps) {
    const safeHtml = useMemo(() => sanitizeRichTextHtml(html), [html]);

    if (!safeHtml) {
        if (!emptyFallback) return null;
        return <div className={className}>{emptyFallback}</div>;
    }

    return (
        <div
            className={cn(
                "rich-text-content break-words [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:mb-1",
                className
            )}
            dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
    );
}

export default RichTextContent;

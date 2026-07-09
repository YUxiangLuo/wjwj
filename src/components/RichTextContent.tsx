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
                "rich-text-content break-words",
                "[&_p]:mb-2 [&_p:last-child]:mb-0",
                "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2:first-child]:mt-0",
                "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3:first-child]:mt-0",
                "[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-2 [&_h4]:mb-1",
                "[&_blockquote]:border-l-4 [&_blockquote]:border-input [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-2",
                "[&_hr]:border-border [&_hr]:my-3",
                "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:mb-1",
                className
            )}
            dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
    );
}

export default RichTextContent;

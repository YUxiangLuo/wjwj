import { useEffect, useCallback, type ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    List,
    ListOrdered,
    Heading2,
    Heading3,
    Quote,
    Undo2,
    Redo2,
    Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface RichTextEditorProps {
    dataTestId?: string;
    editorTestId?: string;
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    editorClassName?: string;
}

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

function ToolbarButton({
    title,
    active,
    disabled,
    onClick,
    children,
}: {
    title: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            title={title}
            disabled={disabled}
            onMouseDown={(e) => {
                e.preventDefault();
                onClick();
            }}
            className={cn(
                "rounded-md text-muted-foreground hover:text-foreground",
                active && "bg-muted text-foreground",
            )}
        >
            {children}
        </Button>
    );
}

function ToolbarDivider() {
    return <Separator orientation="vertical" className="mx-0.5 h-5" />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RichTextEditor({
    dataTestId,
    editorTestId,
    id,
    value,
    onChange,
    placeholder = "请输入内容...",
    className,
    editorClassName,
}: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
            }),
            Placeholder.configure({ placeholder }),
        ],
        content: value,
        onUpdate: ({ editor: e }) => {
            const html = e.getHTML();
            // Tiptap emits <p></p> for empty docs
            onChange(e.isEmpty ? "" : html);
        },
        editorProps: {
            attributes: {
                "data-testid": editorTestId ?? "",
                ...(id ? { id } : {}),
                class: cn(
                    "min-h-[180px] p-4 text-sm leading-relaxed text-foreground outline-none rich-text-content",
                    "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1",
                    "[&_p]:mb-2 [&_p:last-child]:mb-0",
                    "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:mb-1",
                    "[&_blockquote]:my-2 [&_blockquote]:border-l-3 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
                    "[&_hr]:my-3 [&_hr]:border-border",
                    editorClassName,
                ),
            },
        },
    });

    // Sync external value changes (e.g. draft restore)
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;
        const current = editor.isEmpty ? "" : editor.getHTML();
        if (current !== value) {
            editor.commands.setContent(value, { emitUpdate: false });
        }
    }, [value, editor]);

    const plainLength = getRichTextPlainLength(
        editor ? (editor.isEmpty ? "" : editor.getHTML()) : value,
    );

    const run = useCallback(
        (fn: () => boolean | void) => {
            fn();
            editor?.commands.focus();
        },
        [editor],
    );

    if (!editor) return null;

    return (
        <div
            className={cn(
                "overflow-hidden rounded-xl border border-border bg-background/50",
                className,
            )}
            data-testid={dataTestId}
        >
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-2 py-1.5">
                <ToolbarButton
                    title="标题 2"
                    active={editor.isActive("heading", { level: 2 })}
                    onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
                >
                    <Heading2 />
                </ToolbarButton>
                <ToolbarButton
                    title="标题 3"
                    active={editor.isActive("heading", { level: 3 })}
                    onClick={() => run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
                >
                    <Heading3 />
                </ToolbarButton>

                <ToolbarDivider />

                <ToolbarButton
                    title="加粗"
                    active={editor.isActive("bold")}
                    onClick={() => run(() => editor.chain().focus().toggleBold().run())}
                >
                    <Bold />
                </ToolbarButton>
                <ToolbarButton
                    title="斜体"
                    active={editor.isActive("italic")}
                    onClick={() => run(() => editor.chain().focus().toggleItalic().run())}
                >
                    <Italic />
                </ToolbarButton>
                <ToolbarButton
                    title="下划线"
                    active={editor.isActive("underline")}
                    onClick={() => run(() => editor.chain().focus().toggleUnderline().run())}
                >
                    <Underline />
                </ToolbarButton>
                <ToolbarButton
                    title="删除线"
                    active={editor.isActive("strike")}
                    onClick={() => run(() => editor.chain().focus().toggleStrike().run())}
                >
                    <Strikethrough />
                </ToolbarButton>

                <ToolbarDivider />

                <ToolbarButton
                    title="无序列表"
                    active={editor.isActive("bulletList")}
                    onClick={() => run(() => editor.chain().focus().toggleBulletList().run())}
                >
                    <List />
                </ToolbarButton>
                <ToolbarButton
                    title="有序列表"
                    active={editor.isActive("orderedList")}
                    onClick={() => run(() => editor.chain().focus().toggleOrderedList().run())}
                >
                    <ListOrdered />
                </ToolbarButton>
                <ToolbarButton
                    title="引用"
                    active={editor.isActive("blockquote")}
                    onClick={() => run(() => editor.chain().focus().toggleBlockquote().run())}
                >
                    <Quote />
                </ToolbarButton>
                <ToolbarButton
                    title="分隔线"
                    onClick={() => run(() => editor.chain().focus().setHorizontalRule().run())}
                >
                    <Minus />
                </ToolbarButton>

                <ToolbarDivider />

                <ToolbarButton
                    title="撤销"
                    disabled={!editor.can().undo()}
                    onClick={() => run(() => editor.chain().focus().undo().run())}
                >
                    <Undo2 />
                </ToolbarButton>
                <ToolbarButton
                    title="重做"
                    disabled={!editor.can().redo()}
                    onClick={() => run(() => editor.chain().focus().redo().run())}
                >
                    <Redo2 />
                </ToolbarButton>

                <div className="ml-auto text-xs tabular-nums text-muted-foreground">
                    {plainLength} 字
                </div>
            </div>

            {/* Editor */}
            <EditorContent editor={editor} />
        </div>
    );
}

export default RichTextEditor;

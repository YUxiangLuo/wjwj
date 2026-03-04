import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bold, Italic, Underline, List, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { normalizeRichTextHtml } from "@/utils/rich-text-html";

interface RichTextEditorProps {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    editorClassName?: string;
}

interface ToolbarButtonProps {
    title: string;
    onClick: () => void;
    children: ReactNode;
}

function ToolbarButton({ title, onClick, children }: ToolbarButtonProps) {
    return (
        <button
            type="button"
            title={title}
            onMouseDown={(event) => {
                event.preventDefault();
                onClick();
            }}
            className="h-8 w-8 rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
        >
            {children}
        </button>
    );
}

export function RichTextEditor({
    id,
    value,
    onChange,
    placeholder = "请输入内容...",
    className,
    editorClassName,
}: RichTextEditorProps) {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const [focused, setFocused] = useState(false);

    const plainLength = useMemo(() => getRichTextPlainLength(value), [value]);

    useEffect(() => {
        if (!editorRef.current) return;
        const normalized = normalizeRichTextHtml(value);
        if (editorRef.current.innerHTML !== normalized) {
            editorRef.current.innerHTML = normalized;
        }
    }, [value]);

    const emitChangeFromDom = () => {
        const raw = editorRef.current?.innerHTML ?? "";
        const normalized = normalizeRichTextHtml(raw);

        if (editorRef.current && editorRef.current.innerHTML !== normalized) {
            editorRef.current.innerHTML = normalized;
        }
        onChange(normalized);
    };

    const executeCommand = (command: string) => {
        editorRef.current?.focus();
        document.execCommand("styleWithCSS", false, "false");
        document.execCommand(command, false);
        emitChangeFromDom();
    };

    return (
        <div className={cn("rounded-xl border border-slate-800 bg-slate-950/40", className)}>
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
                <ToolbarButton title="加粗" onClick={() => executeCommand("bold")}>
                    <Bold className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton title="斜体" onClick={() => executeCommand("italic")}>
                    <Italic className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton title="下划线" onClick={() => executeCommand("underline")}>
                    <Underline className="h-4 w-4" />
                </ToolbarButton>
                <div className="mx-1 h-5 w-px bg-slate-700" />
                <ToolbarButton title="无序列表" onClick={() => executeCommand("insertUnorderedList")}>
                    <List className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton title="有序列表" onClick={() => executeCommand("insertOrderedList")}>
                    <ListOrdered className="h-4 w-4" />
                </ToolbarButton>
                <div className="ml-auto text-xs text-slate-500">已输入 {plainLength} 字</div>
            </div>

            <div className="relative">
                {!focused && plainLength === 0 && (
                    <div className="pointer-events-none absolute left-4 top-3 text-sm text-slate-500">
                        {placeholder}
                    </div>
                )}
                <div
                    id={id}
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    className={cn(
                        "min-h-[180px] p-4 text-sm text-slate-200 leading-relaxed outline-none rich-text-content [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:mb-1",
                        editorClassName
                    )}
                    onFocus={() => setFocused(true)}
                    onBlur={() => {
                        setFocused(false);
                        emitChangeFromDom();
                    }}
                    onInput={emitChangeFromDom}
                    onPaste={(event) => {
                        event.preventDefault();
                        const text = event.clipboardData.getData("text/plain");
                        document.execCommand("insertText", false, text);
                        emitChangeFromDom();
                    }}
                />
            </div>
        </div>
    );
}

export default RichTextEditor;

import { useRef, useState, type ReactNode, type RefObject } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmTone = "primary" | "destructive";

interface ConfirmDialogOptions {
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: ConfirmTone;
    fallbackFocusRef?: RefObject<HTMLElement | null>;
}

function isFocusableElement(element: HTMLElement | null): boolean {
    if (!element || !element.isConnected) return false;
    if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return false;
    if (element.closest("[inert]")) return false;
    return true;
}

export function useConfirmDialog() {
    const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
    const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
    const openerRef = useRef<HTMLElement | null>(null);
    const fallbackFocusRef = useRef<RefObject<HTMLElement | null> | null>(null);

    const close = (confirmed: boolean) => {
        resolverRef.current?.(confirmed);
        resolverRef.current = null;
        setOptions(null);
    };

    const confirm = (nextOptions: ConfirmDialogOptions) =>
        new Promise<boolean>((resolve) => {
            openerRef.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            fallbackFocusRef.current = nextOptions.fallbackFocusRef ?? null;
            resolverRef.current = resolve;
            setOptions(nextOptions);
        });

    const dialog = (
        <AlertDialog
            open={options !== null}
            fallbackFocusRef={options?.fallbackFocusRef ?? fallbackFocusRef.current ?? undefined}
            onOpenChange={(open) => {
                if (!open) close(false);
            }}
        >
            <AlertDialogContent
                className="bg-card border-border text-foreground data-[state=closed]:animate-none"
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    const opener = openerRef.current;
                    const fallback = fallbackFocusRef.current?.current ?? null;
                    openerRef.current = null;
                    requestAnimationFrame(() => {
                        const target = isFocusableElement(opener)
                            ? opener
                            : isFocusableElement(fallback)
                                ? fallback
                                : opener?.closest<HTMLElement>('[role="dialog"]')
                                    ?? fallback?.closest<HTMLElement>('[role="dialog"]')
                                    ?? null;
                        if (target?.isConnected && !target.closest("[inert]")) {
                            target.focus();
                        }
                    });
                }}
            >
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">{options?.title}</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground whitespace-pre-line">
                        {options?.description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel
                        data-testid="confirm-dialog-cancel"
                        onClick={() => close(false)}
                    >
                        {options?.cancelLabel ?? "取消"}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        data-testid="confirm-dialog-action"
                        onClick={() => close(true)}
                        variant={options?.tone === "destructive" ? "destructive" : "default"}
                    >
                        {options?.confirmLabel ?? "确认"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );

    return { confirm, dialog };
}

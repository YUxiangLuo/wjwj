import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
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
    const lastConfirmedRef = useRef(false);
    const cleanupAsyncFocusWatchRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        return () => {
            cleanupAsyncFocusWatchRef.current?.();
            cleanupAsyncFocusWatchRef.current = null;
        };
    }, []);

    const close = (confirmed: boolean) => {
        lastConfirmedRef.current = confirmed;
        resolverRef.current?.(confirmed);
        resolverRef.current = null;
        setOptions(null);
    };

    const confirm = (nextOptions: ConfirmDialogOptions) =>
        new Promise<boolean>((resolve) => {
            cleanupAsyncFocusWatchRef.current?.();
            cleanupAsyncFocusWatchRef.current = null;
            openerRef.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            fallbackFocusRef.current = nextOptions.fallbackFocusRef ?? null;
            lastConfirmedRef.current = false;
            resolverRef.current = resolve;
            setOptions(nextOptions);
        });

    const dialog = (
        <AlertDialog
            open={options !== null}
            fallbackFocusRef={options?.fallbackFocusRef ?? fallbackFocusRef.current ?? undefined}
            onOpenChange={(open) => {
                if (!open && resolverRef.current !== null) close(false);
            }}
        >
            <AlertDialogContent
                className="rounded-overlay border-border bg-card p-6 text-foreground"
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    const opener = openerRef.current;
                    const fallbackHolder = fallbackFocusRef.current;
                    const wasConfirmed = lastConfirmedRef.current;
                    openerRef.current = null;
                    requestAnimationFrame(() => {
                        const fallback = fallbackHolder?.current ?? null;
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
                        if (
                            wasConfirmed
                            && target === opener
                            && opener
                            && fallbackHolder
                            && typeof MutationObserver !== "undefined"
                            && typeof document !== "undefined"
                            && document.body
                        ) {
                            cleanupAsyncFocusWatchRef.current?.();
                            const stopWatching = () => {
                                observer.disconnect();
                                clearTimeout(timer);
                                document.removeEventListener("pointerdown", stopWatching, true);
                                document.removeEventListener("keydown", stopWatching, true);
                                if (cleanupAsyncFocusWatchRef.current === stopWatching) {
                                    cleanupAsyncFocusWatchRef.current = null;
                                }
                            };
                            const observer = new MutationObserver(() => {
                                if (opener.isConnected && isFocusableElement(opener)) return;
                                const active = document.activeElement;
                                const lostToBody =
                                    !active
                                    || active === document.body
                                    || active === document.documentElement
                                    || !(active instanceof HTMLElement && active.isConnected);
                                if (lostToBody) {
                                    const survivingFallback = fallbackHolder.current;
                                    if (survivingFallback && isFocusableElement(survivingFallback)) {
                                        survivingFallback.focus();
                                    }
                                }
                                stopWatching();
                            });
                            const timer = setTimeout(stopWatching, 2000);
                            document.addEventListener("pointerdown", stopWatching, true);
                            document.addEventListener("keydown", stopWatching, true);
                            observer.observe(document.body, { childList: true, subtree: true });
                            cleanupAsyncFocusWatchRef.current = stopWatching;
                        }
                    });
                }}
            >
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-subheading font-medium text-foreground">{options?.title}</AlertDialogTitle>
                    <AlertDialogDescription className="whitespace-pre-line text-label text-muted-foreground">
                        {options?.description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 pt-1">
                    <AlertDialogCancel
                        variant="outline"
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

import { useRef, useState, type ReactNode } from "react";
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
}

export function useConfirmDialog() {
    const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
    const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

    const close = (confirmed: boolean) => {
        resolverRef.current?.(confirmed);
        resolverRef.current = null;
        setOptions(null);
    };

    const confirm = (nextOptions: ConfirmDialogOptions) =>
        new Promise<boolean>((resolve) => {
            resolverRef.current = resolve;
            setOptions(nextOptions);
        });

    const dialog = (
        <AlertDialog
            open={options !== null}
            onOpenChange={(open) => {
                if (!open) close(false);
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{options?.title}</AlertDialogTitle>
                    <AlertDialogDescription className="whitespace-pre-line">
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

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

const toneClasses: Record<ConfirmTone, string> = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white border-none",
    destructive: "bg-rose-600 hover:bg-rose-700 text-white border-none",
};

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
            <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-slate-900 dark:text-slate-100">{options?.title}</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-600 dark:text-slate-400 whitespace-pre-line">
                        {options?.description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel
                        data-testid="confirm-dialog-cancel"
                        onClick={() => close(false)}
                        className="bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                        {options?.cancelLabel ?? "取消"}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        data-testid="confirm-dialog-action"
                        onClick={() => close(true)}
                        className={toneClasses[options?.tone ?? "primary"]}
                    >
                        {options?.confirmLabel ?? "确认"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );

    return { confirm, dialog };
}

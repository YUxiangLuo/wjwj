import { Toaster } from "sonner";

export function AppToaster() {
    return (
        <Toaster
            richColors
            position="top-right"
            toastOptions={{
                classNames: {
                    toast: "!rounded-overlay !border-border !bg-card !text-foreground",
                    title: "!text-label !font-medium !text-current",
                    description: "!text-meta !text-current",
                    success: "!border-success-border !bg-success-muted !text-success",
                    error: "!border-destructive-border !bg-destructive-muted !text-destructive",
                    warning: "!border-warning-border !bg-warning-muted !text-warning",
                    info: "!border-info-border !bg-info-muted !text-info",
                    actionButton: "!bg-primary !text-primary-foreground",
                    cancelButton: "!bg-secondary !text-secondary-foreground",
                },
            }}
        />
    );
}

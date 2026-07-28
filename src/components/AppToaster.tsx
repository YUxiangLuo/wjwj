import { Toaster } from "sonner";

export function AppToaster() {
    return (
        <Toaster
            richColors
            position="top-right"
            toastOptions={{
                classNames: {
                    toast: "!border-border !bg-card !text-foreground",
                    title: "!text-current",
                    description: "!text-current !opacity-90",
                    success: "!border-success !bg-success !text-success-foreground",
                    error: "!border-destructive !bg-destructive !text-destructive-foreground",
                    warning: "!border-warning !bg-warning !text-warning-foreground",
                    info: "!border-info !bg-info !text-info-foreground",
                    actionButton: "!bg-primary !text-primary-foreground",
                    cancelButton: "!bg-secondary !text-secondary-foreground",
                },
            }}
        />
    );
}

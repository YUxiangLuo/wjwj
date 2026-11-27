import * as React from "react";
import MuiDialog from "@mui/material/Dialog";
import { Slot } from "@radix-ui/react-slot";

import { MaterialThemeProvider } from "@/components/MaterialThemeProvider";
import { Button } from "@/components/ui/button";
import { useControlledOverlayFocusRestore } from "@/components/ui/controlled-overlay-focus";
import { useDocumentEscapeDismiss, useModalBackgroundInert } from "@/components/ui/overlay-inert";
import { cn } from "@/lib/utils";

interface AlertDialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  hasTitle: boolean;
  setHasTitle: (present: boolean) => void;
  hasDescription: boolean;
  setHasDescription: (present: boolean) => void;
}

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(null);

interface AlertDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * 受控弹窗的开启元素可能在关闭前被卸载（例如开启它的是会随菜单关闭的菜单项）。
   * 此时焦点回退到该引用，而不是落到 body。
   */
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
  children?: React.ReactNode;
}

function AlertDialog({
  open,
  defaultOpen,
  onOpenChange,
  fallbackFocusRef,
  children,
}: AlertDialogProps) {
  const baseId = React.useId();
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const [hasTitle, setHasTitle] = React.useState(false);
  const [hasDescription, setHasDescription] = React.useState(false);
  const actualOpen = open ?? internalOpen;

  useControlledOverlayFocusRestore(actualOpen, fallbackFocusRef);
  useModalBackgroundInert(actualOpen);

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange],
  );

  const contextValue = React.useMemo<AlertDialogContextValue>(
    () => ({
      open: actualOpen,
      setOpen,
      titleId: `${baseId}-title`,
      descriptionId: `${baseId}-description`,
      hasTitle,
      setHasTitle,
      hasDescription,
      setHasDescription,
    }),
    [actualOpen, baseId, hasDescription, hasTitle, setOpen],
  );

  return (
    <MaterialThemeProvider>
      <AlertDialogContext.Provider value={contextValue}>
        {children}
      </AlertDialogContext.Provider>
    </MaterialThemeProvider>
  );
}

function AlertDialogTrigger({
  asChild = false,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const context = React.useContext(AlertDialogContext);
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      type={asChild ? undefined : "button"}
      data-slot="alert-dialog-trigger"
      data-state={context?.open ? "open" : "closed"}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          context?.setOpen(true);
        }
      }}
      {...props}
    />
  );
}

function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-overlay", className)}
      {...props}
    />
  );
}

type AlertDialogContentProps = React.ComponentProps<"div"> & {
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
};

function AlertDialogContent({
  className,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  ref,
  ...props
}: AlertDialogContentProps) {
  const context = React.useContext(AlertDialogContext);
  const open = Boolean(context?.open);
  const paperRef = React.useRef<HTMLDivElement | null>(null);
  const didAutoFocusRef = React.useRef(false);
  const openAutoFocusRef = React.useRef(onOpenAutoFocus);
  openAutoFocusRef.current = onOpenAutoFocus;
  const closeAutoFocusRef = React.useRef(onCloseAutoFocus);
  closeAutoFocusRef.current = onCloseAutoFocus;

  if (!open) {
    didAutoFocusRef.current = false;
  }

  const setPaperRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      paperRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;

      if (node && !didAutoFocusRef.current) {
        didAutoFocusRef.current = true;
        const autoFocusEvent = new CustomEvent("openautofocus", { cancelable: true });
        openAutoFocusRef.current?.(autoFocusEvent);
        if (!autoFocusEvent.defaultPrevented && !node.contains(document.activeElement)) {
          const cancelOrFirst =
            node.querySelector<HTMLElement>('[data-slot="alert-dialog-cancel"]:not(:disabled)')
            ?? node.querySelector<HTMLElement>('button:not(:disabled), [tabindex]:not([tabindex="-1"])')
            ?? node;
          cancelOrFirst.focus({ preventScroll: true });
        }
      }
    },
    [ref],
  );

  useDocumentEscapeDismiss(open, (keyboardEvent) => {
    onEscapeKeyDown?.(keyboardEvent);
    if (!keyboardEvent.defaultPrevented) {
      context?.setOpen(false);
    }
  });

  React.useLayoutEffect(() => {
    if (!open) return;
    return () => {
      const closeEvent = new CustomEvent("closeautofocus", { cancelable: true });
      closeAutoFocusRef.current?.(closeEvent);
    };
  }, [open]);

  if (!open || !context) return null;

  return (
    <MuiDialog
      open={open}
      transitionDuration={0}
      disableAutoFocus
      disableRestoreFocus
      aria-labelledby={context.hasTitle ? context.titleId : undefined}
      aria-describedby={context.hasDescription ? context.descriptionId : undefined}
      onClose={(event, reason) => {
        if (reason === "backdropClick") {
          return;
        }
        if (reason === "escapeKeyDown") {
          const nativeKeyboardEvent =
            "nativeEvent" in event && event.nativeEvent instanceof KeyboardEvent
              ? event.nativeEvent
              : new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
          onEscapeKeyDown?.(nativeKeyboardEvent);
          if (nativeKeyboardEvent.defaultPrevented) return;
        }
        context.setOpen(false);
      }}
      slotProps={{
        backdrop: {
          "data-slot": "alert-dialog-overlay",
          className: "bg-overlay",
        } as Record<string, unknown>,
        paper: {
          ...props,
          ref: setPaperRef,
          role: "alertdialog",
          tabIndex: -1,
          "data-slot": "alert-dialog-content",
          "data-state": "open",
          className: cn(
            "relative m-4 grid max-h-[calc(100vh-2rem)] w-full max-w-lg gap-4 overflow-y-auto rounded-overlay border border-border bg-card p-6 text-card-foreground shadow-floating outline-none",
            className,
          ),
        } as Record<string, unknown>,
      }}
    >
      {children}
    </MuiDialog>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-left", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex flex-row justify-end gap-2", className)}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  id,
  ...props
}: React.ComponentProps<"h2">) {
  const context = React.useContext(AlertDialogContext);
  const setHasTitle = context?.setHasTitle;

  React.useLayoutEffect(() => {
    setHasTitle?.(true);
    return () => setHasTitle?.(false);
  }, [setHasTitle]);

  return (
    <h2
      id={id ?? context?.titleId}
      data-slot="alert-dialog-title"
      className={cn("text-subheading font-medium text-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  id,
  ...props
}: React.ComponentProps<"div">) {
  const context = React.useContext(AlertDialogContext);
  const setHasDescription = context?.setHasDescription;

  React.useLayoutEffect(() => {
    setHasDescription?.(true);
    return () => setHasDescription?.(false);
  }, [setHasDescription]);

  return (
    <div
      id={id ?? context?.descriptionId}
      data-slot="alert-dialog-description"
      className={cn("text-label text-muted-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const context = React.useContext(AlertDialogContext);

  return (
    <Button
      type="button"
      data-slot="alert-dialog-action"
      className={className}
      variant={variant}
      size={size}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          context?.setOpen(false);
        }
      }}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const context = React.useContext(AlertDialogContext);

  return (
    <Button
      type="button"
      data-slot="alert-dialog-cancel"
      className={className}
      variant={variant}
      size={size}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          context?.setOpen(false);
        }
      }}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};

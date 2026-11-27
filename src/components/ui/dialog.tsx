import * as React from "react";
import MuiDialog from "@mui/material/Dialog";
import { Slot } from "@radix-ui/react-slot";
import { XIcon } from "lucide-react";

import { MaterialThemeProvider } from "@/components/MaterialThemeProvider";
import { useControlledOverlayFocusRestore } from "@/components/ui/controlled-overlay-focus";
import { useDocumentEscapeDismiss, useModalBackgroundInert } from "@/components/ui/overlay-inert";
import { cn } from "@/lib/utils";

interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
  hasTitle: boolean;
  setHasTitle: (present: boolean) => void;
  hasDescription: boolean;
  setHasDescription: (present: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children?: React.ReactNode;
}

function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  children,
}: DialogProps) {
  const baseId = React.useId();
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const [hasTitle, setHasTitle] = React.useState(false);
  const [hasDescription, setHasDescription] = React.useState(false);
  const actualOpen = open ?? internalOpen;

  useControlledOverlayFocusRestore(actualOpen);
  useModalBackgroundInert(actualOpen);

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange],
  );

  const contextValue = React.useMemo<DialogContextValue>(
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
      <DialogContext.Provider value={contextValue}>
        {children}
      </DialogContext.Provider>
    </MaterialThemeProvider>
  );
}

function DialogTrigger({
  asChild = false,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const context = React.useContext(DialogContext);
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      type={asChild ? undefined : "button"}
      data-slot="dialog-trigger"
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

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function DialogClose({
  asChild = false,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const context = React.useContext(DialogContext);
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      type={asChild ? undefined : "button"}
      data-slot="dialog-close"
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          context?.setOpen(false);
        }
      }}
      {...props}
    />
  );
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-overlay", className)}
      {...props}
    />
  );
}

type DialogContentProps = React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
  onPointerDownOutside?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
};

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onInteractOutside,
  onPointerDownOutside,
  onEscapeKeyDown,
  ref,
  ...props
}: DialogContentProps) {
  const context = React.useContext(DialogContext);
  const open = Boolean(context?.open);
  const paperRef = React.useRef<HTMLDivElement | null>(null);
  const openAutoFocusRef = React.useRef(onOpenAutoFocus);
  openAutoFocusRef.current = onOpenAutoFocus;
  const closeAutoFocusRef = React.useRef(onCloseAutoFocus);
  closeAutoFocusRef.current = onCloseAutoFocus;

  const setPaperRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      paperRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
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
    const autoFocusEvent = new CustomEvent("openautofocus", { cancelable: true });
    openAutoFocusRef.current?.(autoFocusEvent);
    if (!autoFocusEvent.defaultPrevented) {
      const panel = paperRef.current;
      if (panel && !panel.contains(document.activeElement)) {
        const firstFocusable = panel.querySelector<HTMLElement>(
          'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled):not([data-slot="dialog-close"]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? panel.querySelector<HTMLElement>('button:not(:disabled)') ?? panel;
        firstFocusable.focus({ preventScroll: true });
      }
    }
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
      disableAutoFocus={Boolean(onOpenAutoFocus)}
      disableRestoreFocus
      aria-labelledby={context.hasTitle ? context.titleId : undefined}
      aria-describedby={context.hasDescription ? context.descriptionId : undefined}
      onClose={(event, reason) => {
        if (reason === "backdropClick") {
          const outsideEvent = new CustomEvent("interactoutside", { cancelable: true });
          onPointerDownOutside?.(outsideEvent);
          onInteractOutside?.(outsideEvent);
          if (outsideEvent.defaultPrevented) return;
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
          "data-slot": "dialog-overlay",
          className: "bg-overlay",
        } as Record<string, unknown>,
        paper: {
          ...props,
          ref: setPaperRef,
          tabIndex: -1,
          "data-slot": "dialog-content",
          "data-state": "open",
          className: cn(
            "relative m-4 grid max-h-[calc(100vh-2rem)] w-full max-w-lg gap-4 overflow-y-auto rounded-overlay border border-border bg-card p-6 text-card-foreground shadow-floating outline-none",
            className,
          ),
        } as Record<string, unknown>,
      }}
    >
      {children}
      {showCloseButton && (
        <DialogClose
          className="absolute top-4 right-4 grid size-9 place-items-center rounded-circle text-muted-foreground transition-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          <XIcon />
          <span className="sr-only">关闭</span>
        </DialogClose>
      )}
    </MuiDialog>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-row justify-end gap-2", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  id,
  ...props
}: React.ComponentProps<"h2">) {
  const context = React.useContext(DialogContext);
  const setHasTitle = context?.setHasTitle;

  React.useLayoutEffect(() => {
    setHasTitle?.(true);
    return () => setHasTitle?.(false);
  }, [setHasTitle]);

  return (
    <h2
      id={id ?? context?.titleId}
      data-slot="dialog-title"
      className={cn("text-subheading leading-snug font-medium text-foreground", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  id,
  ...props
}: React.ComponentProps<"p">) {
  const context = React.useContext(DialogContext);
  const setHasDescription = context?.setHasDescription;

  React.useLayoutEffect(() => {
    setHasDescription?.(true);
    return () => setHasDescription?.(false);
  }, [setHasDescription]);

  return (
    <p
      id={id ?? context?.descriptionId}
      data-slot="dialog-description"
      className={cn("text-label text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};

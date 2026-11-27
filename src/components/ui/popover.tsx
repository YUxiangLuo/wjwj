import * as React from "react";
import MuiPopover from "@mui/material/Popover";
import { Slot } from "@radix-ui/react-slot";

import { MaterialThemeProvider } from "@/components/MaterialThemeProvider";
import { useControlledOverlayFocusRestore } from "@/components/ui/controlled-overlay-focus";
import { useDocumentEscapeDismiss, useModalBackgroundInert } from "@/components/ui/overlay-inert";
import { cn } from "@/lib/utils";

interface PopoverContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  anchorEl: HTMLElement | null;
  setAnchorEl: (el: HTMLElement | null) => void;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

interface PopoverProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children?: React.ReactNode;
}

function Popover({
  open,
  defaultOpen,
  onOpenChange,
  children,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const [anchorEl, setAnchorElState] = React.useState<HTMLElement | null>(null);
  const anchorRef = React.useRef<HTMLElement | null>(null);
  const actualOpen = open ?? internalOpen;

  const setAnchorEl = React.useCallback((el: HTMLElement | null) => {
    anchorRef.current = el;
    setAnchorElState(el);
  }, []);

  useControlledOverlayFocusRestore(actualOpen, anchorRef);
  useModalBackgroundInert(actualOpen);

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange],
  );

  const contextValue = React.useMemo<PopoverContextValue>(
    () => ({ open: actualOpen, setOpen, anchorEl, setAnchorEl }),
    [actualOpen, anchorEl, setOpen],
  );

  return (
    <MaterialThemeProvider>
      <PopoverContext.Provider value={contextValue}>
        {children}
      </PopoverContext.Provider>
    </MaterialThemeProvider>
  );
}

const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button"> & { asChild?: boolean }
>(({ asChild = false, onClick, ...props }, forwardedRef) => {
  const context = React.useContext(PopoverContext);
  const Comp = asChild ? Slot : "button";

  const setRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      context?.setAnchorEl(node);
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    },
    [context, forwardedRef],
  );

  return (
    <Comp
      ref={setRef}
      type={asChild ? undefined : "button"}
      data-slot="popover-trigger"
      data-state={context?.open ? "open" : "closed"}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          context?.setAnchorEl(event.currentTarget);
          context?.setOpen(!context.open);
        }
      }}
      {...props}
    />
  );
});
PopoverTrigger.displayName = "PopoverTrigger";

const PopoverAnchor = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & { asChild?: boolean }
>(({ asChild = false, ...props }, forwardedRef) => {
  const context = React.useContext(PopoverContext);
  const Comp = asChild ? Slot : "div";

  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      context?.setAnchorEl(node);
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [context, forwardedRef],
  );

  return <Comp ref={setRef} data-slot="popover-anchor" {...props} />;
});
PopoverAnchor.displayName = "PopoverAnchor";

type PopoverContentProps = React.ComponentPropsWithoutRef<"div"> & {
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  collisionPadding?: number;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  (
    {
      className,
      align = "start",
      side = "bottom",
      sideOffset = 4,
      collisionPadding = 16,
      onOpenAutoFocus,
      onCloseAutoFocus,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const context = React.useContext(PopoverContext);
    const open = Boolean(context?.open);
    const openAutoFocusRef = React.useRef(onOpenAutoFocus);
    openAutoFocusRef.current = onOpenAutoFocus;
    const closeAutoFocusRef = React.useRef(onCloseAutoFocus);
    closeAutoFocusRef.current = onCloseAutoFocus;

    useDocumentEscapeDismiss(open, () => {
      context?.setOpen(false);
    });

    React.useLayoutEffect(() => {
      if (!open) return;
      const autoFocusEvent = new CustomEvent("openautofocus", { cancelable: true });
      openAutoFocusRef.current?.(autoFocusEvent);
      return () => {
        const closeEvent = new CustomEvent("closeautofocus", { cancelable: true });
        closeAutoFocusRef.current?.(closeEvent);
      };
    }, [open]);

    if (!open || !context) return null;

    const horizontal = align === "start" ? "left" : align === "end" ? "right" : "center";
    const anchorVertical = side === "top" ? "top" : "bottom";
    const transformVertical = side === "top" ? "bottom" : "top";

    return (
      <MuiPopover
        open={open}
        anchorEl={context.anchorEl}
        onClose={() => context.setOpen(false)}
        transitionDuration={0}
        disableAutoFocus={Boolean(onOpenAutoFocus)}
        disableRestoreFocus
        marginThreshold={collisionPadding}
        anchorOrigin={{ vertical: anchorVertical, horizontal }}
        transformOrigin={{ vertical: transformVertical, horizontal }}
        slotProps={{
          paper: {
            ...props,
            ref,
            role: "dialog",
            "data-slot": "popover-content",
            "data-state": "open",
            style: {
              marginTop: side === "bottom" ? sideOffset : undefined,
              marginBottom: side === "top" ? sideOffset : undefined,
              ...style,
            },
            className: cn(
              "z-[100] w-auto rounded-surface border border-border bg-popover p-0 text-popover-foreground shadow-floating outline-none",
              className,
            ),
          } as Record<string, unknown>,
        }}
      >
        {children}
      </MuiPopover>
    );
  },
);
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };

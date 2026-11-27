import * as React from "react";
import MuiButtonBase from "@mui/material/ButtonBase";
import MuiDivider from "@mui/material/Divider";
import MuiListSubheader from "@mui/material/ListSubheader";
import MuiMenu from "@mui/material/Menu";
import MuiMenuItem from "@mui/material/MenuItem";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { MaterialThemeProvider } from "@/components/MaterialThemeProvider";
import type { AccessibleNameProps } from "@/components/ui/accessible-name";
import { useDocumentEscapeDismiss, useModalBackgroundInert } from "@/components/ui/overlay-inert";
import { cn } from "@/lib/utils";

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  disabled: boolean;
  triggerEl: HTMLButtonElement | null;
  setTriggerEl: (el: HTMLButtonElement | null) => void;
  listboxId: string;
  itemLabels: ReadonlyMap<string, React.ReactNode>;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

const SELECT_ITEM_MARK = Symbol("SelectItem");

function collectSelectItemLabels(
  nodes: React.ReactNode,
  map: Map<string, React.ReactNode> = new Map(),
): Map<string, React.ReactNode> {
  React.Children.forEach(nodes, (child) => {
    if (!React.isValidElement<{ value?: unknown; children?: React.ReactNode }>(child)) return;
    const childType = child.type as { [SELECT_ITEM_MARK]?: boolean };
    if (childType?.[SELECT_ITEM_MARK] && typeof child.props.value === "string") {
      map.set(child.props.value, child.props.children);
      return;
    }
    if (child.props.children !== undefined) {
      collectSelectItemLabels(child.props.children, map);
    }
  });
  return map;
}

interface SelectProps<T extends string = string> {
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  name?: string;
  required?: boolean;
  children?: React.ReactNode;
}

function Select<T extends string = string>({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  disabled = false,
  children,
}: SelectProps<T>) {
  const listboxId = React.useId();
  const [internalValue, setInternalValue] = React.useState<string>(defaultValue ?? "");
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const [triggerEl, setTriggerElState] = React.useState<HTMLButtonElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  const setTriggerEl = React.useCallback((el: HTMLButtonElement | null) => {
    triggerRef.current = el;
    setTriggerElState((prev) => (prev === el ? prev : el));
  }, []);

  const actualValue = value ?? internalValue;
  const actualOpen = disabled ? false : (open ?? internalOpen);
  const wasOpenRef = React.useRef(actualOpen);

  useModalBackgroundInert(actualOpen);

  React.useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = actualOpen;
    if (actualOpen || !wasOpen) return;

    const frame = requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected) {
        triggerRef.current.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [actualOpen]);

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (disabled && nextOpen) return;
      setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [disabled, onOpenChange],
  );

  const handleValueChange = React.useCallback(
    (nextValue: string) => {
      setInternalValue(nextValue);
      onValueChange?.(nextValue as T);
      setOpen(false);
    },
    [onValueChange, setOpen],
  );

  const itemLabels = React.useMemo(() => collectSelectItemLabels(children), [children]);

  const contextValue = React.useMemo<SelectContextValue>(
    () => ({
      value: actualValue,
      onValueChange: handleValueChange,
      open: actualOpen,
      setOpen,
      disabled,
      triggerEl,
      setTriggerEl,
      listboxId,
      itemLabels,
    }),
    [actualOpen, actualValue, disabled, handleValueChange, itemLabels, listboxId, setOpen, setTriggerEl, triggerEl],
  );

  return (
    <MaterialThemeProvider>
      <SelectContext.Provider value={contextValue}>
        {children}
      </SelectContext.Provider>
    </MaterialThemeProvider>
  );
}

function SelectGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="group" data-slot="select-group" className={className} {...props} />;
}

interface SelectValueProps extends React.ComponentProps<"span"> {
  placeholder?: React.ReactNode;
}

function SelectValue({ placeholder, children, className, ...props }: SelectValueProps) {
  const context = React.useContext(SelectContext);
  const hasSelection = Boolean(context && context.value !== "" && context.itemLabels.has(context.value));
  const resolvedLabel =
    children !== undefined
      ? children
      : hasSelection
        ? context?.itemLabels.get(context.value)
        : placeholder;

  return (
    <span
      data-slot="select-value"
      className={cn(
        "min-w-0 flex-1 truncate text-left [&>svg]:mr-1.5 [&>svg]:inline [&>svg]:align-text-bottom",
        !hasSelection && children === undefined && "text-muted-foreground",
        className,
      )}
      {...props}
    >
      {resolvedLabel}
    </span>
  );
}

type SelectTriggerProps = Omit<React.ComponentProps<"button">, "aria-label" | "aria-labelledby"> & {
  size?: "sm" | "default";
} & AccessibleNameProps;

function SelectTrigger({
  className,
  size = "default",
  children,
  disabled: triggerDisabled,
  onClick,
  onKeyDown,
  ref,
  ...props
}: SelectTriggerProps) {
  const context = React.useContext(SelectContext);
  const setTriggerEl = context?.setTriggerEl;
  const isDisabled = Boolean(triggerDisabled || context?.disabled);
  const isOpen = Boolean(context?.open);
  const hasSelection = Boolean(context && context.value !== "" && context.itemLabels.has(context.value));

  const setTriggerRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      setTriggerEl?.(node);
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    },
    [setTriggerEl, ref],
  );

  return (
    <MuiButtonBase
      {...(props as Omit<
        React.ComponentProps<typeof MuiButtonBase>,
        "component" | "disabled" | "onClick" | "onKeyDown" | "children"
      >)}
      ref={setTriggerRef}
      component="button"
      type="button"
      role="combobox"
      disableRipple
      disabled={isDisabled}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-controls={isOpen ? context?.listboxId : undefined}
      data-slot="select-trigger"
      data-size={size}
      data-state={isOpen ? "open" : "closed"}
      data-placeholder={!hasSelection ? "" : undefined}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented && !isDisabled) {
          context?.setTriggerEl(event.currentTarget);
          context?.setOpen(!isOpen);
        }
      }}
      onKeyDown={(event: React.KeyboardEvent<HTMLButtonElement>) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || isDisabled) return;
        if (
          event.key === "ArrowDown"
          || event.key === "ArrowUp"
          || event.key === "Enter"
          || event.key === " "
        ) {
          event.preventDefault();
          context?.setTriggerEl(event.currentTarget);
          context?.setOpen(true);
        }
      }}
      className={cn(
        "flex w-fit items-center justify-between gap-2 whitespace-nowrap rounded-control border border-input bg-card px-3 py-2 text-label text-foreground outline-none transition-[border-color,box-shadow,background-color] hover:border-foreground data-[placeholder]:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-destructive disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground data-[size=default]:h-10 data-[size=sm]:h-9 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
    >
      {children}
      <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
    </MuiButtonBase>
  );
}

type SelectContentProps = React.ComponentProps<"div"> & {
  position?: "item-aligned" | "popper";
  align?: "start" | "center" | "end";
  sideOffset?: number;
};

function SelectContent({
  className,
  children,
  position: _position = "popper",
  align = "start",
  sideOffset = 4,
  ref,
  ...props
}: SelectContentProps) {
  const context = React.useContext(SelectContext);
  const open = Boolean(context?.open);

  useDocumentEscapeDismiss(open, () => {
    context?.setOpen(false);
  });

  if (!open || !context) return null;

  const horizontal = align === "start" ? "left" : align === "end" ? "right" : "center";
  const triggerWidth = context.triggerEl?.offsetWidth;

  return (
    <MuiMenu
      open={open}
      anchorEl={context.triggerEl}
      onClose={() => context.setOpen(false)}
      transitionDuration={0}
      disableRestoreFocus
      anchorOrigin={{ vertical: "bottom", horizontal }}
      transformOrigin={{ vertical: "top", horizontal }}
      slotProps={{
        list: {
          id: context.listboxId,
          role: "listbox",
          className: "p-1 outline-none",
        },
        paper: {
          ...props,
          ref,
          "data-slot": "select-content",
          "data-state": "open",
          style: {
            marginTop: sideOffset,
            minWidth: triggerWidth && triggerWidth > 0 ? `${triggerWidth}px` : "8rem",
            ...props.style,
          },
          className: cn(
            "z-50 max-h-80 min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-surface border border-border bg-popover text-popover-foreground shadow-floating",
            className,
          ),
        } as Record<string, unknown>,
      }}
    >
      {children}
    </MuiMenu>
  );
}

function SelectLabel({ className, ...props }: Omit<React.ComponentProps<"li">, "color">) {
  return (
    <MuiListSubheader
      {...props}
      disableSticky
      data-slot="select-label"
      className={cn("bg-transparent px-2.5 py-1.5 text-meta font-medium leading-snug text-muted-foreground", className)}
    />
  );
}

type SelectItemProps = Omit<React.ComponentProps<"li">, "value"> & {
  value: string;
  disabled?: boolean;
};

function SelectItemBase({
  className,
  children,
  value,
  disabled = false,
  onClick,
  onKeyDown,
  ...props
}: SelectItemProps) {
  const context = React.useContext(SelectContext);
  const isSelected = context?.value === value;

  const selectThisItem = () => {
    if (!disabled) {
      context?.onValueChange(value);
    }
  };

  return (
    <MuiMenuItem
      role="option"
      disableRipple
      selected={isSelected}
      disabled={disabled}
      aria-selected={isSelected}
      aria-disabled={disabled ? "true" : undefined}
      data-slot="select-item"
      data-state={isSelected ? "checked" : "unchecked"}
      data-disabled={disabled ? "" : undefined}
      onClick={(event: React.MouseEvent<HTMLLIElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) {
          selectThisItem();
        }
      }}
      onKeyDown={(event: React.KeyboardEvent<HTMLLIElement>) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented && !disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          selectThisItem();
        }
      }}
      className={cn(
        "relative flex min-h-9 w-full items-center gap-2 rounded-control py-1.5 pr-8 pl-2.5 text-label text-foreground outline-none select-none",
        "hover:bg-muted focus:bg-accent focus:text-accent-foreground",
        isSelected && "bg-accent font-medium text-accent-foreground hover:bg-accent",
        disabled && "cursor-not-allowed bg-muted text-muted-foreground",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...(props as Omit<
        React.ComponentProps<typeof MuiMenuItem>,
        "value" | "selected" | "disabled" | "onClick" | "onKeyDown" | "children"
      >)}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {isSelected && (
        <span className="absolute right-2 flex size-4 items-center justify-center text-accent-foreground">
          <CheckIcon aria-hidden="true" className="size-4" />
        </span>
      )}
    </MuiMenuItem>
  );
}

const SelectItem = Object.assign(SelectItemBase, {
  [SELECT_ITEM_MARK]: true,
});

function SelectSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <MuiDivider
      {...(props as Omit<React.ComponentProps<typeof MuiDivider>, "component">)}
      component="div"
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px border-border bg-border", className)}
    />
  );
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="select-scroll-up-button"
      className={cn("flex items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </div>
  );
}

function SelectScrollDownButton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="select-scroll-down-button"
      className={cn("flex items-center justify-center py-1", className)}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </div>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};

import * as React from "react";
import MuiTab from "@mui/material/Tab";
import MuiTabs from "@mui/material/Tabs";

import { cn } from "@/lib/utils";

interface TabsContextValue {
  baseId: string;
  value: string;
  onValueChange: (value: string) => void;
  mountedPanels: ReadonlySet<string>;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

const TABS_CONTENT_MARK = Symbol("TabsContent");

function sanitizeIdSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function collectMountedTabPanels(
  nodes: React.ReactNode,
  activeValue: string,
  mounted: Set<string> = new Set(),
): Set<string> {
  React.Children.forEach(nodes, (child) => {
    if (!React.isValidElement<{ value?: unknown; forceMount?: unknown; children?: React.ReactNode }>(child)) {
      return;
    }
    const childType = child.type as { [TABS_CONTENT_MARK]?: boolean };
    if (childType?.[TABS_CONTENT_MARK] && typeof child.props.value === "string") {
      if (child.props.value === activeValue || Boolean(child.props.forceMount)) {
        mounted.add(child.props.value);
      }
    }
    if (child.props.children !== undefined) {
      collectMountedTabPanels(child.props.children, activeValue, mounted);
    }
  });
  return mounted;
}

type TabsProps<T extends string = string> = Omit<React.ComponentProps<"div">, "defaultValue"> & {
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  orientation?: "horizontal" | "vertical";
  dir?: "ltr" | "rtl";
};

function Tabs<T extends string = string>({
  className,
  value,
  defaultValue,
  onValueChange,
  orientation: _orientation,
  dir: _dir,
  children,
  ...props
}: TabsProps<T>) {
  const baseId = React.useId();
  const [internalValue, setInternalValue] = React.useState<string>(defaultValue ?? "");
  const activeValue = value ?? internalValue;

  const handleValueChange = React.useCallback(
    (nextValue: string) => {
      setInternalValue(nextValue);
      onValueChange?.(nextValue as T);
    },
    [onValueChange],
  );

  const mountedPanels = collectMountedTabPanels(children, activeValue);

  const contextValue: TabsContextValue = {
    baseId,
    value: activeValue,
    onValueChange: handleValueChange,
    mountedPanels,
  };

  return (
    <TabsContext.Provider value={contextValue}>
      <div
        data-slot="tabs"
        className={cn("flex flex-col gap-2", className)}
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

type TabsListProps = Omit<React.ComponentProps<"div">, "onChange">;

function TabsList({
  className,
  children,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: TabsListProps) {
  const context = React.useContext(TabsContext);
  const childValues: string[] = [];
  React.Children.forEach(children, (child) => {
    if (React.isValidElement<{ value?: unknown }>(child) && typeof child.props.value === "string") {
      childValues.push(child.props.value);
    }
  });
  const muiValue = context && childValues.includes(context.value) ? context.value : false;

  return (
    <MuiTabs
      value={muiValue}
      onChange={(_event, nextValue) => {
        if (typeof nextValue === "string") {
          context?.onValueChange(nextValue);
        }
      }}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      data-slot="tabs-list"
      className={cn(
        "min-h-10 w-fit overflow-visible border-b border-border bg-transparent text-muted-foreground [&_.MuiTabs-scroller]:overflow-visible [&_.MuiTabs-indicator]:hidden",
        className,
      )}
      slotProps={{
        list: {
          className: cn(
            "inline-flex min-h-10 w-full items-center justify-start gap-1",
            className,
          ),
        },
      }}
      {...(props as Omit<React.ComponentProps<typeof MuiTabs>, "value" | "onChange" | "children">)}
    >
      {children}
    </MuiTabs>
  );
}

type TabsTriggerProps = Omit<React.ComponentProps<"button">, "value" | "onChange"> & {
  value: string;
  // Injected by MuiTabs onto direct children; accepted and stripped cleanly.
  selected?: boolean;
  selectionFollowsFocus?: boolean;
  fullWidth?: boolean;
  indicator?: React.ReactNode;
  textColor?: string;
  onChange?: (event: React.SyntheticEvent, value: string) => void;
};

function TabsTrigger({
  className,
  value,
  disabled,
  children,
  onClick,
  onMouseDown,
  onKeyDown,
  selected: _selected,
  selectionFollowsFocus: _selectionFollowsFocus,
  fullWidth: _fullWidth,
  indicator: _indicator,
  textColor: _textColor,
  onChange: _muiOnChange,
  ...props
}: TabsTriggerProps) {
  const context = React.useContext(TabsContext);
  const isSelected = context?.value === value;
  const safeSegment = sanitizeIdSegment(value);
  const tabId = context ? `${context.baseId}-tab-${safeSegment}` : undefined;
  const panelId = context ? `${context.baseId}-panel-${safeSegment}` : undefined;
  const hasMountedPanel = Boolean(context?.mountedPanels.has(value));

  const activate = () => {
    if (!disabled) {
      context?.onValueChange(value);
    }
  };

  return (
    <MuiTab
      {...(props as unknown as Omit<
        React.ComponentProps<typeof MuiTab>,
        "value" | "disabled" | "children" | "label" | "onClick" | "onMouseDown" | "onKeyDown"
      >)}
      role="tab"
      value={value}
      disabled={disabled}
      disableRipple
      id={tabId}
      aria-selected={isSelected}
      aria-controls={hasMountedPanel ? panelId : undefined}
      tabIndex={isSelected ? 0 : -1}
      label={
        <>
          {children}
          {isSelected ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-2.5 bottom-0 h-[3px] rounded-control bg-primary"
            />
          ) : null}
        </>
      }
      data-slot="tabs-trigger"
      data-state={isSelected ? "active" : "inactive"}
      onMouseDown={(event: React.MouseEvent<HTMLElement>) => {
        onMouseDown?.(event as React.MouseEvent<HTMLButtonElement>);
        if (!event.defaultPrevented && event.button === 0 && !disabled) {
          activate();
        }
      }}
      onClick={(event: React.MouseEvent<HTMLElement>) => {
        onClick?.(event as React.MouseEvent<HTMLButtonElement>);
        if (!event.defaultPrevented && !disabled) {
          activate();
        }
      }}
      onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
        onKeyDown?.(event as React.KeyboardEvent<HTMLButtonElement>);
        if (!event.defaultPrevented && !disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          activate();
        }
      }}
      className={cn(
        "relative inline-flex min-h-10 min-w-0 flex-initial items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-3.5 py-2 text-label font-medium text-muted-foreground transition-colors outline-none",
        "hover:bg-muted hover:text-foreground",
        "data-[state=active]:text-primary",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:bg-transparent disabled:text-muted-foreground",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
    />
  );
}

type TabsContentProps = React.ComponentProps<"div"> & {
  value: string;
  forceMount?: boolean;
};

function TabsContentBase({
  className,
  value,
  forceMount = false,
  children,
  ...props
}: TabsContentProps) {
  const context = React.useContext(TabsContext);
  const isActive = context?.value === value;
  const shouldRender = Boolean(isActive || forceMount);
  const safeSegment = sanitizeIdSegment(value);
  const tabId = context ? `${context.baseId}-tab-${safeSegment}` : undefined;
  const panelId = context ? `${context.baseId}-panel-${safeSegment}` : undefined;

  if (!shouldRender) return null;

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      data-slot="tabs-content"
      data-state={isActive ? "active" : "inactive"}
      className={cn("flex-1 outline-none data-[state=inactive]:hidden", className)}
      {...props}
    >
      {children}
    </div>
  );
}

const TabsContent = Object.assign(TabsContentBase, {
  [TABS_CONTENT_MARK]: true,
});

export { Tabs, TabsList, TabsTrigger, TabsContent };

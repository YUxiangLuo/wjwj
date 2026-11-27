import * as React from "react";
import MuiSlider from "@mui/material/Slider";

import type { AccessibleLabelProps } from "@/components/ui/accessible-name";
import { cn } from "@/lib/utils";

type SliderProps = Omit<
  React.ComponentProps<"span">,
  "aria-label" | "aria-labelledby" | "defaultValue" | "onChange"
> &
  AccessibleLabelProps & {
    value?: number[];
    defaultValue?: number[];
    onValueChange?: (value: number[]) => void;
    onValueCommit?: (value: number[]) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    orientation?: "horizontal" | "vertical";
    name?: string;
  };

function Slider({
  className,
  defaultValue,
  value,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  orientation = "horizontal",
  name,
  "aria-label": accessibleLabel,
  ...props
}: SliderProps) {
  const resolvedValues = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  );

  const muiValue =
    value !== undefined
      ? value.length === 1
        ? value[0]!
        : value
      : undefined;

  const muiDefaultValue =
    defaultValue !== undefined
      ? defaultValue.length === 1
        ? defaultValue[0]!
        : defaultValue
      : [min, max];

  const isMultiThumb = resolvedValues.length > 1;

  return (
    <MuiSlider
      name={name}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      orientation={orientation}
      value={muiValue}
      defaultValue={muiValue === undefined ? muiDefaultValue : undefined}
      aria-label={isMultiThumb ? undefined : accessibleLabel}
      getAriaLabel={
        isMultiThumb
          ? (index) =>
              `${accessibleLabel}${
                index === 0
                  ? "下限"
                  : index === resolvedValues.length - 1
                    ? "上限"
                    : `第 ${index + 1} 个值`
              }`
          : undefined
      }
      onChange={(_event, next) => {
        onValueChange?.(Array.isArray(next) ? next : [next]);
      }}
      onChangeCommitted={(_event, next) => {
        onValueCommit?.(Array.isArray(next) ? next : [next]);
      }}
      data-slot="slider"
      data-disabled={disabled ? "" : undefined}
      data-orientation={orientation}
      className={cn(
        "relative flex w-full touch-none items-center py-2 select-none",
        "[&_.MuiSlider-rail]:h-2 [&_.MuiSlider-rail]:rounded-pill [&_.MuiSlider-rail]:bg-primary-muted [&_.MuiSlider-rail]:opacity-100",
        "[&_.MuiSlider-track]:h-2 [&_.MuiSlider-track]:rounded-pill [&_.MuiSlider-track]:border-0 [&_.MuiSlider-track]:bg-primary",
        "[&_.MuiSlider-thumb]:size-5 [&_.MuiSlider-thumb]:rounded-circle [&_.MuiSlider-thumb]:border-2 [&_.MuiSlider-thumb]:border-primary [&_.MuiSlider-thumb]:bg-card [&_.MuiSlider-thumb]:shadow-none [&_.MuiSlider-thumb:before]:hidden [&_.MuiSlider-thumb.Mui-focusVisible]:ring-2 [&_.MuiSlider-thumb.Mui-focusVisible]:ring-ring [&_.MuiSlider-thumb.Mui-focusVisible]:ring-offset-2 [&_.MuiSlider-thumb.Mui-focusVisible]:ring-offset-background",
        disabled && "cursor-not-allowed text-muted-foreground [&_.MuiSlider-rail]:bg-muted [&_.MuiSlider-track]:bg-input [&_.MuiSlider-thumb]:border-input [&_.MuiSlider-thumb]:bg-muted",
        orientation === "vertical" && "h-full min-h-44 w-auto flex-col",
        className,
      )}
      slotProps={{
        rail: { "data-slot": "slider-track" } as React.HTMLAttributes<HTMLSpanElement>,
        track: { "data-slot": "slider-range" } as React.HTMLAttributes<HTMLSpanElement>,
        thumb: { "data-slot": "slider-thumb" } as React.HTMLAttributes<HTMLSpanElement>,
      }}
      {...(props as Omit<
        React.ComponentProps<typeof MuiSlider>,
        "value" | "defaultValue" | "onChange" | "onChangeCommitted" | "min" | "max" | "step" | "disabled" | "orientation" | "name"
      >)}
    />
  );
}

export { Slider };

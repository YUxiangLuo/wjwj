import * as React from "react";
import MuiSwitch from "@mui/material/Switch";

import { cn } from "@/lib/utils";

type SwitchProps = Omit<React.ComponentProps<"button">, "onChange" | "value"> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  name?: string;
  value?: string;
  required?: boolean;
};

function Switch({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  id,
  name,
  value,
  required,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  ...restProps
}: SwitchProps) {
  const [internalChecked, setInternalChecked] = React.useState(defaultChecked ?? false);
  const actualChecked = checked ?? internalChecked;

  return (
    <MuiSwitch
      id={id}
      name={name}
      value={value}
      required={required}
      checked={actualChecked}
      disabled={disabled}
      disableRipple
      onChange={(_event, nextChecked) => {
        setInternalChecked(nextChecked);
        onCheckedChange?.(nextChecked);
      }}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 items-center overflow-hidden rounded-toggle p-0 align-middle",
        "[&_.MuiSwitch-switchBase]:top-0.5 [&_.MuiSwitch-switchBase]:left-0.5 [&_.MuiSwitch-switchBase]:p-0",
        "[&_.MuiSwitch-switchBase.Mui-checked]:translate-x-5",
        "[&_.MuiSwitch-switchBase_.MuiSwitch-input]:top-0 [&_.MuiSwitch-switchBase_.MuiSwitch-input]:left-0 [&_.MuiSwitch-switchBase_.MuiSwitch-input]:h-5 [&_.MuiSwitch-switchBase_.MuiSwitch-input]:w-full",
        "[&_.MuiSwitch-thumb]:size-5 [&_.MuiSwitch-thumb]:rounded-circle [&_.MuiSwitch-thumb]:border [&_.MuiSwitch-thumb]:border-border [&_.MuiSwitch-thumb]:bg-card [&_.MuiSwitch-thumb]:shadow-none",
        "[&_.MuiSwitch-track]:h-6 [&_.MuiSwitch-track]:w-11 [&_.MuiSwitch-track]:rounded-toggle [&_.MuiSwitch-track]:border [&_.MuiSwitch-track]:border-input [&_.MuiSwitch-track]:bg-muted [&_.MuiSwitch-track]:opacity-100",
        "[&_.MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track]:border-primary [&_.MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track]:bg-primary [&_.MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track]:opacity-100",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background focus-within:rounded-toggle",
        disabled && "cursor-not-allowed [&_.MuiSwitch-track]:border-border [&_.MuiSwitch-track]:bg-muted",
        className,
      )}
      slotProps={{
        root: {
          "data-slot": "switch",
          "data-state": actualChecked ? "checked" : "unchecked",
        } as React.HTMLAttributes<HTMLSpanElement>,
        input: {
          ...restProps,
          role: "switch",
          "aria-checked": actualChecked,
          "aria-label": ariaLabel,
          "aria-labelledby": ariaLabelledBy,
          "aria-describedby": ariaDescribedBy,
        } as React.InputHTMLAttributes<HTMLInputElement>,
      }}
    />
  );
}

export { Switch };

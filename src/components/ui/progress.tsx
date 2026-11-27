import * as React from "react";
import MuiLinearProgress from "@mui/material/LinearProgress";

import type { AccessibleNameProps } from "@/components/ui/accessible-name";
import { cn } from "@/lib/utils";

type ProgressProps = Omit<React.ComponentProps<"div">, "aria-label" | "aria-labelledby"> & {
  value?: number | null;
  max?: number;
} & AccessibleNameProps;

function Progress({
  className,
  value,
  max = 100,
  ...props
}: ProgressProps) {
  const safeMax = max > 0 ? max : 100;
  const normalized = Math.min(100, Math.max(0, ((value ?? 0) / safeMax) * 100));

  return (
    <MuiLinearProgress
      variant="determinate"
      value={normalized}
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-pill bg-primary-muted [&_.MuiLinearProgress-bar]:rounded-pill [&_.MuiLinearProgress-bar]:bg-primary",
        className,
      )}
      {...(props as Omit<React.ComponentProps<typeof MuiLinearProgress>, "value" | "variant">)}
    />
  );
}

export { Progress };

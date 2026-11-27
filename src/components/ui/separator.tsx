import * as React from "react";
import MuiDivider from "@mui/material/Divider";

import { cn } from "@/lib/utils";

type SeparatorProps = React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
};

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <MuiDivider
      component="div"
      orientation={orientation}
      flexItem={orientation === "vertical"}
      role={decorative ? "none" : "separator"}
      aria-orientation={!decorative && orientation === "vertical" ? "vertical" : undefined}
      data-slot="separator"
      data-orientation={orientation}
      className={cn(
        "shrink-0 border-border bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className,
      )}
      {...(props as Omit<React.ComponentProps<typeof MuiDivider>, "orientation">)}
    />
  );
}

export { Separator };

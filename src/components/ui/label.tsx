import * as React from "react";
import MuiFormLabel from "@mui/material/FormLabel";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <MuiFormLabel
      {...(props as Omit<React.ComponentProps<typeof MuiFormLabel>, "component">)}
      component="label"
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-label font-medium leading-snug text-foreground select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:text-muted-foreground",
        className,
      )}
    />
  );
}

export { Label };

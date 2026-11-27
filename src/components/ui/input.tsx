import * as React from "react";
import { styled } from "@mui/material/styles";

import { cn } from "@/lib/utils";

const MuiStyledInput = styled("input")(({ theme }) => ({
  fontFamily: theme.typography.fontFamily,
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
}));

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <MuiStyledInput
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-control border border-input bg-card px-3 py-2 text-label text-foreground outline-none transition-[border-color,box-shadow,background-color] hover:border-foreground file:mr-2 file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-label file:font-medium file:text-foreground placeholder:text-muted-foreground selection:bg-primary-muted selection:text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "aria-invalid:border-destructive aria-invalid:ring-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

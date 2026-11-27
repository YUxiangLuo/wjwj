import * as React from "react";
import { styled } from "@mui/material/styles";

import { cn } from "@/lib/utils";

const MuiStyledTextarea = styled("textarea")(({ theme }) => ({
  fontFamily: theme.typography.fontFamily,
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
}));

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <MuiStyledTextarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full field-sizing-content rounded-control border border-input bg-card px-3 py-2 text-label text-foreground outline-none transition-[border-color,box-shadow,background-color] hover:border-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-destructive disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

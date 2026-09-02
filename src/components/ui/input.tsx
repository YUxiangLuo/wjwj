import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-control border border-input bg-card px-3 py-2 text-label text-foreground outline-none transition-[border-color,box-shadow,background-color] file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-label file:font-medium file:text-foreground placeholder:text-muted-foreground selection:bg-primary-muted selection:text-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "aria-invalid:ring-destructive aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };

import * as React from "react";
import MuiChip from "@mui/material/Chip";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-auto min-h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-control border px-2 py-0.5 text-meta font-medium transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary-hover",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive-hover focus-visible:ring-destructive",
        outline:
          "border-border bg-transparent text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const mergedClassName = cn(badgeVariants({ variant }), className);

  if (asChild) {
    return (
      <Slot
        data-slot="badge"
        data-variant={variant}
        className={mergedClassName}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <MuiChip
      component="span"
      size="small"
      variant={variant === "outline" ? "outlined" : "filled"}
      label={children}
      data-slot="badge"
      data-variant={variant}
      className={mergedClassName}
      slotProps={{
        label: {
          className: "inline-flex items-center gap-1 overflow-visible px-0 text-inherit",
        },
      }}
      {...(props as Omit<React.ComponentProps<typeof MuiChip>, "variant" | "label" | "children">)}
    />
  );
}

export { Badge, badgeVariants };

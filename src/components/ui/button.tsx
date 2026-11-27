import * as React from "react";
import MuiButton from "@mui/material/Button";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import type { AccessibleLabelProps } from "@/components/ui/accessible-name";
import { cn } from "@/lib/utils";

// Google Material Design 3 capsule buttons: flat elevation, crisp state layers,
// zero ripple, immediate color response without flashing transitions.
const buttonVariants = cva(
  "inline-flex min-w-0 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-pill text-label font-medium shadow-none transition-none outline-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        success:
          "bg-success text-success-foreground hover:bg-success-hover",
        outline:
          "border border-input bg-card text-foreground hover:border-primary-border hover:bg-primary-muted hover:text-primary",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
        ghost:
          "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "bg-transparent text-primary underline-offset-4 hover:bg-transparent hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-11 px-6 has-[>svg]:px-5",
        icon: "size-10 p-0",
        "icon-sm": "size-9 p-0",
        "icon-lg": "size-11 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const mergedClassName = cn(buttonVariants({ variant, size, className }));

  if (asChild) {
    return (
      <Slot
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={mergedClassName}
        {...props}
      />
    );
  }

  const muiVariant =
    variant === "outline"
      ? "outlined"
      : variant === "ghost" || variant === "link"
        ? "text"
        : "contained";

  return (
    <MuiButton
      disableElevation
      disableRipple
      variant={muiVariant}
      type={type}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={mergedClassName}
      {...(props as React.ComponentProps<typeof MuiButton>)}
    />
  );
}

type IconButtonProps = Omit<
  React.ComponentProps<"button">,
  "aria-label" | "aria-labelledby" | "children"
> &
  AccessibleLabelProps &
  Omit<VariantProps<typeof buttonVariants>, "size"> & {
    children: React.ReactNode;
    size?: "icon" | "icon-sm" | "icon-lg";
  };

function IconButton({
  className,
  variant = "default",
  size = "icon",
  ...props
}: IconButtonProps) {
  return (
    <Button
      className={className}
      variant={variant}
      size={size}
      {...props}
    />
  );
}

export { Button, IconButton, buttonVariants };

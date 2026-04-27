import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-none border-0 bg-transparent px-0 py-0 text-[0.625rem] font-semibold tracking-widest whitespace-nowrap uppercase transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-0 has-data-[icon=inline-start]:pl-0 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "text-foreground [a]:hover:text-foreground/70",
        secondary:
          "border border-border bg-secondary px-1.5 py-0.5 text-secondary-foreground [a]:hover:text-foreground",
        destructive:
          "border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 text-destructive focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:text-destructive/70",
        outline: "border border-border px-1.5 py-0.5 text-foreground [a]:hover:text-foreground/70",
        success: "border border-success/20 bg-success/10 px-1.5 py-0.5 text-success [a]:hover:text-success/80",
        warning: "border border-warning/20 bg-warning/10 px-1.5 py-0.5 text-warning [a]:hover:text-warning/80",
        info: "border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-primary [a]:hover:text-primary/80",
        muted: "border border-border bg-muted px-1.5 py-0.5 text-muted-foreground [a]:hover:text-foreground",
        ghost: "text-muted-foreground hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

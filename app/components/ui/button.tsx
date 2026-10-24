import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent font-semibold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.1em]",
  {
    variants: {
      variant: {
        default: "bg-lake text-white hover:bg-lake-strong",
        outline: "border-line-strong bg-surface text-ink hover:border-ink hover:bg-canvas",
        secondary: "bg-lake-tint text-lake-strong hover:bg-[#d3e6e9]",
        ghost: "text-ink hover:bg-muted",
        destructive: "bg-danger text-white hover:bg-[#912018]",
        "destructive-outline": "border-danger/60 bg-surface text-danger hover:bg-danger-tint",
        link: "h-auto px-0 text-lake underline underline-offset-4 hover:text-lake-strong",
      },
      size: {
        default: "h-11 px-4 text-base",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-5 text-lg",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), variant === "link" && "h-auto", className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };

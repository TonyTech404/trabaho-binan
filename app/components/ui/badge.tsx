import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "~/lib/utils";

/** Small status label. Colour is never the only signal: the text names the state. */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs leading-tight font-semibold whitespace-nowrap [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        neutral: "border-line bg-muted text-ink-muted",
        info: "border-lake/25 bg-lake-tint text-lake-strong",
        success: "border-open/25 bg-open-tint text-open",
        warning: "border-marigold/60 bg-marigold-tint text-marigold-ink",
        danger: "border-danger/25 bg-danger-tint text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "~/lib/utils";

const alertVariants = cva(
  "grid w-full gap-1 rounded-md border-l-4 px-4 py-3 text-left text-base has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:mt-0.5 *:[svg]:size-5",
  {
    variants: {
      variant: {
        info: "border-lake bg-lake-tint text-ink *:[svg]:text-lake",
        success: "border-open bg-open-tint text-ink *:[svg]:text-open",
        warning: "border-marigold bg-marigold-tint text-ink *:[svg]:text-marigold-ink",
        danger: "border-danger bg-danger-tint text-ink *:[svg]:text-danger",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

function Alert({
  className,
  variant,
  role,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={role ?? (variant === "danger" ? "alert" : "status")}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("leading-snug font-semibold", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("text-[0.9375rem] leading-relaxed text-ink-muted", className)} {...props} />
  );
}

export { Alert, AlertDescription, AlertTitle };

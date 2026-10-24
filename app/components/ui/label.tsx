import * as React from "react";
import { cn } from "~/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- callers pass htmlFor
    <label
      data-slot="label"
      className={cn("block text-sm leading-snug font-semibold text-ink", className)}
      {...props}
    />
  );
}

export { Label };

import * as React from "react";
import { cn } from "~/lib/utils";

/** 44px tall and 16px text: comfortable to tap and no zoom-on-focus in iOS Safari. */
export const fieldClasses =
  "w-full min-w-0 rounded-md border border-input bg-surface px-3 text-base text-ink placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-danger aria-invalid:bg-danger-tint/40";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldClasses, "h-11", className)}
      {...props}
    />
  );
}

export { Input };

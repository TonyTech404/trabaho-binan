import * as React from "react";
import { cn } from "~/lib/utils";
import { fieldClasses } from "./input";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldClasses,
        "field-sizing-content min-h-28 py-2.5 leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

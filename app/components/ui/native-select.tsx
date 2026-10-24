import { ChevronDownIcon } from "lucide-react";
import * as React from "react";
import { cn } from "~/lib/utils";
import { fieldClasses } from "./input";

/** Native <select>: works without JavaScript and uses the phone's own picker. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative w-full", className)} data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        className={cn(fieldClasses, "h-11 appearance-none pr-10")}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
        aria-hidden="true"
      />
    </div>
  );
}

function NativeSelectOption(props: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}

export { NativeSelect, NativeSelectOption };

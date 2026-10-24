import type { LucideIcon } from "lucide-react";
import { cn } from "~/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  children,
  actions,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-line-strong bg-surface px-5 py-10 text-center",
        className,
      )}
    >
      <Icon aria-hidden="true" className="mx-auto size-8 text-ink-subtle" />
      <h2 className="mt-3 text-xl font-semibold">{title}</h2>
      {children ? <div className="mx-auto mt-2 max-w-md text-ink-muted">{children}</div> : null}
      {actions ? <div className="mt-5 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}

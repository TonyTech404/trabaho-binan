import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { Alert, AlertTitle } from "~/components/ui/alert";
import { Label } from "~/components/ui/label";
import type { FieldErrors } from "~/lib/validation";
import { cn } from "~/lib/utils";

export interface ControlProps {
  id: string;
  name: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  required?: boolean;
}

/**
 * Label, optional hint and inline error wired to the control with
 * aria-describedby / aria-invalid. The control is rendered by the caller.
 */
export function Field({
  name,
  label,
  hint,
  error,
  required,
  optional,
  className,
  children,
}: {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: (props: ControlProps) => React.ReactNode;
}) {
  const id = `field-${name}`;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? <span className="ml-1.5 font-normal text-ink-subtle">(optional)</span> : null}
      </Label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        name,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
        required,
      })}
      {error ? (
        <p
          id={`${id}-error`}
          className="flex items-start gap-1.5 text-sm font-semibold text-danger"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Prefix the field name unless the message already mentions it. */
function withLabel(label: string | undefined, message: string | undefined) {
  if (!label || !message || message.toLowerCase().includes(label.toLowerCase())) return message;
  return `${label}: ${message}`;
}

/** Summary of errors at the top of a form; receives focus so screen readers announce it. */
export function ErrorSummary({
  errors,
  labels,
}: {
  errors?: FieldErrors;
  labels?: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors ?? {}).filter(([, v]) => v);
  useEffect(() => {
    if (entries.length) ref.current?.focus();
  }, [entries.length, errors]);
  if (entries.length === 0) return null;
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      <Alert variant="danger">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>
          {entries.length === 1
            ? "Fix 1 problem to continue"
            : `Fix ${entries.length} problems to continue`}
        </AlertTitle>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[0.9375rem]">
          {entries.map(([key, message]) => (
            <li key={key}>
              {key === "form" ? (
                message
              ) : (
                <a href={`#field-${key}`} className="font-semibold text-ink underline">
                  {withLabel(labels?.[key], message)}
                </a>
              )}
            </li>
          ))}
        </ul>
      </Alert>
    </div>
  );
}

export function FormMessage({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "success" | "info";
  children: React.ReactNode;
}) {
  return (
    <Alert variant={tone}>
      <CircleAlert aria-hidden="true" />
      <AlertTitle className="font-normal">{children}</AlertTitle>
    </Alert>
  );
}

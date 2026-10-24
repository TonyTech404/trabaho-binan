import { OfficialLogos } from "./wordmark";

/** Narrow centred layout for sign-in, invitation and password pages. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <div className="rounded-lg border border-line bg-surface p-5 sm:p-7">
        <OfficialLogos className="h-12" />
        <h1 className="mt-4 text-3xl font-bold">{title}</h1>
        {description ? <div className="mt-2 text-ink-muted">{description}</div> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

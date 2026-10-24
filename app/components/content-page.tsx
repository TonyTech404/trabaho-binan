/** Long-form text pages (help, privacy). */
export function ContentPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {intro ? <div className="mt-3 text-lg text-ink-muted">{intro}</div> : null}
      <div className="mt-8 space-y-10 [&_h2]:text-2xl [&_h2]:font-bold [&_li]:leading-relaxed [&_p]:leading-relaxed [&_section]:scroll-mt-6 [&_section>*+*]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </main>
  );
}

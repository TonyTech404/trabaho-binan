/**
 * Renders employer-entered text safely: no HTML or Markdown is interpreted.
 * Blank lines separate paragraphs; lines starting with "-", "*" or "•"
 * become bullet lists. Links are deliberately not auto-linked.
 */
export function JobText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text) return null;
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={className ?? "prose-job"}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const bullet = /^\s*[-*•]\s+/;
        if (lines.length > 0 && lines.every((l) => bullet.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{l.replace(bullet, "")}</li>
              ))}
            </ul>
          );
        }
        if (lines.some((l) => bullet.test(l))) {
          const intro = lines.filter((l) => !bullet.test(l));
          const items = lines.filter((l) => bullet.test(l));
          return (
            <div key={i}>
              <p className="whitespace-pre-line">{intro.join("\n")}</p>
              <ul className="mt-2">
                {items.map((l, j) => (
                  <li key={j}>{l.replace(bullet, "")}</li>
                ))}
              </ul>
            </div>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

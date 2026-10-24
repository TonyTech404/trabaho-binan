/**
 * Highlights wording a reviewer should check before publication. These are
 * prompts for human review, not automatic rejections or legal advice.
 *
 * Republic Act No. 10911 prohibits age-based requirements in job postings,
 * and Philippine labour rules prohibit charging placement fees for local
 * employment, so those patterns are flagged prominently.
 */
export interface PolicyFlag {
  label: string;
  match: string;
}

const RULES: { label: string; pattern: RegExp }[] = [
  {
    label: "Age requirement",
    pattern:
      /\b(?:\d{2}\s*(?:-|–|to)\s*\d{2}\s*(?:years?\s*old|yrs?\.?\s*old|y\/?o)|(?:age|aged)\s*(?:limit|requirement|range|bracket)?\s*[:-]?\s*\d{2}|(?:not\s+)?(?:older|younger)\s+than\s+\d{2}|(?:below|above|under|over)\s+\d{2}\s*(?:years|yrs|y\/?o)|\d{2}\s*(?:years?\s*old|yrs?\.?\s*old|y\/?o)\s*(?:and\s*)?(?:below|above|up|or\s+(?:younger|older)))/i,
  },
  {
    label: "Gender requirement",
    pattern:
      /\b(?:male|female|men|women)\s+(?:only|applicants?\s+only|preferred)\b|\b(?:must\s+be\s+(?:a\s+)?(?:male|female))\b/i,
  },
  {
    label: "Marital status",
    pattern:
      /\b(?:single|unmarried|married)\s+(?:only|applicants?|preferred)\b|\bmust\s+be\s+single\b/i,
  },
  {
    label: "Physical appearance",
    pattern:
      /\b(?:pleasing\s+personality|good[-\s]looking|attractive|height\s+(?:of\s+)?(?:at\s+least\s+)?\d|\d['’]\s?\d{1,2}["”]?\s*(?:and\s+)?(?:above|tall)|\d{3}\s*cm)\b/i,
  },
  {
    label: "Religion",
    pattern:
      /\b(?:catholic|christian|muslim|iglesia|born[-\s]again)\s+(?:only|applicants?|preferred)\b/i,
  },
  {
    label: "Fee charged to applicants",
    pattern:
      /\b(?:placement|processing|training|medical|uniform|registration|application)\s+fees?\b|\bpay\s+(?:a|the)\s+fee\b|\bdeposit\s+(?:of|required)\b/i,
  },
];

export function findPolicyFlags(...texts: (string | null | undefined)[]): PolicyFlag[] {
  const text = texts.filter(Boolean).join("\n");
  const flags: PolicyFlag[] = [];
  for (const rule of RULES) {
    const m = text.match(rule.pattern);
    if (m) flags.push({ label: rule.label, match: m[0].trim() });
  }
  return flags;
}

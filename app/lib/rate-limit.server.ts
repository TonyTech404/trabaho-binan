/**
 * Approximate per-location rate limiting with the Workers Rate Limiting
 * binding. It deters brute-force sign-in and form spam; it is not a strict
 * global quota. Failures of the limiter itself fail open.
 */
export async function withinRateLimit(
  limiter: RateLimit | undefined,
  request: Request,
  scope: string,
  /** Limit by something other than the connection, such as an account. */
  key?: string,
): Promise<boolean> {
  if (!limiter) return true;
  const subject = key ?? clientNetwork(request.headers.get("cf-connecting-ip") ?? "unknown");
  try {
    const { success } = await limiter.limit({ key: `${scope}:${subject}` });
    return success;
  } catch {
    return true;
  }
}

export function tooManyRequests(message = "Too many attempts. Wait a minute and try again.") {
  return { error: message, status: 429 as const };
}

/** IPv6 hextets with "::" expanded, or null for IPv4 and anything unexpected. */
function ipv6Groups(ip: string): string[] | null {
  if (!ip.includes(":")) return null;
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return groups.length === 8 ? groups.map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")) : null;
}

/**
 * The unit rate limits count: an IPv4 address, or an IPv6 /64 (one home or
 * phone usually gets a whole /64, so rotating addresses within it is free).
 */
export function clientNetwork(ip: string) {
  const v6 = ipv6Groups(ip);
  return v6 ? `${v6.slice(0, 4).join(":")}::/64` : ip;
}

/** A coarse network for logs: IPv4 /24 or IPv6 /48, never a full address. */
export function coarseNetwork(ip: string) {
  const v6 = ipv6Groups(ip);
  if (v6) return `${v6.slice(0, 3).join(":")}::/48`;
  const m = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/.exec(ip);
  return m ? `${m[1]}.0/24` : "unknown";
}

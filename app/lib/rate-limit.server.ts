/**
 * Approximate per-location rate limiting with the Workers Rate Limiting
 * binding. It deters brute-force sign-in and form spam; it is not a strict
 * global quota. Failures of the limiter itself fail open.
 */
export async function withinRateLimit(
  limiter: RateLimit | undefined,
  request: Request,
  scope: string,
): Promise<boolean> {
  if (!limiter) return true;
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  try {
    const { success } = await limiter.limit({ key: `${scope}:${ip}` });
    return success;
  } catch {
    return true;
  }
}

export function tooManyRequests(message = "Too many attempts. Wait a minute and try again.") {
  return { error: message, status: 429 as const };
}

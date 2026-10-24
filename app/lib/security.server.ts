/**
 * Response hardening applied to every Worker response.
 */

export function isCrossSiteMutation(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;

  // Browsers send Sec-Fetch-Site on all modern requests.
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return true;

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return true;

  return false;
}

export function contentSecurityPolicy(nonce: string, isHttps: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function withSecurityHeaders(
  response: Response,
  options: { nonce: string; isHttps: boolean; dev: boolean; authenticated: boolean },
): Response {
  const headers = new Headers(response.headers);
  const contentType = headers.get("content-type") ?? "";

  if (contentType.includes("text/html") && !options.dev) {
    headers.set("Content-Security-Policy", contentSecurityPolicy(options.nonce, options.isHttps));
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (options.isHttps) {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  // Never let shared caches or the browser store pages for signed-in users.
  if (options.authenticated || headers.has("set-cookie")) {
    headers.set("Cache-Control", "private, no-store");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

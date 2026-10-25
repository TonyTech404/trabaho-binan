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

/** Largest accepted application upload: three files of up to 10 MB in all, plus the form. */
const MAX_APPLICATION_BODY = 11 * 1024 * 1024;
/** Every other form on the site is text. */
const MAX_FORM_BODY = 256 * 1024;

/**
 * Refuses oversized request bodies before anything reads them, so a large
 * upload cannot use up the Worker's memory or CPU. Bodies without a declared
 * length are refused too (browsers always send one for forms).
 */
export function bodyLimitResponse(request: Request): Response | null {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  const declared = request.headers.get("content-length");
  if (declared === null) {
    return request.body ? new Response("Length required.", { status: 411 }) : null;
  }
  const length = Number(declared);
  const limit = /^\/apply\/[^/]+\/form$/.test(new URL(request.url).pathname)
    ? MAX_APPLICATION_BODY
    : MAX_FORM_BODY;
  if (!Number.isFinite(length) || length > limit) {
    return new Response("The form is too large to send.", { status: 413 });
  }
  return null;
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
  options: {
    nonce: string;
    isHttps: boolean;
    dev: boolean;
    authenticated: boolean;
    /** Keep non-production sites (sample data) out of search engines. */
    noindex?: boolean;
  },
): Response {
  const headers = new Headers(response.headers);
  const contentType = headers.get("content-type") ?? "";

  if (contentType.includes("text/html") && !options.dev) {
    headers.set("Content-Security-Policy", contentSecurityPolicy(options.nonce, options.isHttps));
  }
  headers.set("X-Content-Type-Options", "nosniff");
  // Pages that hold a token in their URL set the stricter "no-referrer" themselves.
  if (!headers.has("Referrer-Policy")) {
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (options.isHttps) {
    headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  if (options.noindex) headers.set("X-Robots-Tag", "noindex, nofollow");
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

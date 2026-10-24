/**
 * Short-lived edge caching for anonymous public pages.
 *
 * - Only anonymous GET document requests for public paths are eligible.
 * - A route opts in by sending `Cache-Control` with `s-maxage`; job pages cap
 *   that value so it never extends past the vacancy deadline.
 * - Responses with Set-Cookie, non-200 statuses and signed-in visitors are
 *   never cached.
 * - Lifecycle changes purge the job page; the listing page relies on its
 *   60-second lifetime. The apply redirect is never cached and re-checks the
 *   job status, so a stale page cannot send anyone to a closed vacancy.
 *
 * The Cache API is per data centre. Workers run with targeted placement
 * near the database, so reads, writes and purges share one location.
 */

const PUBLIC_PATH =
  /^\/(?:|jobs\/[A-Za-z0-9]+(?:\/[a-z0-9-]+)?|employers\/[a-z0-9-]+|help|privacy)$/;

export const PUBLIC_LIST_TTL_SECONDS = 60;
export const PUBLIC_PAGE_TTL_SECONDS = 300;

function cacheKey(url: URL): Request {
  return new Request(url.toString(), { method: "GET" });
}

function getCache(): Cache | undefined {
  return typeof caches === "undefined"
    ? undefined
    : (caches as unknown as { default: Cache }).default;
}

export function isCacheableRequest(request: Request, hasSession: boolean): boolean {
  if (request.method !== "GET" || hasSession) return false;
  const url = new URL(request.url);
  return PUBLIC_PATH.test(url.pathname);
}

export async function matchPublicCache(
  request: Request,
  nonce: string,
): Promise<Response | undefined> {
  const cache = getCache();
  if (!cache) return undefined;
  const cached = await cache.match(cacheKey(new URL(request.url)));
  if (!cached) return undefined;

  // Cached HTML carries the nonce of the response that filled the cache.
  // Re-stamp inline scripts with this response's nonce.
  const rewritten = new HTMLRewriter()
    .on("script", {
      element(el) {
        if (el.hasAttribute("nonce")) el.setAttribute("nonce", nonce);
      },
    })
    .transform(cached);
  const headers = new Headers(rewritten.headers);
  headers.set("X-Cache", "HIT");
  return new Response(rewritten.body, { status: rewritten.status, headers });
}

export function storePublicCache(request: Request, response: Response, ctx: ExecutionContext) {
  const cache = getCache();
  if (!cache) return;
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (
    response.status !== 200 ||
    response.headers.has("set-cookie") ||
    !/s-maxage=\d+/.test(cacheControl) ||
    /no-store|private/.test(cacheControl)
  ) {
    return;
  }
  ctx.waitUntil(cache.put(cacheKey(new URL(request.url)), response.clone()));
}

/** Purge cached copies of the given public paths (e.g. after a job closes). */
export async function purgePublicPaths(baseUrl: string, paths: string[]): Promise<void> {
  const cache = getCache();
  if (!cache) return;
  await Promise.all(
    [...new Set(paths)].map((path) => cache.delete(cacheKey(new URL(path, baseUrl)))),
  );
}

/** Cache-Control for public pages; `maxSeconds` caps the lifetime (e.g. until a deadline). */
export function publicCacheControl(ttlSeconds: number, maxSeconds?: number): string {
  const ttl = Math.max(0, Math.floor(Math.min(ttlSeconds, maxSeconds ?? ttlSeconds)));
  return ttl > 0 ? `public, max-age=0, s-maxage=${ttl}` : "no-cache";
}

import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { EntryContext, HandleErrorFunction, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { appContext } from "~/lib/context.server";
import { describeError, loggablePath } from "~/lib/log.server";

export const streamTimeout = 5_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  // CSP (and therefore the nonce) is only applied outside development; skipping
  // it in dev avoids a harmless hydration warning about the attribute.
  const nonce = import.meta.env.DEV ? undefined : loadContext.get(appContext).nonce;
  let shellRendered = false;
  const userAgent = request.headers.get("user-agent");

  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
    {
      nonce,
      signal: AbortSignal.timeout(streamTimeout + 1000),
      onError(error: unknown) {
        responseStatusCode = 500;
        if (shellRendered) console.error(JSON.stringify({ renderError: describeError(error) }));
      },
    },
  );
  shellRendered = true;

  // Crawlers get the complete document instead of a streamed shell.
  if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html; charset=utf-8");
  return new Response(body, { headers: responseHeaders, status: responseStatusCode });
}

/**
 * Unexpected errors from loaders and actions. React Router's default logs the
 * whole error, which for database errors includes the query's parameters.
 */
export const handleError: HandleErrorFunction = (error, { request }) => {
  if (request.signal.aborted) return;
  console.error(
    JSON.stringify({
      method: request.method,
      path: loggablePath(request.url),
      ...describeError(error),
    }),
  );
};

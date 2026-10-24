import { createRequestHandler, RouterContextProvider } from "react-router";
import * as serverBuild from "virtual:react-router/server-build";
import { appContext, createAppServices, hasSessionCookie } from "~/lib/context.server";
import { isCacheableRequest, matchPublicCache, storePublicCache } from "~/lib/public-cache.server";
import { isCrossSiteMutation, withSecurityHeaders } from "~/lib/security.server";
import { runScheduledTasks } from "~/services/scheduled.server";

// The server build is imported statically so its modules are evaluated at
// Worker startup rather than inside the first request's 10 ms CPU budget.
// Development keeps the lazy import so Vite can hot-reload route modules.
const requestHandler = createRequestHandler(
  import.meta.env.DEV ? () => import("virtual:react-router/server-build") : serverBuild,
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    if (isCrossSiteMutation(request)) {
      return new Response("Cross-site form submissions are not allowed.", { status: 403 });
    }

    const services = createAppServices(request, env, ctx, env.HYPERDRIVE.connectionString);
    const authenticated = hasSessionCookie(request);
    const securityOptions = {
      nonce: services.nonce,
      isHttps: new URL(request.url).protocol === "https:",
      dev: import.meta.env.DEV,
      authenticated,
    };

    const cacheable = !import.meta.env.DEV && isCacheableRequest(request, authenticated);
    if (cacheable) {
      const cached = await matchPublicCache(request, services.nonce);
      if (cached) return withSecurityHeaders(cached, securityOptions);
    }

    const context = new RouterContextProvider();
    context.set(appContext, services);
    try {
      const response = await requestHandler(request, context);
      if (cacheable) storePublicCache(request, response, ctx);
      return withSecurityHeaders(response, securityOptions);
    } finally {
      // Loaders and actions have finished; rendering does not touch the database.
      ctx.waitUntil(services.dispose());
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledTasks(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;

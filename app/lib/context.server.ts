import { createContext, type RouterContextProvider } from "react-router";
import { createLazyDatabase, type Database } from "~/db/client.server";
import { r2ResumeStore, type ResumeStore } from "./resume";
import { createAuth, SESSION_COOKIE_PREFIX, type Auth } from "./auth.server";
import { describeError } from "./log.server";

export interface AppServices {
  env: Env;
  ctx: ExecutionContext;
  /** Public origin used for links (APP_URL, or the request origin when unset). */
  baseUrl: string;
  /** CSP nonce for inline scripts rendered in this response. */
  nonce: string;
  db(): Promise<Database>;
  auth(): Promise<Auth>;
  /** Private résumé storage (R2). */
  resumes: ResumeStore;
  /** Run non-critical work (e.g. metrics) after the response; the DB closes once it settles. */
  defer(task: () => Promise<unknown>): void;
  dispose(): Promise<void>;
}

export const appContext = createContext<AppServices>();

export function createAppServices(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  connectionString: string,
): AppServices {
  const baseUrl = (env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  const database = createLazyDatabase(connectionString);
  let auth: Promise<Auth> | undefined;
  const deferred: Promise<unknown>[] = [];

  return {
    env,
    ctx,
    baseUrl,
    nonce: createNonce(),
    db: () => database.get(),
    resumes: r2ResumeStore(env.RESUMES),
    auth() {
      auth ??= database.get().then((db) =>
        createAuth(db, {
          baseURL: baseUrl,
          secret: requireSecret(env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET"),
          secureCookies: baseUrl.startsWith("https://"),
        }),
      );
      return auth;
    },
    defer(task) {
      deferred.push(
        task().catch((error) =>
          console.error(JSON.stringify({ deferredTaskFailed: describeError(error) })),
        ),
      );
    },
    async dispose() {
      await Promise.allSettled(deferred);
      await database.close();
    },
  };
}

export function getServices(context: Readonly<RouterContextProvider>): AppServices {
  return context.get(appContext);
}

export function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie");
  return !!cookie && cookie.includes(`${SESSION_COOKIE_PREFIX}.session_token=`);
}

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function requireSecret(value: string | undefined, name: string): string {
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set to a random value of at least 32 characters.`);
  }
  return value;
}

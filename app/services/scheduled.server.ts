import { createLazyDatabase } from "~/db/client.server";
import { purgePublicPaths } from "~/lib/public-cache.server";
import { expireDueJobs } from "./jobs.server";

/**
 * Cron Trigger entry point (hourly in production). Public queries also filter
 * on the deadline, so a missed run never shows an expired job as open.
 */
export async function runScheduledTasks(env: Env, now: Date) {
  const database = createLazyDatabase(env.HYPERDRIVE.connectionString);
  try {
    const db = await database.get();
    const expired = await expireDueJobs(db, now);
    if (expired.length > 0 && env.APP_URL) {
      await purgePublicPaths(env.APP_URL, [
        "/",
        ...expired.flatMap((j) => [`/jobs/${j.publicId}`, `/jobs/${j.publicId}/${j.slug}`]),
      ]);
    }
    console.log(JSON.stringify({ task: "expire-jobs", expired: expired.length }));
  } finally {
    await database.close();
  }
}

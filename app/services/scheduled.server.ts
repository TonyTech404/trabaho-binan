import { createLazyDatabase } from "~/db/client.server";
import { purgePublicPaths } from "~/lib/public-cache.server";
import { r2ResumeStore } from "~/lib/resume";
import { purgeExpiredApplications } from "./applications.server";
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
    const purged = await purgeExpiredApplications(db, r2ResumeStore(env.RESUMES), now);
    console.log(JSON.stringify({ task: "purge-applications", purged }));
  } finally {
    await database.close();
  }
}

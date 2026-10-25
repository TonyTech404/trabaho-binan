import { createLazyDatabase } from "~/db/client.server";
import { describeError } from "~/lib/log.server";
import { purgePublicPaths } from "~/lib/public-cache.server";
import { r2ResumeStore } from "~/lib/resume";
import { purgeExpiredApplications } from "./applications.server";
import { expireDueJobs } from "./jobs.server";

/**
 * Cron Trigger entry point (hourly in production). Public queries also filter
 * on the deadline, so a missed run never shows an expired job as open. Each
 * task runs on its own, so a failure in one never skips the other (deleting
 * old applications is a privacy promise). Failures are rethrown so the run
 * shows as failed in the dashboard.
 */
export async function runScheduledTasks(env: Env, now: Date) {
  const database = createLazyDatabase(env.HYPERDRIVE.connectionString);
  const failures: string[] = [];
  async function task(name: string, run: () => Promise<Record<string, number>>) {
    try {
      console.log(JSON.stringify({ task: name, ...(await run()) }));
    } catch (error) {
      failures.push(name);
      console.error(JSON.stringify({ task: name, failed: describeError(error) }));
    }
  }
  try {
    const db = await database.get();
    await task("expire-jobs", async () => {
      const expired = await expireDueJobs(db, now);
      if (expired.length > 0 && env.APP_URL) {
        await purgePublicPaths(env.APP_URL, [
          "/",
          ...expired.flatMap((j) => [`/jobs/${j.publicId}`, `/jobs/${j.publicId}/${j.slug}`]),
        ]);
      }
      return { expired: expired.length };
    });
    await task("purge-applications", async () => ({
      purged: await purgeExpiredApplications(db, r2ResumeStore(env.RESUMES), now),
    }));
  } finally {
    await database.close();
  }
  if (failures.length) throw new Error(`Scheduled tasks failed: ${failures.join(", ")}`);
}

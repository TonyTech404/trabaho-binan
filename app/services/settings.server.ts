import { inArray } from "drizzle-orm";
import type { Database } from "~/db/client.server";
import { settings } from "~/db/schema";
import { cleanText } from "~/lib/validation";
import { recordAudit, requireAdmin, type Actor } from "./common.server";

/** Site settings editable by administrators. Defaults avoid claiming any official affiliation. */
export interface SiteSettings {
  operatorName: string;
  contactEmail: string;
  contactPhone: string;
  contactNote: string;
}

export const SETTING_DEFAULTS: SiteSettings = {
  operatorName: "the Trabaho Biñan team",
  contactEmail: "",
  contactPhone: "",
  contactNote: "",
};

const KEYS = Object.keys(SETTING_DEFAULTS) as (keyof SiteSettings)[];

export async function getSiteSettings(db: Database): Promise<SiteSettings> {
  const rows = await db.select().from(settings).where(inArray(settings.key, KEYS));
  const out = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (typeof row.value === "string" && (KEYS as string[]).includes(row.key)) {
      out[row.key as keyof SiteSettings] = row.value;
    }
  }
  return out;
}

export async function updateSiteSettings(db: Database, actor: Actor, input: Partial<SiteSettings>) {
  requireAdmin(actor);
  const values = KEYS.filter((k) => input[k] !== undefined).map((key) => ({
    key,
    value: cleanText(input[key]).slice(0, key === "contactNote" ? 1000 : 200),
    updatedById: actor.id,
    updatedAt: new Date(),
  }));
  if (values.length === 0) return;
  await db.transaction(async (tx) => {
    for (const v of values) {
      await tx
        .insert(settings)
        .values(v)
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: v.value, updatedById: v.updatedById, updatedAt: v.updatedAt },
        });
    }
    await recordAudit(tx, actor, {
      action: "settings.update",
      entityType: "settings",
      summary: `Updated ${values.map((v) => v.key).join(", ")}`,
    });
  });
}

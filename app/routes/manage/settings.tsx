import { Form, redirect, useNavigation } from "react-router";
import { NoticeBanner } from "~/components/dashboard/notice";
import { PageHeader } from "~/components/dashboard/shell";
import { Field } from "~/components/form/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { getServices } from "~/lib/context.server";
import { withNotice } from "~/lib/route-helpers.server";
import { requireAdminViewer } from "~/lib/session.server";
import { getSiteSettings, updateSiteSettings } from "~/services/settings.server";
import type { Route } from "./+types/settings";

export const meta = () => [{ title: "Settings — Review dashboard" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireAdminViewer(request, context);
  return { settings: await getSiteSettings(await getServices(context).db()) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const viewer = await requireAdminViewer(request, context);
  const services = getServices(context);
  const form = await request.formData();
  await updateSiteSettings(await services.db(), viewer, {
    operatorName: String(form.get("operatorName") ?? "") || "PESO Biñan",
    contactEmail: String(form.get("contactEmail") ?? ""),
    contactPhone: String(form.get("contactPhone") ?? ""),
    contactNote: String(form.get("contactNote") ?? ""),
  });
  return redirect(withNotice("/manage/settings", "settings_saved"));
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { settings } = loaderData;
  const navigation = useNavigation();
  return (
    <>
      <PageHeader
        title="Settings"
        description="Shown on the help, privacy and password pages. Do not describe the site as official unless a partnership has been confirmed in writing."
      />
      <NoticeBanner />
      <Form
        method="post"
        className="max-w-2xl space-y-5 rounded-lg border border-line bg-surface p-4 sm:p-5"
      >
        <Field
          name="operatorName"
          label="Who runs the site"
          hint="Used in sentences such as “Ask … for an invitation”. Example: PESO Biñan."
        >
          {(p) => <Input {...p} defaultValue={settings.operatorName} maxLength={200} />}
        </Field>
        <Field name="contactEmail" label="Contact email" optional>
          {(p) => (
            <Input {...p} type="email" defaultValue={settings.contactEmail} maxLength={200} />
          )}
        </Field>
        <Field name="contactPhone" label="Contact phone" optional>
          {(p) => <Input {...p} type="tel" defaultValue={settings.contactPhone} maxLength={200} />}
        </Field>
        <Field
          name="contactNote"
          label="Other contact information"
          optional
          hint="For example office hours or a Facebook page."
        >
          {(p) => <Textarea {...p} defaultValue={settings.contactNote} rows={3} maxLength={1000} />}
        </Field>
        <Button type="submit" disabled={navigation.state === "submitting"}>
          Save settings
        </Button>
      </Form>
    </>
  );
}

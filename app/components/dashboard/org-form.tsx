import { Form, useNavigation } from "react-router";
import { ErrorSummary, Field } from "~/components/form/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { Textarea } from "~/components/ui/textarea";
import { ORGANIZATION_TYPES } from "~/lib/labels";
import type { FieldErrors } from "~/lib/validation";

const LABELS: Record<string, string> = {
  name: "Name",
  type: "Type",
  description: "Description",
  website: "Website",
  publicEmail: "Public email",
  publicPhone: "Public phone",
  officeCity: "Office city",
  officeBarangay: "Office barangay",
  officeAddress: "Office address",
  internalNotes: "Internal notes",
};

/** Organization details. Employers see only the public profile fields (`profileOnly`). */
export function OrganizationForm({
  values = {},
  errors,
  submitLabel,
  profileOnly,
}: {
  values?: Partial<Record<string, unknown>>;
  errors?: FieldErrors;
  submitLabel: string;
  profileOnly?: boolean;
}) {
  const navigation = useNavigation();
  const v = (k: string) => (typeof values[k] === "string" ? (values[k] as string) : "");
  return (
    <Form method="post" className="space-y-5" noValidate>
      <input type="hidden" name="intent" value="save" />
      <ErrorSummary errors={errors} labels={LABELS} />
      {!profileOnly ? (
        <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field
            name="name"
            label="Name"
            hint="As used publicly. Add the trade name if different."
            error={errors?.name}
            required
          >
            {(p) => <Input {...p} defaultValue={v("name")} maxLength={120} />}
          </Field>
          <Field name="type" label="Type" error={errors?.type} required>
            {(p) => (
              <NativeSelect {...p} defaultValue={v("type")}>
                <NativeSelectOption value="">Choose</NativeSelectOption>
                {Object.entries(ORGANIZATION_TYPES).map(([k, l]) => (
                  <NativeSelectOption key={k} value={k}>
                    {l}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
      ) : null}
      <Field
        name="description"
        label="About the organization"
        optional
        hint="Shown on the public employer page."
        error={errors?.description}
      >
        {(p) => <Textarea {...p} defaultValue={v("description")} rows={4} maxLength={2000} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field name="website" label="Website" optional hint="https:// only" error={errors?.website}>
          {(p) => <Input {...p} type="url" defaultValue={v("website")} maxLength={500} />}
        </Field>
        <Field name="publicEmail" label="Public email" optional error={errors?.publicEmail}>
          {(p) => <Input {...p} type="email" defaultValue={v("publicEmail")} maxLength={254} />}
        </Field>
        <Field name="publicPhone" label="Public phone" optional error={errors?.publicPhone}>
          {(p) => <Input {...p} type="tel" defaultValue={v("publicPhone")} maxLength={40} />}
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field name="officeCity" label="Office city" optional error={errors?.officeCity}>
          {(p) => <Input {...p} defaultValue={v("officeCity")} maxLength={80} />}
        </Field>
        <Field
          name="officeBarangay"
          label="Office barangay"
          optional
          error={errors?.officeBarangay}
        >
          {(p) => <Input {...p} defaultValue={v("officeBarangay")} maxLength={80} />}
        </Field>
        <Field name="officeAddress" label="Office address" optional error={errors?.officeAddress}>
          {(p) => <Input {...p} defaultValue={v("officeAddress")} maxLength={200} />}
        </Field>
      </div>
      {!profileOnly ? (
        <Field
          name="internalNotes"
          label="Internal notes"
          optional
          hint="Not shown publicly or to the employer. Do not store ID numbers or documents here."
          error={errors?.internalNotes}
        >
          {(p) => <Textarea {...p} defaultValue={v("internalNotes")} rows={3} maxLength={2000} />}
        </Field>
      ) : null}
      <Button type="submit" disabled={navigation.state === "submitting"}>
        {submitLabel}
      </Button>
    </Form>
  );
}

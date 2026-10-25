import { CircleCheck } from "lucide-react";
import { useSearchParams } from "react-router";
import { Alert, AlertTitle } from "~/components/ui/alert";

/**
 * Success messages after a redirect: actions redirect with ?notice=<key>.
 * Keys are mapped to fixed text, so the URL cannot inject content.
 */
export const NOTICES: Record<string, string> = {
  created: "Saved as a draft.",
  saved: "Changes saved.",
  submitted: "Submitted for review. You will see the result here.",
  withdrawn: "Submission withdrawn. The listing is a draft again.",
  approved: "Approved and published.",
  changes_requested: "Sent back to the employer with your notes.",
  rejected: "Listing rejected.",
  paused: "Listing paused. It is hidden from search and cannot be applied to.",
  resumed: "Listing published again.",
  closed: "Listing closed. It no longer accepts applications.",
  archived: "Listing archived.",
  renewed: "Deadline updated and listing confirmed.",
  confirmed: "Marked as confirmed open today.",
  revision_submitted:
    "Changes submitted for review. The current version stays live until they are approved.",
  revision_approved: "Changes approved and live.",
  revision_changes_requested: "Revision sent back with your notes.",
  revision_rejected: "Revision rejected. The live version is unchanged.",
  revision_withdrawn: "Revision withdrawn.",
  org_created: "Employer added.",
  org_saved: "Employer details saved.",
  verified: "Employer marked as verified.",
  unverified: "Verification removed.",
  suspended: "Employer suspended and their live listings paused.",
  report_resolved: "Report closed.",
  settings_saved: "Settings saved.",
  password_changed: "Password changed. Other devices were signed out.",
  profile_saved: "Company profile saved.",
  user_updated: "Account updated.",
  link_revoked: "Link revoked. It can no longer be used.",
  application_status: "Application status saved.",
  filled: "Done. Closed jobs leave the listings; applicants see their updated status.",
};

export function NoticeBanner() {
  const [params] = useSearchParams();
  const key = params.get("notice");
  const text = key ? NOTICES[key] : undefined;
  if (!text) return null;
  return (
    <Alert variant="success" className="mb-5">
      <CircleCheck aria-hidden="true" />
      <AlertTitle className="font-semibold">{text}</AlertTitle>
    </Alert>
  );
}

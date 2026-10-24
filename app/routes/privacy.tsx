import { ContentPage } from "~/components/content-page";
import { getServices } from "~/lib/context.server";
import { PUBLIC_PAGE_TTL_SECONDS, publicCacheControl } from "~/lib/public-cache.server";
import { getSiteSettings } from "~/services/settings.server";
import type { Route } from "./+types/privacy";

export async function loader({ context }: Route.LoaderArgs) {
  const db = await getServices(context).db();
  return { settings: await getSiteSettings(db) };
}

export function headers() {
  return { "Cache-Control": publicCacheControl(PUBLIC_PAGE_TTL_SECONDS) };
}

export const meta = () => [{ title: "Privacy — Trabaho Biñan" }];

export default function Privacy({ loaderData }: Route.ComponentProps) {
  const { settings } = loaderData;
  return (
    <ContentPage
      title="Privacy"
      intro={<p>What Trabaho Biñan keeps, and why. This is a plain-language summary.</p>}
    >
      <section>
        <h2>If you are looking for work</h2>
        <ul>
          <li>You do not need an account to browse or to apply.</li>
          <li>No advertising or tracking cookies are used.</li>
          <li>
            The site counts job-page views and clicks on application links per day, per job. These
            are totals only; no names, IP addresses or device details are stored with them.
          </li>
          <li>
            When you apply through an employer’s website, email or office, you deal directly with
            the employer, and their own privacy practices apply.
          </li>
        </ul>
      </section>
      <section id="applications">
        <h2>If you apply with your résumé on this site</h2>
        <ul>
          <li>
            Some jobs let you apply here. The site keeps the name, email address, mobile number and
            message you enter, and your résumé file.
          </li>
          <li>
            Only the employer for that job and PESO Biñan staff can see your application. Your
            résumé is stored privately and is never shown publicly. Every download is recorded.
          </li>
          <li>
            Your details are used only to consider you for that job. Applications and résumés are
            deleted automatically about six months after you send them.
          </li>
          <li>
            You can ask for your application to be corrected or deleted sooner. Use the contact
            below and give your application reference.
          </li>
        </ul>
      </section>
      <section>
        <h2>If you report a listing</h2>
        <ul>
          <li>The report stores the reason you chose and any details you write.</li>
          <li>
            Contact details are optional. They are only used to follow up on your report and are
            erased when the report is closed.
          </li>
        </ul>
      </section>
      <section>
        <h2>Employer and staff accounts</h2>
        <ul>
          <li>Accounts store a name, email address, role and, for employers, the organization.</li>
          <li>Passwords are stored only as one-way hashes. Nobody can read your password.</li>
          <li>
            A cookie keeps you signed in. It is needed for the site to work and is not used for
            tracking.
          </li>
          <li>
            Changes to listings, reviews, invitations and account access are recorded with the
            person and time, so that mistakes and misuse can be traced.
          </li>
        </ul>
      </section>
      <section>
        <h2>Hosting</h2>
        <p>
          The site runs on Cloudflare and stores data with Neon in Singapore. Résumés are stored in
          a private Cloudflare R2 bucket in the Asia-Pacific region. These providers keep short-term
          technical logs for security and reliability.
        </p>
      </section>
      <section>
        <h2>Questions and requests</h2>
        <p>
          To ask about your data or request a correction or deletion, contact{" "}
          {settings.operatorName}
          {settings.contactEmail ? (
            <>
              {" "}
              at{" "}
              <a className="link" href={`mailto:${settings.contactEmail}`}>
                {settings.contactEmail}
              </a>
            </>
          ) : null}
          .
        </p>
      </section>
    </ContentPage>
  );
}

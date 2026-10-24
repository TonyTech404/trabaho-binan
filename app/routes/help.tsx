import { Link } from "react-router";
import { ContentPage } from "~/components/content-page";
import { getServices } from "~/lib/context.server";
import { PUBLIC_PAGE_TTL_SECONDS, publicCacheControl } from "~/lib/public-cache.server";
import { getSiteSettings } from "~/services/settings.server";
import type { Route } from "./+types/help";

export async function loader({ context }: Route.LoaderArgs) {
  const db = await getServices(context).db();
  return { settings: await getSiteSettings(db) };
}

export function headers() {
  return { "Cache-Control": publicCacheControl(PUBLIC_PAGE_TTL_SECONDS) };
}

export const meta = () => [
  { title: "Help and safety tips — Trabaho Biñan" },
  {
    name: "description",
    content:
      "How to find and apply for jobs on Trabaho Biñan, and how to stay safe from job scams.",
  },
];

export default function Help({ loaderData }: Route.ComponentProps) {
  const { settings } = loaderData;
  const hasContact = settings.contactEmail || settings.contactPhone || settings.contactNote;
  return (
    <ContentPage
      title="Help and safety tips"
      intro={<p>How to find work on Trabaho Biñan, how to apply, and how to stay safe.</p>}
    >
      <section id="finding">
        <h2>Finding a job</h2>
        <p>
          Search by job title, company or skill, then narrow the list with filters. The education
          and experience filters show jobs you can apply for with what you already have.
        </p>
        <p>
          Every listing shows a closing date on the left. A yellow tab means the job closes within
          three days. Only open vacancies appear in search results.
        </p>
      </section>

      <section id="applying">
        <h2>Applying</h2>
        <p>
          Each job page has a <strong>How to apply</strong> section. Depending on the employer, you
          apply on their website, by email, or in person. Trabaho Biñan does not collect
          applications or résumés.
        </p>
        <p>
          Read the qualifications and closing date before you apply, and prepare the documents the
          listing asks for.
        </p>
      </section>

      <section id="safety">
        <h2>Staying safe</h2>
        <ul>
          <li>
            <strong>Never pay to apply.</strong> Employers should not ask for placement, training,
            medical or processing fees before hiring you.
          </li>
          <li>
            Do not send bank details, one-time passwords (OTP) or copies of IDs to anyone you cannot
            verify.
          </li>
          <li>
            Be careful with job offers that promise very high pay for little work, or that ask you
            to recruit others.
          </li>
          <li>
            Go to interviews at an office or workplace, not a private home. Tell someone where you
            are going.
          </li>
          <li>
            If something feels wrong, use <strong>Report a problem with this listing</strong> on the
            job page. Reports are reviewed and a listing can be taken down while it is checked.
          </li>
        </ul>
      </section>

      <section id="verified">
        <h2>How listings are checked</h2>
        <p>
          Every listing is reviewed before it is published: the job details, the closing date and
          the way to apply. A listing is removed from search when it closes or its deadline passes.
        </p>
        <p>
          <strong>Verified employer</strong> means a reviewer completed the agreed checks on that
          employer or agency. It does not guarantee a job offer, and listings from employers who are
          not yet verified are still reviewed.
        </p>
        <p>
          For recruitment agencies, the listing shows the company you would work for when the agency
          discloses it. The agency office may be in a different place from the job.
        </p>
      </section>

      <section id="employers">
        <h2>For employers</h2>
        <p>
          Employer accounts are by invitation during the pilot. Ask {settings.operatorName} for an
          invitation. Once your account is set up, you can submit vacancies, see review feedback and
          close a job as soon as it is filled.
        </p>
      </section>

      <section id="about">
        <h2>About this site</h2>
        <p>
          Trabaho Biñan is a pro bono community initiative to make local job vacancies easier to
          find. It is run by {settings.operatorName}. It is not an official website of the City
          Government of Biñan or of PESO Biñan.
        </p>
        <p>
          Read the{" "}
          <Link to="/privacy" className="link">
            privacy information
          </Link>{" "}
          to see what data the site keeps.
        </p>
      </section>

      <section id="contact">
        <h2>Contact</h2>
        {hasContact ? (
          <ul>
            {settings.contactEmail ? (
              <li>
                Email:{" "}
                <a className="link" href={`mailto:${settings.contactEmail}`}>
                  {settings.contactEmail}
                </a>
              </li>
            ) : null}
            {settings.contactPhone ? <li>Phone: {settings.contactPhone}</li> : null}
            {settings.contactNote ? <li>{settings.contactNote}</li> : null}
          </ul>
        ) : (
          <p>
            Contact details will be published here. Until then, use the report link on a job page to
            reach the review team.
          </p>
        )}
      </section>
    </ContentPage>
  );
}

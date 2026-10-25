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
          Every listing shows its closing date. A yellow “Closes in …” label means the job closes
          within three days. Only open vacancies appear in search results.
        </p>
      </section>

      <section id="applying">
        <h2>Applying</h2>
        <p>
          Each job page has a <strong>How to apply</strong> section. Some jobs let you apply right
          here: it goes to the employer and to PESO Biñan, and you get a reference number. You need
          a mobile number. A résumé is optional: you can attach photos of your papers, or write your
          work experience instead. For other jobs you apply on the employer’s website, by email or
          in person. Listings copied from other sites send you to the original announcement.
        </p>
        <p>
          To see what happened to an application you sent here, go to{" "}
          <Link to="/application-status" className="link">
            Check your application
          </Link>{" "}
          and enter your reference and mobile number.
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
          Listings that employers submit, or that PESO staff add, are reviewed before they are
          published: the job details, the closing date and the way to apply. A listing is removed
          from search when it closes or its deadline passes.
        </p>
        <p>
          Some listings are copied from public announcements, such as government vacancy notices or
          an employer’s own careers page. They are published when the announcement states a closing
          date, but they have not been confirmed with the employer. Their description ends with the
          source, and their application link opens the original announcement. Check it before you
          apply.
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
          Trabaho Biñan is the job portal of the Public Employment Service Office (PESO) of the City
          Government of Biñan. It makes current local vacancies easier to find, check and share.
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

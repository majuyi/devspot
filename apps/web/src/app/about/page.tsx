import type { Metadata } from "next";
import Link from "next/link";
import { LINK, P, ProsePage, ProseSection } from "@/components/prose-page";
import { REPO_URL } from "@/data/site";

export const metadata: Metadata = {
  title: "About",
  description: "What this site lists, where every listing comes from, and what it will never do.",
  alternates: { canonical: "/about" },
};

/** `/about` (docs/01 §3): a static page. The copy is the maintainer's to change. */
export default function About() {
  return (
    <ProsePage
      title="About"
      intro="Opportunities for early-career tech people in Nigeria, in one place, with every deadline in West Africa Time."
    >
      <ProseSection title="What is listed">
        <P>
          Internships, jobs, fellowships, scholarships, grants, hackathons, open-source programmes,
          events, competitions, accelerators and bootcamps. The aim is that nobody misses a deadline
          because they did not hear about it in time.
        </P>
      </ProseSection>

      <ProseSection title="Where it comes from">
        <P>
          Every listing is read from the organisation's own page: a careers page, a programme page,
          a feed. We read each one every six hours, link to it, and show when we last checked it.
          The{" "}
          <Link href="/status" className={LINK}>
            status page
          </Link>{" "}
          shows which sources were read on time and which need attention.
        </P>
      </ProseSection>

      <ProseSection title="What we do not do">
        <P>
          We do not decide who can apply. Requirements are shown word for word, as the organisation
          states them, and you should read the source page before you apply.
        </P>
        <P>We never guess a date. If a page states no deadline, the listing says so.</P>
        <P>
          We never ask for money, documents or a login. You always apply on the organisation's own
          site.
        </P>
        <P>
          There are no accounts and no tracking. A saved feed is kept in a cookie on your own
          device.
        </P>
      </ProseSection>

      <ProseSection title="When something is wrong">
        <P>
          Each listing has a "Report this listing" link, or you can{" "}
          <a href={`${REPO_URL}/issues/new`} className={LINK}>
            open an issue on GitHub
          </a>
          . A wrong deadline is the most important thing to fix.
        </P>
      </ProseSection>

      <ProseSection title="Open">
        <P>
          The code is open source under the Apache-2.0 licence, and the list of organisations is in
          the public domain. Anyone can{" "}
          <Link href="/contribute" className={LINK}>
            add an organisation
          </Link>
          . The data is also available as an{" "}
          <a href="/api/v1/openapi.json" className={LINK}>
            open API
          </a>{" "}
          and a{" "}
          <Link href="/calendar#subscribe" className={LINK}>
            calendar feed
          </Link>
          .
        </P>
      </ProseSection>
    </ProsePage>
  );
}

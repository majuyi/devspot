import type { Metadata } from "next";
import Link from "next/link";
import { LINK, P, ProsePage, ProseSection } from "@/components/prose-page";
import { REPO_URL } from "@/data/site";

export const metadata: Metadata = {
  title: "Contribute",
  description: "Add an organisation, report a wrong listing, or fix a source that stopped working.",
  alternates: { canonical: "/contribute" },
};

const code = "text-date rounded-[4px] bg-raise px-1 text-[14px]";

/** `/contribute` (docs/01 §3): the short version of CONTRIBUTING.md, for readers. */
export default function Contribute() {
  return (
    <ProsePage
      title="Contribute"
      intro="The list is only as good as the organisations in it. Most help needs no code."
    >
      <ProseSection title="Add an organisation">
        <P>
          This is the most useful thing you can do, and it takes under an hour. Find the page an
          organisation updates when it announces something, such as its careers page, a programme
          page or a blog, and check whether it has a feed. Then copy{" "}
          <a href={`${REPO_URL}/blob/main/registry/organizations/_template.yaml`} className={LINK}>
            the template
          </a>
          , fill it in, and open a pull request titled{" "}
          <span className={code}>registry: add &lt;name&gt;</span>.
        </P>
      </ProseSection>

      <ProseSection title="Report a wrong listing">
        <P>
          Use "Report this listing" on the listing's page, or{" "}
          <a href={`${REPO_URL}/issues/new`} className={LINK}>
            open an issue
          </a>{" "}
          with its address and what is wrong. Wrong deadlines matter most.
        </P>
      </ProseSection>

      <ProseSection title="Fix a source that stopped working">
        <P>
          The{" "}
          <Link href="/status" className={LINK}>
            status page
          </Link>{" "}
          lists every source, worst first. A stale or erroring one usually needs a new address or a
          repaired reader, which makes it a good first issue.
        </P>
      </ProseSection>

      <ProseSection title="Write code">
        <P>
          Readers for sites without a feed, fixes and features are welcome. Everything you need to
          set up, and the rules every change follows, is in{" "}
          <a href={`${REPO_URL}/blob/main/CONTRIBUTING.md`} className={LINK}>
            CONTRIBUTING.md
          </a>
          . Small pull requests, one change each.
        </P>
      </ProseSection>
    </ProsePage>
  );
}

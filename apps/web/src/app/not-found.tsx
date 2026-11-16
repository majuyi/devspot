import type { Metadata } from "next";
import { ButtonLink } from "@/components/blocks";

export const metadata: Metadata = { title: "Not found" };

/** docs/01 §1 Errors: an unknown address explains itself and links to browse. */
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-content flex-col items-start gap-3 px-4 py-12 md:px-6">
      <h1 className="text-page-title m-0">Nothing at this address</h1>
      <p className="text-body m-0 max-w-[60ch] text-muted">
        The page may have moved, or the listing may never have been published. Everything open is on
        the opportunities page.
      </p>
      <ButtonLink href="/opportunities">See all opportunities</ButtonLink>
    </main>
  );
}

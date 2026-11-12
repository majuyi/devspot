import type { Metadata } from "next";
import { ComponentsGallery } from "@/components/gallery";

export const metadata: Metadata = {
  title: "Components",
  robots: { index: false, follow: false },
};

/** Not in the sitemap. Rendered at build; countdowns move to the client clock. */
export default function ComponentsPage() {
  return <ComponentsGallery now={new Date()} />;
}

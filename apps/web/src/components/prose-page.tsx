import type { ReactNode } from "react";

/** A static text page (`/about`, `/contribute`): `prose` at 68ch (docs/07 §2). */
export function ProsePage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-content px-4 pt-6 pb-10 md:px-6">
      <div className="flex max-w-[68ch] flex-col gap-3">
        <h1 className="text-page-title m-0">{title}</h1>
        <p className="text-prose m-0 text-muted">{intro}</p>
        {children}
      </div>
    </main>
  );
}

export function ProseSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 pt-5">
      <h2 className="text-section m-0">{title}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-prose m-0">{children}</p>;
}

export const LINK = "underline underline-offset-[3px]";

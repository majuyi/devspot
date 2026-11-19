import type { Metadata } from "next";
import type { ReactNode } from "react";
import { logout } from "@/admin/actions";
import { adminDbConfigured } from "@/admin/db";
import { isAdmin } from "@/admin/session";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

/** The maintainer's area (docs/01 §4). Plain and desktop-first: one person uses it. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const signedIn = await isAdmin();
  return (
    <div className="mx-auto max-w-content px-4 pb-12 md:px-6">
      <div className="flex items-center justify-between gap-3 border-b border-line py-2">
        <a
          href="/admin"
          className="text-[13px] font-semibold tracking-[0.04em] uppercase no-underline"
        >
          Admin
        </a>
        {signedIn ? (
          <div className="flex items-center gap-1">
            <a
              href="/admin/new"
              className="flex h-target items-center rounded-pill px-3 text-[13px] font-medium no-underline hover:bg-raise"
            >
              New opportunity
            </a>
            <form action={logout}>
              <button
                type="submit"
                className="flex h-target items-center rounded-pill px-3 text-[13px] text-muted hover:bg-raise hover:text-fg"
              >
                Log out
              </button>
            </form>
          </div>
        ) : null}
      </div>
      {signedIn && !adminDbConfigured() ? (
        <p
          role="alert"
          className="text-body m-0 mt-6 max-w-[68ch] rounded-tile border border-line bg-raise px-3.5 py-3"
        >
          Admin has no database connection. Set ADMIN_DATABASE_URL to the admin role's connection
          string (docs/09 §3) and redeploy.
        </p>
      ) : (
        children
      )}
    </div>
  );
}

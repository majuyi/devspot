import type { Metadata } from "next";
import { login } from "@/admin/actions";
import { adminToken } from "@/admin/auth";
import { go } from "@/admin/go";
import { isAdmin } from "@/admin/session";
import { buttonClass } from "@/components/blocks";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  wrong: "That token is not right.",
  wait: "Too many tries. Wait a minute, then try again.",
  off: "Admin is switched off: ADMIN_TOKEN is not set, or is shorter than 32 characters.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** docs/01 §4: a token form that sets the signed cookie. */
export default async function Login({ searchParams }: Props) {
  if (await isAdmin()) go("/admin");
  const code = (await searchParams).error;
  const error = typeof code === "string" ? ERRORS[code] : undefined;
  const off = !adminToken();
  return (
    <main className="flex max-w-[420px] flex-col gap-4 py-10">
      <h1 className="text-page-title m-0">Sign in</h1>
      {(error ?? (off ? ERRORS.off : undefined)) ? (
        <p
          role="alert"
          className="text-body m-0 rounded-tile border border-line bg-raise px-3.5 py-3"
        >
          {error ?? ERRORS.off}
        </p>
      ) : null}
      <form action={login} className="flex flex-col gap-3">
        <label htmlFor="token" className="text-[13px] font-medium">
          Admin token
        </label>
        <input
          id="token"
          name="token"
          type="password"
          required
          autoComplete="current-password"
          className="h-target rounded-tile border border-line bg-surface px-3 text-[16px] text-fg"
        />
        <button type="submit" className={`${buttonClass("primary")} w-fit`}>
          Sign in
        </button>
      </form>
    </main>
  );
}

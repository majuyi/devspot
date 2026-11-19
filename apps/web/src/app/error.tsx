"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/blocks";

/**
 * docs/01 §1 Errors: when a page fails, the header and footer still render and the reader
 * gets a way to try again. Never a blank page. The details go to the server log, not here.
 */
export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex max-w-content flex-col items-start gap-3 px-4 py-12 md:px-6">
      <h1 className="text-page-title m-0">Something went wrong</h1>
      <p className="text-body m-0 max-w-[60ch] text-muted">
        This page could not be loaded just now. Nothing was lost. Try again, or go back to the home
        page.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={reset} className={buttonClass("primary")}>
          Try again
        </button>
        {/* A full load, not a client transition: the app's state may be what failed. */}
        <a href="/" className={buttonClass("secondary")}>
          Home
        </a>
      </div>
      {error.digest ? (
        <p className="text-date m-0 text-[12px] text-faint">Reference {error.digest}</p>
      ) : null}
    </main>
  );
}

"use client";

import { useEffect, useRef } from "react";

/**
 * The search field. The header's search button links to `/opportunities#q`; a fragment only
 * scrolls to a field, so this focuses it. Without JavaScript the scroll still happens.
 */
export function SearchInput({ defaultValue }: { defaultValue?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (window.location.hash === "#q") ref.current?.focus();
  }, []);
  return (
    <input
      ref={ref}
      id="q"
      name="q"
      type="search"
      defaultValue={defaultValue}
      maxLength={200}
      placeholder="Search opportunities"
      autoComplete="off"
      // 16px: iOS zooms the page on focus for anything smaller.
      className="h-target min-w-0 flex-1 rounded-pill border border-line bg-surface px-4 text-[16px] text-fg placeholder:text-faint"
    />
  );
}

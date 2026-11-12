"use client";

import { useSyncExternalStore } from "react";

// One shared minute timer for every countdown on the page.
let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const l of listeners) l();
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/**
 * The current time. The server and the first client render use `serverNow`, the instant the
 * page was rendered, so hydration matches; then the client moves to its own clock, which
 * fixes a cached page's countdowns (pages can be 15 minutes old).
 */
export function useNow(serverNow: string): Date {
  const ms = useSyncExternalStore(
    subscribe,
    () => current,
    () => Date.parse(serverNow),
  );
  return new Date(ms);
}

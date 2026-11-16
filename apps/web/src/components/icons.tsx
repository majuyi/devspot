// Inline SVG icons (docs/07 §10): currentColor, hidden from assistive tech; label the control.
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function CalendarAddIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true" {...base}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4M12 12.8v5M9.5 15.3h5" />
    </svg>
  );
}

export function ArrowIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth="2"
      aria-hidden="true"
      {...base}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function NotStatedIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true" {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" strokeWidth="2.4" aria-hidden="true" {...base}>
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" aria-hidden="true" {...base}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" strokeWidth="2.2" aria-hidden="true" {...base}>
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.8" aria-hidden="true" {...base}>
      <path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

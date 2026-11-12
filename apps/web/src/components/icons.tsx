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

/** 36px tile: the organisation's logo on `logo-tile`, or its initial on `raise`. Decorative. */
export function LogoTile({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-tile border border-[#dfe3e7] bg-logo-tile"
      >
        {/* biome-ignore lint/performance/noImgElement: tiny curated logos; next/image adds client JS for nothing here. */}
        <img src={logoUrl} alt="" width={24} height={24} loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-tile border border-line bg-raise text-[14px] font-semibold text-muted"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getOpportunity } from "@/data/opportunities";
import { closedLine, deadlineView } from "@/ui/deadline";
import { KIND_FAMILY, KIND_LABEL } from "@/ui/kind";
import { placeLabel } from "@/ui/place";
import { sourceDomain } from "@/ui/time";

export const alt = "The opportunity's title, organisation and deadline";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The light theme's tokens (styles/tokens.css): an image has no stylesheet to read them from.
const C = { bg: "#F6F7F8", line: "#DFE3E7", fg: "#111316", muted: "#555B62" };
const TINT = {
  work: ["#E3ECFB", "#1F4FA8"],
  build: ["#EEE7FB", "#5B34B0"],
  events: ["#DDF1EE", "#0E6A5E"],
  funding: ["#E5F0DF", "#3C6A2A"],
  prog: ["#E6E8F3", "#3D4A7A"],
} as const;

// The CDN keeps an image as long as a page, so a chat app's crawlers do not each cost a
// database read and a render, and a moved deadline still shows within 15 minutes.
const CACHE = { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400" };

const font = (file: string) => readFile(join(process.cwd(), "assets/og", file));

/** Board "Share image · 1200 × 630": wordmark, kind, title, who and where, the deadline. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const o = await getOpportunity((await params).slug);
  const [regular, semibold, mono] = await Promise.all([
    font("Geist-Regular.ttf"),
    font("Geist-SemiBold.ttf"),
    font("GeistMono-Medium.ttf"),
  ]);
  const fonts = [
    { name: "Geist", data: regular, weight: 400 as const },
    { name: "Geist", data: semibold, weight: 600 as const },
    { name: "Geist Mono", data: mono, weight: 500 as const },
  ];
  const wordmark = (
    <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.035em" }}>devspot</span>
  );
  if (!o) {
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.bg,
          color: C.fg,
          fontFamily: "Geist",
        }}
      >
        {wordmark}
      </div>,
      { ...size, fonts, headers: CACHE },
    );
  }

  const view = deadlineView(o);
  const closed = o.status === "closed";
  const [tagBg, tagFg] = TINT[KIND_FAMILY[o.kind]];
  // Long titles step down so three lines always fit above the rule.
  const titleSize = o.title.length > 70 ? 46 : o.title.length > 40 ? 54 : 62;
  const label = closed ? "Closed" : view.type === "dated" ? view.label : "Deadline";
  const value = closed
    ? closedLine(o)
    : view.type === "dated"
      ? view.line.slice(view.label.length + 1)
      : view.headline;
  const dated = !closed && view.type === "dated";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 64px",
        background: C.bg,
        color: C.fg,
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {wordmark}
        <span
          style={{
            padding: "6px 16px",
            borderRadius: 10,
            background: tagBg,
            color: tagFg,
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          {KIND_LABEL[o.kind]}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <span
          style={{
            fontSize: titleSize,
            lineHeight: 1.1,
            fontWeight: 600,
            letterSpacing: "-0.035em",
            maxWidth: 1000,
            // Satori's line clamp: at most three lines, then an ellipsis.
            display: "block",
            lineClamp: 3,
          }}
        >
          {o.title}
        </span>
        <span style={{ fontSize: 30, color: C.muted }}>
          {o.organization.name} · {placeLabel(o)}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 32,
          paddingTop: 28,
          borderTop: `2px solid ${C.line}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 24, color: C.muted }}>{label}</span>
          <span
            style={
              dated
                ? {
                    fontFamily: "Geist Mono",
                    fontSize: 46,
                    fontWeight: 500,
                    letterSpacing: "-0.04em",
                  }
                : { fontSize: 40, fontWeight: 600, letterSpacing: "-0.025em" }
            }
          >
            {value}
          </span>
        </div>
        <span style={{ fontFamily: "Geist Mono", fontSize: 24, color: C.muted, paddingBottom: 6 }}>
          {sourceDomain(o.canonicalUrl)}
        </span>
      </div>
    </div>,
    { ...size, fonts, headers: CACHE },
  );
}

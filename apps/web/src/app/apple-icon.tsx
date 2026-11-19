import { ImageResponse } from "next/og";

// The home-screen icon iPhones use (180 px, no transparency): the same mark as icon.svg,
// on the light ground. A placeholder until the brand at M5.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const D =
  "M260 -12Q192 -12 142.5 22.0Q93 56 66.0 119.0Q39 182 39 267Q39 352 66.0 415.0Q93 478 143.0 512.0Q193 546 260 546Q316 546 358.5 523.0Q401 500 423 458V710H551V0H429L426 79Q404 36 360.0 12.0Q316 -12 260 -12ZM299 92Q339 92 366.5 112.0Q394 132 408.5 171.5Q423 211 423 267Q423 324 408.5 363.0Q394 402 366.5 422.0Q339 442 299 442Q241 442 206.5 395.5Q172 349 172 267Q172 187 206.5 139.5Q241 92 299 92Z";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f7f8" }}>
      <svg width="180" height="180" viewBox="0 0 1000 1000" aria-hidden="true">
        <path fill="#111316" transform="matrix(1 0 0 -1 205 849)" d={D} />
      </svg>
    </div>,
    size,
  );
}

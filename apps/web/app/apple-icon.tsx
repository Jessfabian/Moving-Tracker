import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iPhone (iOS ignores SVG icons). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d0f" }}>
        <svg width="112" height="112" viewBox="0 0 24 24" fill="none" stroke="#d7ff3e" strokeWidth="2.2" strokeLinejoin="round">
          <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
          <path d="M3 7.5 12 12l9-4.5M12 12v9" />
        </svg>
      </div>
    ),
    size,
  );
}

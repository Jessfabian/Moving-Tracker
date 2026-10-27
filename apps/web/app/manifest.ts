import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Moving Tracker",
    short_name: "Moving",
    description: "Plan and track every detail of your move.",
    start_url: "/",
    display: "standalone",
    // "any" lets it follow the phone: portrait, landscape, the Duo's outer display or opened up.
    orientation: "any",
    background_color: "#f3f1ec",
    theme_color: "#f3f1ec",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
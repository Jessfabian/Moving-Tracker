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
    // Home Screen quick actions (long-press the app icon on Android; HIG "Home Screen quick actions").
    shortcuts: [
      { name: "Scan an item", short_name: "Scan", url: "/scan", icons: [{ src: "/icon.svg", sizes: "any" }] },
      { name: "Add to inventory", short_name: "Inventory", url: "/inventory" },
      { name: "Checklist", short_name: "Checklist", url: "/tasks" },
      { name: "Calendar", short_name: "Calendar", url: "/calendar" },
    ],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
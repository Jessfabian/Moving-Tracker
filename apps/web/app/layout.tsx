import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { NAV_POSITION_SCRIPT } from "@/lib/navPositionScript";
import { StoreProvider } from "@/lib/store-context";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display-face", display: "swap", weight: ["500", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Moving Tracker", template: "%s · Moving Tracker" },
  description: "Plan every detail of a long-distance move: checklist, family, inventory, boxes, books, quotes, paperwork and budget.",
  appleWebApp: { capable: true, title: "Moving Tracker", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Stops iOS auto-zooming into focused fields; pinch-zoom still works in iOS Safari.
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f1ec",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NAV_POSITION_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}

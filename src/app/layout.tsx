import type { Metadata, Viewport } from "next";
import { AnimatedFavicon } from "@/ui/AnimatedFavicon";
import { ojuju } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARCHIVE — The Sound of Nigeria",
  description: "An interactive museum of Nigerian music, 1900–2026: 126 years of rhythm, reinvention and influence.",
  // The first instrument frame; AnimatedFavicon cycles the rest (scripts/build-favicons.mjs).
  icons: {
    icon: { url: "/icons/favicon/trumpet.png", type: "image/png", sizes: "64x64" },
    apple: { url: "/icons/favicon/apple-touch-icon.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d1d1f",
  // Lets the HUD reach the edges on notched / rounded screens; its padding uses env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={ojuju.variable}>
      <body>
        {children}
        <AnimatedFavicon />
      </body>
    </html>
  );
}

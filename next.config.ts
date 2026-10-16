import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Development only: let devices on the local network (e.g. a phone on the same Wi-Fi) load the
  // dev server's scripts. Update the address if this machine's LAN IP changes.
  allowedDevOrigins: ["10.190.77.42"],
  // Keep the dev-only Next.js badge away from the bottom-left focus label.
  devIndicators: { position: "bottom-right" },
  // A stray package-lock.json in the user's home directory otherwise makes Next guess the wrong root.
  turbopack: { root: __dirname },
};

export default nextConfig;

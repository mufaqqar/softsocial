import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Dockerfile runs .next/standalone/server.js.
  output: "standalone",
  // Media is streamed through /api/media/[id] so every byte a user downloads is
  // checked against their workspace membership. No remote image hosts are
  // trusted, so no images.remotePatterns entry is required.
  typedRoutes: true,
  experimental: {
    taint: true,
  },
};

export default nextConfig;

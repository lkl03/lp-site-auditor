import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["cheerio"],
  eslint: {
    // ESLint runs separately via `npm run lint` — skip during builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

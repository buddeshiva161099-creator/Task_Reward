import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  typescript: {
    // Skip typescript type checking during production builds for speed
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

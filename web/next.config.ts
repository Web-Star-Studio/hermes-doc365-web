import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Standalone output so the Dockerfile can run `node server.js` directly
  // without shipping node_modules.
  output: "standalone",
  // App Router is the default in Next.js 15.
  experimental: {
    // Server Actions are on by default in 15.
  },
  // MinIO / S3-compatible hosts may serve user-uploaded images if we ever
  // render them directly. For MVP we don't expose images in <Image>, so no
  // remotePatterns needed yet.
  images: {
    remotePatterns: [],
  },
};

export default config;

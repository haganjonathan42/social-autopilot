import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project sits under a home directory that has its own lockfile, which
  // Next would otherwise pick as the workspace root.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;

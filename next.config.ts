import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

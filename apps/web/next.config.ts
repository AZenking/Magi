import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@magi/ui", "@magi/types", "@magi/utils"],
};

export default nextConfig;

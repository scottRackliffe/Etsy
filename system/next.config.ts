import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/sales", destination: "/orders", permanent: true },
      { source: "/config", destination: "/settings", permanent: true },
    ];
  },
};

export default nextConfig;

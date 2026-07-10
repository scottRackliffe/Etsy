import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its font-metric (.afm) files from disk at runtime via a
  // relative path. Bundling it breaks that path resolution (ENOENT on
  // Helvetica.afm), so keep it external and load it from node_modules.
  serverExternalPackages: ["pdfkit"],
  async redirects() {
    return [
      { source: "/sales", destination: "/orders", permanent: true },
      { source: "/config", destination: "/settings", permanent: true },
    ];
  },
};

export default nextConfig;

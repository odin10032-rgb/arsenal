import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai", "space-z.ai"],
  async rewrites() {
    return {
      /* La racine sert la SPA vanilla (public/index.html) — le hash #admin
         reste côté navigateur, aucune redirection ne le casse. */
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        { source: "/admin", destination: "/index.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;

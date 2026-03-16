import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["tesseract.js", "pdf-parse"],
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"],
    optimizePackageImports: ["lucide-react"],
  },
};
module.exports = nextConfig;

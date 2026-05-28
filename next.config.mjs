/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // pdf-parse v2 depends on pdfjs-dist + @napi-rs/canvas (native).
  // Keep them as runtime CJS requires instead of bundling, otherwise
  // Vercel serverless can't resolve the native canvas binding and
  // pdf extraction throws silently.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  },
};

export default nextConfig;

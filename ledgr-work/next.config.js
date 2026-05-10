/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Prevent Next.js from bundling Prisma through webpack; the native
    // query engine binary must be resolved at runtime, not compile time.
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
};

module.exports = nextConfig;

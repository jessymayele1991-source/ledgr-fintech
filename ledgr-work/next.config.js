/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Next.js from bundling Prisma through webpack — the native
  // query engine binary must be resolved at runtime, not compile time.
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
};

module.exports = nextConfig;

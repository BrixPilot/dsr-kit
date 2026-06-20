/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@dsr-kit/core",
    "@dsr-kit/adapter-prisma",
    "@dsr-kit/connector-stripe",
    "@dsr-kit/connector-resend",
    "@dsr-kit/nextjs",
  ],
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    // better-sqlite3 ships a native binding that cannot be bundled — Next must
    // require it from node_modules at runtime instead.
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

module.exports = nextConfig;

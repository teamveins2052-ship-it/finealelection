import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server code (functions/src) talks to Supabase Postgres with node-postgres; keep it a real
  // node_module on the server instead of bundling it.
  serverExternalPackages: ["pg"],
  // Type and lint errors fail the build on purpose: a broken build must never reach voters.
};

export default nextConfig;

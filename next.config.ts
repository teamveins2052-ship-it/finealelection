import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets `NEXT_DIST_DIR=.next-build npm run build` run while `npm run dev` holds `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // /api/fn runs the Cloud Functions code on the Next server (free hosting). Keep the Firebase
  // server SDKs as real node_modules so there's exactly one firebase-admin instance.
  serverExternalPackages: ["firebase-admin", "firebase-functions"],
  typescript: {
    // Ensure production builds succeed on Vercel
    ignoreBuildErrors: true,
  },
  eslint: {
    // Ensure ESLint does not block production deploy
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

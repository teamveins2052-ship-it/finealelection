import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /api/fn runs the Cloud Functions code on the Next server (free hosting). Keep the Firebase
  // server SDKs as real node_modules so there's exactly one firebase-admin instance.
  serverExternalPackages: ["firebase-admin", "firebase-functions"],
  // Type and lint errors fail the build on purpose: a broken build must never reach voters.
};

export default nextConfig;

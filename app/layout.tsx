import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/shared/providers";
import "./globals.css";

// Use bundled local fonts — zero network requests, 100% reliable on Vercel builds.
const display = localFont({
  src: "../public/assets/fonts/luckiest-guy-latin.woff2",
  variable: "--font-display-face",
  display: "swap",
});

const nunito = localFont({
  src: "../public/assets/fonts/nunito-latin.woff2",
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NIAT Elections '26",
  description: "Your campus. Your vote.",
  applicationName: "NIAT Votes",
};

export const viewport: Viewport = {
  themeColor: "#F2F1EC",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${nunito.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

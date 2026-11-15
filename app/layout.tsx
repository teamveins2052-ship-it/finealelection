import type { Metadata, Viewport } from "next";
import { Bowlby_One, JetBrains_Mono, Nunito } from "next/font/google";
import { Providers } from "@/components/shared/providers";
import "./globals.css";

// Self-hosted by next/font at build time → no layout shift, no runtime Google request.
// Display: chunky poster lettering. Body: rounded, friendly sans. Mono: receipt codes.
const display = Bowlby_One({ variable: "--font-display-face", subsets: ["latin"], weight: "400", display: "swap" });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "600", "700", "800", "900"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["600"], display: "swap" });

export const metadata: Metadata = {
  title: "NIAT Elections '26",
  description: "Your campus. Your vote.",
  applicationName: "NIAT Votes",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F1EC" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${nunito.variable} ${jetbrains.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

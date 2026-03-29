import type { Metadata, Viewport } from "next";
import "./globals.css";
import PWARegistration from "@/components/PWARegistration";

export const metadata: Metadata = {
  title: "TeslaPulse — AI Co-Pilot Dashboard",
  description: "Real-time Tesla telemetry with AI-powered driving insights",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TeslaPulse",
  },
};

export const viewport: Viewport = {
  themeColor: "#00d4ff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-screen bg-bg antialiased">
        {children}
        <PWARegistration />
      </body>
    </html>
  );
}

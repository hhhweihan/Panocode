import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RuntimeSettingsProvider } from "@/components/RuntimeSettingsProvider";
import TopRightControls from "@/components/TopRightControls";
import { THEME_INIT_SCRIPT } from "@/lib/themeShared";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Panocode — GitHub Repository Explorer",
  description: "AI-powered repository analysis workspace for understanding GitHub repositories and local projects",
  icons: {
    icon: "/hi-mark.svg",
    shortcut: "/hi-mark.svg",
    apple: "/hi-mark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <RuntimeSettingsProvider>
          <TopRightControls />
          {children}
        </RuntimeSettingsProvider>
      </body>
    </html>
  );
}

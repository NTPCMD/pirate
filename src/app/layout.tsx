import type { Metadata } from "next";
import { Geist, Geist_Mono, Pirata_One } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/pirate/ThemeProvider";
import { SoundProvider } from "@/components/pirate/SoundManager";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pirata = Pirata_One({
  variable: "--font-pirata",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pirate Game — Multiplayer Treasure Hunt",
  description:
    "A real-time multiplayer pirate treasure game by Mr Stephen Corcoran — Σ(Cor)²an. Host calls coordinates, players reveal hidden squares, power cards activate.",
  keywords: ["pirate game", "multiplayer", "treasure", "kahoot", "real-time", "socket.io"],
  authors: [{ name: "Mr Stephen Corcoran" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pirata.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <ThemeProvider>
          <SoundProvider>
            {children}
            <Toaster />
          </SoundProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
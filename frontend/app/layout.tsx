import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { ModelProvider } from "@/lib/contexts/model-context";
import { ProjectProvider } from "@/lib/contexts/project-context";
import { Suspense } from "react";
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
  title: "Script Factory AI",
  description: "全流程 AI 短剧创作工作站",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex h-screen overflow-hidden`}
      >
        <Suspense fallback={<div>Loading...</div>}>
          <ModelProvider>
            <ProjectProvider>
              <AppShell>{children}</AppShell>
            </ProjectProvider>
          </ModelProvider>
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}

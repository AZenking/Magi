import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@magi/ui/components/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAGI - EPG Manager",
  description: "Personal EPG + Live TV Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}

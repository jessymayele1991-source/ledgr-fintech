import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

export const metadata: Metadata = {
  title: "Ledgr — Financial Clarity",
  description: "Professional bookkeeping for modern businesses",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-gray-50 font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

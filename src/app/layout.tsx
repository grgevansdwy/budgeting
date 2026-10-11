import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { HydrationGate } from "@/components/HydrationGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Budget",
  description:
    "Monthly statement review, splits and Excel export. Runs entirely in your browser.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <HydrationGate>
          <AppNav />
          {children}
        </HydrationGate>
      </body>
    </html>
  );
}

import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Distill — Research Wiki Compiler",
  description: "Turn any research topic into a living knowledge wiki.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";

import { SHINDIG_SITE } from "../lib/site";

import "./globals.css";

export const metadata: Metadata = {
  title: SHINDIG_SITE.title,
  description: SHINDIG_SITE.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

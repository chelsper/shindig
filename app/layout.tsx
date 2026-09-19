import type { Metadata } from "next";

import { OYSTER_ROAST_EVENT } from "../lib/oyster-roast-event";

import "./globals.css";

export const metadata: Metadata = {
  title: OYSTER_ROAST_EVENT.title,
  description: `Join us for an oyster roast on ${OYSTER_ROAST_EVENT.dateLabel} at ${OYSTER_ROAST_EVENT.timeLabel} in ${OYSTER_ROAST_EVENT.cityLabel}.`,
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

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Another Annualish Oyster Roast",
  description:
    "Join us for an oyster roast on November 7 at 5 PM in St. Johns, Florida.",
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

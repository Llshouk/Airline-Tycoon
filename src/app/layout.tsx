import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airline Tycoon V1.0.2",
  description: "A browser-based airline management simulation MVP."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airline Tycoon V1.1.0",
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

import type { Metadata } from "next";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airline Tycoon V1.3.3",
  description: "A browser-based airline management simulation MVP.",
  ...(process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" ? {} : { manifest: "/manifest.json" })
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}

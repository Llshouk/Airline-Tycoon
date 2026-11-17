import type { Metadata } from "next";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airline Tycoon",
  description: "Build and run your own airline: buy aircraft, open routes, plan timetables and keep the fleet flying.",
  other: {
    "airline-tycoon-maintenance": "home-return-v2",
    ...(process.env.VERCEL_GIT_COMMIT_SHA ? { "airline-tycoon-revision": process.env.VERCEL_GIT_COMMIT_SHA } : {})
  },
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

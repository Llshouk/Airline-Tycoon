import { notFound } from "next/navigation";
import { MapHarnessClient } from "./MapHarnessClient";

export default function MapHarnessPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return <MapHarnessClient />;
}

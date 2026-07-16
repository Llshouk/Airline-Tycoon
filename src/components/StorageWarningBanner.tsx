"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import { getStorageWarning, type StorageWriteResult } from "@/lib/gameSaveStorage";

export function StorageWarningBanner() {
  const { t } = useTranslation();
  const [warning, setWarning] = useState<StorageWriteResult | null>(null);

  useEffect(() => {
    const updateWarning = () => setWarning(getStorageWarning());
    updateWarning();
    window.addEventListener("airline-tycoon-storage-warning", updateWarning);
    return () => window.removeEventListener("airline-tycoon-storage-warning", updateWarning);
  }, []);

  if (!warning || warning.ok) return null;

  return (
    <div role="status" className="fixed inset-x-3 top-3 z-[10000] mx-auto max-w-3xl rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 shadow-soft">
      {warning.reason === "quota" ? t("save.localStorageFull") : t("save.localStorageUnavailable")}
    </div>
  );
}

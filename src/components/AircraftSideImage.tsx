"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";

type AircraftSideImageProps = {
  src?: string;
  alt: string;
  size?: "small" | "medium" | "large";
  className?: string;
  imageScale?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
};

const sizeClass = {
  small: "h-16",
  medium: "h-32",
  large: "h-48"
};

export function AircraftSideImage({
  src,
  alt,
  size = "medium",
  className = "",
  imageScale = 1,
  imageOffsetX = 0,
  imageOffsetY = 0
}: AircraftSideImageProps) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div className={`relative flex w-full items-center justify-center overflow-hidden rounded-md border border-slate-100 bg-white ${sizeClass[size]} ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="max-h-full max-w-full object-contain"
          style={{ transform: `translate(${imageOffsetX}px, ${imageOffsetY}px) scale(${imageScale})` }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-runway px-3 text-center text-xs font-black text-slate-500">
          {t("aircraft.imageComingSoon")}
        </div>
      )}
    </div>
  );
}

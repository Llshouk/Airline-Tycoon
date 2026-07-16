"use client";

export function GlobeLoadingFallback({ label = "Loading 3D Globe..." }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[360px] items-center justify-center bg-slate-950 px-6 text-center text-sm font-bold text-slate-200">
      {label}
    </div>
  );
}

"use client";

import { Armchair } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { CABIN_COLORS } from "@/components/CabinLayoutDesigner";
import { SEAT_GRADES } from "@/config/cabinProducts";
import { CABIN_ARTWORK } from "@/config/cabinArtwork";
import type { SeatGrade } from "@/types/cabin";
import type { CabinClass } from "@/types/game";

export function SeatProductImage({ cabin, grade, alt }: { cabin: CabinClass; grade: SeatGrade; alt: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const frame = SEAT_GRADES.indexOf(grade);
  const { src, width, height, frames } = CABIN_ARTWORK[cabin];
  const [top, bottom] = frames?.[frame] ?? [frame * height / 3, (frame + 1) * height / 3];
  const frameHeight = bottom - top;
  useEffect(() => { setFailedSource(null); }, [src]);
  return <div data-cabin-artwork={cabin} data-seat-grade={grade} className="relative aspect-video w-full overflow-hidden bg-[#edf0f3]">
    {failedSource === src ? <div role="img" aria-label={alt} className="flex h-full items-center justify-center"><Armchair size={48} style={{ color: CABIN_COLORS[cabin] }} /></div>
      : <Image key={src} src={src} alt={alt} width={width} height={height} unoptimized onError={() => setFailedSource(src)}
        className="absolute max-w-none" draggable={false}
        style={{ width: "100%", height: `${height / frameHeight * 100}%`, left: 0, top: `${-top / frameHeight * 100}%` }} />}
  </div>;
}

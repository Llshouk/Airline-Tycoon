"use client";

import { Armchair } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { CABIN_COLORS } from "@/components/CabinLayoutDesigner";
import { SEAT_GRADES } from "@/config/cabinProducts";
import { CABIN_CLASSES } from "@/lib/cabin";
import type { SeatGrade } from "@/types/cabin";
import type { CabinClass } from "@/types/game";

export function SeatProductImage({ cabin, grade, alt }: { cabin: CabinClass; grade: SeatGrade; alt: string }) {
  const [failed, setFailed] = useState(false);
  const column = SEAT_GRADES.indexOf(grade);
  const row = CABIN_CLASSES.indexOf(cabin);
  const src = cabin === "first" ? "/cabin/first-class-products-v172.png" : "/cabin/seat-products.png";
  useEffect(() => { setFailed(false); }, [src]);
  return <div className="relative aspect-video w-full overflow-hidden bg-[#edf0f3]">
    {failed ? <div role="img" aria-label={alt} className="flex h-full items-center justify-center"><Armchair size={48} style={{ color: CABIN_COLORS[cabin] }} /></div>
      : <Image src={src} alt={alt} width={cabin === "first" ? 966 : 1536} height={cabin === "first" ? 1628 : 1152} unoptimized onError={() => setFailed(true)}
        className="absolute max-w-none" draggable={false}
        style={cabin === "first" ? { width: "100%", height: "300%", left: 0, top: `${column * -100}%` }
          : { width: "300%", height: "400%", left: `${column * -100}%`, top: `${row * -100}%` }} />}
  </div>;
}

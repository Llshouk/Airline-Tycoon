"use client";

import { Armchair } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { CABIN_COLORS } from "@/components/CabinLayoutDesigner";
import { SEAT_GRADES } from "@/config/cabinProducts";
import { CABIN_CLASSES } from "@/lib/cabin";
import type { SeatGrade } from "@/types/cabin";
import type { CabinClass } from "@/types/game";

export function SeatProductImage({ cabin, grade, alt }: { cabin: CabinClass; grade: SeatGrade; alt: string }) {
  const [failed, setFailed] = useState(false);
  const column = SEAT_GRADES.indexOf(grade);
  const row = CABIN_CLASSES.indexOf(cabin);
  return <div className="relative aspect-video w-full overflow-hidden bg-[#edf0f3]">
    {failed ? <div role="img" aria-label={alt} className="flex h-full items-center justify-center"><Armchair size={48} style={{ color: CABIN_COLORS[cabin] }} /></div>
      : <Image src="/cabin/seat-products.png" alt={alt} width={1536} height={1152} unoptimized onError={() => setFailed(true)}
        className="absolute max-w-none" draggable={false}
        style={{ width: "300%", height: "400%", left: `${column * -100}%`, top: `${row * -100}%` }} />}
  </div>;
}

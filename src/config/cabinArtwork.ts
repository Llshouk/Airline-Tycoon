import type { CabinClass } from "@/types/game";

type FrameBounds = readonly [top: number, bottom: number];
export type CabinArtwork = {
  src: string; width: number; height: number;
  frames?: readonly [FrameBounds, FrameBounds, FrameBounds];
};

// Basic, Premium, Luxury. Explicit bounds exclude generated seams between panels.
export const CABIN_ARTWORK: Record<CabinClass, CabinArtwork> = {
  first: { src: "/cabin/first-class-products-v172.png", width: 966, height: 1628 },
  business: { src: "/cabin/business-products-v173.png", width: 965, height: 1629,
    frames: [[0, 532], [535, 1069], [1072, 1629]] },
  premiumEconomy: { src: "/cabin/premium-economy-products-v173.png", width: 965, height: 1629,
    frames: [[0, 541], [544, 1084], [1088, 1629]] },
  economy: { src: "/cabin/economy-products-v173.png", width: 965, height: 1629,
    frames: [[0, 539], [546, 1083], [1090, 1629]] }
};

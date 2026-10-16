export const CABIN_DIVIDER_SIZE = 40;
export const CABIN_DIVIDER_TRACK = 48;

export function cabinDividerLanes(positions: number[], width: number): number[] {
  const scale = Number.isFinite(width) ? Math.max(0, width) / 100 : 0;
  const lanes: number[] = [];
  positions.forEach((position, index) => {
    let lane = 0;
    while (positions.some((previous, previousIndex) => previousIndex < index && lanes[previousIndex] === lane
      && Math.abs(previous - position) * scale < CABIN_DIVIDER_TRACK)) lane++;
    lanes.push(lane);
  });
  return lanes;
}

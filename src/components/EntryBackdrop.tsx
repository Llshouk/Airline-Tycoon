/** Route-map backdrop for the screens before a game is running: one hub, a handful of great-circle arcs. */
export function EntryBackdrop() {
  const hub = { x: 170, y: 790 };
  const ends = [
    { x: 1330, y: 820 }, { x: 1400, y: 470 }, { x: 1290, y: 120 }, { x: 820, y: 50 }, { x: 330, y: 70 }, { x: 60, y: 260 }
  ];
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
      {ends.map((end, index) => {
        const midX = (hub.x + end.x) / 2;
        const midY = (hub.y + end.y) / 2 - Math.abs(end.x - hub.x) * 0.16;
        return (
          <g key={index}>
            <path d={`M ${hub.x} ${hub.y} Q ${midX} ${midY} ${end.x} ${end.y}`} fill="none" stroke={index === 0 ? "#b7127b" : "#1f3a57"} strokeWidth={index === 0 ? 2 : 1.5} />
            <circle cx={end.x} cy={end.y} r="4" fill="#0d2137" stroke={index === 0 ? "#b7127b" : "#2c4a6c"} strokeWidth="2" />
          </g>
        );
      })}
      <circle cx={hub.x} cy={hub.y} r="7" fill="#ffc629" stroke="#0d2137" strokeWidth="3" />
    </svg>
  );
}

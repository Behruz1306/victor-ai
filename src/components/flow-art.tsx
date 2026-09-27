// Original abstract art for the login / landing: many scattered chat "threads" (muted pills of
// different lengths) drift in from the left and converge into one accent path that ends in the
// Victor AI check-mark V. Pure SVG, no images.
const ROWS: { y: number; pills: [number, number][] }[] = [
  { y: 30, pills: [[20, 62], [96, 34], [144, 70]] },
  { y: 72, pills: [[0, 44], [58, 96], [168, 44]] },
  { y: 114, pills: [[36, 78], [128, 58]] },
  { y: 156, pills: [[8, 56], [78, 44], [136, 82]] },
  { y: 198, pills: [[48, 90], [152, 36]] },
  { y: 240, pills: [[14, 50], [78, 68], [160, 58]] },
  { y: 282, pills: [[40, 84], [138, 50]] },
  { y: 324, pills: [[4, 66], [84, 36], [134, 76]] },
];

export function FlowArt({ className }: { className?: string }) {
  const cx = 420;
  const cy = 177;
  return (
    <svg viewBox="0 0 600 354" preserveAspectRatio="xMidYMid meet" className={className} aria-hidden>
      <defs>
        <linearGradient id="fa-fade" x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.04" />
          <stop offset="0.75" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="fa-accent" x1="0" x2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="1" />
        </linearGradient>
      </defs>
      {ROWS.map((r) =>
        r.pills.map(([x, w], i) => (
          <rect key={`${r.y}-${i}`} x={x} y={r.y - 6} width={w} height={12} rx={6} fill="url(#fa-fade)" />
        )),
      )}
      {ROWS.map((r, i) => (
        <path
          key={`c-${r.y}`}
          d={`M232 ${r.y} C 310 ${r.y}, 330 ${cy}, ${cx} ${cy}`}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.12 + (i % 3) * 0.04}
          strokeWidth={1.2}
        />
      ))}
      <path d={`M330 ${cy} L ${cx + 10} ${cy}`} stroke="url(#fa-accent)" strokeWidth={2.5} strokeLinecap="round" />
      <g
        transform={`translate(${cx + 14} ${cy - 44}) scale(2.6)`}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8.6 14.2 L14.1 23.4" />
        <path d="M17.2 23.4 L24.2 9" />
      </g>
    </svg>
  );
}

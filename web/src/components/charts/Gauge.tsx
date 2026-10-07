/** Semicircle risk gauge on a 0–100 scale: safe band up to `max`, needle at `value`,
 *  dashed ghost needle at an unverified external reading when it differs. */
export function Gauge({ value, max, ghost, label }: { value: number; max: number; ghost?: number | null; label: string }) {
  const w = 220, h = 124, cx = w / 2, cy = 112, r = 92;
  const angle = (v: number) => Math.PI * (1 - Math.min(Math.max(v, 0), 100) / 100);
  const point = (v: number, rr = r) => [cx + rr * Math.cos(angle(v)), cy - rr * Math.sin(angle(v))] as const;
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const over = value > max;
  const needle = (v: number) => `rotate(${(Math.min(Math.max(v, 0), 100) / 100) * 180 - 90} ${cx} ${cy})`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${value} of max ${max}${over ? ", over the limit" : ""}`}>
      <path d={arc(0, 100)} stroke="#1a222d" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d={arc(0, max)} stroke="#2f6b57" strokeWidth="14" fill="none" strokeLinecap="round" />
      <path d={arc(max, 100)} stroke="#3a1c24" strokeWidth="14" fill="none" strokeLinecap="round" />
      {(() => {
        const [x, y] = point(max, r + 14);
        return (
          <text x={x} y={y} fill="#8592a6" fontSize="10" textAnchor="middle">
            max {max}
          </text>
        );
      })()}
      {ghost !== null && ghost !== undefined && ghost !== value && (
        <g transform={needle(ghost)} className="chart-anim">
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 6} stroke="#ffb547" strokeWidth="2" strokeDasharray="4 4" />
          <title>{`Unverified external reading: ${ghost}`}</title>
        </g>
      )}
      <g transform={needle(value)} className="chart-anim">
        <line x1={cx} y1={cy} x2={cx} y2={cy - r + 4} stroke={over ? "#ff5d6c" : "#7cf7c4"} strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx={cx} cy={cy} r="6" fill="#e8edf4" />
    </svg>
  );
}

import type { ReactNode } from "react";

type Slice = { label: string; value: number; color: string };

/** Allocation donut. Segments are stroke-dasharray arcs so value changes animate smoothly. */
export function Donut({ slices, size = 168, thickness = 18, center }: { slices: Slice[]; size?: number; thickness?: number; center?: ReactNode }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  // cumulative start of each arc, computed up front (render must stay pure)
  const arcs = slices.map((s, i) => ({
    ...s,
    len: (s.value / total) * c,
    start: slices.slice(0, i).reduce((a, x) => a + (x.value / total) * c, 0),
  }));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={slices.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a222d" strokeWidth={thickness} />
        {arcs.map((s) => (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(s.len - 2, 0)} ${c}`}
              strokeDashoffset={-s.start}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="chart-anim"
            >
              <title>{`${s.label}: ${Math.round((s.value / total) * 1000) / 10}%`}</title>
            </circle>
        ))}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}

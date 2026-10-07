import type { RiskPoint } from "@/lib/client";

/** Portfolio risk after each executed allocation (step line) against the mandate limit,
 *  with markers where a verified risk score changed. */
export function RiskChart({ points, max }: { points: RiskPoint[]; max: number }) {
  const execs = points.filter((p) => p.kind === "execution" && p.portfolioRisk !== null);
  if (execs.length === 0) {
    return <p className="flex h-full items-center justify-center text-xs text-muted">Risk history appears after the first allocation.</p>;
  }
  const w = 560, h = 132, padL = 28, padR = 10, padT = 10, padB = 18;
  const top = Math.max(max + 10, ...execs.map((p) => p.portfolioRisk ?? 0)) ;
  const n = points.length;
  const x = (i: number) => padL + (n === 1 ? (w - padL - padR) / 2 : (i / (n - 1)) * (w - padL - padR));
  const y = (v: number) => padT + (1 - v / top) * (h - padT - padB);

  let last: number | null = null;
  const segs: string[] = [];
  points.forEach((p, i) => {
    if (p.kind === "execution" && p.portfolioRisk !== null) {
      segs.push(last === null ? `M ${x(i)} ${y(p.portfolioRisk)}` : `L ${x(i)} ${y(last)} L ${x(i)} ${y(p.portfolioRisk)}`);
      last = p.portfolioRisk;
    }
  });
  if (last !== null) segs.push(`L ${w - padR} ${y(last)}`);

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Portfolio risk over time, latest ${last}, limit ${max}`}>
      {[0, Math.round(top / 2), Math.round(top)].map((v) => (
        <g key={v}>
          <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="#1a222d" />
          <text x={padL - 6} y={y(v) + 3} fill="#8592a6" fontSize="9" textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <line x1={padL} x2={w - padR} y1={y(max)} y2={y(max)} stroke="#ff5d6c" strokeDasharray="5 4" opacity="0.8" />
      <text x={w - padR} y={y(max) - 4} fill="#ff5d6c" fontSize="9" textAnchor="end">
        max risk {max}
      </text>
      <path d={segs.join(" ")} fill="none" stroke="#7cf7c4" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) =>
        p.kind === "execution" && p.portfolioRisk !== null ? (
          <circle key={i} cx={x(i)} cy={y(p.portfolioRisk)} r="4" fill={p.source === "CRE" ? "#5aa8ff" : "#7cf7c4"}>
            <title>{`${p.label}: risk ${p.portfolioRisk} (${p.source === "CRE" ? "Chainlink CRE" : "KRIYA agent"})`}</title>
          </circle>
        ) : (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={padT} y2={h - padB} stroke="#ffb547" strokeDasharray="2 3" opacity="0.7" />
            <path d={`M ${x(i)} ${h - padB - 7} l 5 5 l -5 5 l -5 -5 z`} fill="#ffb547">
              <title>{`Verified risk change: ${p.label}`}</title>
            </path>
          </g>
        ),
      )}
    </svg>
  );
}

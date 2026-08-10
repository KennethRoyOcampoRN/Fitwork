import React from "react";

interface Series {
  label: string;
  color: string;
  points: { x: number; y: number | null }[];
}

interface Props {
  series: Series[];
  height?: number;
  yLabel?: string;
}

// Minimal dependency-free SVG line chart (no charting library — keeps the
// bundle self-contained per the offline/no-CDN constraint).
export default function LineChart({ series, height = 180, yLabel }: Props) {
  const width = 600;
  const padding = { top: 10, right: 10, bottom: 24, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allPoints = series.flatMap((s) => s.points.filter((p) => p.y !== null) as { x: number; y: number }[]);
  if (allPoints.length === 0) {
    return <div className="text-sm text-gray-400 p-4">Not enough data yet to chart.</div>;
  }

  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(0, Math.min(...ys) * 0.95);
  const yMax = Math.max(...ys) * 1.1 || 1;

  function sx(x: number) {
    return padding.left + (xMax === xMin ? innerW / 2 : ((x - xMin) / (xMax - xMin)) * innerW);
  }
  function sy(y: number) {
    return padding.top + innerH - ((y - yMin) / (yMax - yMin || 1)) * innerH;
  }

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerH} stroke="#e5e7eb" />
        <line x1={padding.left} y1={padding.top + innerH} x2={padding.left + innerW} y2={padding.top + innerH} stroke="#e5e7eb" />
        <text x={4} y={padding.top + 4} fontSize="9" fill="#9ca3af">{yLabel}</text>
        <text x={4} y={padding.top + innerH} fontSize="9" fill="#9ca3af">{Math.round(yMin)}</text>
        <text x={4} y={padding.top + 8} fontSize="9" fill="#9ca3af">{Math.round(yMax)}</text>

        {series.map((s) => {
          const pts = s.points.filter((p) => p.y !== null) as { x: number; y: number }[];
          if (pts.length === 0) return null;
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`).join(" ");
          return (
            <g key={s.label}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
              {pts.map((p, i) => (
                <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 justify-center text-xs mt-1">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

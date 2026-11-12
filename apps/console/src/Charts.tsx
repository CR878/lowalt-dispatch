import { useId, useState } from "react";
import type { ReviewRoute } from "./RouteReview";

export function Sparkline({
  color = "#bca9ff",
  phase = 0,
  height = 34,
}: {
  color?: string;
  phase?: number;
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  const values = Array.from(
    { length: 80 },
    (_, i) =>
      17 +
      Math.sin(i * 0.37 + phase) * 4 +
      Math.sin(i * 1.3 + phase) * 2 +
      (i > 50 && i < 58 ? Math.sin(i * 2.8) * 8 : 0),
  );
  const line = values.map((v, i) => `${i ? "L" : "M"}${i * 3},${v}`).join(" ");
  return (
    <svg
      viewBox="0 0 237 38"
      height={height}
      width="100%"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".2" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L237,38 L0,38Z`} fill={`url(#${id})`} />
      <path
        d={line}
        stroke={color}
        fill="none"
        strokeWidth="1.1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function MarginChart({
  progress,
  compare,
  review,
}: {
  progress: number;
  compare: boolean;
  review?: ReviewRoute | null;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const values = Array.from(
    { length: 121 },
    (_, i) => 80 - i * 0.31 + 4.6 * Math.sin(i * 0.23),
  );
  const minimum = Math.min(...values);
  const candidate = review?.samples.length
    ? Array.from({ length: 121 }, (_, i) => {
        const sample = (i / 120) * (review.samples.length - 1),
          lo = Math.floor(sample),
          hi = Math.min(review.samples.length - 1, lo + 1);
        return (
          review.samples[lo].margin_wh +
          (review.samples[hi].margin_wh - review.samples[lo].margin_wh) *
            (sample - lo)
        );
      })
    : values.map((v) => v - minimum + 34.8);
  const maxY = Math.ceil(Math.max(...candidate, review ? 1 : 80) / 10) * 10;
  const yAt = (value: number) => 127 - value * (84 / maxY);
  const path = (series: number[]) =>
    series
      .map((v, i) => `${i ? "L" : "M"}${42 + (i / 120) * 658},${yAt(v)}`)
      .join(" ");
  const current = path(candidate);
  const previous = path(
    Array.from(
      { length: 121 },
      (_, i) => 76 - i * 0.84 + 5 * Math.sin(i * 0.16),
    ),
  );
  const cursor = Math.max(0, Math.min(1, hover ?? progress)) * 120;
  const lower = Math.floor(cursor),
    upper = Math.min(120, lower + 1);
  const cursorY = yAt(
    candidate[lower] + (candidate[upper] - candidate[lower]) * (cursor - lower),
  );
  const totalKm = review?.samples.length
    ? review.samples.at(-1)!.s_m / 1000
    : 3.67;
  const checkpoints = review?.samples.length
    ? [...new Set(review.samples.map((s) => s.nearest_site_id))].map(
        (name) => ({
          x:
            42 +
            (review.samples.findIndex((s) => s.nearest_site_id === name) /
              (review.samples.length - 1)) *
              658,
          name,
        }),
      )
    : [
        { x: 150, name: "L1" },
        { x: 330, name: "L3" },
        { x: 520, name: "L2" },
        { x: 600, name: "L4" },
      ];
  return (
    <svg
      className="margin-svg"
      viewBox="0 0 735 182"
      role="img"
      aria-label={
        review
          ? `历史演示备降余量曲线 ${review.id}，零线以下为负余量`
          : "演示备降余量曲线，紫线为候选示例，灰色虚线为对照示例，零线以下为负余量"
      }
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setHover(
          Math.max(
            0,
            Math.min(
              1,
              (((e.clientX - rect.left) / rect.width) * 735 - 42) / 658,
            ),
          ),
        );
      }}
      onPointerLeave={() => setHover(null)}
    >
      <defs>
        <clipPath id={`${id}-negative`}>
          <rect x="42" y="127" width="658" height="35" />
        </clipPath>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a891ef" stopOpacity=".22" />
          <stop offset="1" stopColor="#a891ef" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[43, 85, 127].map((y, i) => (
        <g key={y}>
          <line
            x1="42"
            x2="700"
            y1={y}
            y2={y}
            stroke={i === 2 ? "#665849" : "#242a32"}
            strokeDasharray={i === 2 ? "4 5" : "2 5"}
          />
          <text x="24" y={y + 4} textAnchor="end" className="chart-tick">
            {[maxY, maxY / 2, 0][i]}
          </text>
        </g>
      ))}
      <rect
        x="42"
        y="128"
        width="658"
        height="30"
        fill="#b87d61"
        opacity=".035"
      />
      {checkpoints.map((site) => (
        <g key={site.name}>
          <line
            x1={site.x}
            x2={site.x}
            y1="30"
            y2="158"
            stroke="#70aa9630"
            strokeDasharray="2 5"
          />
          <text x={site.x + 4} y="36" fill="#91bbaa" fontSize="8">
            {site.name}
          </text>
        </g>
      ))}
      <path d={`${current} L700 127 L42 127 Z`} fill={`url(#${id})`} />
      {compare && (
        <path
          d={previous}
          fill="none"
          stroke="#a3a8b4"
          strokeDasharray="4 5"
          strokeWidth="1.2"
          opacity=".65"
        />
      )}
      <path d={current} fill="none" stroke="#baa6f7" strokeWidth="2" />
      <path
        d={`${current} L700 127 L42 127 Z`}
        fill="#ed91ad40"
        clipPath={`url(#${id}-negative)`}
      />
      <path
        d={current}
        fill="none"
        stroke="#f099b7"
        strokeWidth="2"
        clipPath={`url(#${id}-negative)`}
      />
      <line
        x1={42 + (cursor / 120) * 658}
        x2={42 + (cursor / 120) * 658}
        y1="27"
        y2="158"
        stroke="#b8c3d1"
        opacity=".5"
      />
      <circle
        cx={42 + (cursor / 120) * 658}
        cy={cursorY}
        r="3.5"
        fill="#e8e0ff"
      />
      <text
        x={Math.min(540, 52 + (cursor / 120) * 658)}
        y="23"
        fill="#d5c7fa"
        fontSize="9"
      >
        {hover === null
          ? "当前位置"
          : `${(hover * totalKm).toFixed(2)} km · ${(candidate[lower] + (candidate[upper] - candidate[lower]) * (cursor - lower)).toFixed(1)} Wh`}
      </text>
      {[0, 1, 2, 3].map((n) => (
        <text
          key={n}
          x={42 + n * 219}
          y="176"
          className="chart-tick"
          textAnchor={n === 0 ? "start" : "middle"}
        >
          {((n / 3) * totalKm).toFixed(1)} km
        </text>
      ))}
      <text x="5" y="16" className="chart-tick">
        Wh
      </text>
      <text x="696" y="144" textAnchor="end" fill="#94785d" fontSize="8">
        无有效退出余量
      </text>
    </svg>
  );
}

export function Attitude({ pitch, roll }: { pitch: number; roll: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 140 140"
      className="attitude"
      role="img"
      aria-label={`俯仰${pitch.toFixed(1)}度，横滚${roll.toFixed(1)}度`}
    >
      <defs>
        <clipPath id={id}>
          <circle cx="70" cy="70" r="49" />
        </clipPath>
      </defs>
      <circle cx="70" cy="70" r="59" fill="none" stroke="#303741" />
      {Array.from({ length: 25 }, (_, i) => (
        <line
          key={i}
          x1="70"
          x2="70"
          y1="10"
          y2={i % 3 ? 14 : 18}
          stroke={i === 12 ? "#c6b5f8" : "#707d8e"}
          strokeWidth="1"
          transform={`rotate(${i * 10 - 120} 70 70)`}
        />
      ))}
      <g clipPath={`url(#${id})`}>
        <g transform={`rotate(${-roll} 70 70) translate(0 ${pitch * 1.2})`}>
          <rect x="0" y="-10" width="140" height="80" fill="#23303e" />
          <rect x="0" y="70" width="140" height="90" fill="#2d2a2c" />
          <line x1="0" x2="140" y1="70" y2="70" stroke="#8d98a4" />
          {[-30, -15, 15, 30].map((v) => (
            <g key={v}>
              <line
                x1={Math.abs(v) === 30 ? 48 : 54}
                x2={Math.abs(v) === 30 ? 92 : 86}
                y1={70 + v}
                y2={70 + v}
                stroke="#7c8999"
                opacity=".6"
              />
              <text x="99" y={73 + v} fill="#8994a2" fontSize="6">
                {Math.abs(v)}
              </text>
            </g>
          ))}
        </g>
      </g>
      <path
        d="M33 70 H57 L62 75 H78 L83 70 H107"
        fill="none"
        stroke="#d4c1ff"
        strokeWidth="2"
      />
      <circle cx="70" cy="70" r="2" fill="#d4c1ff" />
      <path d="M66 24 L70 17 L74 24Z" fill="#c5afff" />
      <text x="70" y="132" textAnchor="middle" fill="#838f9e" fontSize="8">
        姿态 / ATTITUDE
      </text>
    </svg>
  );
}

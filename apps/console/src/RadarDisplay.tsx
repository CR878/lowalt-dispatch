import { useId } from "react";
export default function RadarDisplay({
  heading,
  playing,
}: {
  heading: number;
  playing: boolean;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`perception-radar ${playing ? "" : "stopped"}`}
      viewBox="0 0 220 112"
      role="img"
      aria-label="演示扫描雷达，非真实探测结果"
    >
      <defs>
        <radialGradient id={id}>
          <stop stopColor="#98e0cf" stopOpacity=".04" />
          <stop offset="1" stopColor="#98e0cf" stopOpacity=".42" />
        </radialGradient>
      </defs>
      {[16, 32, 48].map((r) => (
        <circle
          key={r}
          cx="110"
          cy="56"
          r={r}
          fill="none"
          stroke="#3b5d61"
          strokeOpacity=".42"
        />
      ))}
      <path d="M9 56H211M110 3V109" stroke="#315052" strokeWidth=".7" />
      <g className="radar-sweep">
        <path d="M110 56L158 56A48 48 0 0 0 144 22Z" fill={`url(#${id})`} />
        <path d="M110 56H158" stroke="#9be7d0" />
      </g>
      <g transform={`rotate(${heading} 110 56)`}>
        <path d="M110 47L115 62L110 59L105 62Z" fill="#c7b4fa" />
      </g>
      <circle className="radar-echo" cx="134" cy="33" r="2.2" fill="#a2e4d1" />
      <circle
        className="radar-echo secondary"
        cx="80"
        cy="72"
        r="1.8"
        fill="#f0a6c6"
      />
      <text x="8" y="104">
        DEMO · 250 m
      </text>
      <text x="186" y="13">
        N
      </text>
    </svg>
  );
}

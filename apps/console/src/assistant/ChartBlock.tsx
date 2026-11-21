import { useState, type CSSProperties } from "react";
import { DataExport, DataTable } from "./DataTable";

export type ChartDatum = { label: string; value: number };
export type ChartSpec = {
  type: "bar" | "pie" | "line";
  title?: string;
  unit?: string;
  data: ChartDatum[];
};

const COLORS = [
  "#2f6df6",
  "#1f9d55",
  "#e08b2f",
  "#b455d6",
  "#d64a6a",
  "#2aa2b8",
];

function parseSpec(raw: string): ChartSpec | null {
  try {
    const value = JSON.parse(raw) as Partial<ChartSpec>;
    if (!value || !Array.isArray(value.data)) return null;
    const data = value.data
      .map((item) => ({
        label: String((item as ChartDatum)?.label ?? "").slice(0, 24),
        value:
          typeof (item as ChartDatum)?.value === "number"
            ? (item as ChartDatum).value
            : NaN,
      }))
      .filter((item) => item.label && Number.isFinite(item.value));
    if (!data.length) return null;
    const type = value.type;
    if (!["pie", "bar", "line"].includes(type || "")) return null;
    if (type === "pie" && data.some((item) => item.value < 0)) return null;
    return {
      type: type as ChartSpec["type"],
      title: value.title ? String(value.title).slice(0, 60) : undefined,
      unit: value.unit ? String(value.unit).slice(0, 12) : undefined,
      data: data.slice(0, 12),
    };
  } catch {
    return null;
  }
}

function axisLabel(value: number, unit?: string) {
  const text =
    Math.abs(value) >= 1000 ? (value / 1000).toFixed(1) + "k" : String(value);
  return unit ? `${text}${unit}` : text;
}

function BarChart({ spec }: { spec: ChartSpec }) {
  const { data, unit } = spec;
  const min = Math.min(0, ...data.map((item) => item.value));
  const max = Math.max(0, ...data.map((item) => item.value));
  const span = max - min || 1;
  const zero = 78 + (-min / span) * 190;
  const rowHeight = 26;
  const height = data.length * rowHeight + 8;
  return (
    <svg
      viewBox={`0 0 320 ${height}`}
      role="img"
      aria-label={spec.title ?? "柱状图"}
    >
      {data.map((item, index) => {
        const width = (Math.abs(item.value) / span) * 190;
        const y = index * rowHeight + 6;
        return (
          <g key={`${item.label}-${index}`}>
            <title>
              {item.label} · {axisLabel(item.value, unit)}
            </title>
            <text x={0} y={y + 11} className="assistant-chart-label">
              {item.label}
            </text>
            <rect
              x={78}
              y={y}
              width={190}
              height={14}
              rx={3}
              className="assistant-chart-track"
            />
            <rect
              x={item.value < 0 ? zero - width : zero}
              y={y}
              width={width}
              height={14}
              rx={3}
              fill={COLORS[index % COLORS.length]}
            />
            <text x={276} y={y + 11} className="assistant-chart-value">
              {axisLabel(item.value, unit)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PieChart({ spec }: { spec: ChartSpec }) {
  const total = spec.data.reduce((sum, item) => sum + item.value, 0);
  const height = Math.max(160, spec.data.length * 20 + 20);
  let angle = -Math.PI / 2;
  const cx = 78;
  const cy = 78;
  const radius = 62;
  const slices = spec.data.map((item, index) => {
    const sweep = total ? (item.value / total) * Math.PI * 2 : 0;
    const x1 = cx + radius * Math.cos(angle);
    const y1 = cy + radius * Math.sin(angle);
    angle += sweep;
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);
    return {
      key: `${item.label}-${index}`,
      color: COLORS[index % COLORS.length],
      value: item.value,
      label: item.label,
      fullCircle: total > 0 && item.value === total,
      path: `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${
        sweep > Math.PI ? 1 : 0
      } 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`,
    };
  });
  return (
    <svg
      viewBox={`0 0 320 ${height}`}
      role="img"
      aria-label={spec.title ?? "饼图"}
    >
      {total === 0 && (
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#8a98a6" />
      )}
      {slices.map((slice) =>
        slice.fullCircle ? (
          <circle
            key={slice.key}
            cx={cx}
            cy={cy}
            r={radius}
            fill={slice.color}
          />
        ) : (
          <path key={slice.key} d={slice.path} fill={slice.color} />
        ),
      )}
      {spec.data.map((item, index) => (
        <g key={`${item.label}-${index}`}>
          <rect
            x={160}
            y={18 + index * 20}
            width={9}
            height={9}
            rx={2}
            fill={COLORS[index % COLORS.length]}
          />
          <text x={174} y={26 + index * 20} className="assistant-chart-legend">
            {item.label} · {axisLabel(item.value, spec.unit)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function LineChart({ spec }: { spec: ChartSpec }) {
  const { data } = spec;
  const values = data.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = data.length > 1 ? 280 / (data.length - 1) : 0;
  const points = data.map((item, index) => ({
    x: 20 + index * step,
    y: 124 - ((item.value - min) / span) * 96,
    ...item,
  }));
  return (
    <svg viewBox="0 0 320 160" role="img" aria-label={spec.title ?? "折线图"}>
      <polyline
        fill="none"
        stroke={COLORS[0]}
        strokeWidth={2}
        points={points.map((point) => `${point.x},${point.y}`).join(" ")}
      />
      <text x="20" y="16" className="assistant-chart-label">
        {axisLabel(max, spec.unit)}
      </text>
      <text x="20" y="136" className="assistant-chart-label">
        {axisLabel(min, spec.unit)}
      </text>
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <title>
            {point.label} · {axisLabel(point.value, spec.unit)}
          </title>
          <circle cx={point.x} cy={point.y} r={3} fill={COLORS[0]} />
          <text
            x={point.x}
            y={144}
            textAnchor="middle"
            className="assistant-chart-label"
          >
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function ChartBlock({ raw }: { raw: string }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const spec = parseSpec(raw);
  if (!spec) {
    return (
      <pre className="assistant-chart-fallback">
        <code>{raw.trim()}</code>
      </pre>
    );
  }
  const style: CSSProperties = { margin: "0 0 8px" };
  const columns = ["项目", spec.unit ? `数值 / ${spec.unit}` : "数值"];
  const rows = spec.data.map((item) => [item.label, item.value]);
  return (
    <figure className="assistant-chart" style={style}>
      <div className="assistant-chart-heading">
        <figcaption>{spec.title || "数据图表"}</figcaption>
        <div className="assistant-chart-actions">
          <button
            aria-pressed={view === "chart"}
            onClick={() => setView("chart")}
          >
            图表
          </button>
          <button
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            表格
          </button>
          <DataExport
            title={spec.title || "图表"}
            columns={columns}
            rows={rows}
          />
        </div>
      </div>
      {view === "table" ? (
        <DataTable
          title={`${spec.title || "图表"}数据`}
          columns={columns}
          rows={rows}
        />
      ) : spec.type === "pie" ? (
        <PieChart spec={spec} />
      ) : spec.type === "line" ? (
        <LineChart spec={spec} />
      ) : (
        <BarChart spec={spec} />
      )}
    </figure>
  );
}

import { ArrowUpRight, MapPin } from "lucide-react";
import { ChartBlock } from "./ChartBlock";
import { DataExport, DataTable } from "./DataTable";
import type { Presentation, ResponseBlock } from "./presentation";
import type { PreviewRoute } from "./types";
import "./responseBlocks.css";
import { TaskEvidenceCard } from "./TaskEvidenceCard";

const metric = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(
        value,
      );

function Source({ block }: { block: ResponseBlock }) {
  const date = block.as_of ? new Date(block.as_of) : null;
  return (
    <footer className="assistant-block-source">
      <span>{block.source}</span>
      {date && (
        <time dateTime={block.as_of!}>
          {Number.isNaN(date.getTime())
            ? block.as_of
            : date.toLocaleString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
        </time>
      )}
      {block.note && <p>{block.note}</p>}
    </footer>
  );
}

function RoutePreview({
  block,
  onRoute,
}: {
  block: Extract<ResponseBlock, { type: "route" }>;
  onRoute: (route: PreviewRoute) => void;
}) {
  const xs = block.waypoints.map((p) => p[0]),
    ys = block.waypoints.map((p) => p[1]);
  const left = Math.min(...xs),
    bottom = Math.min(...ys);
  const width = Math.max(...xs) - left,
    height = Math.max(...ys) - bottom;
  const scale = Math.min(244 / (width || 1), 124 / (height || 1));
  const project = (p: [number, number]) => [
    (300 - width * scale) / 2 + (p[0] - left) * scale,
    (180 + height * scale) / 2 - (p[1] - bottom) * scale,
  ];
  const points = block.waypoints.map(project);
  const first = points[0],
    last = points[points.length - 1];
  return (
    <>
      <svg
        viewBox="0 0 300 180"
        role="img"
        aria-label="本地几何路线小图"
        className="assistant-route-thumbnail"
      >
        {[40, 80, 120, 160].map((y) => (
          <line key={y} x1="14" x2="286" y1={y} y2={y} className="route-grid" />
        ))}
        <polyline
          points={points.map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx={first[0]} cy={first[1]} r="4" fill="currentColor" />
        <circle cx={last[0]} cy={last[1]} r="4" fill="currentColor" />
        <text x={first[0] + 8} y={first[1] - 8}>
          起
        </text>
        <text x={last[0] + 8} y={last[1] - 8}>
          终
        </text>
        <text x="278" y="20">
          N ↑
        </text>
      </svg>
      <div className="assistant-route-summary">
        <span>{metric(block.length_m)} m</span>
        <span>{block.waypoints.length} 航点 · ENU</span>
        <button
          onClick={() =>
            onRoute({
              status: "geometry_only",
              route_id: block.route_id,
              draft_digest: block.draft_digest,
              length_m: block.length_m,
              waypoint_count: block.waypoints.length,
              waypoints: block.waypoints,
              source: block.source,
              assumptions: block.note,
              dispatch_enabled: false,
            })
          }
        >
          <MapPin size={12} /> 显示到主地图 <ArrowUpRight size={12} />
        </button>
      </div>
    </>
  );
}

export function ResponseBlocks({
  presentation,
  onRoute,
}: {
  presentation: Presentation;
  onRoute: (route: PreviewRoute) => void;
}) {
  return (
    <div className="assistant-response-blocks">
      {presentation.blocks.map((block, index) => (
        <section
          key={index}
          className={`assistant-response-block response-${block.type}`}
          aria-label={block.title}
        >
          {block.type !== "chart" && (
            <header className="assistant-block-heading">
              <h4>{block.title}</h4>
              {block.type === "table" && (
                <DataExport
                  title={block.title}
                  columns={block.columns}
                  rows={block.rows}
                />
              )}
            </header>
          )}
          {block.type === "metrics" && (
            <dl className="assistant-metric-grid">
              {block.items.map((item, i) => (
                <div key={i}>
                  <dt>{item.label}</dt>
                  <dd>
                    {metric(item.value)}
                    <small>{item.value === null ? "" : item.unit}</small>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {block.type === "chart" && (
            <ChartBlock raw={JSON.stringify(block.chart)} />
          )}
          {block.type === "table" && (
            <DataTable
              title={block.title}
              columns={block.columns}
              rows={block.rows}
            />
          )}
          {block.type === "timeline" && (
            <ol className="assistant-event-timeline">
              {block.items.map((item, i) => (
                <li key={i} data-level={item.level}>
                  <time>{item.time}</time>
                  <div>
                    <strong>{item.title}</strong>
                    {item.detail && <p>{item.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {block.type === "route" && (
            <RoutePreview block={block} onRoute={onRoute} />
          )}
          {block.type === "task_evidence" && (
            <TaskEvidenceCard
              evidence={block.evidence}
              onLocate={() =>
                onRoute({
                  status: "geometry_only",
                  route_id: block.evidence.route_id,
                  draft_digest: block.evidence.revision,
                  length_m: block.evidence.length_m,
                  waypoint_count: block.evidence.waypoints.length,
                  waypoints: block.evidence.waypoints,
                  source: block.evidence.source,
                  assumptions: "冻结算法证据；示例参数；未下发",
                  dispatch_enabled: false,
                })
              }
            />
          )}
          {block.type === "env_matrix" && (
            <div
              className={`env-verdict env-verdict-${block.verdict}`}
              data-verdict={block.verdict}
            >
              <strong>{block.verdict}</strong>
              <p>{block.verdict_reason}</p>
              <p>{block.coverage_statement}</p>
              <ul>
                {block.factors.map((factor) => (
                  <li
                    key={factor.id}
                    className={`env-factor env-factor-${factor.status}`}
                    data-status={factor.status}
                  >
                    {factor.name} · {factor.status}
                    {factor.value === null || factor.value === undefined
                      ? ""
                      : ` ${factor.value}${factor.unit}`}
                    <small>
                      {factor.segment_index == null
                        ? ""
                        : `航段 ${factor.segment_index + 1} · `}
                      {factor.reason}
                    </small>
                  </li>
                ))}
              </ul>
              <code>{block.evidence_id}</code>
            </div>
          )}
          {block.type === "gaps" && (
            <ol className="env-gaps">
              {block.items.map((item) => (
                <li key={item.factor}>
                  <strong>{item.factor}</strong> {item.why}
                  <small>{item.to_close}</small>
                </li>
              ))}
            </ol>
          )}
          {block.type === "time_window" && (
            <ul className="env-time-window">
              {block.options.map((option) => (
                <li key={option.scheduled_for} data-verdict={option.verdict}>
                  {option.scheduled_for} · {option.verdict}
                  <small>{option.reason}</small>
                </li>
              ))}
            </ul>
          )}
          <Source block={block} />
        </section>
      ))}
    </div>
  );
}

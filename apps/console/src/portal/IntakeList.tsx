import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CloudSun,
  Package,
  Route,
  Sparkles,
} from "lucide-react";

import { api } from "./api";
import "./intake-list.css";

type Intake = {
  intake_id: string;
  text: string;
  origin: { name: string; point: number[] | null; crs: string };
  destination: { name: string; point: number[] | null; crs: string };
  scheduled_for: string | null;
  payload_kg: number | null;
  priority: string | null;
  weather: {
    status: string;
    kind: string;
    valid_for: string | null;
    note: string;
  };
  airspace: { status: string; note: string; zones: unknown[] };
  route_preview: unknown | null;
  real_route?: {
    status?: string;
    waypoints?: unknown[];
    length_m?: number | null;
    reason?: string | null;
  } | null;
  warnings: string[];
  created_at: string;
  is_simulated: boolean;
  dispatch_enabled: boolean;
};

export function IntakeList() {
  const [items, setItems] = useState<Intake[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api<{ items: Intake[] }>("/assistant/intakes")
      .then((value) => {
        if (alive) setItems(value.items || []);
      })
      .catch((reason: unknown) => {
        if (alive)
          setError(reason instanceof Error ? reason.message : "读取失败");
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!items.length && !error) return null;
  return (
    <section className="p-card p-spaced intake-board" data-testid="intake-list">
      <div className="p-card-head">
        <div className="intake-board-title">
          <span className="intake-board-icon">
            <Sparkles size={20} />
          </span>
          <div>
            <h2>AI 任务工单</h2>
            <p>自然语言生成 · 任务信息与规划进展</p>
          </div>
        </div>
        <span className="intake-count">
          {items.length}
          <small>张工单</small>
        </span>
      </div>
      {error && <p className="p-muted">工单读取失败：{error}</p>}
      <div className="intake-grid">
        {items.map((item) => {
          const status = item.real_route?.status;
          const label =
            status === "ok"
              ? "航线已生成"
              : status === "pending"
                ? "航线计算中"
                : status === "unavailable"
                  ? "航线未生成"
                  : item.route_preview
                    ? "几何预览"
                    : "待规划";
          const length = item.real_route?.length_m;
          return (
            <article
              key={item.intake_id}
              className="intake-ticket"
              aria-label={`${item.origin.name}至${item.destination.name}工单`}
            >
              <div className="intake-ticket-head">
                <span className="intake-ticket-id" title={item.intake_id}>
                  #{item.intake_id.slice(0, 8).toUpperCase()}
                </span>
                <span className="intake-priority" data-priority={item.priority}>
                  {item.priority ?? "优先级待确认"}
                </span>
              </div>
              <div className="intake-stations">
                <div>
                  <i className="intake-dot origin" />
                  <span>
                    <small>起点</small>
                    <strong>{item.origin.name}</strong>
                  </span>
                </div>
                <div>
                  <i className="intake-dot destination" />
                  <span>
                    <small>终点</small>
                    <strong>{item.destination.name}</strong>
                  </span>
                </div>
              </div>
              <div className="intake-facts">
                <span>
                  <CalendarDays size={14} />
                  <time dateTime={item.scheduled_for ?? undefined}>
                    {item.scheduled_for
                      ? new Date(item.scheduled_for).toLocaleString("zh-CN", {
                          timeZone: "Asia/Shanghai",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      : "时间待确认"}
                  </time>
                </span>
                <span>
                  <Package size={14} />
                  {item.payload_kg == null
                    ? "载荷待确认"
                    : `${item.payload_kg} kg`}
                </span>
              </div>
              <div
                className="intake-progress"
                data-status={status ?? "unplanned"}
              >
                <Route size={14} />
                <strong>{label}</strong>
                {status === "ok" && length != null && (
                  <span>{(length / 1000).toFixed(2)} km</span>
                )}
              </div>
              <div className="intake-ticket-meta">
                <span data-ready={item.weather.status === "ok"}>
                  <CloudSun size={13} />
                  {item.weather.status === "ok" ? "预报已获取" : "预报待获取"}
                </span>
                <span>工单记录 · 未下发</span>
              </div>
              <details className="intake-ticket-details">
                <summary>
                  工单详情与依据
                  <ChevronDown size={14} />
                </summary>
                <div className="intake-detail">
                  <p className="intake-request">{item.text}</p>
                  <p>
                    起点基准：{item.origin.crs} · 终点基准：
                    {item.destination.crs}
                  </p>
                  <p>
                    载荷：{item.payload_kg ?? "未填"} kg · 优先级：
                    {item.priority ?? "未填"} · 工单号：{item.intake_id}
                  </p>
                  <p>天气：{item.weather.note}</p>
                  <p>空域：{item.airspace.note}</p>
                  <p>
                    {item.real_route?.status === "ok"
                      ? `航线：${item.real_route.waypoints?.length ?? "未知"} 航点 / ${length == null ? "距离未知" : `${(length / 1000).toFixed(2)} km`}（OSM 建筑足迹避障）`
                      : item.real_route?.status === "pending"
                        ? "航线：后台计算中，稍后刷新查看"
                        : item.real_route?.status === "unavailable"
                          ? `航线：未生成（${item.real_route.reason ?? "原因未知"}）`
                          : item.route_preview
                            ? "路线：几何预览（仿真）"
                            : "航线：未计算"}
                  </p>
                  <ul>
                    {item.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </details>
              <a
                className="intake-view-route"
                href={`/airspace?intake=${encodeURIComponent(item.intake_id)}`}
              >
                在地图中查看
                <ArrowUpRight size={15} />
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

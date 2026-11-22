import { useEffect, useState } from "react";

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
    <section className="p-card p-spaced" data-testid="intake-list">
      <div className="p-card-head">
        <h2>AI 任务工单</h2>
        <span className="p-tag">{items.length} 条 · 自然语言</span>
      </div>
      {error && <p className="p-muted">工单读取失败：{error}</p>}
      <div className="p-task-rows">
        {items.map((item) => (
          <details key={item.intake_id} className="intake-row">
            <summary>
              <strong>{item.text.slice(0, 42)}</strong>
              <span>
                {item.scheduled_for
                  ? item.scheduled_for.replace("T", " ").slice(0, 16)
                  : "时间待确认"}
              </span>
              <span className="p-tag">
                {item.weather.status === "ok" ? "预报已取" : "预报未取"}
              </span>
            </summary>
            <div className="intake-detail">
              <p>
                起点：{item.origin.name}（{item.origin.crs}） → 终点：
                {item.destination.name}（{item.destination.crs}）
              </p>
              <p>
                载荷：{item.payload_kg ?? "未填"} kg · 优先级：
                {item.priority ?? "未填"} · 工单号：{item.intake_id}
              </p>
              <p>天气：{item.weather.note}</p>
              <p>空域：{item.airspace.note}</p>
              <p>
                {item.real_route?.status === "ok"
                  ? `航线：${item.real_route.waypoints?.length ?? 0} 航点 / ${(((item.real_route.length_m ?? 0) as number) / 1000).toFixed(2)} km（OSM 真实建筑避障）`
                  : item.real_route?.status === "pending"
                    ? "航线：后台计算中，稍后刷新查看"
                    : item.real_route?.status === "unavailable"
                      ? `航线：未生成（${item.real_route.reason ?? "原因未知"}）`
                      : item.route_preview
                        ? "路线：几何预览（仿真）"
                        : "航线：未计算"}
              </p>
              <button
                type="button"
                className="intake-view-route"
                onClick={() =>
                  window.location.assign(
                    `/airspace?intake=${encodeURIComponent(item.intake_id)}`,
                  )
                }
              >
                在空域态势查看航线
              </button>
              <ul>
                {item.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

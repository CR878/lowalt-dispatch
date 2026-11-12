import { useEffect, useState } from "react";
import { Check, MapPin, TriangleAlert } from "lucide-react";
import type { Point } from "./types";
export type ReviewRoute = {
  id: string;
  task_id: string;
  title: string;
  version: string;
  algorithm: string;
  energy_wh: number;
  site: string;
  checks: { name: string; passed: boolean; detail: string }[];
  waypoints: Point[];
  samples: { s_m: number; margin_wh: number; nearest_site_id: string }[];
  source: string;
  captured_at: string;
  is_simulated: true;
};
export default function RouteReview({
  onSelect,
}: {
  onSelect: (route: ReviewRoute) => void;
}) {
  const [routes, setRoutes] = useState<ReviewRoute[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch("/codearts-review.json", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((v) => {
        if (v.is_simulated !== true || !Array.isArray(v.routes))
          throw new Error();
        setRoutes(v.routes);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError("演示方案加载失败，请关闭面板后重试。");
      });
    return () => abort.abort();
  }, []);
  return (
    <>
      <p className="drawer-intro">
        码道版本的5条历史演示方案。可比较版本、检查项与备降剖面，并在真实底图上叠加几何示意。它们不会替换当前任务，也不会用于真实目的地规划。
      </p>
      {error && <p role="alert">{error}</p>}
      {routes.map((r) => (
        <div className="route-review-card" key={r.id}>
          <div>
            <span className="data-tag">DEMO · {r.version}</span>
            <b>{r.id}</b>
            <small>{r.algorithm}</small>
          </div>
          <h3>{r.title}</h3>
          <p>
            {r.task_id} · 预设能量 {r.energy_wh} Wh · 备降点 {r.site}
          </p>
          {r.samples.length > 0 && (
            <div className="review-minimum">
              <span>剖面示例最小余量</span>
              <strong
                className={
                  Math.min(...r.samples.map((p) => p.margin_wh)) < 0
                    ? "negative"
                    : ""
                }
              >
                {Math.min(...r.samples.map((p) => p.margin_wh)).toFixed(2)} Wh
              </strong>
            </div>
          )}
          <ul>
            {r.checks.map((check, i) => (
              <li key={i} className={check.passed ? "pass" : "rejected"}>
                {check.passed ? (
                  <Check size={11} />
                ) : (
                  <TriangleAlert size={11} />
                )}
                <span>
                  {check.name}
                  <small>{check.detail}</small>
                </span>
              </li>
            ))}
          </ul>
          <p className="review-source">
            {r.source} · {r.captured_at} · 构造数据
          </p>
          <button className="button full-width" onClick={() => onSelect(r)}>
            <MapPin size={13} />
            地图与剖面对比
          </button>
        </div>
      ))}
    </>
  );
}

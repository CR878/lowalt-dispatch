import { useCallback, useEffect, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import { validLngLat, type GeoMission, type LngLat } from "./geo";
import { parseRoutes, type NavRoute } from "./navigation/engine";
import "./real-routing.css";
import { useAircraft, type Assessment } from "./aircraft";
import { VehicleAssessment, VehicleSelect } from "./AircraftLibrary";

export type RealScene = {
  obstacles: FeatureCollection;
  roads: FeatureCollection;
};
type RoutingResult = {
  status: string;
  route: unknown;
  scene_id: string | null;
  clearance_m: number;
  grid_clearance_m: number;
  resolution_m: number;
  elapsed_ms: number;
  obstacle_source: string;
  weather_source: string;
  warnings: string[];
  limitation: string;
  alternatives: { reason: string | null }[];
  vehicle_assessment?: Assessment;
  data: {
    building_count?: number;
    road_count?: number;
    fetched_at?: string;
    attribution?: string;
  };
  weather: {
    status: string;
    scheduled_for?: string;
    energy?: {
      status: string;
      reason?: string;
      duration_s?: number;
      energy_wh?: number;
      remaining_after_reserve_wh?: number;
    };
    warnings?: string[];
    samples?: {
      at: string;
      valid_for?: string;
      status: string;
      values: Record<string, number | null>;
    }[];
  };
};

export function useRealRouting(
  mission: GeoMission,
  onReady: (route: NavRoute) => void,
) {
  const aircraft = useAircraft();
  const [payloadKg, setPayloadKg] = useState("");
  const selectionRef = useRef(aircraft.selection);
  selectionRef.current = aircraft.selection;
  const payloadRef = useRef(payloadKg);
  payloadRef.current = payloadKg;
  const [queriedVehicle, setQueriedVehicle] = useState("");
  const selectionKey = JSON.stringify([aircraft.selection, payloadKg]);
  const [result, setResult] = useState<RoutingResult | null>(null);
  const [route, setRoute] = useState<NavRoute | null>(null);
  const [scene, setScene] = useState<RealScene | null>(null);
  const [queriedSchedule, setQueriedSchedule] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const key = JSON.stringify([
    mission.origin?.point,
    mission.destination?.point,
  ]);
  // Clear route and downloaded context whenever the actual endpoints change.
  useEffect(() => {
    abort.current?.abort();
    abort.current = null;
    setResult(null);
    setRoute(null);
    setScene(null);
    setQueriedSchedule(null);
    setBusy(false);
    setError("");
    return () => {
      abort.current?.abort();
      abort.current = null;
    };
  }, [key]);
  const compute = useCallback(
    async (
      points: GeoMission,
      scheduledFor: string | null = null,
      intakePayload?: number | null,
    ) => {
      if (!points.origin || !points.destination) return;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const timer = window.setTimeout(() => controller.abort(), 180_000);
      setBusy(true);
      setError("");
      setResult(null);
      setRoute(null);
      setScene(null);
      const selection = selectionRef.current;
      const payloadText =
        intakePayload == null ? payloadRef.current : String(intakePayload);
      if (intakePayload != null) setPayloadKg(payloadText);
      const vehicleKey = JSON.stringify([selection, payloadText]);
      try {
        const [lng, lat] = points.origin.point;
        const [endLng, endLat] = points.destination.point;
        const response = await fetch("/api/assistant/navigation/candidates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Aeris-Request": "1",
          },
          signal: controller.signal,
          body: JSON.stringify({
            frame: "WGS84",
            origin: { lng, lat },
            destination: { lng: endLng, lat: endLat },
            scheduled_for: scheduledFor,
            ...selection,
            payload_kg: payloadText.trim() ? Number(payloadText) : null,
          }),
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.detail?.reason ||
              (typeof payload.detail === "string"
                ? payload.detail
                : "真实航线计算失败"),
          );
        if (controller.signal.aborted) return;
        setQueriedSchedule(scheduledFor);
        setQueriedVehicle(vehicleKey);
        setResult(payload);
        if (payload.route) {
          const parsed = parseRoutes(payload.route)[0];
          if (
            parsed.frame !== "WGS84" ||
            !parsed.waypoints.every((p) => validLngLat([p.x, p.y]))
          )
            throw new Error("服务返回的真实航线坐标无效");
          setRoute(parsed);
          onReady(parsed);
        }
        if (payload.scene_id) {
          const data = await fetch(
            `/api/assistant/navigation/scenes/${encodeURIComponent(payload.scene_id)}`,
            { signal: controller.signal },
          );
          if (!data.ok)
            throw new Error(
              "航线已计算，但同一批建筑和道路快照加载失败，请重试",
            );
          const snapshot = await data.json();
          if (!controller.signal.aborted) setScene(snapshot);
        }
      } catch (e) {
        if (abort.current === controller)
          setError(
            e instanceof Error && e.name !== "AbortError"
              ? e.message
              : "真实数据获取或规划已取消／超时，请重试",
          );
      } finally {
        window.clearTimeout(timer);
        if (abort.current === controller) setBusy(false);
      }
    },
    [onReady],
  );
  return {
    result,
    route,
    scene,
    busy,
    error,
    compute,
    queriedSchedule,
    aircraft,
    payloadKg,
    setPayloadKg,
    vehicleChanged: queriedVehicle !== selectionKey,
  };
}

export function RealRoutingPanel({
  routing,
  mission,
  scheduledFor,
  onSchedule,
}: {
  routing: ReturnType<typeof useRealRouting>;
  mission: GeoMission;
  scheduledFor: string | null;
  onSchedule: (value: string | null) => void;
}) {
  const { result, route, error, busy } = routing;
  if (!mission.origin || !mission.destination) return null;
  const points: LngLat[] = route?.waypoints.map((p) => [p.x, p.y]) ?? [];
  const scheduleChanged =
    routing.queriedSchedule === null || scheduledFor === null
      ? routing.queriedSchedule !== scheduledFor
      : Math.abs(
          Date.parse(routing.queriedSchedule) - Date.parse(scheduledFor),
        ) > 1000;
  return (
    <section
      className="real-routing glass"
      aria-label="真实数据航线规划"
      data-testid="real-routing"
    >
      <strong>真实建筑避障规划</strong>
      <p>
        {mission.origin.name} → {mission.destination.name}
      </p>
      <VehicleSelect aircraft={routing.aircraft} />
      <a href="/aircraft">查看官方规格 / 管理自定义机型 →</a>
      <label>
        配送载荷 (kg)
        <input
          aria-label="航线配送载荷"
          type="number"
          min="0"
          max="1000"
          step="any"
          placeholder="未填则不判定载荷"
          value={routing.payloadKg}
          onChange={(e) => routing.setPayloadKg(e.target.value)}
        />
      </label>
      <label>
        起飞时刻（留空查询当前预报）
        <input
          aria-label="真实航线起飞时刻"
          type="datetime-local"
          value={scheduledFor ? localTime(scheduledFor) : ""}
          onChange={(e) =>
            onSchedule(
              e.target.value ? new Date(e.target.value).toISOString() : null,
            )
          }
        />
      </label>
      <button
        disabled={busy}
        onClick={() => void routing.compute(mission, scheduledFor)}
      >
        {busy ? "正在获取真实地图并规划…" : "计算真实避障航线"}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          {result.weather.scheduled_for && (
            <p>
              本次预报时刻：
              {new Date(result.weather.scheduled_for).toLocaleString("zh-CN")}
              （本地时间）
            </p>
          )}
          {scheduleChanged && (
            <p role="alert">
              起飞时刻已更改，请重新计算；下方结果仍对应上次查询时刻。
            </p>
          )}
          {routing.vehicleChanged && (
            <p role="alert">
              机型或载荷已更改，请重新计算；下方为上次参数的结果。
            </p>
          )}
          <p>
            {route
              ? `几何 A* · ${points.length} 个 WGS84 航点`
              : `未找到航线：${result.alternatives[0]?.reason ?? "未知原因"}`}
          </p>
          <p>
            要求水平净空 ≥ {result.clearance_m} m · 网格 {result.resolution_m} m
            · 搜索 {(result.elapsed_ms / 1000).toFixed(2)} s
          </p>
          <p>建筑高度：OSM 标签／楼层推算／未知；点击建筑查看来源。</p>
          {result.data.building_count != null && (
            <p>
              本次数据：{result.data.building_count} 栋建筑 ·{" "}
              {result.data.road_count ?? "未知"} 条道路
            </p>
          )}
          <p>
            天气：
            {result.weather.status === "ok"
              ? "已获取模式预报"
              : "预报或性能评估不完整"}{" "}
            · 能耗：
            {result.weather.energy?.status === "user_test"
              ? "用户参数与真实预报的条件测试"
              : result.weather.energy?.status === "conditional"
                ? "已计算机型条件估算，未判定飞行可行"
                : result.weather.energy?.status === "infeasible"
                  ? "风场下无法保持航迹，条件不满足"
                  : "缺少有效数据，未计算"}
          </p>
          {result.vehicle_assessment && (
            <VehicleAssessment value={result.vehicle_assessment} />
          )}
          {result.weather.energy?.energy_wh != null && (
            <p>
              预报风场下条件测试：
              {(result.weather.energy.duration_s! / 60).toFixed(1)} 分钟 ·{" "}
              {result.weather.energy.energy_wh.toFixed(1)} Wh
              {result.weather.energy.remaining_after_reserve_wh != null
                ? ` · 扣除保留量后 ${result.weather.energy.remaining_after_reserve_wh.toFixed(1)} Wh`
                : ""}
              。未含起降、返航与备降。
            </p>
          )}
          {result.weather.samples?.length ? (
            <details>
              <summary>航路天气预报数值</summary>
              <table>
                <thead>
                  <tr>
                    <th>位置</th>
                    <th>风速 m/s</th>
                    <th>温度 °C</th>
                    <th>湿度 %</th>
                  </tr>
                </thead>
                <tbody>
                  {result.weather.samples.map((sample) => (
                    <tr key={sample.at}>
                      <td>
                        {(
                          {
                            origin: "起点",
                            midpoint: "中点",
                            destination: "终点",
                          } as Record<string, string>
                        )[sample.at] ?? sample.at}
                      </td>
                      {[
                        "wind_speed_10m",
                        "temperature_2m",
                        "relative_humidity_2m",
                      ].map((field) => (
                        <td key={field}>
                          {sample.values[field] == null
                            ? "不可用"
                            : sample.values[field]!.toFixed(1)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <small>
                10 m 模式风与 2 m 温湿度，非航高实测。缺失值不补零。
              </small>
            </details>
          ) : null}
          <details>
            <summary>数据来源与限制</summary>
            <p>
              {result.obstacle_source} · {result.weather_source}
            </p>
            <p>{result.limitation}</p>
            {result.data.fetched_at && (
              <p>地图抓取：{result.data.fetched_at}</p>
            )}
            <p>
              ©{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                OpenStreetMap contributors · ODbL
              </a>
            </p>
            <ul>
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
          {route && (
            <button
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(result, null, 2)], {
                    type: "application/json",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = `${route.id}.json`;
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              导出航点与来源 JSON
            </button>
          )}
        </>
      )}
      <small>
        空域未接入，须人工核对 UOM / NOTAM。仅水平几何参考，未生成飞控指令。
      </small>
    </section>
  );
}

function localTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

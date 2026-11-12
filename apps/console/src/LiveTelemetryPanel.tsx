import { useId } from "react";
import { Activity, BatteryCharging, Compass, MapPin } from "lucide-react";
import type { LiveTelemetry } from "./types";
import "./liveTelemetry.css";

type Reading = number | string | null | undefined;
type Row = [name: string, value: Reading, unit?: string, decimals?: number];
type SamplePoint = { x: number; y: number; time: number };

export function Drone({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M6 18 18 6" />
      <rect x="9" y="9" width="6" height="6" rx="2" />
      {[
        [5, 5],
        [19, 5],
        [5, 19],
        [19, 19],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" />
      ))}
    </svg>
  );
}

function display(value: Reading, decimals = 1) {
  return typeof value === "number" ? value.toFixed(decimals) : (value ?? "—");
}

function trace(points: (SamplePoint | null)[]) {
  let previous: SamplePoint | null = null;
  return points
    .map((point) => {
      const command =
        previous && point && point.time - previous.time <= 5000 ? "L" : "M";
      previous = point;
      return point ? `${command}${point.x},${point.y}` : "";
    })
    .join(" ");
}

export function LiveLocalTrack({
  history,
  active,
}: {
  history: LiveTelemetry[];
  active: boolean;
}) {
  const grid = useId();
  const current = history.at(-1);
  const position = current?.position;
  const coordinateFrame = position?.frame === "WGS84" ? null : position?.frame;
  if (!coordinateFrame)
    return (
      <div className="map-stage live-local-track live-track-empty">
        <MapPin size={22} />
        等待局部定位
      </div>
    );

  const points = history.map(({ position: sample, captured_at }) =>
    sample?.frame === coordinateFrame
      ? {
          x: sample.frame === "NED" ? sample.y_m : sample.x_m,
          y: sample.frame === "NED" ? sample.x_m : sample.y_m,
          time: Date.parse(captured_at),
        }
      : null,
  );
  const available = points.filter(
    (point): point is SamplePoint => point !== null,
  );
  const east = available.map((point) => point.x);
  const north = available.map((point) => point.y);
  const minE = Math.min(...east),
    maxE = Math.max(...east);
  const minN = Math.min(...north),
    maxN = Math.max(...north);
  const width = 480,
    height = 300;
  const scale = Math.min(
    (width - 100) / Math.max(20, maxE - minE),
    (height - 100) / Math.max(20, maxN - minN),
  );
  const plotted = points.map(
    (point) =>
      point && {
        ...point,
        x: width / 2 + (point.x - (minE + maxE) / 2) * scale,
        y: height / 2 - (point.y - (minN + maxN) / 2) * scale,
      },
  );
  const last = plotted.at(-1)!;
  const scaleMeters = 10 ** Math.floor(Math.log10(110 / scale));
  const scalePixels = scaleMeters * scale;
  const heading = current?.heading;

  return (
    <div className="map-stage live-local-track" aria-label="局部遥测轨迹">
      <svg
        viewBox="0 0 480 300"
        role="img"
        aria-label={`${coordinateFrame} 局部轨迹，北向上，东向右`}
      >
        <defs>
          <pattern
            id={grid}
            width={scalePixels}
            height={scalePixels}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M0 ${scalePixels}V0H${scalePixels}`}
              fill="none"
              stroke="var(--track-grid)"
            />
          </pattern>
        </defs>
        <rect
          x="1"
          y="1"
          width="478"
          height="298"
          rx="10"
          fill={`url(#${grid})`}
          stroke="var(--track-grid)"
        />
        <path className="live-track-line" d={trace(plotted)} />
        <g
          className="live-aircraft-marker"
          data-testid="live-aircraft-marker"
          style={{ transform: `translate(${last.x}px, ${last.y}px)` }}
          data-active={active}
        >
          <circle r="19" className="live-aircraft-halo" />
          <circle r="13" className="live-aircraft-body" />
          {heading != null && (
            <path
              className="live-aircraft-heading"
              d="M0 -22L-4 -16H4Z"
              transform={`rotate(${heading})`}
            />
          )}
          <g transform="translate(-9 -9)">
            <Drone size={18} />
          </g>
        </g>
        <g className="live-track-scale" transform="translate(19 273)">
          <path d={`M0 -4V0H${scalePixels}V-4`} />
          <text y="-9">{scaleMeters} m</text>
        </g>
        <text
          x="454"
          y="23"
          textAnchor="middle"
          className="live-track-direction"
        >
          北 ↑
        </text>
      </svg>
      <div className="live-track-caption">
        <span>
          <Compass size={13} />
          {coordinateFrame} 局部坐标
        </span>
        <span>
          {current?.in_air == null
            ? ""
            : current.in_air
              ? "空中 · "
              : "地面 · "}
          {available.length} 帧 · {active ? "实时" : "最后读数"}
        </span>
      </div>
    </div>
  );
}

function Trend({
  history,
  field,
  title,
  unit,
}: {
  history: LiveTelemetry[];
  field: "speed" | "pitch";
  title: string;
  unit: string;
}) {
  const current = history.at(-1);
  const values = history.flatMap((sample) =>
    sample[field] == null ? [] : [sample[field]],
  );
  const low = Math.min(...values),
    high = Math.max(...values);
  const time = Date.parse(current?.captured_at ?? "");
  const minTime = Math.max(
    time - 60_000,
    Date.parse(history[0]?.captured_at ?? ""),
  );
  const points = history.map((sample) => {
    const value = sample[field];
    if (value == null) return null;
    const captured = Date.parse(sample.captured_at);
    return {
      x: 8 + (284 * (captured - minTime)) / Math.max(1000, time - minTime),
      y: high === low ? 40 : 68 - (56 * (value - low)) / (high - low),
      time: captured,
    };
  });
  const last = points.at(-1);
  return (
    <div className="live-trend" data-series={field}>
      <div>
        <span>
          <Activity size={14} />
          {title}
        </span>
        <strong>
          {display(current?.[field])} <small>{unit}</small>
        </strong>
      </div>
      {values.length ? (
        <svg viewBox="0 0 300 80" role="img" aria-label={`${title}遥测趋势`}>
          <path className="live-trend-grid" d="M8 14H292M8 40H292M8 68H292" />
          <path className="live-trend-line" d={trace(points)} />
          {last && (
            <circle
              className="live-trend-tip"
              r="4"
              style={{ transform: `translate(${last.x}px, ${last.y}px)` }}
            />
          )}
          <text x="8" y="80" className="live-trend-axis">
            {time === minTime
              ? "单帧"
              : `−${Math.round((time - minTime) / 1000)} s`}
          </text>
          <text x="292" y="80" className="live-trend-axis" textAnchor="end">
            最新
          </text>
        </svg>
      ) : (
        <p>等待该字段的样本</p>
      )}
    </div>
  );
}

export function LiveTelemetryDetails({
  history,
  status,
}: {
  history: LiveTelemetry[];
  status: string;
}) {
  const frame = history.at(-1);
  const position = frame?.position;
  const coords: Row[] =
    position?.frame === "WGS84"
      ? [
          ["经度", position.lon_deg, "°", 6],
          ["纬度", position.lat_deg, "°", 6],
        ]
      : [
          [
            "北向位置",
            position?.frame === "NED" ? position.x_m : position?.y_m,
            "m",
          ],
          [
            "东向位置",
            position?.frame === "NED" ? position.y_m : position?.x_m,
            "m",
          ],
          [
            position?.frame === "ENU" ? "上向位置" : "下向位置",
            position?.z_m,
            "m",
          ],
        ];
  const altitude = frame?.altitude_ref
    ? { agl: "离地高度", amsl: "海拔高度", rel_takeoff: "相对起飞点高度" }[
        frame.altitude_ref
      ]
    : "高度";
  const groups: { title: string; icon: typeof Activity; rows: Row[] }[] = [
    {
      title: "飞行与姿态",
      icon: Activity,
      rows: [
        ["飞行模式", frame?.flight_mode],
        [
          "空地状态",
          frame?.in_air == null ? null : frame.in_air ? "空中" : "地面",
        ],
        ["地速", frame?.speed, "m/s"],
        ["升降率", frame?.climb, "m/s"],
        ["俯仰", frame?.pitch, "°"],
        ["横滚", frame?.roll, "°"],
        ["航向", frame?.heading, "°"],
      ],
    },
    {
      title: "电源",
      icon: BatteryCharging,
      rows: [
        ["剩余电量", frame?.battery, "%"],
        ["电压", frame?.voltage, "V"],
        ["电流", frame?.current, "A"],
        ["剩余能量", frame?.energyWh, "Wh"],
      ],
    },
    {
      title: position ? `定位 · ${position.frame}` : "定位",
      icon: MapPin,
      rows: [
        ...coords,
        [altitude, frame?.altitude, "m"],
        ["GPS 定位", frame?.gps_fix],
      ],
    },
  ];
  return (
    <section
      className="panel live-telemetry-details"
      id="live-telemetry-details"
      aria-labelledby="live-telemetry-title"
    >
      <header>
        <h2 id="live-telemetry-title">遥测明细</h2>
        <div>
          <span>{status}</span>
          {frame && (
            <time dateTime={frame.captured_at}>
              {new Date(frame.captured_at).toLocaleTimeString()}
            </time>
          )}
        </div>
      </header>
      <div className="live-trends" aria-label="最近 60 秒遥测趋势">
        <Trend history={history} field="speed" title="地速" unit="m/s" />
        <Trend history={history} field="pitch" title="俯仰" unit="°" />
      </div>
      <div className="live-metric-groups">
        {groups.map(({ title, icon: Icon, rows }) => (
          <table key={title} className="live-metrics">
            <caption>
              <Icon size={15} />
              {title}
            </caption>
            <thead>
              <tr>
                <th scope="col">指标</th>
                <th scope="col">读数</th>
                <th scope="col">单位</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, value, unit, decimals]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td
                    className={
                      value == null ? "live-metric-missing" : undefined
                    }
                  >
                    {display(value, decimals)}
                  </td>
                  <td>{unit ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <p className="live-metrics-note">— 表示当前采样未提供该字段。</p>
    </section>
  );
}

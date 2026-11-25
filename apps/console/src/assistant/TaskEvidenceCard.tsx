import { useState } from "react";
import type { TaskEvidence } from "./taskEvidence";
import "./taskEvidence.css";

const fixed = (n: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(n);
const xy = (p: [number, number]) => `${p[0]},${3000 - p[1]}`;

export function EvidenceMap({
  evidence: e,
  sampleIndex,
}: {
  evidence: TaskEvidence;
  sampleIndex: number;
}) {
  const sample =
    e.samples[Math.min(e.samples.length - 1, Math.max(0, sampleIndex))];
  const site = e.sites.find((s) => s.id === sample.nearest_site_id);
  return (
    <svg
      viewBox="-100 -100 3200 3200"
      role="img"
      aria-label={`算法场景 ${e.scenario_id} 地图`}
      className="task-evidence-map"
      data-sample={sampleIndex}
    >
      <rect
        x="0"
        y="0"
        width="3000"
        height="3000"
        className="evidence-ground"
      />
      {e.buildings.map((polygon, i) => (
        <polygon
          key={i}
          points={polygon.map(xy).join(" ")}
          className="evidence-building"
        />
      ))}
      <polyline
        points={e.waypoints.map(xy).join(" ")}
        className="evidence-route"
        data-verdict={e.verdict}
      />
      {site && (
        <line
          x1={sample.point[0]}
          y1={3000 - sample.point[1]}
          x2={site.point[0]}
          y2={3000 - site.point[1]}
          className="evidence-nearest"
        >
          <title>最近备降点标识连线；实际撤离距离由栅格计算</title>
        </line>
      )}
      {e.sites.map((s) => (
        <g key={s.id}>
          <circle
            cx={s.point[0]}
            cy={3000 - s.point[1]}
            r={s.id === sample.nearest_site_id ? 45 : 30}
            className="evidence-site"
          />
          <text x={s.point[0] + 45} y={3000 - s.point[1]}>
            {s.id}
          </text>
        </g>
      ))}
      <circle
        cx={sample.point[0]}
        cy={3000 - sample.point[1]}
        r="48"
        className="evidence-cursor"
      />
      {[e.waypoints[0], e.waypoints[e.waypoints.length - 1]].map((p, i) => (
        <text key={i} x={p[0]} y={3000 - p[1] - 65}>
          {i ? "终" : "起"}
        </text>
      ))}
      <text x="80" y="2940">
        ENU · 3000 × 3000 m · N ↑
      </text>
    </svg>
  );
}

export function TaskEvidenceCard({
  evidence: e,
  sampleIndex,
  onSample,
  onLocate,
}: {
  evidence: TaskEvidence;
  sampleIndex?: number;
  onSample?: (index: number) => void;
  onLocate?: () => void;
}) {
  const [local, setLocal] = useState(0);
  const index = Math.min(
    e.samples.length - 1,
    Math.max(0, sampleIndex ?? local),
  );
  const sample = e.samples[index];
  const select = (i: number) => {
    setLocal(i);
    onSample?.(i);
  };
  const margins = e.samples.map((s) => s.margin_wh);
  const min = Math.min(0, ...margins),
    max = Math.max(1, ...margins);
  const x = (i: number) => 15 + (270 * e.samples[i].s_m) / (e.length_m || 1);
  const y = (m: number) => 95 - (80 * (m - min)) / (max - min);
  return (
    <div
      className="task-evidence"
      data-revision={e.revision}
      data-task-id={e.task_id}
    >
      <div className="evidence-verdict" data-verdict={e.verdict}>
        <strong>{e.task_id}</strong>
        <span>
          {e.verdict === "passed" ? "示例参数下通过" : "独立校验拒绝"}
        </span>
      </div>
      <p>
        {e.origin} → {e.destination} · {fixed(e.payload_kg)} kg
      </p>
      <small>{e.vehicle_label}</small>
      <p>
        {e.algorithm} · {fixed(e.length_m)} m
      </p>
      <EvidenceMap evidence={e} sampleIndex={index} />
      <svg
        viewBox="0 0 300 112"
        className="evidence-profile"
        role="img"
        aria-label="沿线备降余量曲线"
      >
        <line x1="15" x2="285" y1={y(0)} y2={y(0)} className="evidence-zero" />
        <polyline points={margins.map((m, i) => `${x(i)},${y(m)}`).join(" ")} />
        <line
          x1={x(index)}
          x2={x(index)}
          y1="10"
          y2="98"
          className="evidence-profile-cursor"
        />
        <circle cx={x(index)} cy={y(sample.margin_wh)} r="4" />
        <text x="15" y="110">
          备降余量 Wh · 含保留量
        </text>
        <text x="15" y="10">
          {fixed(max)}
        </text>
      </svg>
      <input
        type="range"
        min="0"
        max={e.samples.length - 1}
        step="1"
        value={index}
        aria-label="证据采样点"
        onChange={(event) => select(Number(event.target.value))}
      />
      <p className="evidence-sample">
        {fixed(sample.s_m)} m · 余量 {fixed(sample.margin_wh)} Wh · 备降点{" "}
        {sample.nearest_site_id ?? "不可达"}
      </p>
      {onLocate && (
        <button type="button" className="evidence-locate" onClick={onLocate}>
          定位算法地图
        </button>
      )}
      <details>
        <summary>
          独立校验 · {e.checks.filter((c) => c.passed).length}/{e.checks.length}{" "}
          项通过
        </summary>
        <ul>
          {e.checks.map((c) => (
            <li key={c.name} data-passed={c.passed}>
              <strong>
                {c.passed ? "通过" : "拒绝"} · {c.name}
              </strong>
              <p>{c.detail}</p>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>候选航线与来源</summary>
        {e.candidates.map((c) => (
          <p key={c.algorithm}>
            {c.algorithm}：{c.found ? `${fixed(c.length_m)} m` : "未返回航线"}{" "}
            {c.reason}
          </p>
        ))}
        <code>route {e.route_digest.slice(0, 16)}</code>
      </details>
      <details open>
        <summary>数据缺口与适用边界</summary>
        <ul>
          {e.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </details>
      <footer>
        {e.source}
        <br />
        <time>{e.generated_at}</time>
        <br />
        证据 {e.revision.slice(0, 12)} · 冻结仿真 · 未下发
      </footer>
    </div>
  );
}

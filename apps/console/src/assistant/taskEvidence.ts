export type EvidencePoint = [number, number];
export type TaskEvidence = {
  case: "main" | "contrast";
  task_id: string;
  scenario_id: string;
  source: string;
  generated_at: string;
  revision: string;
  origin: string;
  destination: string;
  payload_kg: number;
  vehicle_label: string;
  algorithm: "astar_static" | "astar_diversion";
  verdict: "passed" | "rejected";
  route_id: string;
  route_digest: string;
  length_m: number;
  waypoints: EvidencePoint[];
  samples: {
    point: EvidencePoint;
    s_m: number;
    margin_wh: number;
    nearest_site_id: string | null;
  }[];
  checks: { name: string; passed: boolean; detail: string }[];
  candidates: {
    algorithm: string;
    found: boolean;
    length_m: number;
    reason: string | null;
  }[];
  gaps: string[];
  buildings: EvidencePoint[][];
  sites: { id: string; point: EvidencePoint }[];
  dispatch_enabled: false;
  is_simulated: true;
};

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, n = 240): v is string =>
  typeof v === "string" && v.length <= n;
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const point = (v: unknown) =>
  Array.isArray(v) &&
  v.length === 2 &&
  v.every((x) => finite(x) && x >= 0 && x <= 3000);
const list = (v: unknown, n: number): v is unknown[] =>
  Array.isArray(v) && v.length <= n;

/** Tool payloads cross a trust boundary: unknown/malformed evidence falls back to text. */
export function readTaskEvidence(v: unknown): TaskEvidence | undefined {
  if (
    !record(v) ||
    !["main", "contrast"].includes(String(v.case)) ||
    !["passed", "rejected"].includes(String(v.verdict)) ||
    !["astar_static", "astar_diversion"].includes(String(v.algorithm))
  )
    return;
  if (
    ![
      "task_id",
      "scenario_id",
      "source",
      "generated_at",
      "origin",
      "destination",
      "vehicle_label",
      "route_id",
    ].every((k) => text(v[k]))
  )
    return;
  if (
    ![v.revision, v.route_digest].every(
      (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x),
    )
  )
    return;
  if (
    !finite(v.payload_kg) ||
    v.payload_kg < 0 ||
    !finite(v.length_m) ||
    v.length_m < 0 ||
    v.dispatch_enabled !== false ||
    v.is_simulated !== true
  )
    return;
  if (
    !list(v.waypoints, 5000) ||
    v.waypoints.length < 2 ||
    !v.waypoints.every(point)
  )
    return;
  if (
    !list(v.samples, 1000) ||
    !v.samples.length ||
    !v.samples.every(
      (s) =>
        record(s) &&
        point(s.point) &&
        finite(s.s_m) &&
        s.s_m >= 0 &&
        finite(s.margin_wh) &&
        (s.nearest_site_id === null || text(s.nearest_site_id)),
    )
  )
    return;
  if (
    !list(v.checks, 20) ||
    !v.checks.length ||
    !v.checks.every(
      (c) =>
        record(c) &&
        text(c.name) &&
        typeof c.passed === "boolean" &&
        text(c.detail, 2000),
    )
  )
    return;
  if (
    (v.verdict === "passed") !==
    v.checks.every((c) => (c as Record<string, unknown>).passed === true)
  )
    return;
  if (
    !list(v.candidates, 2) ||
    !v.candidates.length ||
    !v.candidates.every(
      (c) =>
        record(c) &&
        text(c.algorithm) &&
        typeof c.found === "boolean" &&
        finite(c.length_m) &&
        c.length_m >= 0 &&
        (c.reason === null || text(c.reason, 2000)),
    )
  )
    return;
  if (!list(v.gaps, 12) || !v.gaps.length || !v.gaps.every((s) => text(s, 600)))
    return;
  if (
    !list(v.buildings, 200) ||
    !v.buildings.every((p) => list(p, 1000) && p.length >= 3 && p.every(point))
  )
    return;
  if (
    !list(v.sites, 50) ||
    !v.sites.every((s) => record(s) && text(s.id) && point(s.point))
  )
    return;
  return v as TaskEvidence;
}

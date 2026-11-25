import type { ChartSpec } from "./ChartBlock";
import { readTaskEvidence, type TaskEvidence } from "./taskEvidence";

type BlockBase = {
  title: string;
  source: string;
  as_of: string | null;
  note: string;
};
export type ResponseBlock = BlockBase &
  (
    | { type: "task_evidence"; evidence: TaskEvidence }
    | {
        type: "metrics";
        items: { label: string; value: number | null; unit: string }[];
      }
    | { type: "chart"; chart: ChartSpec }
    | { type: "table"; columns: string[]; rows: (string | number | null)[][] }
    | {
        type: "timeline";
        items: {
          time: string;
          title: string;
          detail: string;
          level: "info" | "warning" | "success";
        }[];
      }
    | {
        type: "route";
        route_id: string;
        draft_digest: string;
        length_m: number;
        waypoints: [number, number][];
      }
  );
export type Presentation = { version: 1; blocks: ResponseBlock[] };

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, limit = 240): v is string =>
  typeof v === "string" && v.length <= limit;
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const cell = (v: unknown) => v === null || finite(v) || text(v, 300);

function validBlock(value: unknown): value is ResponseBlock {
  if (
    !object(value) ||
    !text(value.title, 80) ||
    !text(value.source) ||
    !(value.as_of === null || text(value.as_of, 80)) ||
    !text(value.note, 600)
  )
    return false;
  switch (value.type) {
    case "task_evidence":
      return !!readTaskEvidence(value.evidence);
    case "metrics":
      return (
        Array.isArray(value.items) &&
        value.items.length > 0 &&
        value.items.length <= 8 &&
        value.items.every(
          (item: unknown) =>
            object(item) &&
            text(item.label, 60) &&
            text(item.unit, 24) &&
            (item.value === null || finite(item.value)),
        )
      );
    case "chart": {
      const c = value.chart;
      return (
        object(c) &&
        ["bar", "pie", "line"].includes(String(c.type)) &&
        text(c.title, 80) &&
        text(c.unit, 24) &&
        Array.isArray(c.data) &&
        c.data.length > 0 &&
        c.data.length <= 12 &&
        c.data.every(
          (item: unknown) =>
            object(item) &&
            text(item.label, 80) &&
            finite(item.value) &&
            (c.type !== "pie" || item.value >= 0),
        )
      );
    }
    case "table":
      return (
        Array.isArray(value.columns) &&
        value.columns.length > 0 &&
        value.columns.length <= 6 &&
        value.columns.every((v) => text(v, 80)) &&
        Array.isArray(value.rows) &&
        value.rows.length <= 20 &&
        value.rows.every(
          (row) =>
            Array.isArray(row) &&
            row.length === (value.columns as unknown[]).length &&
            row.every(cell),
        )
      );
    case "timeline":
      return (
        Array.isArray(value.items) &&
        value.items.length <= 30 &&
        value.items.every(
          (item: unknown) =>
            object(item) &&
            text(item.time, 80) &&
            text(item.title, 200) &&
            text(item.detail, 1000) &&
            ["info", "warning", "success"].includes(String(item.level)),
        )
      );
    case "route":
      return (
        text(value.route_id, 160) &&
        text(value.draft_digest, 160) &&
        finite(value.length_m) &&
        value.length_m >= 0 &&
        Array.isArray(value.waypoints) &&
        value.waypoints.length >= 2 &&
        value.waypoints.length <= 5000 &&
        value.waypoints.every(
          (p) =>
            Array.isArray(p) &&
            p.length === 2 &&
            p.every((v) => finite(v) && v >= 0 && v <= 3000),
        )
      );
    default:
      return false;
  }
}

/** An unsupported UI block falls back to the existing text reply. */
export function readPresentation(value: unknown): Presentation | undefined {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.blocks))
    return undefined;
  const blocks = value.blocks.slice(0, 6).filter(validBlock);
  return blocks.length ? { version: 1, blocks } : undefined;
}

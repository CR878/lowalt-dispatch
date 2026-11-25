import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readTaskEvidence } from "../src/assistant/taskEvidence.ts";
import { readPresentation } from "../src/assistant/presentation.ts";
import { RoutePolyline } from "../src/routeGeometry.ts";
import { Vector3 } from "three";
import { sampleWind, windRegionFor } from "../src/weather.ts";
import {
  chapters,
  DURATION,
  frameAt,
  timeLabel,
  visualViewAt,
} from "../src/demo/playback.ts";

import { landmarks, makeCityLots } from "../src/demo/city-layout.ts";

test("environment UI v2 accepts evidence and rejects malformed nested blocks", () => {
  const base = { title: "environment", source: "test", as_of: null, note: "" };
  const factor = {
    id: "wind",
    name: "wind",
    status: "unavailable",
    value: null,
    unit: "m/s",
    threshold: null,
    threshold_source: null,
    effect: "hard",
    segment_index: null,
    reason: "no data",
  };
  const block = {
    ...base,
    type: "env_matrix",
    verdict: "unknown",
    verdict_reason: "missing data",
    factors: [factor],
    coverage_statement: "not continuous",
    evidence_id: "env-123456789abc",
  };
  assert.equal(
    readPresentation({ version: 2, blocks: [block] }).blocks[0].type,
    "env_matrix",
  );
  assert.equal(
    readPresentation({ version: 2, blocks: [{ ...block, factors: [null] }] }),
    undefined,
  );
  assert.equal(
    readPresentation({
      version: 2,
      blocks: [{ ...base, type: "gaps", total: 1, items: [null] }],
    }),
    undefined,
  );
  assert.equal(
    readPresentation({
      version: 2,
      blocks: [
        { ...base, type: "time_window", caveat: "test", options: [null, null] },
      ],
    }),
    undefined,
  );
});

test("frozen task contracts accept both cases and reject contradictory or malformed data", () => {
  const bundle = JSON.parse(
    readFileSync(
      new URL("../public/task-evidence.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(readTaskEvidence(bundle.cases.main).task_id, "T-S1-02");
  assert.equal(readTaskEvidence(bundle.cases.contrast).verdict, "rejected");
  assert.equal(
    readTaskEvidence({ ...bundle.cases.contrast, verdict: "passed" }),
    undefined,
  );
  assert.equal(
    readTaskEvidence({ ...bundle.cases.main, samples: [] }),
    undefined,
  );
  assert.equal(readTaskEvidence({ ...bundle.cases.main, gaps: [] }), undefined);
  assert.equal(
    readTaskEvidence({ ...bundle.cases.main, payload_kg: NaN }),
    undefined,
  );
});

test("fictional city has stable districts and unobstructed visual landmark labels", () => {
  const lots = makeCityLots();
  assert.deepEqual(lots, makeCityLots());
  assert.equal(lots.length, 51);
  assert.deepEqual([...new Set(lots.map((lot) => lot.style))].sort(), [
    "office",
    "residential",
    "warehouse",
  ]);
  for (const lot of lots) {
    assert.ok(lot.width > 0 && lot.depth > 0 && lot.height > 0);
    assert.ok(Math.abs(lot.x) - lot.width / 2 > 14);
    for (const point of landmarks) {
      assert.ok(Math.hypot(lot.x - point.x, lot.z - point.z) >= 15);
    }
  }
});

test("confirmation and chapter boundaries are deterministic", () => {
  assert.equal(frameAt(0, false).status, "等待确认");
  assert.equal(frameAt(0, true).confirmed, true);
  for (const chapter of chapters) {
    assert.equal(frameAt(chapter.time, true).chapter.title, chapter.title);
  }
  assert.equal(frameAt(117.9, true).phase, 3);
  assert.equal(frameAt(118, true).phase, 4);
  assert.equal(frameAt(118, true).signal, "退化（情景）");
  assert.equal(frameAt(142, true).phase, 5);
  assert.equal(frameAt(142, true).status, "几何航线回放结束 · 未下发");
});

test("replay never loops from its terminal state and seeking is reversible", () => {
  assert.equal(frameAt(-10, true).time, 0);
  assert.equal(frameAt(NaN, true).time, 0);
  assert.equal(frameAt(95, true).progress, 0);
  assert.equal(frameAt(142, true).progress, 1);
  assert.deepEqual(frameAt(DURATION, true), frameAt(DURATION + 500, true));
  assert.deepEqual(frameAt(118, true), frameAt(118, true));
  assert.equal(frameAt(0, false).progress, 0);
  assert.equal(timeLabel(DURATION), "03:00");
});

test("cinematic insert follows replay time and respects manual views", () => {
  assert.equal(visualViewAt("auto", 31.9), "city");
  assert.equal(visualViewAt("auto", 32), "detail");
  assert.equal(visualViewAt("auto", 33.9), "detail");
  assert.equal(visualViewAt("auto", 34), "studio");
  assert.equal(visualViewAt("auto", 48.9), "studio");
  assert.equal(visualViewAt("auto", 49), "detail");
  assert.equal(visualViewAt("auto", 52), "city");
  assert.equal(visualViewAt("city", 40), "city");
  assert.equal(visualViewAt("studio", 0), "studio");
  assert.equal(visualViewAt("detail", 0), "detail");
});

test("rendered route preserves corners and uses the same horizontal progress as maps", () => {
  const curve = new RoutePolyline([
    new Vector3(0, 0, 0),
    new Vector3(10, 99, 0),
    new Vector3(10, 100, 10),
  ]);
  assert.deepEqual(curve.getPointAt(0.25).toArray(), [5, 49.5, 0]);
  assert.deepEqual(curve.getPointAt(0.5).toArray(), [10, 99, 0]);
  assert.deepEqual(curve.getPointAt(0.75).toArray(), [10, 99.5, 5]);
  for (const p of curve.getPoints(100))
    assert.ok(Math.abs(p.z) < 1e-9 || Math.abs(p.x - 10) < 1e-9);
});

test("wind fields cover the selected city and never reuse another region's grid", () => {
  const point = [115.83, 28.76];
  const region = windRegionFor(point);
  const field = {
    region,
    validAt: "2026-11-25T00:00:00Z",
    vectors: Array.from({ length: 121 }, () => [3, -1]),
  };
  assert.deepEqual(sampleWind(field, point), [3, -1]);
  assert.equal(sampleWind(field, [121.47, 31.23]), null);
  assert.ok(region.west <= point[0] && region.east >= point[0]);
});

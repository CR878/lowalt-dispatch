import test from "node:test";
import assert from "node:assert/strict";
import {
  chapters,
  DURATION,
  frameAt,
  timeLabel,
} from "../src/demo/playback.ts";

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
  assert.equal(frameAt(142, true).status, "仿真备降 · 物资待接续");
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

"""Export one current algorithm run for map, profile and assistant baseline."""

# ruff: noqa: E402 -- direct script invocation needs the repository on sys.path.
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from apps.console.scripts.export_task_evidence import export
from planner.scene import load_scene
from sim.energy import climb_energy_wh, cruise_energy_wh, load_vehicle

if __name__ == "__main__":
    export()
    bundle = json.loads((ROOT / "apps/console/public/task-evidence.json").read_text(encoding="utf-8"))
    evidence = bundle["cases"]["contrast"]
    task = bundle["inputs"]["contrast"]["task"]
    vehicle = load_vehicle(ROOT / "scenarios/vehicles/example_not_real.yaml")
    scene = load_scene()
    active_zone_ids = {
        event["event_id"]
        for event in bundle["inputs"]["contrast"]["snapshot"]["events"]
        if event["kind"] == "restriction_zone"
    }
    data = {
        "metadata": {
            "source": evidence["source"],
            "isSimulated": True,
            "note": "Local ENU frozen algorithm run; example vehicle only. Building heights and terrain are illustrative, not measurements.",
            "generated_at": evidence["generated_at"],
            "revision": evidence["revision"],
            "route_digest": evidence["route_digest"],
        },
        "route": evidence["waypoints"],
        "energy_wh": cruise_energy_wh(vehicle, evidence["length_m"])
        + climb_energy_wh(vehicle, max(0, task["destination"]["alt_m"] - task["origin"]["alt_m"])),
        "margin_profile": evidence["samples"],
        "validation_checks": evidence["checks"],
        "buildings": [
            {"id": f"B{i + 1:02}", "polygon": polygon, "height": 24 + (i * 17 % 78)}
            for i, polygon in enumerate(scene.obstacles)
        ],
        "zones": [
            {"id": key, "polygon": z.polygon, "active": key in active_zone_ids}
            for key, z in scene.zones.items()
        ],
        "sites": [{"id": key, "point": [s.x, s.y]} for key, s in scene.sites.items()],
    }
    path = ROOT / "apps/console/public/demo-scene.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(
        f"Exported {len(data['route'])} identical baseline waypoints and {len(data['margin_profile'])} profile samples."
    )

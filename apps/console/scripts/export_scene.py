"""Export existing virtual scene and geometric baseline; no safety/effect claims."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from planner.astar import plan_scenario
from planner.scene import load_scene, load_suite

scene = load_scene()
scenario = next(s for s in load_suite()['scenarios'] if s['id'] == 'S1-01')
route, _ = plan_scenario(scenario, scene)
if not route.found:
    raise RuntimeError('Baseline route unavailable')
data = {
    'metadata': {
        'source': 'scenarios/v0 + planner.astar / S1-01',
        'isSimulated': True,
        'note': 'Local ENU virtual city. Baseline geometry only. Terrain, building heights and telemetry are illustrative, not measured.',
    },
    'route': route.waypoints,
    'buildings': [{'id': f'B{i+1:02}', 'polygon': poly, 'height': 24 + (i * 17 % 78)} for i, poly in enumerate(scene.obstacles)],
    'zones': [{'id': key, 'polygon': zone.polygon} for key, zone in scene.zones.items()],
    'sites': [{'id': key, 'point': [site.x, site.y]} for key, site in scene.sites.items()],
}
path = Path(__file__).resolve().parents[1] / 'public' / 'demo-scene.json'
path.parent.mkdir(exist_ok=True)
path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
print(f'Exported {len(data["route"])} baseline waypoints, {len(data["buildings"])} virtual buildings.')

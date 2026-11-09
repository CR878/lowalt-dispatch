"""把一条航线画成 SVG —— 给 Word、PPT 和视频用。

    python -m tools.render_route S2-01 docs/figures/S2-01.svg
    python -m tools.render_route S2-01            # 不写文件，直接打到 stdout

为什么要有这个工具，而不是随手截个图：
图上的每个元素都来自 `scenarios/v0/` 的几何和 `planner` 的真实输出，
换一个场景、换一次规划结果，重跑就能得到一致的图。截图做不到这一点，
而且没人能证明那张图对应哪次运行。

坐标是局部 ENU 米制（不是经纬度），图上也不画底图——因为坐标原点还没定。
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

from core.console import ensure_utf8_stdout
from planner.astar import plan_scenario
from planner.scene import load_scene, load_suite

T0 = datetime(2026, 11, 9, 12, 0, 0, tzinfo=UTC)

PLOT_X, PLOT_Y, PLOT = 40.0, 60.0, 400.0
SCENE_M = 3000.0
SCALE = PLOT / SCENE_M
WIDTH, HEIGHT = 680, 500


def _x(v: float) -> float:
    return PLOT_X + v * SCALE


def _y(v: float) -> float:
    return PLOT_Y + PLOT - v * SCALE


def _rect(x0: float, y0: float, x1: float, y1: float) -> str:
    return (
        f'<rect x="{_x(x0):.1f}" y="{_y(y1):.1f}" width="{(x1 - x0) * SCALE:.1f}" '
        f'height="{(y1 - y0) * SCALE:.1f}"'
    )


def render(scenario_id: str) -> str:
    scene = load_scene()
    suite = {s["id"]: s for s in load_suite()["scenarios"]}
    if scenario_id not in suite:
        raise SystemExit(f"未知场景 {scenario_id}；可选：{', '.join(sorted(suite))}")
    sc = suite[scenario_id]

    path, _grid = plan_scenario(sc, scene)
    mentioned = {
        e["zone_id"]: float(e.get("at_s", 0))
        for e in (sc.get("events") or [])
        if e.get("kind") == "restriction_zone" and "zone_id" in e
    }

    out: list[str] = [
        f'<svg width="100%" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" xmlns="http://www.w3.org/2000/svg">',
        f"<title>{scenario_id} 航线与限制区</title>",
        f"<desc>{sc['title']}：A* 基线航线、草稿城区建筑、限制区与备降点。局部 ENU 米制坐标。</desc>",
        f'<rect x="{PLOT_X}" y="{PLOT_Y}" width="{PLOT}" height="{PLOT}" fill="none" '
        f'stroke="#5F5E5A" stroke-width="0.5"/>',
    ]

    for poly in scene.obstacles:
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        out.append(
            _rect(min(xs), min(ys), max(xs), max(ys))
            + ' fill="#2C2C2A" stroke="#5F5E5A" stroke-width="0.5"/>'
        )

    for zid, zone in scene.zones.items():
        xs = [p[0] for p in zone.polygon]
        ys = [p[1] for p in zone.polygon]
        hot = zid in mentioned
        fill, stroke, text = ("#791F1F", "#F09595", "#F7C1C1") if hot else ("#3C3489", "#7F77DD", "#CECBF6")
        out.append(
            _rect(min(xs), min(ys), max(xs), max(ys))
            + f' fill="{fill}" stroke="{stroke}" stroke-width="0.5"'
            + ("" if hot else ' opacity="0.4"')
            + "/>"
        )
        label = f"{zid} +{mentioned[zid]:.0f}s" if hot else zid
        out.append(
            f'<text x="{_x((min(xs) + max(xs)) / 2):.0f}" y="{_y((min(ys) + max(ys)) / 2):.0f}" '
            f'font-family="var(--font-sans)" font-size="10" fill="{text}" text-anchor="middle" '
            f'dominant-baseline="central">{label}</text>'
        )

    for sid, site in scene.sites.items():
        out.append(
            f'<circle cx="{_x(site.x):.1f}" cy="{_y(site.y):.1f}" r="4" fill="#085041" '
            f'stroke="#5DCAA5" stroke-width="0.5"/>'
        )
        out.append(
            f'<text x="{_x(site.x) + 8:.0f}" y="{_y(site.y):.0f}" font-family="var(--font-sans)" '
            f'font-size="10" fill="#5DCAA5" dominant-baseline="central">{sid}</text>'
        )

    if path.found:
        pts = path.waypoints[::3] + [path.waypoints[-1]]
        out.append(
            '<polyline points="'
            + " ".join(f"{_x(x):.1f},{_y(y):.1f}" for x, y in pts)
            + '" fill="none" stroke="#85B7EB" stroke-width="1.8" stroke-linejoin="round"/>'
        )
        out.append(
            f'<circle cx="{_x(path.waypoints[0][0]):.1f}" cy="{_y(path.waypoints[0][1]):.1f}" r="5" '
            f'fill="#0C447C" stroke="#B5D4F4" stroke-width="1.2"/>'
        )
        out.append(
            f'<circle cx="{_x(path.waypoints[-1][0]):.1f}" cy="{_y(path.waypoints[-1][1]):.1f}" r="5" '
            f'fill="#0C447C" stroke="#B5D4F4" stroke-width="1.2"/>'
        )

    lx = 460
    out.append(
        f'<text x="{lx}" y="36" font-family="var(--font-sans)" font-size="14" font-weight="500" '
        f'fill="#D3D1C7" dominant-baseline="central">{scenario_id} · {sc["cls"]}</text>'
    )
    out.append(
        f'<text x="{lx}" y="56" font-family="var(--font-sans)" font-size="11" fill="#888780" '
        f'dominant-baseline="central">{sc["title"]}</text>'
    )

    legend = [
        ("#85B7EB", "#85B7EB", "A* 基线航线", f"{path.length_m:.0f} m" if path.found else "未找到"),
        ("#791F1F", "#F09595", "本场景限制区", "标注为生效偏移"),
        ("#3C3489", "#7F77DD", "未涉及的限制区", "本场景事件里没有"),
        ("#2C2C2A", "#5F5E5A", "建筑", "草稿几何"),
        ("#085041", "#5DCAA5", "备降点", "基线不使用"),
    ]
    ly = 84.0
    for fill, stroke, title, note in legend:
        out.append(
            f'<rect x="{lx}" y="{ly - 5}" width="9" height="9" rx="2" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="0.5"/>'
        )
        out.append(
            f'<text x="{lx + 16}" y="{ly:.0f}" font-family="var(--font-sans)" font-size="11" '
            f'font-weight="500" fill="#D3D1C7" dominant-baseline="central">{title}</text>'
        )
        out.append(
            f'<text x="{lx}" y="{ly + 14:.0f}" font-family="var(--font-sans)" font-size="10" '
            f'fill="#888780">{note}</text>'
        )
        ly += 40

    out.append(
        f'<text x="{lx}" y="{ly + 6:.0f}" font-family="var(--font-sans)" font-size="10" '
        f'fill="#888780">局部 ENU 米制 · 原点待定</text>'
    )
    out.append(
        f'<text x="{lx}" y="{ly + 22:.0f}" font-family="var(--font-sans)" font-size="10" '
        f'fill="#888780">几何为草稿，非真实城区</text>'
    )
    out.append("</svg>")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ensure_utf8_stdout()
    args = argv if argv is not None else sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    svg = render(args[0])
    if len(args) > 1:
        out = Path(args[1])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(svg, encoding="utf-8")
        print(f"已写出 {out}（{len(svg)} 字符）")
    else:
        print(svg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

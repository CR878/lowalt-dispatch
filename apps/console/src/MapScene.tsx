import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GRID, GRID_STEP, TerrainModel, pointAlong } from "./terrain";
import type {
  Layers,
  Point,
  SceneData,
  TerrainChange,
  TerrainPatch,
  ViewMode,
} from "./types";

export type MapHandle = {
  reset: () => void;
  zoom: (factor: number) => void;
  applyTerrain: (patch: TerrainPatch) => TerrainChange;
  focus: (point: Point) => void;
};
type Props = {
  mode: ViewMode;
  layers: Layers;
  progress: number;
  playing: boolean;
  onReady: () => void;
  onError: (message: string) => void;
  onPoint: (point: Point) => void;
  preview?: { route_id: string; waypoints: Point[] } | null;
  terrainModel?: TerrainModel;
};

const world = (x: number, y: number, h: number) =>
  new THREE.Vector3(x - 1500, h, 1500 - y);
const material = (color: string, opacity = 1) =>
  new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });

export default forwardRef<MapHandle, Props>(function MapScene(props, ref) {
  const root = useRef<HTMLDivElement>(null);
  const runtime = useRef<{
    controls: OrbitControls;
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    terrain: TerrainModel;
    updateTerrain: () => void;
    groups: Record<keyof Layers, THREE.Group>;
    reset: () => void;
    focus: (point: Point) => void;
  } | null>(null);
  const dynamic = useRef(props);
  dynamic.current = props;
  const [labels, setLabels] = useState<
    { id: string; x: number; y: number; type: string }[]
  >([]);

  useImperativeHandle(ref, () => ({
    reset: () => runtime.current?.reset(),
    focus: (point) => runtime.current?.focus(point),
    zoom: (factor) => {
      if (runtime.current) {
        const { camera, controls } = runtime.current;
        if (camera instanceof THREE.OrthographicCamera) {
          camera.zoom = THREE.MathUtils.clamp(camera.zoom / factor, 0.5, 5);
          camera.updateProjectionMatrix();
        } else {
          camera.position
            .sub(controls.target)
            .multiplyScalar(factor)
            .clampLength(700, 7000)
            .add(controls.target);
        }
      }
    },
    applyTerrain: (patch) => {
      if (!runtime.current) throw new Error("三维场景尚未就绪");
      const change = runtime.current.terrain.apply(patch);
      runtime.current.updateTerrain();
      return change;
    },
  }));

  useEffect(() => {
    const host = root.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      dynamic.current.onError(
        "当前浏览器未启用 WebGL。请启用硬件加速后重新打开。",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setClearColor("#0b1117");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "可拖动的三维地形地图，滚轮缩放",
    );
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2("#0b1117", 0.000125);
    const perspective = new THREE.PerspectiveCamera(39, 1, 5, 16000);
    const orthographic = new THREE.OrthographicCamera(
      -1700,
      1700,
      1700,
      -1700,
      5,
      16000,
    );
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera =
      perspective;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 700;
    controls.maxDistance = 7000;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    const reset = () => {
      camera.position.copy(
        dynamic.current.mode === "2d"
          ? new THREE.Vector3(0, 4200, 0.1)
          : new THREE.Vector3(1550, 2650, 2850),
      );
      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = 1;
        camera.updateProjectionMatrix();
      }
      controls.target.set(0, 0, 0);
      controls.update();
    };
    reset();
    scene.add(new THREE.AmbientLight("#b1c2d6", 1.7));
    const light = new THREE.DirectionalLight("#dce6f8", 2.5);
    light.position.set(-1200, 3000, 1000);
    scene.add(light);
    const terrain = dynamic.current.terrainModel ?? new TerrainModel();
    const groups = Object.fromEntries(
      ["buildings", "terrain", "restrictions", "routes", "scan"].map((k) => [
        k,
        new THREE.Group(),
      ]),
    ) as Record<keyof Layers, THREE.Group>;
    Object.values(groups).forEach((g) => scene.add(g));

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((GRID + 1) ** 2 * 3);
    const colors = new Float32Array(positions.length);
    const indices: number[] = [];
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const a = y * (GRID + 1) + x,
          b = a + 1,
          c = a + GRID + 1,
          d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    const surface = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        metalness: 0.05,
        side: THREE.DoubleSide,
      }),
    );
    groups.terrain.add(surface);
    const contours = new THREE.Group();
    groups.terrain.add(contours);
    const changeOutline = new THREE.Group();
    groups.terrain.add(changeOutline);
    function clearGroup(group: THREE.Group) {
      while (group.children.length) {
        const child = group.children[0] as THREE.Mesh;
        child.geometry?.dispose();
        if (child.material)
          (Array.isArray(child.material)
            ? child.material
            : [child.material]
          ).forEach((m) => m.dispose());
        group.remove(child);
      }
    }
    function updateTerrain() {
      const dark = new THREE.Color("#111e24"),
        high = new THREE.Color("#26373e");
      for (let y = 0; y <= GRID; y++)
        for (let x = 0; x <= GRID; x++) {
          const i = y * (GRID + 1) + x,
            height = terrain.heights[i];
          const point = world(x * GRID_STEP, y * GRID_STEP, height);
          positions.set(point.toArray(), i * 3);
          const color = dark.clone().lerp(high, Math.min(1, height / 150));
          if (terrain.changedIndices.has(i))
            color.lerp(new THREE.Color("#c38b4b"), 0.65);
          colors.set(color.toArray(), i * 3);
        }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      clearGroup(contours);
      // Marching squares produce actual contour lines from the current height field.
      for (let level = 10; level <= 240; level += 10) {
        const vertices: number[] = [];
        for (let y = 0; y < GRID; y++)
          for (let x = 0; x < GRID; x++) {
            const corners = [
              [x, y],
              [x + 1, y],
              [x + 1, y + 1],
              [x, y + 1],
            ];
            const crossings: THREE.Vector3[] = [];
            for (let edge = 0; edge < 4; edge++) {
              const a = corners[edge],
                b = corners[(edge + 1) % 4];
              const ha = terrain.heights[a[1] * (GRID + 1) + a[0]],
                hb = terrain.heights[b[1] * (GRID + 1) + b[0]];
              if ((ha <= level && hb > level) || (hb <= level && ha > level)) {
                const f = (level - ha) / (hb - ha);
                crossings.push(
                  world(
                    (a[0] + (b[0] - a[0]) * f) * GRID_STEP,
                    (a[1] + (b[1] - a[1]) * f) * GRID_STEP,
                    level + 1.2,
                  ),
                );
              }
            }
            for (let i = 0; i + 1 < crossings.length; i += 2)
              vertices.push(
                ...crossings[i].toArray(),
                ...crossings[i + 1].toArray(),
              );
          }
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(vertices, 3),
        );
        contours.add(
          new THREE.LineSegments(
            lineGeo,
            material(
              level % 30 === 0 ? "#70848b" : "#4d616a",
              level % 30 === 0 ? 0.46 : 0.26,
            ),
          ),
        );
      }
      clearGroup(changeOutline);
      if (terrain.changeBounds) {
        const { minX, minY, maxX, maxY } = terrain.changeBounds;
        const pad = GRID_STEP / 2;
        const poly: Point[] = [
          [minX - pad, minY - pad],
          [maxX + pad, minY - pad],
          [maxX + pad, maxY + pad],
          [minX - pad, maxY + pad],
          [minX - pad, minY - pad],
        ];
        const points = poly.map((p) =>
          world(...p, terrain.heightAt(...p) + 12),
        );
        changeOutline.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            material("#e7b86c", 0.9),
          ),
        );
      }
    }
    updateTerrain();
    runtime.current = {
      controls,
      camera,
      terrain,
      updateTerrain,
      groups,
      reset,
      focus: (point) => {
        transitioning = false;
        const target = world(...point, terrain.heightAt(...point));
        const offset = camera.position
          .clone()
          .sub(controls.target)
          .normalize()
          .multiplyScalar(1600);
        camera.position.copy(target.clone().add(offset));
        controls.target.copy(target);
        if (camera instanceof THREE.OrthographicCamera) {
          camera.zoom = 1.5;
          camera.updateProjectionMatrix();
        }
        controls.update();
      },
    };

    function line(
      points: Point[],
      color: string,
      opacity: number,
      height = 2,
      parent: THREE.Object3D = scene,
    ) {
      const verts = points.map((p) =>
        world(...p, terrain.heightAt(...p) + height),
      );
      const obj = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(verts),
        material(color, opacity),
      );
      parent.add(obj);
      return obj;
    }
    // A local metric map: street geometry is illustrative context, never an online basemap.
    const streets = new THREE.Group();
    scene.add(streets);
    for (let coordinate = 0; coordinate <= 3000; coordinate += 250) {
      const xs: Point[] = [],
        ys: Point[] = [];
      for (let t = 0; t <= 3000; t += 50) {
        xs.push([t, coordinate]);
        ys.push([coordinate, t]);
      }
      line(
        xs,
        coordinate % 500 ? "#344149" : "#52616a",
        coordinate % 500 ? 0.55 : 0.7,
        2,
        streets,
      );
      line(
        ys,
        coordinate % 500 ? "#344149" : "#52616a",
        coordinate % 500 ? 0.55 : 0.7,
        2,
        streets,
      );
    }
    line(
      [
        [0, 0],
        [3000, 0],
        [3000, 3000],
        [0, 3000],
        [0, 0],
      ],
      "#60717f",
      0.35,
      2,
    );
    // River ribbon with a subtle moving specular line.
    const riverPoints = Array.from(
      { length: 61 },
      (_, i) => [1830 + Math.sin(i / 8) * 110, i * 50] as Point,
    );
    const riverVertices: number[] = [],
      riverIndices: number[] = [];
    riverPoints.forEach((p, i) => {
      for (const offset of [-36, 36])
        riverVertices.push(
          ...world(p[0] + offset, p[1], terrain.heightAt(...p) + 2.3).toArray(),
        );
      if (i) {
        const a = (i - 1) * 2;
        riverIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const riverGeo = new THREE.BufferGeometry();
    riverGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(riverVertices, 3),
    );
    riverGeo.setIndex(riverIndices);
    riverGeo.computeVertexNormals();
    scene.add(
      new THREE.Mesh(
        riverGeo,
        new THREE.MeshBasicMaterial({
          color: "#172f39",
          side: THREE.DoubleSide,
        }),
      ),
    );
    line(
      riverPoints.map((p) => [p[0] - 38, p[1]]),
      "#3e6575",
      0.55,
      3,
    );
    line(
      riverPoints.map((p) => [p[0] + 38, p[1]]),
      "#3e6575",
      0.55,
      3,
    );

    const drone = new THREE.Group();
    scene.add(drone);
    const droneBody = new THREE.Mesh(
      new THREE.BoxGeometry(27, 12, 44),
      new THREE.MeshStandardMaterial({
        color: "#f1f2f7",
        metalness: 0.55,
        roughness: 0.4,
      }),
    );
    drone.add(droneBody);
    const arms = new THREE.Mesh(
      new THREE.BoxGeometry(94, 5, 7),
      new THREE.MeshStandardMaterial({ color: "#b7bdd0" }),
    );
    arms.rotation.y = Math.PI / 4;
    drone.add(arms);
    const arm2 = arms.clone();
    arm2.rotation.y = -Math.PI / 4;
    drone.add(arm2);
    const rotorMaterial = new THREE.MeshBasicMaterial({
      color: "#b9a5ff",
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    const rotors: THREE.Mesh[] = [];
    for (const x of [-33, 33])
      for (const z of [-33, 33]) {
        const rotor = new THREE.Mesh(
          new THREE.RingGeometry(12, 19, 32),
          rotorMaterial,
        );
        rotor.rotation.x = -Math.PI / 2;
        rotor.position.set(x, 6, z);
        drone.add(rotor);
        rotors.push(rotor);
      }
    const droneHalo = new THREE.Mesh(
      new THREE.RingGeometry(56, 59, 80),
      new THREE.MeshBasicMaterial({
        color: "#c4b5fd",
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      }),
    );
    droneHalo.rotation.x = -Math.PI / 2;
    drone.add(droneHalo);
    const vertical = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -115, 0),
      ]),
      material("#bdabff", 0.5),
    );
    drone.add(vertical);
    const scan = new THREE.Mesh(
      new THREE.RingGeometry(85, 88, 100),
      new THREE.MeshBasicMaterial({
        color: "#98ddc8",
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    scan.rotation.x = -Math.PI / 2;
    groups.scan.add(scan);
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let downAt: [number, number] = [0, 0];
    const pointerDown = (event: PointerEvent) => {
      downAt = [event.clientX, event.clientY];
    };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 5)
        return;
      const bounds = host.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(surface)[0];
      if (hit)
        dynamic.current.onPoint([
          Math.round(hit.point.x + 1500),
          Math.round(1500 - hit.point.z),
        ]);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    const observer = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      const aspect = width / Math.max(1, height);
      perspective.aspect = aspect;
      perspective.updateProjectionMatrix();
      orthographic.left = -1700 * aspect;
      orthographic.right = 1700 * aspect;
      orthographic.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    observer.observe(host);
    let data: SceneData | null = null,
      disposed = false;
    let routeCurve: THREE.CatmullRomCurve3 | null = null;
    const routeParticles = new THREE.Group();
    groups.routes.add(routeParticles);
    const assistantPreview = new THREE.Group();
    scene.add(assistantPreview);
    let lastPreview = "";
    const labelPoints: { id: string; pos: THREE.Vector3; type: string }[] = [];
    fetch(`${import.meta.env.BASE_URL}demo-scene.json`)
      .then((r) => {
        if (!r.ok) throw new Error("场景加载失败");
        return r.json();
      })
      .then((source: SceneData) => {
        if (disposed) return;
        data = source;
        source.buildings.forEach((building, index) => {
          const shape = new THREE.Shape(
            building.polygon.map(
              (p) => new THREE.Vector2(p[0] - 1500, p[1] - 1500),
            ),
          );
          const geom = new THREE.ExtrudeGeometry(shape, {
            depth: building.height,
            bevelEnabled: false,
          });
          geom.rotateX(-Math.PI / 2);
          const center = building.polygon[0];
          geom.translate(0, terrain.heightAt(...center) + 1, 0);
          groups.buildings.add(
            new THREE.Mesh(
              geom,
              new THREE.MeshStandardMaterial({
                color: index % 3 ? "#36454e" : "#46545f",
                metalness: 0.2,
                roughness: 0.8,
              }),
            ),
          );
          groups.buildings.add(
            new THREE.LineSegments(
              new THREE.EdgesGeometry(geom),
              material("#8b9ba6", 0.32),
            ),
          );
        });
        source.zones.slice(0, 2).forEach((zone, i) => {
          const closed = [...zone.polygon, zone.polygon[0]];
          line(closed, i ? "#e8ad70" : "#c79a6c", 0.65, 7, groups.restrictions);
          const shape = new THREE.Shape(
            zone.polygon.map(
              (p) => new THREE.Vector2(p[0] - 1500, p[1] - 1500),
            ),
          );
          const geom = new THREE.ShapeGeometry(shape);
          geom.rotateX(-Math.PI / 2);
          geom.translate(0, 13, 0);
          groups.restrictions.add(
            new THREE.Mesh(
              geom,
              new THREE.MeshBasicMaterial({
                color: "#d4a36b",
                opacity: 0.08,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
              }),
            ),
          );
          const centroid = zone.polygon.reduce(
            (p, q) =>
              [
                p[0] + q[0] / zone.polygon.length,
                p[1] + q[1] / zone.polygon.length,
              ] as Point,
            [0, 0] as Point,
          );
          labelPoints.push({
            id: `${zone.id} 限制区`,
            pos: world(...centroid, 30),
            type: "zone",
          });
        });
        const routeVectors = source.route.map((p) =>
          world(...p, 130 + terrain.heightAt(...p)),
        );
        routeCurve = new THREE.CatmullRomCurve3(
          routeVectors,
          false,
          "centripetal",
          0,
        );
        const routeGeo = new THREE.TubeGeometry(routeCurve, 360, 3.8, 5, false);
        groups.routes.add(
          new THREE.Mesh(
            routeGeo,
            new THREE.MeshBasicMaterial({ color: "#bca5ff" }),
          ),
        );
        const glow = new THREE.Mesh(
          new THREE.TubeGeometry(routeCurve, 360, 14, 5, false),
          new THREE.MeshBasicMaterial({
            color: "#9b81ff",
            transparent: true,
            opacity: 0.09,
            depthWrite: false,
          }),
        );
        groups.routes.add(glow);
        // Ground projection provides a legible map trace in top view.
        line(source.route, "#7c6ca8", 0.5, 3, groups.routes);
        const planned: Point[] = [
          source.route[0],
          [1250, 1450],
          [2100, 2380],
          source.route[source.route.length - 1],
        ];
        const dashed = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(
            planned.map((p) => world(...p, terrain.heightAt(...p) + 125)),
          ),
          new THREE.LineDashedMaterial({
            color: "#c2c8d6",
            dashSize: 25,
            gapSize: 24,
            transparent: true,
            opacity: 0.38,
          }),
        );
        dashed.computeLineDistances();
        groups.routes.add(dashed);
        for (let i = 0; i < 9; i++)
          routeParticles.add(
            new THREE.Mesh(
              new THREE.SphereGeometry(5, 7, 7),
              new THREE.MeshBasicMaterial({ color: "#f2ebff" }),
            ),
          );
        source.sites.forEach((site) => {
          const p = world(...site.point, terrain.heightAt(...site.point) + 4);
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(35, 39, 48),
            new THREE.MeshBasicMaterial({
              color: "#89cbb8",
              opacity: 0.75,
              transparent: true,
              side: THREE.DoubleSide,
            }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(p);
          groups.routes.add(ring);
          labelPoints.push({
            id: site.id + " 备降点",
            pos: p.clone().add(new THREE.Vector3(0, 28, 0)),
            type: "site",
          });
        });
        labelPoints.push(
          { id: "医疗物资中转站", pos: routeVectors[0], type: "origin" },
          {
            id: "北区应急中心",
            pos: routeVectors[routeVectors.length - 1],
            type: "destination",
          },
        );
        dynamic.current.onReady();
      })
      .catch(() => {
        if (!disposed)
          dynamic.current.onError("虚拟场景加载失败，请刷新重试。");
      });
    let frame = 0,
      time = 0,
      lastLabel = 0,
      lastTimestamp = 0,
      lastMode: ViewMode = "3d";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let transitioning = true;
    const animation = (timestamp: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(animation);
      const dt = lastTimestamp
        ? Math.min((timestamp - lastTimestamp) / 1000, 0.05)
        : 0.016;
      lastTimestamp = timestamp;
      const { mode, progress, layers, playing } = dynamic.current;
      const preview = dynamic.current.preview;
      if ((preview?.route_id ?? "") !== lastPreview) {
        lastPreview = preview?.route_id ?? "";
        clearGroup(assistantPreview);
        if (preview) {
          const points = preview.waypoints.map((p) =>
            world(...p, terrain.heightAt(...p) + 155),
          );
          const routeLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: "#97e6c8" }),
          );
          assistantPreview.add(routeLine);
          for (const point of [points[0], points[points.length - 1]]) {
            const marker = new THREE.Mesh(
              new THREE.SphereGeometry(14, 12, 12),
              new THREE.MeshBasicMaterial({ color: "#9ce6cd" }),
            );
            marker.position.copy(point);
            assistantPreview.add(marker);
          }
        }
      }
      assistantPreview.visible = layers.routes;
      if (mode !== lastMode) {
        lastMode = mode;
        transitioning = true;
        camera = mode === "2d" ? orthographic : perspective;
        controls.object = camera;
        if (runtime.current) runtime.current.camera = camera;
        if (mode === "2d") reset();
      }
      if (transitioning) {
        const target =
          mode === "2d"
            ? new THREE.Vector3(0, 4200, 0.1)
            : new THREE.Vector3(1550, 2650, 2850);
        const easing = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 7);
        camera.position.lerp(target, easing);
        controls.target.lerp(new THREE.Vector3(), easing);
        if (camera.position.distanceTo(target) < 2) transitioning = false;
      }
      controls.enableRotate = mode === "3d";
      Object.entries(groups).forEach(([key, group]) => {
        group.visible = layers[key as keyof Layers];
      });
      if (playing && !reducedMotion.matches) time += dt * 0.72;
      if (data && routeCurve) {
        const p = pointAlong(data.route, progress);
        // A terrain update must never silently alter an already planned route.
        drone.position.copy(
          routeCurve.getPointAt(Math.max(0, Math.min(1, progress))),
        );
        const tangent = routeCurve.getTangentAt(
          Math.max(0, Math.min(1, progress)),
        );
        drone.rotation.y = Math.atan2(tangent.x, tangent.z);
        droneHalo.scale.setScalar(1 + Math.sin(time * 2) * 0.08);
        rotors.forEach((r) => {
          r.rotation.z += playing && !reducedMotion.matches ? dt * 24 : 0;
        });
        const phase = (time * 0.12) % 1;
        scan.position.copy(world(...p, terrain.heightAt(...p) + 5));
        scan.scale.setScalar(1 + phase * 4);
        (scan.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.45;
        routeParticles.children.forEach((particle, i) =>
          particle.position.copy(
            routeCurve!.getPointAt((i / 9 + time * 0.025) % 1),
          ),
        );
      }
      controls.update();
      renderer.render(scene, camera);
      if (timestamp - lastLabel > 90 && host.clientWidth) {
        const project = (pos: THREE.Vector3) => {
          const p = pos.clone().project(camera);
          return {
            x: (p.x * 0.5 + 0.5) * host.clientWidth,
            y: (-p.y * 0.5 + 0.5) * host.clientHeight,
            z: p.z,
          };
        };
        const next = labelPoints
          .map((p) => ({ ...p, ...project(p.pos) }))
          .filter(
            (p) =>
              p.z < 1 &&
              p.x > 15 &&
              p.x < host.clientWidth - 15 &&
              p.y > 10 &&
              p.y < host.clientHeight - 15,
          );
        next.push({
          id: "AER-01",
          type: "drone",
          pos: drone.position,
          ...project(drone.position.clone().add(new THREE.Vector3(0, 80, 0))),
        });
        setLabels(next);
        lastLabel = timestamp;
      }
    };
    frame = requestAnimationFrame(animation);
    const stopTransition = () => {
      transitioning = false;
    };
    controls.addEventListener("start", stopTransition);
    return () => {
      disposed = true;
      runtime.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.material)
          (Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
          ).forEach((m) => m.dispose());
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="map-render" ref={root}>
      <div className="map-labels" aria-hidden="true">
        {labels.map((label) => (
          <div
            key={label.id}
            className={`map-label ${label.type}`}
            style={{
              transform: `translate(${label.x}px, ${label.y}px) translate(-50%, -50%)`,
            }}
          >
            {label.type === "drone" && <i />}
            {label.id}
          </div>
        ))}
      </div>
    </div>
  );
});

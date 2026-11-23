import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import decoderWasm from "three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url";
import decoderWrapper from "three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url";
import decoderScript from "three/examples/jsm/libs/draco/gltf/draco_decoder.js?url";
import modelUrl from "../../../../references/rea-city-flight/asset/out/cr30_lod1.glb?url";
import type { DemoFrame } from "./playback";

// Artistic scene coordinates only. No map projection or real-world navigation.
const points = [
  new THREE.Vector3(-70, 2, 40),
  new THREE.Vector3(-35, 24, 24),
  new THREE.Vector3(5, 24, 4),
  new THREE.Vector3(37, 2, -25),
];
const destination = new THREE.Vector3(76, 2, -52);
const opening = new THREE.CatmullRomCurve3(points.slice(0, 3));
const ending = new THREE.CatmullRomCurve3([
  points[2],
  new THREE.Vector3(26, 18, -12),
  points[3],
]);
const illustratedPlan = new THREE.CatmullRomCurve3([
  points[2],
  new THREE.Vector3(44, 26, -30),
  destination,
]);
const labels = [
  { point: points[0], caption: "中心物资站" },
  { point: points[3], caption: "备降点" },
  { point: destination, caption: "河东救援点" },
];

export default function Scene({ frame }: { frame: DemoFrame }) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(frame);
  const [unavailable, setUnavailable] = useState(false);
  const [modelState, setModelState] = useState<
    "loading" | "loaded" | "fallback"
  >("loading");
  const labelElements = useRef<(HTMLSpanElement | null)[]>([]);
  current.current = frame;

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setClearColor("#0b1420");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    node.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "虚构三维城市动画");
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#0b1420", 180, 420);
    scene.add(new THREE.HemisphereLight(0xc2eaff, 0x344252, 2.1));
    const sun = new THREE.DirectionalLight(0xd8e9ff, 3);
    sun.position.set(-80, 150, 90);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.5, 900);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(230, 180),
      new THREE.MeshStandardMaterial({ color: 0x172835, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const grid = new THREE.GridHelper(220, 44, 0x315867, 0x233945);
    grid.position.y = 0.08;
    scene.add(grid);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 180),
      new THREE.MeshStandardMaterial({
        color: 0x18455a,
        metalness: 0.45,
        roughness: 0.3,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.16, 0);
    scene.add(water);

    const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0x314756,
      roughness: 0.72,
    });
    const edges = new THREE.LineBasicMaterial({
      color: 0x547182,
      transparent: true,
      opacity: 0.5,
    });
    for (let x = -96; x <= 96; x += 16) {
      if (Math.abs(x) < 25) continue;
      for (let z = -72; z <= 72; z += 16) {
        if (
          labels.some(({ point }) => Math.hypot(x - point.x, z - point.z) < 23)
        )
          continue;
        const h = 5 + (Math.abs(x * 31 + z * 17) % 13) * 1.25;
        const block = new THREE.Group();
        block.position.set(x, h / 2, z);
        const mesh = new THREE.Mesh(buildingGeo, material);
        mesh.scale.set(10, h, 9);
        block.add(mesh);
        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(buildingGeo),
          edges,
        );
        outline.scale.copy(mesh.scale);
        block.add(outline);
        scene.add(block);
      }
    }
    const line = new THREE.Mesh(
      new THREE.TubeGeometry(opening, 40, 0.52, 6, false),
      new THREE.MeshBasicMaterial({ color: 0x56e0dd }),
    );
    scene.add(line);
    const alternate = new THREE.Mesh(
      new THREE.TubeGeometry(ending, 40, 0.52, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xffc779 }),
    );
    alternate.visible = false;
    scene.add(alternate);
    const planned = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(illustratedPlan.getPoints(40)),
      new THREE.LineDashedMaterial({
        color: 0x87a4ba,
        dashSize: 3,
        gapSize: 2,
      }),
    );
    planned.computeLineDistances();
    scene.add(planned);
    const marker = (p: THREE.Vector3, color: number) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(5, 6.3, 48),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, 0.25, p.z);
      scene.add(ring);
    };
    marker(points[0], 0x56e0dd);
    marker(points[3], 0xffc779);
    marker(destination, 0x87a4ba);
    const aircraft = new THREE.Group();
    const fallback = new THREE.Mesh(
      new THREE.OctahedronGeometry(3.3),
      new THREE.MeshStandardMaterial({ color: 0xe1eef7, metalness: 0.65 }),
    );
    aircraft.add(fallback);
    scene.add(aircraft);
    let disposed = false;
    const freeObject = (object: THREE.Object3D) => {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh || child instanceof THREE.Line))
          return;
        geometries.add(child.geometry);
        for (const m of Array.isArray(child.material)
          ? child.material
          : [child.material])
          materials.add(m);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => {
        for (const value of Object.values(m))
          if (value instanceof THREE.Texture) value.dispose();
        m.dispose();
      });
    };
    const decoderAssets: Record<string, string> = {
      "draco_decoder.wasm": decoderWasm,
      "draco_wasm_wrapper.js": decoderWrapper,
      "draco_decoder.js": decoderScript,
    };
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => decoderAssets[url] ?? url);
    const decoder = new DRACOLoader(manager);
    new GLTFLoader(manager).setDRACOLoader(decoder).load(
      modelUrl,
      (gltf) => {
        if (disposed) {
          freeObject(gltf.scene);
          return;
        }
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 9 / Math.max(size.x, size.y, size.z, 0.001);
        gltf.scene.scale.setScalar(scale);
        gltf.scene.position.copy(center.multiplyScalar(-scale));
        aircraft.remove(fallback);
        freeObject(fallback);
        aircraft.add(gltf.scene);
        setModelState("loaded");
      },
      undefined,
      () => {
        if (!disposed) setModelState("fallback");
      },
    );

    const resize = () => {
      const width = Math.max(1, node.clientWidth),
        height = Math.max(1, node.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    let raf = 0;
    const animate = () => {
      const state = current.current;
      aircraft.position.copy(
        state.time < 118
          ? opening.getPoint(
              THREE.MathUtils.clamp((state.time - 95) / 23, 0, 1),
            )
          : ending.getPoint(
              THREE.MathUtils.clamp((state.time - 118) / 24, 0, 1),
            ),
      );
      const angle = state.phase < 2 ? 0.32 : state.phase === 5 ? -0.25 : 0.7;
      const overview = new THREE.Vector3(
        160 * Math.sin(angle),
        132,
        160 * Math.cos(angle),
      );
      camera.position.lerp(overview, 0.08);
      camera.lookAt(0, 4, 0);
      camera.updateMatrixWorld();
      alternate.visible = state.phase >= 4;
      labels.forEach(({ point }, index) => {
        const element = labelElements.current[index];
        if (!element) return;
        const projected = point
          .clone()
          .add(new THREE.Vector3(0, 5, 0))
          .project(camera);
        element.style.left = `${(projected.x + 1) * 50}%`;
        element.style.top = `${(1 - projected.y) * 50}%`;
      });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    camera.position.set(95, 132, 160);
    animate();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      freeObject(scene);
      decoder.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="demo-scene" ref={host} data-model={modelState}>
      {!unavailable &&
        labels.map(({ caption }, index) => (
          <span
            key={caption}
            className="demo-map-label"
            ref={(element) => {
              labelElements.current[index] = element;
            }}
          >
            {caption}
          </span>
        ))}
      {unavailable && (
        <div className="demo-scene-fallback">虚拟城区 · 3D 渲染不可用</div>
      )}
      {modelState === "fallback" && !unavailable && (
        <span className="demo-model-fallback">模型加载失败 · 使用示意标记</span>
      )}
    </div>
  );
}

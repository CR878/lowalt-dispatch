import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import decoderWasm from "three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url";
import decoderWrapper from "three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url";
import decoderScript from "three/examples/jsm/libs/draco/gltf/draco_decoder.js?url";
import modelUrl from "../../../../references/rea-city-flight/asset/out/cr30_lod1.glb?url";
import type { DemoFrame } from "./playback";
import { createCity } from "./City";

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
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    node.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "虚构三维城市动画");
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#0b1420", 240, 520);
    scene.add(new THREE.HemisphereLight(0xc2dff1, 0x35454b, 1.65));
    const sun = new THREE.DirectionalLight(0xffe1b9, 2.65);
    sun.position.set(-105, 110, 65);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160;
    sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 140;
    sun.shadow.camera.bottom = -140;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 420;
    sun.shadow.normalBias = 0.15;
    sun.shadow.bias = -0.0002;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);
    scene.add(sun.target);
    const rim = new THREE.DirectionalLight(0x78bde1, 0.8);
    rim.position.set(110, 65, -95);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.5, 900);
    const city = createCity();
    scene.add(city);
    node.dataset.city = "waterfront";
    node.dataset.buildings = String(city.userData.buildingCount);
    renderer.shadowMap.needsUpdate = true;
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
      ring.position.set(p.x, 0.4, p.z);
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
        if (child instanceof THREE.InstancedMesh) child.dispose();
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
    // Camera presets are driven only by playback time, so paused and
    // repeated captures settle into the same visual composition.
    const shots = [
      { time: 0, angle: 0.26, height: 154, distance: 200 },
      { time: 32, angle: 0.5, height: 127, distance: 185 },
      { time: 52, angle: 0.72, height: 113, distance: 195 },
      { time: 95, angle: 0.48, height: 122, distance: 190 },
      { time: 118, angle: 0.18, height: 137, distance: 190 },
      { time: 142, angle: -0.22, height: 153, distance: 200 },
      { time: 180, angle: -0.22, height: 153, distance: 200 },
    ];
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
      const next = shots.findIndex((shot) => state.time < shot.time);
      const index = next === -1 ? shots.length - 1 : Math.max(1, next);
      const before = shots[index - 1];
      const after = shots[index];
      const mix = THREE.MathUtils.smoothstep(
        state.time,
        before.time,
        after.time,
      );
      const angle = THREE.MathUtils.lerp(before.angle, after.angle, mix);
      const fit = Math.max(1, 1.24 / camera.aspect);
      const distance =
        THREE.MathUtils.lerp(before.distance, after.distance, mix) * fit;
      camera.position.set(
        distance * Math.sin(angle),
        THREE.MathUtils.lerp(before.height, after.height, mix) * fit,
        distance * Math.cos(angle),
      );
      camera.lookAt(0, 5, 0);
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
      sun.shadow.dispose();
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

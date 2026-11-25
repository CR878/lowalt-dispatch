import * as THREE from "three";

/** Instanced straight segments preserve planner corners instead of resampling a spline/tube. */
export function routeSegments(
  points: THREE.Vector3[],
  radius: number,
  material: THREE.Material,
) {
  const segments = points
    .slice(1)
    .map((p, i) => [points[i], p] as const)
    .filter(([a, b]) => a.distanceToSquared(b) > 1e-12);
  const mesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 6),
    material,
    segments.length,
  );
  const transform = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  segments.forEach(([a, b], index) => {
    const direction = b.clone().sub(a);
    transform.position.copy(a).add(b).multiplyScalar(0.5);
    transform.quaternion.setFromUnitVectors(up, direction.clone().normalize());
    transform.scale.set(radius, direction.length(), radius);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Preserve every planner segment; progress is horizontal route distance, like the 2D map. */
export class RoutePolyline extends THREE.Curve<THREE.Vector3> {
  points: THREE.Vector3[];
  lengths: number[];
  total: number;
  constructor(points: THREE.Vector3[]) {
    super();
    if (points.length < 2) throw new Error("Route requires two points");
    this.points = points;
    this.lengths = points
      .slice(1)
      .map((p, i) => Math.hypot(p.x - points[i].x, p.z - points[i].z));
    this.total = this.lengths.reduce((a, b) => a + b, 0);
  }
  override getPoint(t: number, target = new THREE.Vector3()) {
    let left = Math.max(0, Math.min(1, t)) * this.total;
    for (let i = 0; i < this.lengths.length; i++) {
      if (left <= this.lengths[i])
        return target
          .copy(this.points[i])
          .lerp(this.points[i + 1], left / Math.max(this.lengths[i], 1e-12));
      left -= this.lengths[i];
    }
    return target.copy(this.points[this.points.length - 1]);
  }
  override getPointAt(t: number, target = new THREE.Vector3()) {
    return this.getPoint(t, target);
  }
  override getTangentAt(t: number, target = new THREE.Vector3()) {
    return this.getTangent(t, target);
  }
}

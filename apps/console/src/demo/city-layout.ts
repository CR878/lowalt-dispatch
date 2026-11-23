/** Fixed fictional art direction, in arbitrary scene units. */
export type CityLot = {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  style: "office" | "residential" | "warehouse";
};

export const landmarks = [
  { x: -70, z: 40 },
  { x: 37, z: -25 },
  { x: 76, z: -52 },
] as const;

export const xStreets = [-89, -58, -24, 24, 53, 85] as const;
export const zStreets = [-57, -27, 3, 33, 63] as const;

export function cityNoise(seed: number) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function makeCityLots(): CityLot[] {
  const lots: CityLot[] = [];
  const sides = [
    [-111, -89, -58, -24],
    [24, 53, 85, 111],
  ];
  const rows = [-87, -57, -27, 3, 33, 63, 87];
  let id = 0;
  for (const columns of sides) {
    for (let col = 0; col < columns.length - 1; col++) {
      for (let row = 0; row < rows.length - 1; row++) {
        const x = (columns[col] + columns[col + 1]) / 2;
        const z = (rows[row] + rows[row + 1]) / 2;
        // Leave several blocks for public space instead of filling a grid.
        if (cityNoise(++id) < 0.16) continue;
        for (const offset of [-6, 6]) {
          const index = ++id;
          const cz = z + offset;
          const width = 8 + cityNoise(index + 50) * 5;
          const depth = 7 + cityNoise(index + 80) * 2;
          if (landmarks.some((p) => Math.hypot(x - p.x, cz - p.z) < 15)) {
            continue;
          }
          const style =
            x < -80 && cz > 10
              ? "warehouse"
              : x > 50
                ? "office"
                : "residential";
          const skyline = style === "office" && Math.abs(cz) > 30;
          const height =
            style === "warehouse"
              ? 3.8 + cityNoise(index) * 3
              : 7 + cityNoise(index) * (skyline ? 26 : 10);
          lots.push({ x, z: cz, width, depth, height, style });
        }
      }
    }
  }
  return lots;
}

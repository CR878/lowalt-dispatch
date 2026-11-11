export type ViewMode = "2d" | "3d";
export type PanelId =
  | "mission"
  | "instruments"
  | "analysis"
  | "events"
  | "perception";
export type Point = [number, number];
export type EventItem = {
  id: string;
  time: string;
  type: "info" | "success" | "warning";
  title: string;
  detail: string;
};
export type Telemetry = {
  battery: number;
  voltage: number;
  current: number;
  energyWh: number | null;
  altitude: number;
  speed: number;
  climb: number;
  heading: number;
  pitch: number;
  roll: number;
  rssi: number;
  satellites: number;
  hdop: number;
  rtt: number;
  rotors: [number, number, number, number];
  motorTemp: number;
  coverage: number;
  scanned: number;
  totalCells: number;
  distanceToTarget: number;
  obstacleDistance: number;
};
export type TerrainPatch = {
  revision: number;
  source: string;
  capturedAt: string;
  mode?: "baseline" | "delta";
  cells: { x: number; y: number; height: number }[];
};
export type TerrainChange = {
  revision: number;
  count: number;
  maxDelta: number;
  source: string;
  capturedAt: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
};
export type Layers = {
  buildings: boolean;
  terrain: boolean;
  restrictions: boolean;
  routes: boolean;
  scan: boolean;
};
export type SceneData = {
  metadata: { source: string; isSimulated: true; note: string };
  route: Point[];
  buildings: { id: string; polygon: Point[]; height: number }[];
  zones: { id: string; polygon: Point[] }[];
  sites: { id: string; point: Point }[];
};

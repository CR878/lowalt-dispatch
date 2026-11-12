import type { Point } from "./types";

export type LngLat = [number, number];
export type GeoPlace = {
  name: string;
  point: LngLat;
  source: "map_click" | "coordinates" | "browser" | "osm_search";
  capturedAt: string;
  accuracyM?: number;
};
export type GeoMission = {
  origin: GeoPlace | null;
  destination: GeoPlace | null;
};
// Same display anchor as the CodeArts frontend. This does NOT georeference M1.
export const DEMO_ANCHOR: LngLat = [121.4737, 31.2304];
export const enuToLngLat = ([x, y]: Point): LngLat => [
  DEMO_ANCHOR[0] + x / 95188.9,
  DEMO_ANCHOR[1] + y / 111320,
];
export const lngLatToEnu = ([lng, lat]: LngLat): Point => [
  (lng - DEMO_ANCHOR[0]) * 95188.9,
  (lat - DEMO_ANCHOR[1]) * 111320,
];
export function validLngLat(value: unknown): value is LngLat {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(Number.isFinite) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 85.0511
  );
}
export function parseCoordinates(text: string): LngLat | null {
  const match = text
    .trim()
    .match(/^([+-]?\d+(?:\.\d+)?)\s*[,，\s]\s*([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const point: LngLat = [Number(match[1]), Number(match[2])];
  if (!validLngLat(point))
    throw new Error(
      "坐标超出范围：经度±180°、纬度±85.0511°。请按“经度, 纬度”输入。",
    );
  return point;
}
export const formatCoordinates = (point: LngLat) =>
  `${point[0].toFixed(6)}, ${point[1].toFixed(6)}`;
export function validGeoPlace(value: unknown): value is GeoPlace {
  if (!value || typeof value !== "object") return false;
  const p = value as GeoPlace;
  return (
    typeof p.name === "string" &&
    p.name.trim().length > 0 &&
    p.name.length <= 200 &&
    validLngLat(p.point) &&
    ["map_click", "coordinates", "browser", "osm_search"].includes(p.source) &&
    Number.isFinite(Date.parse(p.capturedAt)) &&
    (p.accuracyM === undefined ||
      (Number.isFinite(p.accuracyM) && p.accuracyM >= 0))
  );
}
export function loadGeoMission(): GeoMission {
  try {
    const value = JSON.parse(
      localStorage.getItem("aeris-geo-mission-v1") || "null",
    );
    return {
      origin: validGeoPlace(value?.origin) ? value.origin : null,
      destination: validGeoPlace(value?.destination) ? value.destination : null,
    };
  } catch {
    return { origin: null, destination: null };
  }
}

export function distanceMeters(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 +
    Math.cos(a[1] * rad) *
      Math.cos(b[1] * rad) *
      Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

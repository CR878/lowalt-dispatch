import { useEffect, useState } from "react";
import type { Telemetry } from "./types";

export const initialTelemetry: Telemetry = {
  battery: 83.4,
  voltage: 24.4,
  current: 8.6,
  energyWh: 212.8,
  altitude: 123.6,
  speed: 12.4,
  climb: 0.3,
  heading: 42,
  pitch: -2.4,
  roll: 0.7,
  rssi: -68,
  satellites: 17,
  hdop: 0.8,
  rtt: 42,
  rotors: [6869, 6558, 6672, 6659],
  motorTemp: 61,
  coverage: 65,
  scanned: 19,
  totalCells: 29,
  distanceToTarget: 1240,
  obstacleDistance: 32.8,
};

export function useFlight(playing: boolean) {
  const [tick, setTick] = useState(0);
  const [progress, setProgress] = useState(0.43);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setTick((t) => t + 1);
      setProgress((p) => (p >= 0.99 ? 0.02 : p + 0.00125));
    }, 600);
    return () => clearInterval(timer);
  }, [playing]);
  const telemetry: Telemetry = {
    ...initialTelemetry,
    altitude: 123.6 + Math.sin(tick / 8) * 0.8,
    speed: 12.4 + Math.sin(tick / 6) * 0.4,
    battery: 83.4 - (tick % 1000) * 0.002,
    voltage: 24.4 + Math.sin(tick / 5) * 0.08,
    current: 8.6 + Math.sin(tick / 3) * 0.6,
    pitch: -2.4 + Math.sin(tick / 4) * 0.6,
    roll: 0.7 + Math.sin(tick / 7) * 1.3,
    rssi: Math.round(-68 + Math.sin(tick / 9) * 3),
    rtt: Math.round(42 + Math.sin(tick / 7) * 7),
    motorTemp: Math.round(61 + Math.sin(tick / 13) * 2),
    scanned: 19 + (Math.floor(tick / 12) % 10),
    coverage: Math.round(((19 + (Math.floor(tick / 12) % 10)) / 29) * 100),
    obstacleDistance: Math.round((32.8 + Math.sin(tick / 12) * 4) * 10) / 10,
    rotors: initialTelemetry.rotors.map((v, i) =>
      Math.round(v + Math.sin(tick / 2 + i) * 45),
    ) as Telemetry["rotors"],
    distanceToTarget: Math.round(2180 * (1 - progress)),
  };
  return { telemetry, tick, progress, setProgress };
}

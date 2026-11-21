import { useEffect, useState } from "react";
import { api } from "./portal/api";

export type CustomVehicle = {
  schema_version: number;
  display_name: string;
  source: string;
  notes: string;
  max_payload_kg: number;
  cruise_speed_mps: number;
  max_speed_mps: number | null;
  max_range_km: number | null;
  battery_capacity_wh: number | null;
  usable_battery_wh: number | null;
  reserve_policy_wh: number | null;
  energy_per_meter_wh: number | null;
  max_wind_mps: number | null;
  min_temperature_c: number | null;
  max_temperature_c: number | null;
};
export type Aircraft = {
  id: string;
  display_name: string;
  manufacturer: string;
  category: string;
  airframe: string;
  configuration: string;
  summary: string;
  max_payload_kg: number;
  max_range_km: number | null;
  reference_speed_mps: number;
  max_speed_mps: number | null;
  battery_capacity_wh: number | null;
  max_wind_mps: number | null;
  min_temperature_c: number | null;
  max_temperature_c: number | null;
  range_note: string;
  speed_note: string;
  battery_note: string;
  limitations: string[];
  sources: {
    url: string;
    title: string;
    fetched_at: string;
    excerpts: string[];
  }[];
};
type Saved = { id: string; profile: CustomVehicle };
type Library = { selected: string; custom: Saved[] };
const STORAGE = "aeris-aircraft-library-v1";
const EVENT = "aeris:aircraft-library";
function readLibrary(): Library {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (data && typeof data.selected === "string" && Array.isArray(data.custom))
      return {
        selected: data.selected,
        custom: data.custom
          .filter(
            (v: Saved) =>
              typeof v.id === "string" &&
              v.profile &&
              typeof v.profile.display_name === "string",
          )
          .slice(0, 20),
      };
  } catch {
    /* Corrupt browser state must not break the map. */
  }
  return { selected: "", custom: [] };
}
export async function validateVehicle(profile: unknown) {
  const result = await api<{ vehicle: CustomVehicle }>(
    "/assistant/vehicles/validate",
    profile,
  );
  return result.vehicle;
}
export function useAircraft() {
  const [library, setLibrary] = useState(readLibrary);
  const [catalog, setCatalog] = useState<Aircraft[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    api<{ vehicles: Aircraft[] }>(
      "/assistant/vehicles",
      undefined,
      "GET",
      controller.signal,
    )
      .then((value) => setCatalog(value.vehicles))
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    const sync = () => setLibrary(readLibrary());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      controller.abort();
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = (next: Library) => {
    localStorage.setItem(STORAGE, JSON.stringify(next));
    setLibrary(next);
    window.dispatchEvent(new Event(EVENT));
  };
  const selectedCustom = library.custom.find((c) => c.id === library.selected);
  const selectedOfficial = catalog.find((c) => c.id === library.selected);
  return {
    ...library,
    catalog,
    error,
    loading,
    selectedCustom,
    selectedOfficial,
    selection: selectedCustom
      ? { custom_vehicle: selectedCustom.profile }
      : library.selected
        ? { vehicle_key: library.selected }
        : {},
    select: (id: string) => update({ ...library, selected: id }),
    save: (profile: CustomVehicle, id?: string) => {
      if (!id && library.custom.length >= 20)
        throw new Error(
          "当前浏览器最多保存20款自定义机型，请先删除不再使用的机型。",
        );
      const key = id || `custom-${crypto.randomUUID()}`;
      update({
        selected: key,
        custom: [
          ...library.custom.filter((c) => c.id !== key),
          { id: key, profile },
        ],
      });
    },
    remove: (id: string) =>
      update({
        selected: library.selected === id ? "" : library.selected,
        custom: library.custom.filter((c) => c.id !== id),
      }),
  };
}
export type Assessment = {
  status: string;
  reason?: string;
  vehicle: { display_name: string; data_status: string } | null;
  range_note?: string;
  limitation?: string;
  checks: {
    key: string;
    status: string;
    value: number | null;
    limit: number | null;
    label: string;
  }[];
  estimate?: {
    status: string;
    reason?: string;
    duration_s?: number;
    energy_wh?: number | null;
    ground_speed_mps?: number;
    remaining_after_reserve_wh?: number | null;
    energy_reason?: string;
  };
};

import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  MapPin,
  Search,
  X,
  ArrowRight,
  Navigation,
  LocateFixed,
  Trash2,
} from "lucide-react";
import {
  formatCoordinates,
  parseCoordinates,
  validGeoPlace,
  distanceMeters,
  type GeoPlace,
  type GeoMission,
} from "./geo";
type Props = {
  open: boolean;
  onClose: () => void;
  selected: GeoPlace | null;
  mission: GeoMission;
  onSelect: (place: GeoPlace) => void;
  onAssign: (key: keyof GeoMission, place: GeoPlace | null) => void;
  onTask: () => void;
  onError: (text: string) => void;
};
export default function LocationPanel({
  open,
  onClose,
  selected,
  mission,
  onSelect,
  onAssign,
  onTask,
  onError,
}: Props) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<GeoPlace[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const request = useRef<AbortController | null>(null),
    generation = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    setName(selected?.name ?? "");
  }, [selected]);
  useEffect(() => {
    if (!open) {
      generation.current++;
      request.current?.abort();
      setBusy(false);
    }
  }, [open]);
  async function search(e: React.FormEvent) {
    e.preventDefault();
    request.current?.abort();
    const token = ++generation.current;
    setMessage("");
    setResults([]);
    try {
      const coordinates = parseCoordinates(query);
      if (coordinates) {
        onSelect({
          name: "坐标选点",
          point: coordinates,
          source: "coordinates",
          capturedAt: new Date().toISOString(),
        });
        return;
      }
      if (query.trim().length < 2)
        throw new Error("输入城市＋地点，或“经度, 纬度”。");
      if (/^[\d\s,，.+-]+$/.test(query))
        throw new Error("请按“经度, 纬度”输入两个有效数字。");
      setBusy(true);
      const abort = new AbortController();
      request.current = abort;
      const response = await fetch(
        `/api/assistant/places/search?q=${encodeURIComponent(query.trim())}`,
        { signal: abort.signal },
      );
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "搜索太快，请等一秒再试。"
            : "地点搜索暂不可用。请启动助手服务，或直接输入经纬度/地图选点。",
        );
      const value = await response.json();
      if (!Array.isArray(value.places) || !value.places.every(validGeoPlace))
        throw new Error("地点服务返回格式不合法。");
      if (token !== generation.current || !mounted.current) return;
      setResults(value.places);
      if (!value.places.length)
        setMessage("没有找到匹配地点。试试更完整的城市＋地址，或地图选点。");
    } catch (error) {
      if (
        token === generation.current &&
        mounted.current &&
        !(error instanceof DOMException && error.name === "AbortError")
      )
        setMessage(error instanceof Error ? error.message : "搜索失败");
    } finally {
      if (token === generation.current && mounted.current) setBusy(false);
    }
  }
  function locate() {
    request.current?.abort();
    const token = ++generation.current;
    if (!navigator.geolocation) {
      setMessage("浏览器不支持定位，请直接搜索坐标。");
      return;
    }
    setBusy(true);
    setMessage("请允许浏览器读取你的位置。仅此次定位，不持续追踪。");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (token !== generation.current || !mounted.current) return;
        setBusy(false);
        setMessage("");
        onSelect({
          name: "我的当前位置",
          point: [position.coords.longitude, position.coords.latitude],
          source: "browser",
          capturedAt: new Date(position.timestamp).toISOString(),
          accuracyM: position.coords.accuracy,
        });
      },
      (error) => {
        if (token !== generation.current || !mounted.current) return;
        setBusy(false);
        setMessage(
          error.code === 1
            ? "定位权限未开启。点击地址栏的位置权限后重试，也可地图选点。"
            : "未能取得位置。检查系统定位和网络，或直接输入经纬度。",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }
  function assign(key: keyof GeoMission) {
    if (!selected) return;
    const value = { ...selected, name: name.trim() || selected.name };
    onAssign(key, value);
  }
  if (!open) return null;
  return (
    <section className="location-panel glass" aria-label="地点与任务坐标">
      <div className="location-heading">
        <span>
          <MapPin size={14} />
          地点与任务坐标 <small>WGS84</small>
        </span>
        <button aria-label="收起地点面板" onClick={onClose}>
          <X size={15} />
        </button>
      </div>
      <form onSubmit={search} className="place-search">
        <Search size={14} />
        <input
          aria-label="搜索地点或经纬度"
          placeholder="城市＋地点 / 经度, 纬度"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={180}
        />
        <button aria-label="搜索地点" disabled={busy || !query.trim()}>
          {busy ? <span className="mini-spinner" /> : <ArrowRight size={15} />}
        </button>
      </form>
      <div className="location-quick">
        <button onClick={locate} disabled={busy}>
          <LocateFixed size={13} />
          {busy ? "正在获取…" : "定位我"}
        </button>
        <span>也可直接点击地图选点</span>
      </div>
      {message && (
        <p className="location-message" role="status">
          {message}
        </p>
      )}
      {!!results.length && (
        <div className="place-results">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                onSelect(r);
                setResults([]);
              }}
            >
              <MapPin size={12} />
              <span>
                {r.name}
                <small>{formatCoordinates(r.point)}</small>
              </span>
            </button>
          ))}
          <small>搜索：© OpenStreetMap / Nominatim</small>
        </div>
      )}
      {selected && (
        <div className="selected-place">
          <label>
            选中地点名称
            <input
              aria-label="选中地点名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </label>
          <p className="geo-point-value">
            {formatCoordinates(selected.point)}
            {selected.accuracyM !== undefined && (
              <small>定位精度约 ±{Math.round(selected.accuracyM)}m</small>
            )}
          </p>
          <div className="assign-actions">
            <button onClick={() => assign("origin")}>
              <span className="origin-dot" />
              设为起点
            </button>
            <button onClick={() => assign("destination")}>
              <MapPin size={12} />
              设为终点
            </button>
          </div>
        </div>
      )}
      {(mission.origin || mission.destination) && (
        <div className="geo-mission">
          {(["origin", "destination"] as const).map((key) => (
            <div key={key}>
              <span
                className={key === "origin" ? "origin-dot" : "destination-dot"}
              />
              <span>
                <small>{key === "origin" ? "起点" : "终点"}</small>
                {mission[key]?.name ?? "请在地图选择"}
                {mission[key] && (
                  <small>{formatCoordinates(mission[key]!.point)}</small>
                )}
              </span>
              {mission[key] && (
                <button
                  aria-label={
                    key === "origin" ? "清除真实起点" : "清除真实终点"
                  }
                  onClick={() => onAssign(key, null)}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {mission.origin && mission.destination && (
            <p>
              直线距离{" "}
              {(
                distanceMeters(
                  mission.origin.point,
                  mission.destination.point,
                ) / 1000
              ).toFixed(2)}{" "}
              km · 尚未规划
            </p>
          )}
          <button
            className="button primary full-width"
            disabled={!mission.origin || !mission.destination}
            onClick={() => {
              if (
                mission.origin &&
                mission.destination &&
                distanceMeters(
                  mission.origin.point,
                  mission.destination.point,
                ) < 1
              ) {
                onError("起终点距离不足1米，请选择不同地点。");
                return;
              }
              onTask();
            }}
          >
            <Navigation size={13} />
            用这两个地点创建草稿
          </button>
        </div>
      )}
      <p className="location-footnote">
        地图选点保存真实经纬度；虚线仅表示两点连线。演示航线与安全校验独立。
      </p>
    </section>
  );
}

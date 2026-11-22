import { useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  Package,
  Plane,
  Plus,
  Upload,
  Wind,
  Zap,
} from "lucide-react";
import {
  useAircraft,
  validateVehicle,
  type Assessment,
  type CustomVehicle,
} from "./aircraft";
import { api, downloadJson, message } from "./portal/api";
import "./aircraft.css";

const fields = [
  ["max_payload_kg", "最大载荷", "kg", true],
  ["cruise_speed_mps", "测试巡航空速", "m/s", true],
  ["max_speed_mps", "最大水平速度", "m/s", false],
  ["max_range_km", "参考航程", "km", false],
  ["battery_capacity_wh", "标称电池总量", "Wh", false],
  ["usable_battery_wh", "实际可用电量", "Wh", false],
  ["reserve_policy_wh", "保留电量", "Wh", false],
  ["energy_per_meter_wh", "巡航单位距离能耗", "Wh/m", false],
  ["max_wind_mps", "最大抗风速度", "m/s", false],
  ["min_temperature_c", "最低工作温度", "°C", false],
  ["max_temperature_c", "最高工作温度", "°C", false],
] as const;
const numberText = (value: number | null | undefined, digits = 1) =>
  value == null
    ? "未公开"
    : value.toLocaleString("zh-CN", { maximumFractionDigits: digits });

export function VehicleSelect({
  aircraft,
}: {
  aircraft: ReturnType<typeof useAircraft>;
}) {
  return (
    <div className="aircraft-select">
      <label>
        配送机型
        <select
          aria-label="配送机型"
          value={aircraft.selected}
          onChange={(e) => aircraft.select(e.target.value)}
        >
          <option value="">仅几何规划 · 未选机型</option>
          {aircraft.selected &&
            !aircraft.selectedOfficial &&
            !aircraft.selectedCustom && (
              <option value={aircraft.selected}>
                {aircraft.loading
                  ? "正在加载已选机型…"
                  : "已选机型不可用，请重新选择"}
              </option>
            )}
          <optgroup label="厂家公开规格">
            {aircraft.catalog.map((v) => (
              <option key={v.id} value={v.id}>
                {v.display_name} · {v.max_payload_kg} kg
              </option>
            ))}
          </optgroup>
          <optgroup label="我的测试机型">
            {aircraft.custom.map((v) => (
              <option key={v.id} value={v.id}>
                {v.profile.display_name} · 自定义测试
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {aircraft.error && <p role="alert">机型库加载失败：{aircraft.error}</p>}
    </div>
  );
}

export function VehicleAssessment({ value }: { value: Assessment }) {
  const e = value.estimate;
  return (
    <div className="aircraft-assessment" data-testid="vehicle-assessment">
      <strong>
        {value.vehicle?.display_name ?? "未选机型"} ·{" "}
        {value.status === "exceeds_reference" ? "超出参考边界" : "参数对照"}
      </strong>
      {value.checks.map((c) => (
        <div className={`aircraft-check ${c.status}`} key={c.key}>
          <span>{c.label}</span>
          <b>
            {c.status === "exceeded"
              ? "超出"
              : c.status === "within_reference"
                ? "参考范围内"
                : "缺少参数"}
          </b>
          <small>
            {numberText(c.value, 3)} / {numberText(c.limit, 3)}{" "}
            {
              (
                {
                  payload: "kg",
                  range: "km",
                  wind: "m/s",
                  energy: "Wh",
                } as Record<string, string>
              )[c.key]
            }
          </small>
        </div>
      ))}
      {e?.duration_s != null && (
        <div className="aircraft-test-metrics">
          <div>
            <span>测试时长</span>
            <strong>
              {numberText(e.duration_s / 60)} <small>min</small>
            </strong>
          </div>
          <div>
            <span>测试能耗</span>
            <strong>
              {e.energy_wh == null
                ? "待补参数"
                : `${numberText(e.energy_wh)} Wh`}
            </strong>
          </div>
        </div>
      )}
      {e?.remaining_after_reserve_wh != null && (
        <p>
          扣除保留量后的测试余量：{numberText(e.remaining_after_reserve_wh)} Wh
        </p>
      )}
      {e?.reason && <p>{e.reason}</p>}
      {e?.energy_reason && <p>{e.energy_reason}</p>}
      <p>{value.range_note}</p>
      <small>{value.limitation ?? value.reason}</small>
    </div>
  );
}

export default function AircraftLibrary({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}) {
  const aircraft = useAircraft();
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string>();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [distance, setDistance] = useState("");
  const [payload, setPayload] = useState("");
  const [wind, setWind] = useState("0");
  const [direction, setDirection] = useState("calm");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [testedKey, setTestedKey] = useState("");
  const [testing, setTesting] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const currentTestKey = JSON.stringify([
    aircraft.selection,
    distance,
    payload,
    wind,
    direction,
  ]);
  const openEditor = (profile?: CustomVehicle, id?: string) => {
    setEditId(id);
    setError("");
    setNotice("");
    setDraft(
      profile
        ? Object.fromEntries(
            Object.entries(profile).map(([k, v]) => [
              k,
              v == null ? "" : String(v),
            ]),
          )
        : {},
    );
    setEditing(true);
    requestAnimationFrame(() =>
      editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data: Record<string, unknown> = {
        schema_version: 1,
        display_name: draft.display_name || "",
        source: draft.source || "",
        notes: draft.notes || "",
      };
      for (const [key] of fields)
        data[key] = draft[key]?.trim() ? Number(draft[key]) : null;
      const profile = await validateVehicle(data);
      aircraft.save(profile, editId);
      setEditing(false);
      setNotice("已保存并选用自定义测试机型，保存在当前浏览器。");
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    setSaving(true);
    try {
      if (f.size > 65536) throw new Error("机型 JSON 文件不能超过64 KB。");
      const profile = await validateVehicle(JSON.parse(await f.text()));
      aircraft.save(profile);
      setNotice(`已导入并选用 ${profile.display_name}。`);
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
      if (file.current) file.current.value = "";
    }
  };
  const testVehicle = async (event: FormEvent) => {
    event.preventDefault();
    setTesting(true);
    setError("");
    setAssessment(null);
    const key = currentTestKey;
    try {
      const result = await api<Assessment>("/assistant/vehicles/evaluate", {
        ...aircraft.selection,
        distance_km: Number(distance),
        payload_kg: Number(payload),
        wind_speed_mps: Number(wind),
        wind_direction: direction,
      });
      setAssessment(result);
      setTestedKey(key);
    } catch (e) {
      setError(message(e));
    } finally {
      setTesting(false);
    }
  };
  return (
    <div className="aircraft-page">
      <header className="aircraft-heading">
        <div>
          <p className="aircraft-eyebrow">AIRCRAFT LIBRARY / 配送平台</p>
          <h1>为每一次配送，选择合适的机型。</h1>
          <p>对照厂家规格，管理自己的测试参数，再将所选机型带入真实航线。</p>
        </div>
        <button
          className="aircraft-action primary"
          onClick={() => onNavigate("/airspace")}
        >
          <span>进入航线规划</span>
          <ArrowRight size={17} />
        </button>
      </header>
      <div className="aircraft-topline">
        <span>
          <Check size={15} /> {aircraft.catalog.length} 款官方来源机型
        </span>
        <span>
          <Package size={15} /> {aircraft.custom.length} 款本机测试档案
        </span>
        <span>参数核实日期随来源记录保存</span>
      </div>
      {error && (
        <div className="aircraft-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="aircraft-notice" role="status">
          {notice}
        </div>
      )}
      <div className="aircraft-layout">
        <section className="aircraft-catalog" aria-label="配送无人机目录">
          <div className="aircraft-section-title">
            <h2>配送机型目录</h2>
            <span>厂家公开规格 · 条件见各卡片</span>
          </div>
          {aircraft.loading && <p role="status">正在读取机型资料…</p>}
          {aircraft.error && <p role="alert">{aircraft.error}</p>}
          <div className="aircraft-cards">
            {aircraft.catalog.map((v, index) => (
              <article
                className={`aircraft-card ${aircraft.selected === v.id ? "selected" : ""}`}
                key={v.id}
                data-testid={`aircraft-${v.id}`}
              >
                <div className="aircraft-card-top">
                  <span className="aircraft-number">0{index + 1}</span>
                  <span className="aircraft-badge">{v.category}</span>
                  <Plane size={28} strokeWidth={1.3} />
                </div>
                <p className="aircraft-maker">
                  {v.manufacturer} / {v.airframe}
                </p>
                <h3>{v.display_name}</h3>
                <p className="aircraft-description">{v.summary}</p>
                <div className="aircraft-specs">
                  <div>
                    <Package size={16} />
                    <span>载荷上限</span>
                    <strong>
                      {v.max_payload_kg}
                      <small> kg</small>
                    </strong>
                  </div>
                  <div>
                    <Plane size={16} />
                    <span>参考航程</span>
                    <strong>
                      {numberText(v.max_range_km)}
                      <small> km</small>
                    </strong>
                  </div>
                  <div>
                    <Wind size={16} />
                    <span>参考速度</span>
                    <strong>
                      {v.reference_speed_mps}
                      <small> m/s</small>
                    </strong>
                  </div>
                </div>
                <p className="aircraft-configuration">{v.configuration}</p>
                <button
                  className={`aircraft-action ${aircraft.selected === v.id ? "chosen" : ""}`}
                  onClick={() => {
                    aircraft.select(v.id);
                    setNotice(
                      `已选用 ${v.display_name}，航线规划将使用此机型。`,
                    );
                  }}
                >
                  {aircraft.selected === v.id ? (
                    <>
                      <Check size={16} /> 当前选用
                    </>
                  ) : (
                    <>
                      选用此机型 <ArrowRight size={16} />
                    </>
                  )}
                </button>
                <details>
                  <summary>参数、工况与官方来源</summary>
                  <p>{v.range_note}</p>
                  <p>{v.speed_note}</p>
                  <p>
                    <Zap size={14} /> 标称电池：
                    {numberText(v.battery_capacity_wh)} Wh。{v.battery_note}
                  </p>
                  <p>
                    最大水平速度：{numberText(v.max_speed_mps)} m/s；抗风：
                    {numberText(v.max_wind_mps)} m/s；温度：
                    {numberText(v.min_temperature_c)} 至{" "}
                    {numberText(v.max_temperature_c)} °C。
                  </p>
                  {v.limitations.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                  {v.sources.map((s) => (
                    <div className="aircraft-source" key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title} <ExternalLink size={12} />
                      </a>
                      <small>
                        核实：
                        {new Date(s.fetched_at).toLocaleDateString("zh-CN")}
                      </small>
                    </div>
                  ))}
                </details>
              </article>
            ))}
          </div>
          <div className="aircraft-custom-heading">
            <div>
              <h2>我的测试机型</h2>
              <p>
                手动录入或导入 JSON。空缺参数保持未知，数据仅保存在当前浏览器。
              </p>
            </div>
            <div className="aircraft-actions">
              <button
                className="aircraft-action"
                onClick={() =>
                  downloadJson(
                    {
                      schema_version: 1,
                      display_name: "",
                      source: "",
                      notes:
                        "请填写实际来源；此文件为结构模板，未预填性能参数。",
                      ...Object.fromEntries(fields.map(([key]) => [key, null])),
                    },
                    "aircraft-template.json",
                  )
                }
              >
                <Download size={15} /> 模板
              </button>
              <button
                className="aircraft-action"
                disabled={saving}
                onClick={() => file.current?.click()}
              >
                <Upload size={15} /> 导入 JSON
              </button>
              <button
                className="aircraft-action primary"
                onClick={() => openEditor()}
              >
                <Plus size={15} /> 新建机型
              </button>
              <input
                ref={file}
                type="file"
                accept=".json,application/json"
                aria-label="导入机型 JSON"
                hidden
                onChange={(e) => void importFile(e.target.files?.[0])}
              />
            </div>
          </div>
          {aircraft.custom.length === 0 && !editing && (
            <div className="aircraft-empty">
              <Plane size={28} />
              <strong>把你的无人机加入工作区</strong>
              <p>
                填写载荷与测试空速即可开始；补充 Wh/m
                和可用电量后，可计算能耗与电量预算。
              </p>
              <button className="aircraft-action" onClick={() => openEditor()}>
                填写第一款机型
              </button>
            </div>
          )}
          {aircraft.custom.map((c) => (
            <article className="aircraft-custom-row" key={c.id}>
              <div>
                <strong>{c.profile.display_name}</strong>
                <p>
                  {c.profile.max_payload_kg} kg · {c.profile.cruise_speed_mps}{" "}
                  m/s · 用户测试参数
                </p>
              </div>
              <div className="aircraft-actions">
                <button
                  className="aircraft-action"
                  onClick={() => aircraft.select(c.id)}
                >
                  {aircraft.selected === c.id ? "当前选用" : "选用"}
                </button>
                <button
                  className="aircraft-action"
                  onClick={() => openEditor(c.profile, c.id)}
                >
                  编辑
                </button>
                <button
                  className="aircraft-action"
                  onClick={() =>
                    downloadJson(c.profile, `${c.profile.display_name}.json`)
                  }
                >
                  导出
                </button>
                <button
                  className="aircraft-action"
                  onClick={() => aircraft.remove(c.id)}
                >
                  删除
                </button>
              </div>
            </article>
          ))}
          {editing && (
            <div ref={editor} className="aircraft-editor">
              <h2>{editId ? "编辑测试机型" : "新建测试机型"}</h2>
              <form onSubmit={(e) => void save(e)}>
                <div className="aircraft-form-grid">
                  <label>
                    机型名称 *
                    <input
                      required
                      maxLength={100}
                      value={draft.display_name || ""}
                      onChange={(e) =>
                        setDraft({ ...draft, display_name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    数据来源 *
                    <input
                      required
                      maxLength={1000}
                      placeholder="手册网址、测试日志编号或测试假设说明"
                      value={draft.source || ""}
                      onChange={(e) =>
                        setDraft({ ...draft, source: e.target.value })
                      }
                    />
                  </label>
                  {fields.map(([key, label, unit, required]) => (
                    <label key={key}>
                      {label} ({unit}){required ? " *" : ""}
                      <input
                        type="number"
                        step="any"
                        required={required}
                        value={draft[key] || ""}
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: e.target.value })
                        }
                        placeholder={required ? "请填写" : "未知可留空"}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  适用工况与备注
                  <textarea
                    maxLength={2000}
                    value={draft.notes || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, notes: e.target.value })
                    }
                    placeholder="记录载重、温度、海拔、电池状态及测试误差"
                  />
                </label>
                <p className="aircraft-help">
                  Wh/m
                  应对应所填空速与载重工况。标称电池不等于可用电量；没有实测参数时请留空。所有手动数据均标记为用户测试。
                </p>
                <div className="aircraft-actions">
                  <button
                    className="aircraft-action primary"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? "正在校验…" : "校验并保存"}
                  </button>
                  <button
                    className="aircraft-action"
                    type="button"
                    onClick={() => setEditing(false)}
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
        <aside className="aircraft-test-panel">
          <p className="aircraft-eyebrow">QUICK CHECK</p>
          <h2>机型参数测试</h2>
          <p>
            输入单程距离与载荷，对照规格边界。风场由你设定，结果用于方案测试。
          </p>
          <VehicleSelect aircraft={aircraft} />
          <form onSubmit={(e) => void testVehicle(e)}>
            <div className="aircraft-form-grid">
              <label>
                测试距离 (km)
                <input
                  type="number"
                  required
                  min="0.001"
                  max="2000"
                  step="any"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                />
              </label>
              <label>
                配送载荷 (kg)
                <input
                  type="number"
                  required
                  min="0"
                  max="1000"
                  step="any"
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                />
              </label>
            </div>
            <label>
              测试风向
              <select
                aria-label="测试风向"
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value);
                  if (e.target.value === "calm") setWind("0");
                }}
              >
                <option value="calm">无风情景</option>
                <option value="headwind">正逆风情景</option>
                <option value="tailwind">正顺风情景</option>
                <option value="crosswind">正侧风情景</option>
              </select>
            </label>
            <label>
              测试风速 (m/s)
              <input
                type="number"
                required
                min="0"
                max="100"
                step="any"
                disabled={direction === "calm"}
                value={wind}
                onChange={(e) => setWind(e.target.value)}
              />
            </label>
            <button
              className="aircraft-action primary"
              disabled={testing || !aircraft.selected}
            >
              {testing ? "计算中…" : "运行参数测试"}
              <ArrowRight size={16} />
            </button>
          </form>
          {assessment && (
            <>
              {testedKey !== currentTestKey && (
                <p className="aircraft-error" role="alert">
                  参数已更改，请重新运行测试；下方为上次结果。
                </p>
              )}
              <VehicleAssessment value={assessment} />
            </>
          )}
          <div className="aircraft-note">
            <strong>从规格到实际飞行</strong>
            <p>
              官方数据保留原始测试条件；厂家未公开的能耗参数保持为空。手动录入可以测试能耗，但不会自动成为实机标定。
            </p>
            <p>测试不包含起降、转弯、返航与备降，不生成飞控指令。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

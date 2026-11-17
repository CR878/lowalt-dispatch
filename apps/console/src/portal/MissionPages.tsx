import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  Flag,
  Info,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Button,
  Empty,
  ErrorLine,
  Loading,
  PageTitle,
  TaskRows,
  usePortal,
} from "./Portal";
import {
  api,
  downloadJson,
  message,
  stateLabel,
  type DispatchTask,
  type PlanRecord,
  type Position,
  type Proposal,
} from "./api";
import { IntakeList } from "./IntakeList";

type Form = {
  mode: "scenario" | "custom";
  scenario: string;
  name: string;
  ox: string;
  oy: string;
  dx: string;
  dy: string;
  altitude: string;
  energy: string;
  reserve: string;
  payload: string;
  zones: string[];
  occupied: string[];
};
const defaults: Form = {
  mode: "scenario",
  scenario: "S1-01",
  name: "我的航线规划",
  ox: "150",
  oy: "150",
  dx: "2650",
  dy: "2750",
  altitude: "30",
  energy: "100",
  reserve: "20",
  payload: "1",
  zones: [],
  occupied: [],
};
function loadDraft(key: string): Form {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (value && ["scenario", "custom"].includes(value.mode))
      return { ...defaults, ...value };
  } catch {
    /* Start with a safe draft when storage is unavailable. */
  }
  return defaults;
}
export function RoutePreview({
  points = [],
  origin,
  destination,
}: {
  points?: Position[];
  origin?: Position;
  destination?: Position;
}) {
  const all = points.length
    ? points
    : origin && destination
      ? [origin, destination]
      : [];
  const x = (v: number) => 34 + (v / 3000) * 432,
    y = (v: number) => 287 - (v / 3000) * 249;
  return (
    <div className="p-route-preview">
      <svg
        viewBox="0 0 500 325"
        aria-label={points.length ? "已返回的 ENU 航线预览" : "任务起终点预览"}
        role="img"
      >
        <defs>
          <pattern
            id="route-grid"
            width="36"
            height="36"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M36 0H0V36"
              fill="none"
              stroke="var(--preview-grid, #dbe4ec)"
              strokeWidth=".7"
            />
          </pattern>
        </defs>
        <rect
          x="25"
          y="25"
          width="450"
          height="270"
          rx="7"
          fill="url(#route-grid)"
        />
        <rect
          x="167"
          y="124"
          width="64"
          height="42"
          fill="var(--preview-block, #e2e8ee)"
          rx="3"
        />
        <rect
          x="300"
          y="193"
          width="80"
          height="33"
          fill="var(--preview-block, #e2e8ee)"
          rx="3"
        />
        {all.length > 1 && (
          <polyline
            points={all.map((p) => `${x(p.x_m)},${y(p.y_m)}`).join(" ")}
            stroke={
              points.length
                ? "var(--preview-route, #0070d5)"
                : "var(--preview-draft, #8fa1b2)"
            }
            strokeWidth="3"
            strokeDasharray={points.length ? undefined : "6 5"}
            fill="none"
          />
        )}
        {all.length > 0 &&
          [all[0], all[all.length - 1]].map((p, i) => (
            <g key={i}>
              <circle
                cx={x(p.x_m)}
                cy={y(p.y_m)}
                r="7"
                fill="var(--preview-point, white)"
                stroke={
                  i
                    ? "var(--preview-route, #0070d5)"
                    : "var(--preview-origin, #168269)"
                }
                strokeWidth="3"
              />
              <text
                x={x(p.x_m) + 13}
                y={y(p.y_m) + 4}
                fontSize="11"
                fill="var(--preview-label, #526578)"
              >
                {i ? "终点" : "起点"}
              </text>
            </g>
          ))}
        <text
          x="34"
          y="315"
          fontSize="10"
          fill="var(--preview-muted, #7f8d9b)"
          fontFamily="monospace"
        >
          ENU / 3,000 × 3,000 m
        </text>
        <text x="445" y="20" fontSize="10" fill="var(--preview-muted, #7f8d9b)">
          N ↑
        </text>
      </svg>
      <div>
        <span className="p-tag">仿真坐标</span>
        <small>
          {points.length
            ? "显示接口返回的航点；背景建筑仅作示意。"
            : "虚线仅连接起终点，尚未规划。"}
        </small>
      </div>
    </div>
  );
}

export function MissionList() {
  const { summary, can, go, user, toast } = usePortal();
  const [query, setQuery] = useState(""),
    [tab, setTab] = useState("all"),
    [draftDeleted, setDraftDeleted] = useState(false);
  const tasks = (summary?.tasks || []).filter(
    (t) =>
      (t.task_id.includes(query) ||
        t.scenario_id.toLowerCase().includes(query.toLowerCase())) &&
      (tab === "all" ||
        (tab === "active" &&
          ["executing", "accepted", "recovering"].includes(
            t.execution?.state || "",
          )) ||
        (tab === "review" && t.planning_status === "awaiting_confirmation")),
  );
  const draft = (() => {
    try {
      return (
        !draftDeleted &&
        !!localStorage.getItem("aeris-mission-draft-" + user.id)
      );
    } catch {
      return false;
    }
  })();
  return (
    <>
      <PageTitle
        eyebrow="MISSION MANAGEMENT"
        title="任务中心"
        description="创建、审核与追踪任务，在一个流程中完成协作。"
        action={
          can("task.create") && (
            <Button primary onClick={() => go("/missions/new")}>
              <Plus size={17} />
              创建任务
            </Button>
          )
        }
      />
      <div className="p-info">
        <Info size={19} />
        <p>
          第一次使用？选择一个已配置场景，即可体验“任务 → 规划 → 校验 →
          回执”的本地完整链路。
        </p>
        <button onClick={() => go("/help")}>
          查看指引
          <ChevronRight size={14} />
        </button>
      </div>
      <IntakeList />
      {draft && can("task.create") && (
        <div className="p-draft-notice">
          <Save size={18} />
          <div>
            <strong>有一份尚未完成的任务草稿</strong>
            <p>输入参数已保存在当前浏览器，可随时继续。</p>
          </div>
          <Button onClick={() => go("/missions/new")}>
            继续编辑
            <ArrowRight size={15} />
          </Button>
          <button
            title="删除草稿"
            aria-label="删除草稿"
            onClick={() => {
              localStorage.removeItem("aeris-mission-draft-" + user.id);
              setDraftDeleted(true);
              toast("草稿已删除");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <section className="p-card">
        <div className="p-table-toolbar">
          <div className="p-tabs">
            {[
              ["all", "全部任务"],
              ["active", "执行中"],
              ["review", "待审核"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={tab === value ? "active" : ""}
              >
                {label}
                {value === "all" && <span>{summary?.tasks.length || 0}</span>}
              </button>
            ))}
          </div>
          <label className="p-search-field">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索场景、任务编号"
              aria-label="搜索任务"
            />
          </label>
        </div>
        {tasks.length ? (
          <TaskRows tasks={tasks} />
        ) : (
          <Empty
            title={
              query || tab !== "all"
                ? "没有匹配的任务"
                : "你的第一项任务，从这里开始"
            }
          >
            <p>
              {query || tab !== "all"
                ? "尝试其他关键词或状态筛选。"
                : "从预设场景开始，系统将引导你完成每一步。"}
            </p>
            {can("task.create") && !query && tab === "all" && (
              <Button onClick={() => go("/missions/new")}>
                开始配置
                <ArrowRight size={15} />
              </Button>
            )}
          </Empty>
        )}
      </section>
      {!!summary?.planning_tasks.length && (
        <section className="p-card p-spaced">
          <div className="p-card-head">
            <h2>自定义航线规划</h2>
            <span className="p-tag">规划 API</span>
          </div>
          <div className="p-task-rows">
            {summary.planning_tasks.map((t) => (
              <button
                key={t.task_id}
                onClick={() => go("/missions/plan/" + t.task_id)}
              >
                <Route size={19} />
                <div>
                  <strong>{t.task_id}</strong>
                  <p>ENU 仿真任务 · 查看规划结果</p>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function MissionWizard() {
  const { user, summary, go, toast, refreshSummary } = usePortal();
  const key = "aeris-mission-draft-" + user.id;
  const [form, setForm] = useState<Form>(() => loadDraft(key)),
    [step, setStep] = useState(0),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [planningId, setPlanningId] = useState(""),
    [result, setResult] = useState<DispatchTask | null>(null),
    [plan, setPlan] = useState<PlanRecord | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false),
    [now, setNow] = useState(Date.now()),
    [scene, setScene] = useState<{
      restriction_zones: { properties: { id?: string; zone_id?: string } }[];
      landing_sites: { site_id: string }[];
    } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (form.mode !== "custom") return;
    const abort = new AbortController();
    api<typeof scene>("/planning/scenes/v0", undefined, undefined, abort.signal)
      .then(setScene)
      .catch((e) => {
        if (!abort.signal.aborted) setError(message(e));
      });
    return () => abort.abort();
  }, [form.mode]);
  useEffect(() => {
    if (step === 3) return;
    try {
      localStorage.setItem(key, JSON.stringify(form));
    } catch {
      /* Saving remains optional when browser storage is disabled. */
    }
  }, [form, key, step]);
  const change = (field: keyof Form, value: Form[keyof Form]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };
  const expired = !!proposal && Date.parse(proposal.expires_at) <= now;
  const remaining = proposal
    ? Math.max(0, Math.ceil((Date.parse(proposal.expires_at) - now) / 1000))
    : 0;
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      if (form.mode === "scenario") {
        const p = await api<Proposal>("/dispatch/proposals", {
          scenario_id: form.scenario,
        });
        if (mounted.current) {
          setProposal(p);
          setStep(1);
          setConsent(false);
        }
      } else {
        const nums = [
          form.ox,
          form.oy,
          form.dx,
          form.dy,
          form.altitude,
          form.energy,
          form.reserve,
          form.payload,
        ];
        if (nums.some((n) => !n.trim() || !Number.isFinite(Number(n))))
          throw new Error("请填写完整且有效的数值");
        if (
          [form.ox, form.oy, form.dx, form.dy].some((n) => +n < 0 || +n > 3000)
        )
          throw new Error("当前仿真场景坐标范围为0–3000米");
        if (+form.energy <= +form.reserve || +form.reserve < 0)
          throw new Error("初始能量需大于预留能量，且预留能量不能为负");
        if (+form.altitude < 0 || +form.altitude > 120 || +form.payload < 0)
          throw new Error("高度应为0–120米，载荷不能为负");
        const id = "P-" + crypto.randomUUID();
        const pos = (x: string, y: string, alt: number) => ({
          frame: "enu_m",
          x_m: +x,
          y_m: +y,
          alt_m: alt,
          alt_ref: "rel_takeoff",
        });
        await api("/planning/tasks", {
          task_id: id,
          origin: pos(form.ox, form.oy, 0),
          destination: pos(form.dx, form.dy, +form.altitude),
          payload_kg: +form.payload,
          vehicle_type: "placeholder",
          initial_energy_wh: +form.energy,
          reserve_energy_wh: +form.reserve,
          time_limit_s: 600,
          provenance: {
            source: "AERIS frontend / " + form.name,
            version: "1",
            captured_at: new Date().toISOString(),
            is_simulated: true,
            uncertainty_note: "用户输入的仿真参数，未经实际机型标定",
          },
        });
        setPlanningId(id);
        setStep(1);
        setConsent(false);
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    setBusy(true);
    setError("");
    setStep(2);
    try {
      if (form.mode === "scenario" && proposal) {
        const task = await api<DispatchTask>(
          "/dispatch/tasks/" + proposal.task_id + "/confirm",
          { confirmed: true, review_digest: proposal.review_digest },
        );
        setResult(task);
        localStorage.setItem("aeris-local-task", task.task_id);
      } else {
        await api("/planning/tasks/" + planningId + "/snapshots/from-scene", {
          scene_id: "v0",
          active_zone_ids: form.zones,
          occupied_site_ids: form.occupied,
        });
        const value = await api<{ route: PlanRecord }>(
          "/planning/tasks/" + planningId + "/plan",
          {},
        );
        setPlan(value.route);
      }
      localStorage.removeItem(key);
      setStep(3);
      void refreshSummary();
    } catch (e) {
      setError(message(e));
      setStep(1);
    } finally {
      setBusy(false);
    }
  }
  const task = proposal?.task;
  const origin = task?.origin || {
    x_m: +form.ox,
    y_m: +form.oy,
    alt_m: 0,
    alt_ref: "rel_takeoff",
  };
  const destination = task?.destination || {
    x_m: +form.dx,
    y_m: +form.dy,
    alt_m: +form.altitude,
    alt_ref: "rel_takeoff",
  };
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(form));
      toast("输入参数已保存，返回后可继续；审核将在运行前重新核对");
      go("/missions");
    } catch {
      setError("浏览器未允许保存草稿，请保持当前页面");
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="A GUIDED MISSION, FROM START TO FINISH"
        title="创建任务"
        description="一次专注一步，让每次关键决策都有据可查。"
        action={
          step < 3 &&
          !busy && (
            <Button onClick={save}>
              <Save size={16} />
              保存草稿，稍后继续
            </Button>
          )
        }
      />
      <ol className="p-stepper">
        {["定义任务", "核对与审核", "规划与校验", "查看结果"].map((name, i) => (
          <li
            key={name}
            className={i === step ? "current" : i < step ? "complete" : ""}
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i < step ? <Check size={16} /> : i + 1}</span>
            <div>
              <strong>{name}</strong>
              <small>
                {
                  [
                    "选择任务场景与目标",
                    "确认参数和运行边界",
                    "调用实际本地模块",
                    "查阅状态与执行证据",
                  ][i]
                }
              </small>
            </div>
          </li>
        ))}
      </ol>
      <ErrorLine text={error} />
      {step === 0 && (
        <div className="p-wizard-columns">
          <section className="p-card p-form-card">
            <p className="p-kicker">STEP 01 / DEFINE</p>
            <h2>从哪一种任务开始？</h2>
            <p className="p-description">
              初次使用建议选择场景联调，体验完整任务链路。
            </p>
            <div className="p-choice-grid">
              {[
                {
                  value: "scenario",
                  title: "场景联调",
                  text: "使用已配置场景，运行完整的 M3 → M4 流程",
                  icon: Route,
                },
                {
                  value: "custom",
                  title: "自定义航线",
                  text: "输入仿真坐标，调用独立任务与规划 API",
                  icon: MapPin,
                },
              ].map((c) => (
                <button
                  key={c.value}
                  className={`p-choice ${form.mode === c.value ? "selected" : ""}`}
                  onClick={() => change("mode", c.value as Form["mode"])}
                >
                  <c.icon size={22} />
                  <strong>{c.title}</strong>
                  <p>{c.text}</p>
                  <span>
                    {form.mode === c.value ? <CheckCircle2 size={17} /> : null}
                  </span>
                </button>
              ))}
            </div>
            {form.mode === "scenario" ? (
              <>
                <label className="p-field">
                  任务场景
                  <select
                    value={form.scenario}
                    onChange={(e) => change("scenario", e.target.value)}
                  >
                    {(
                      summary?.dispatch.scenarios || [
                        { id: "S1-01", name: "基础任务" },
                      ]
                    ).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} · {s.name}
                      </option>
                    ))}
                  </select>
                  <small>
                    参数由场景集与机型配置提供，下一步可以逐项核对。
                  </small>
                </label>
                {summary?.dispatch.active_task_id && (
                  <div className="p-info warning">
                    <Info size={18} />
                    <p>
                      当前执行端仍有未结束任务。你可以先审核新任务，执行端会独立检查是否允许受理。
                    </p>
                    <button
                      onClick={() =>
                        go("/missions/" + summary.dispatch.active_task_id)
                      }
                    >
                      查看当前任务
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="p-field">
                  规划备注
                  <input
                    value={form.name}
                    onChange={(e) => change("name", e.target.value)}
                    maxLength={60}
                  />
                </label>
                <div className="p-form-grid">
                  {[
                    ["ox", "起点 E / m"],
                    ["oy", "起点 N / m"],
                    ["dx", "终点 E / m"],
                    ["dy", "终点 N / m"],
                    ["altitude", "相对起飞点高度 / m"],
                    ["payload", "载荷 / kg"],
                    ["energy", "初始能量 / Wh"],
                    ["reserve", "预留能量 / Wh"],
                  ].map(([field, label]) => (
                    <label className="p-field" key={field}>
                      {label}
                      <input
                        type="number"
                        value={form[field as keyof Form] as string}
                        min={0}
                        step="any"
                        onChange={(e) =>
                          change(field as keyof Form, e.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
                <p className="p-input-hint">
                  <Info size={14} />
                  当前场景为 ENU
                  0–3000米，高度0–120米。参数属于合成输入，规划器未返回的能耗和余量会显示为不可用。
                </p>
              </>
            )}
          </section>
          <aside className="p-wizard-aside">
            <section className="p-card p-guide-card">
              <span className="p-guide-icon">
                <Flag size={24} />
              </span>
              <h3>先明确目标，再交给系统。</h3>
              <p>
                场景联调会使用同一任务 ID 串起规划、独立校验、执行命令与回执。
              </p>
              <ul>
                <li>
                  <Check size={15} />
                  运行前可以核对全部关键参数
                </li>
                <li>
                  <Check size={15} />
                  只有人工确认后才会启动流程
                </li>
                <li>
                  <Check size={15} />
                  每一步都保留可追溯记录
                </li>
              </ul>
              <div className="p-guide-note">
                本地合成执行不连接 PX4。真实地图目的地与仿真坐标不会自动混用。
              </div>
            </section>
            <button className="p-text-button" onClick={() => go("/help")}>
              随时查看新手指引
              <ArrowRight size={14} />
            </button>
          </aside>
        </div>
      )}
      {step === 1 && (
        <div className="p-wizard-columns">
          <section className="p-card p-form-card">
            <p className="p-kicker">STEP 02 / REVIEW</p>
            <h2>确认这一次任务的边界。</h2>
            <p className="p-description">
              上一步的信息已锁定，返回编辑会重新生成待审记录。
            </p>
            <div className="p-review-summary">
              <div>
                <span>任务类型</span>
                <strong>
                  {form.mode === "scenario"
                    ? `场景联调 / ${form.scenario}`
                    : form.name}
                </strong>
              </div>
              <div>
                <span>起点 / ENU</span>
                <strong>
                  {origin.x_m}, {origin.y_m} m
                </strong>
              </div>
              <div>
                <span>终点 / ENU</span>
                <strong>
                  {destination.x_m}, {destination.y_m} m
                </strong>
              </div>
              <div>
                <span>高度 / 相对起飞点</span>
                <strong>{destination.alt_m} m</strong>
              </div>
              <div>
                <span>初始能量 / 预留</span>
                <strong>
                  {task?.initial_energy_wh ?? form.energy} /{" "}
                  {task?.reserve_energy_wh ?? form.reserve} Wh
                </strong>
              </div>
              <div>
                <span>执行边界</span>
                <strong>
                  {form.mode === "scenario"
                    ? "本地合成执行 · 不连接 PX4"
                    : "仅规划 · 不执行飞行任务"}
                </strong>
              </div>
            </div>
            {form.mode === "custom" && (
              <>
                <h3 className="p-subheading">场景风险快照</h3>
                <p className="p-input-hint">
                  选中要激活的限制区和已占用的备降点。风险将写入独立 API
                  的快照。
                </p>
                <div className="p-risk-options">
                  {scene?.restriction_zones.map((z, i) => {
                    const id = z.properties.id || z.properties.zone_id || "";
                    return id ? (
                      <label key={id}>
                        <input
                          type="checkbox"
                          checked={form.zones.includes(id)}
                          onChange={(e) =>
                            change(
                              "zones",
                              e.target.checked
                                ? [...form.zones, id]
                                : form.zones.filter((v) => v !== id),
                            )
                          }
                        />
                        激活限制区 {id}
                      </label>
                    ) : (
                      <small key={i}>场景限制区缺少 ID，请检查场景数据</small>
                    );
                  })}
                  {scene?.landing_sites.map((s) => (
                    <label key={s.site_id}>
                      <input
                        type="checkbox"
                        checked={form.occupied.includes(s.site_id)}
                        onChange={(e) =>
                          change(
                            "occupied",
                            e.target.checked
                              ? [...form.occupied, s.site_id]
                              : form.occupied.filter((v) => v !== s.site_id),
                          )
                        }
                      />
                      备降点 {s.site_id} 已占用
                    </label>
                  ))}
                </div>
              </>
            )}
            {proposal && (
              <div className={`p-review-expiry ${expired ? "expired" : ""}`}>
                <Clock3 size={16} />
                {expired
                  ? "待审记录已过期，请返回重新生成。"
                  : `审核有效期剩余 ${Math.floor(remaining / 60)}分${remaining % 60}秒`}
              </div>
            )}
            <label className="p-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                我已核对任务参数，确认
                {form.mode === "scenario"
                  ? "仅运行本地合成联调，不连接或控制真实飞控。"
                  : "仅使用仿真坐标进行规划，不将结果视为真实飞行许可。"}
              </span>
            </label>
          </section>
          <aside className="p-wizard-aside">
            <section className="p-card">
              <RoutePreview origin={origin} destination={destination} />
            </section>
            <section className="p-card p-guide-card">
              <ShieldCheck size={23} />
              <h3>安全校验拥有最终决定权</h3>
              <p>
                场景联调会由独立校验器检查候选航线。被拦截也是有效结果，页面会如实展示原因。
              </p>
            </section>
          </aside>
        </div>
      )}
      {step === 2 && (
        <section className="p-card p-run-stage" aria-live="polite">
          <LoaderCircle size={36} className="p-spin" />
          <h2>系统正在处理这一次任务</h2>
          <p>
            {form.mode === "scenario"
              ? "调用 Agent、规划器与独立校验，等待执行端回执。"
              : "创建风险快照，调用已配置的规划器。"}
          </p>
          <span>页面会展示实际接口结果，请稍候。</span>
        </section>
      )}
      {step === 3 && (
        <section className="p-card p-complete">
          <span
            className={`p-complete-icon ${result?.planning_status === "blocked" || (plan && !plan.found) ? "warning" : ""}`}
          >
            <FileCheck2 size={30} />
          </span>
          <p className="p-kicker">RESULT SAVED</p>
          <h2>
            {result?.planning_status === "blocked"
              ? "安全校验已拦截这条航线"
              : plan && !plan.found
                ? "本次未找到可行航线"
                : "任务结果已保存"}
          </h2>
          <p>
            {result
              ? stateLabel(result.execution?.state || result.planning_status)
              : plan?.found
                ? "已获得规划结果，可以查看航点与规划限制。"
                : plan?.reason || "请查看详情中的完整诊断信息。"}
          </p>
          <div className="p-result-facts">
            <span>
              <CheckCircle2 size={16} />
              任务记录已持久化
            </span>
            <span>
              <ShieldCheck size={16} />
              原始证据可追溯
            </span>
            <span>
              <Activity size={16} />
              {result?.result?.ack
                ? "已收到执行端回执"
                : "状态来自本地实际接口"}
            </span>
          </div>
          <div className="p-complete-actions">
            <Button
              primary
              onClick={() =>
                go(
                  result
                    ? "/missions/" + result.task_id
                    : "/missions/plan/" + planningId,
                )
              }
            >
              查看{result ? "任务" : "规划"}详情
              <ArrowRight size={16} />
            </Button>
            <Button onClick={() => go("/workspace")}>返回工作台</Button>
            <button
              className="p-text-button"
              onClick={() => {
                setStep(0);
                setProposal(null);
                setResult(null);
                setPlan(null);
                setConsent(false);
              }}
            >
              新建另一个任务
            </button>
          </div>
          <RoutePreview
            points={result?.result?.route?.waypoints || plan?.waypoints || []}
            origin={origin}
            destination={destination}
          />
        </section>
      )}
      {step < 3 && (
        <div className="p-wizard-footer">
          <div>
            <ShieldCheck size={16} />
            <span>
              {step === 0
                ? "输入可随时保存为草稿"
                : step === 1
                  ? "核对完成后才能运行"
                  : "正在等待接口结果"}
            </span>
          </div>
          <div>
            {step > 0 && !busy && (
              <Button
                onClick={() => {
                  setStep(0);
                  setConsent(false);
                  setProposal(null);
                }}
              >
                <ArrowLeft size={15} />
                返回编辑
              </Button>
            )}
            {step === 0 ? (
              <Button
                primary
                disabled={busy || !summary}
                onClick={() => void prepare()}
              >
                {busy ? <LoaderCircle size={16} className="p-spin" /> : null}
                生成待审任务
                <ArrowRight size={16} />
              </Button>
            ) : (
              <Button
                primary
                disabled={busy || !consent || expired}
                onClick={() => void run()}
              >
                {busy ? <LoaderCircle size={16} className="p-spin" /> : null}
                {form.mode === "scenario"
                  ? "确认并运行本地任务"
                  : "确认并规划航线"}
                <ArrowRight size={16} />
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function TaskDetail({
  taskId,
  planning,
}: {
  taskId: string;
  planning: boolean;
}) {
  const { go, can, toast, refreshSummary } = usePortal();
  const [task, setTask] = useState<DispatchTask | null>(null),
    [plans, setPlans] = useState<PlanRecord[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmEnd, setConfirmEnd] = useState(false),
    [updated, setUpdated] = useState("");
  async function reload(signal?: AbortSignal) {
    try {
      if (planning)
        setPlans(
          await api<PlanRecord[]>(
            "/planning/tasks/" + encodeURIComponent(taskId) + "/routes",
            undefined,
            undefined,
            signal,
          ),
        );
      else {
        const value = await api<DispatchTask>(
          "/dispatch/tasks/" + encodeURIComponent(taskId),
          undefined,
          undefined,
          signal,
        );
        setTask(value);
        localStorage.setItem("aeris-local-task", value.task_id);
      }
      setUpdated(new Date().toLocaleTimeString("zh-CN"));
      setError("");
    } catch (e) {
      if (!signal?.aborted) setError(message(e));
    }
  }
  useEffect(() => {
    const abort = new AbortController();
    void reload(abort.signal);
    const id = setInterval(() => void reload(abort.signal), 2500);
    return () => {
      abort.abort();
      clearInterval(id);
    };
  }, [taskId, planning]);
  const plan = plans?.at(-1);
  const points = task?.result?.route?.waypoints || plan?.waypoints || [];
  const active =
    task?.execution &&
    ["accepted", "executing", "recovering"].includes(task.execution.state);
  async function end() {
    setBusy(true);
    try {
      await api("/dispatch/tasks/" + taskId + "/abandon", { confirmed: true });
      setConfirmEnd(false);
      await reload();
      void refreshSummary();
      toast("本次合成测试已结束，已记录操作原因");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportRecord() {
    setBusy(true);
    try {
      let record: unknown = task;
      if (planning) {
        const original = await api(
          "/planning/tasks/" + encodeURIComponent(taskId),
        );
        const margins = await Promise.all(
          (plans || []).map((p) =>
            api(
              "/planning/tasks/" +
                encodeURIComponent(taskId) +
                "/routes/" +
                encodeURIComponent(p.route_id) +
                "/margin",
            ),
          ),
        );
        record = { task: original, routes: plans, margins };
      }
      downloadJson(record, `aeris-${taskId}.json`);
      toast("完整任务记录已导出");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow={planning ? "PLANNING RECORD" : "MISSION DETAIL"}
        title={
          planning
            ? "航线规划详情"
            : `${task?.scenario_id || "低空任务"} · 任务详情`
        }
        description={taskId}
        action={
          <div className="p-inline">
            <Button
              disabled={busy || (!task && !plans)}
              onClick={() => void exportRecord()}
            >
              <ArrowDownToLine size={16} />
              导出完整记录
            </Button>
            <Button onClick={() => void reload()}>
              <RefreshCw size={16} />
              刷新状态
            </Button>
          </div>
        }
      />
      <ErrorLine text={error} />
      {!task && !plans && !error ? (
        <Loading />
      ) : (
        <>
          <div className="p-detail-status">
            <span
              className={`p-status ${task?.planning_status === "blocked" || (plan && !plan.found) ? "warning" : ""}`}
            >
              {task
                ? stateLabel(task.execution?.state || task.planning_status)
                : plan
                  ? plan.found
                    ? "已生成规划"
                    : "未找到可行航线"
                  : "尚未规划"}
            </span>
            <span>
              <span className="p-service-dot" />
              最后同步 {updated || "—"}
            </span>
            <span>本地仿真 · 不连接 PX4</span>
          </div>
          <div className="p-wizard-columns">
            <section className="p-card">
              <div className="p-card-head">
                <div>
                  <h2>航线与任务状态</h2>
                  <p>直接显示接口返回的航点与执行证据。</p>
                </div>
                <span className="p-tag">
                  {task?.execution?.plan_version ||
                    plan?.plan_version ||
                    "待生成版本"}
                </span>
              </div>
              <RoutePreview points={points} />
              <div className="p-review-summary p-detail-facts">
                <div>
                  <span>规划结果</span>
                  <strong>
                    {task
                      ? stateLabel(task.planning_status)
                      : plan?.found
                        ? "找到可行航线"
                        : plan
                          ? "未找到航线"
                          : "尚未运行"}
                  </strong>
                </div>
                <div>
                  <span>返回航点</span>
                  <strong>{points.length || "—"}</strong>
                </div>
                <div>
                  <span>执行回执</span>
                  <strong>
                    {task?.result?.ack
                      ? task.result.ack.accepted
                        ? "已接受"
                        : "已拒绝"
                      : "尚无执行回执"}
                  </strong>
                </div>
                <div>
                  <span>命令执行次数</span>
                  <strong>{task?.execution?.execution_count ?? "—"}</strong>
                </div>
                <div>
                  <span>能量余量 / Wh</span>
                  <strong>
                    {task?.observation?.state.energy_remaining_wh?.toFixed(2) ??
                      "尚无遥测数值"}
                  </strong>
                </div>
                <div>
                  <span>航线长度 / m</span>
                  <strong>{plan?.length_m?.toFixed(1) ?? "接口未提供"}</strong>
                </div>
              </div>
              {task?.reason && (
                <div className="p-diagnostic">
                  <h3>实际处理结果</h3>
                  <p>{task.reason}</p>
                </div>
              )}
              {plan && (
                <div className="p-diagnostic">
                  <h3>规划与余量状态</h3>
                  <p>{plan.reason || "规划器已返回结果"}</p>
                  <p>
                    当前算法：{plan.algorithm} ·{" "}
                    {plan.elapsed_ms !== null
                      ? `${plan.elapsed_ms.toFixed(1)} ms`
                      : "耗时未返回"}
                  </p>
                  <p>{plan.margin_detail}</p>
                  {plan.limitations.map((v) => (
                    <p key={v}>{v}</p>
                  ))}
                </div>
              )}
            </section>
            <aside className="p-wizard-aside">
              <section className="p-card p-guide-card">
                <h3>模块证据链</h3>
                <ol className="p-evidence-chain">
                  {[
                    {
                      label: "任务与场景",
                      value: task?.scenario_id || taskId,
                      done: !!task || !!plans,
                    },
                    {
                      label: "规划与独立校验",
                      value: task
                        ? stateLabel(task.planning_status)
                        : plan?.algorithm || "等待规划结果",
                      done: !!task?.result || !!plan,
                    },
                    {
                      label: "执行端 ACK",
                      value: task?.result?.ack?.fc_mode || "尚无回执",
                      done: !!task?.result?.ack,
                    },
                    {
                      label: "执行状态",
                      value: task?.execution
                        ? stateLabel(task.execution.state)
                        : "尚无执行证据",
                      done: !!task?.execution,
                    },
                  ].map((v, i) => (
                    <li key={v.label}>
                      <span className={v.done ? "done" : ""}>
                        {v.done ? <Check size={14} /> : i + 1}
                      </span>
                      <div>
                        <strong>{v.label}</strong>
                        <small>{v.value}</small>
                      </div>
                    </li>
                  ))}
                </ol>
                <Button
                  onClick={() =>
                    go(
                      "/airspace?" +
                        (planning ? "planTask=" : "task=") +
                        encodeURIComponent(taskId),
                    )
                  }
                >
                  <MapPin size={16} />
                  打开空域态势
                  <ArrowRight size={15} />
                </Button>
              </section>
              {active && can("task.execute") && (
                <section className="p-card p-guide-card">
                  <h3>合成测试管理</h3>
                  <p>
                    当前合成任务仍在执行或等待对账。核对记录后可结束进程内测试。
                  </p>
                  {!confirmEnd ? (
                    <button
                      className="p-text-button p-danger"
                      onClick={() => setConfirmEnd(true)}
                    >
                      结束本次合成测试
                    </button>
                  ) : (
                    <>
                      <p className="p-input-hint">
                        结束后执行状态将记录为失败，原始审计保留。
                      </p>
                      <div className="p-inline">
                        <Button onClick={() => setConfirmEnd(false)}>
                          返回
                        </Button>
                        <button
                          className="p-danger-button"
                          disabled={busy}
                          onClick={() => void end()}
                        >
                          确认结束合成测试
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}
            </aside>
          </div>
          <section className="p-card p-spaced">
            <div className="p-card-head">
              <div>
                <h2>{planning ? "历次规划版本" : "工具调用与事件流"}</h2>
                <p>
                  {planning
                    ? "任务 API 持久化的真实版本记录。"
                    : "最近30条实际审计事件，随任务状态同步。"}
                </p>
              </div>
              <Activity size={19} />
            </div>
            {planning ? (
              <div className="p-task-rows">
                {plans?.length ? (
                  plans.map((p) => (
                    <div className="p-plan-row" key={p.route_id}>
                      <span className="p-tag">{p.plan_version}</span>
                      <strong>{p.algorithm}</strong>
                      <span>{p.waypoints.length} 个航点</span>
                      <span className={`p-status ${p.found ? "" : "warning"}`}>
                        {p.found ? "可行" : "未找到航线"}
                      </span>
                      <Button
                        onClick={() =>
                          downloadJson(p, "route-" + p.route_id + ".json")
                        }
                      >
                        导出版本
                      </Button>
                    </div>
                  ))
                ) : (
                  <Empty title="还没有规划版本" />
                )}
              </div>
            ) : task?.events?.length ? (
              <div className="p-audit-flow">
                {task.events.map((e, i) => (
                  <div key={i}>
                    <span className="p-audit-node" />
                    <time>
                      {e.ts
                        ? new Date(e.ts).toLocaleTimeString("zh-CN")
                        : "事件 " + (i + 1)}
                    </time>
                    <strong>{e.event}</strong>
                    <span>{e.tool_name || e.tool || "状态记录"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="尚无工具审计">
                <p>待审任务在确认后才会启动 Agent 工具链。</p>
                {task?.planning_status === "awaiting_confirmation" &&
                  can("task.create") && (
                    <Button onClick={() => go("/missions/new")}>
                      重新核对并创建任务
                    </Button>
                  )}
              </Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}

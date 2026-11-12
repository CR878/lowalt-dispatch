import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Activity, Check, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import "./dispatch.css";

type Position = { x_m: number; y_m: number; alt_m: number; alt_ref: string };
type Proposal = {
  task_id: string;
  scenario_id: string;
  review_digest: string;
  task: {
    origin: Position;
    destination: Position;
    initial_energy_wh: number;
    reserve_energy_wh: number;
  };
};
type TaskView = {
  task_id: string;
  planning_status: string;
  reason: string;
  transport: string;
  execution: {
    state: string;
    execution_count: number;
    plan_version: string;
    reason: string | null;
  } | null;
  observation: {
    state: {
      position: Position;
      energy_remaining_wh: number | null;
      flight_mode: string;
      ts: string;
    };
  } | null;
  result: {
    route: { waypoints: Position[] } | null;
    ack: { accepted: boolean; fc_mode: string | null } | null;
  } | null;
  events: { event: string; ts?: string; tool?: string; tool_name?: string }[];
};
type Health = {
  transport: string;
  active_task_id?: string | null;
  scenarios: { id: string; name: string }[];
};
const states: Record<string, string> = {
  awaiting_confirmation: "等待确认",
  acknowledged: "执行端已受理",
  blocked: "独立校验拦截",
  rejected: "拒绝执行",
  error: "流程异常",
  waiting_ack: "等待回执，结果待对账",
  executing: "合成执行中",
  completed: "合成执行完成",
  recovering: "待人工对账",
  failed: "执行失败",
  accepted: "已接收",
  reconcile_required: "需恢复原始审计",
};
const label = (state: string) => states[state] ?? state;
async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/dispatch/${path}`, {
    method: body === undefined ? "GET" : "POST",
    signal,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : `本地服务响应异常 (${response.status})`,
    );
  }
  return response.json();
}
export function rememberedDispatchTask() {
  try {
    const id = localStorage.getItem("aeris-local-task") ?? "";
    return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ? id : "";
  } catch {
    return "";
  }
}

export function DispatchPanel({
  taskId,
  setTaskId,
}: {
  taskId: string;
  setTaskId: Dispatch<SetStateAction<string>>;
}) {
  const [health, setHealth] = useState<Health | null>(null);
  const [scenario, setScenario] = useState("S1-01");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [task, setTask] = useState<TaskView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<Health>("health", undefined, controller.signal)
      .then((value) => {
        setHealth(value);
        const active = value.active_task_id;
        if (active) setTaskId((current) => current || active);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(`服务未就绪：${e.message}`);
      });
    return () => controller.abort();
  }, [setTaskId]);
  useEffect(() => {
    if (!taskId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const next = await api<TaskView>(
          `tasks/${encodeURIComponent(taskId)}`,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setTask(next);
          setOnline(true);
        }
      } catch {
        if (!controller.signal.aborted) setOnline(false);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 1000);
      }
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [taskId]);

  async function create() {
    setBusy(true);
    setError("");
    setReviewed(false);
    try {
      const next = await api<Proposal>("proposals", { scenario_id: scenario });
      if (mounted.current) setProposal(next);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function confirm() {
    if (!proposal || !reviewed) return;
    // Remember before POST: if the connection drops after acceptance, GET
    // reconciles the same task. Never automatically resubmit or invent a new ID.
    const id = proposal.task_id;
    setTaskId(id);
    setTask(null);
    setBusy(true);
    setError("");
    try {
      localStorage.setItem("aeris-local-task", id);
    } catch {
      /* memory still works */
    }
    try {
      const result = await api<TaskView>(`tasks/${id}/confirm`, {
        confirmed: true,
        review_digest: proposal.review_digest,
      });
      if (mounted.current) {
        setTask(result);
        setOnline(true);
        setProposal(null);
      }
    } catch (e) {
      if (mounted.current)
        setError(
          `${(e as Error).message}。已保留原任务ID，请先查看状态，避免新建重复任务。`,
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const active =
    task?.execution &&
    ["accepted", "executing", "recovering"].includes(task.execution.state);
  async function abandon() {
    if (
      !task ||
      !window.confirm(
        "确认结束本次合成测试？此操作仅清理本地合成执行状态，不向PX4发送任何指令。",
      )
    )
      return;
    setBusy(true);
    try {
      setTask(
        await api<TaskView>(`tasks/${task.task_id}/abandon`, {
          confirmed: true,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="dispatch-panel" aria-label="本地模块链路联调">
      <div className="dispatch-banner">
        <Link2 size={20} />
        <div>
          <strong>真实代码 · 本地合成执行</strong>
          <p>M3 Agent → M2 规划 → 独立校验 → M4 执行回执</p>
        </div>
      </div>
      <p className="drawer-intro">
        使用场景集的 ENU 坐标和合成机型参数，不连接
        PX4。地图中的真实目的地草稿需完成坐标和机型标定后再接入。
      </p>
      <div className="dispatch-chain">
        {["任务确认", "规划与校验", "执行端 ACK", "执行状态"].map((name, i) => (
          <span key={name}>
            <b>{i + 1}</b>
            {name}
          </span>
        ))}
      </div>
      <p className="dispatch-muted">
        传输：
        {health?.transport === "mqtt"
          ? "本地 MQTT Broker"
          : health
            ? "进程内直连 / SQLite持久化"
            : "检测服务中…"}{" "}
        · 飞控控制：关闭
      </p>
      <label className="dispatch-field">
        测试场景
        <select
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          disabled={busy}
        >
          {(health?.scenarios ?? [{ id: "S1-01", name: "S1-01" }]).map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {s.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button subtle"
        onClick={() => void create()}
        disabled={busy || !health || !!active}
      >
        <RefreshCw size={15} />
        生成待审任务
      </button>
      {active && (
        <p className="dispatch-muted">
          当前车辆仍在执行或待对账，完成前不能启动新任务。
        </p>
      )}
      {active && task?.transport === "direct" && (
        <button
          className="button subtle"
          disabled={busy}
          onClick={() => void abandon()}
        >
          结束本次合成测试
        </button>
      )}
      {proposal && (
        <div className="dispatch-card">
          <h3>
            <ShieldCheck size={17} />
            确认合成联调任务 · {proposal.scenario_id}
          </h3>
          <dl>
            <dt>起点 / ENU 米</dt>
            <dd>
              {proposal.task.origin.x_m}, {proposal.task.origin.y_m}
            </dd>
            <dt>终点 / ENU 米</dt>
            <dd>
              {proposal.task.destination.x_m}, {proposal.task.destination.y_m}
            </dd>
            <dt>高度 / 基准</dt>
            <dd>
              {proposal.task.origin.alt_m}m · {proposal.task.origin.alt_ref}
            </dd>
            <dt>初始 / 预留能量</dt>
            <dd>
              {proposal.task.initial_energy_wh} /{" "}
              {proposal.task.reserve_energy_wh} Wh（合成）
            </dd>
          </dl>
          <label className="dispatch-consent">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            我已核对参数，确认仅进行本地合成执行
          </label>
          <button
            className="button primary"
            disabled={!reviewed || busy}
            onClick={() => void confirm()}
          >
            <Check size={15} />
            {busy ? "处理中…" : "确认并运行本地任务"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="dispatch-error">
          {error}
        </p>
      )}
      {taskId && (
        <div className="dispatch-card" aria-live="polite">
          <h3>
            <Activity size={17} />
            当前任务{" "}
            <span className={online ? "dispatch-online" : "dispatch-muted"}>
              {online ? "状态已同步" : "等待状态同步"}
            </span>
          </h3>
          <code className="dispatch-id">{taskId}</code>
          {task && (
            <>
              <dl>
                <dt>Agent 状态</dt>
                <dd>{label(task.planning_status)}</dd>
                <dt>执行状态</dt>
                <dd>
                  {task.execution
                    ? label(task.execution.state)
                    : "尚无执行证据"}
                </dd>
                <dt>版本 / 启动次数</dt>
                <dd>
                  {task.execution
                    ? `${task.execution.plan_version} / ${task.execution.execution_count}`
                    : "—"}
                </dd>
                <dt>已校验航点</dt>
                <dd>{task.result?.route?.waypoints.length ?? "—"}</dd>
                <dt>执行端回执</dt>
                <dd>
                  {task.result?.ack
                    ? `${task.result.ack.accepted ? "已接受" : "已拒绝"} · ${task.result.ack.fc_mode ?? "—"}`
                    : "尚未收到"}
                </dd>
              </dl>
              <p className="dispatch-muted">{task.reason}</p>
              {task.observation && (
                <p className="dispatch-muted">
                  合成遥测：{task.observation.state.flight_mode} · 高度{" "}
                  {task.observation.state.position.alt_m.toFixed(1)}m ·{" "}
                  {task.observation.state.position.alt_ref}
                  <br />
                  采样{" "}
                  {new Date(task.observation.state.ts).toLocaleTimeString()}
                </p>
              )}
              <details>
                <summary>查看工具审计与状态流（最近30条）</summary>
                <ol className="dispatch-events">
                  {task.events.map((event, i) => (
                    <li key={i}>
                      <time>
                        {event.ts
                          ? new Date(event.ts).toLocaleTimeString()
                          : "—"}
                      </time>
                      <span>
                        {event.event}
                        {event.tool || event.tool_name
                          ? ` · ${event.tool ?? event.tool_name}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </div>
      )}
      <p className="dispatch-muted">
        ACK
        表示受理，完成必须由执行端另行报告。页面关闭后本地服务继续推进；重新打开可查询上次任务。
      </p>
    </section>
  );
}

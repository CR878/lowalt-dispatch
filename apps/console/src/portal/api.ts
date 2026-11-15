export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  role_name: string;
  email_verified: boolean;
  active: boolean;
  mfa_enabled: boolean;
  permissions: string[];
};
export type Policy = {
  setup_required: boolean;
  registration: "invite" | "open" | "closed";
  email_delivery: string;
};
export type Position = {
  x_m: number;
  y_m: number;
  alt_m: number;
  alt_ref: string;
  frame?: string;
};
export type Proposal = {
  task_id: string;
  scenario_id: string;
  review_digest: string;
  expires_at: string;
  task: {
    origin: Position;
    destination: Position;
    initial_energy_wh: number;
    reserve_energy_wh: number;
    payload_kg: number;
    time_limit_s: number;
  };
};
export type DispatchTask = {
  task_id: string;
  scenario_id: string;
  planning_status: string;
  reason: string;
  execution: {
    state: string;
    plan_version: string;
    execution_count: number;
    reason: string | null;
  } | null;
  result?: {
    route: { waypoints: Position[]; plan_version: string } | null;
    ack: { accepted: boolean; fc_mode: string } | null;
    command?: { command_id: string } | null;
  } | null;
  observation?: {
    state: {
      position: Position;
      energy_remaining_wh: number | null;
      flight_mode: string;
      ts: string;
    };
  } | null;
  events?: { event: string; ts?: string; tool?: string; tool_name?: string }[];
};
export type PlanningTask = {
  task_id: string;
  origin: Position;
  destination: Position;
  payload_kg: number;
  vehicle_type: string;
};
export type PlanRecord = {
  task_id: string;
  route_id: string;
  plan_version: string;
  snapshot_id: string;
  algorithm: string;
  found: boolean;
  reason: string | null;
  length_m: number | null;
  elapsed_ms: number | null;
  waypoints: Position[];
  margin_status: string;
  margin_detail: string;
  margin_profile: {
    samples: { distance_m?: number; margin_wh?: number }[];
  } | null;
  limitations: string[];
  route_plan_detail: string;
  simulation_note: string;
};
export type Summary = {
  tasks: DispatchTask[];
  planning_tasks: PlanningTask[];
  dispatch: {
    active_task_id: string | null;
    transport: string;
    scenarios: { id: string; name: string }[];
  };
  services: { name: string; status: string; detail: string }[];
};
export const stateLabel = (state: string) =>
  ({
    awaiting_confirmation: "待审核",
    acknowledged: "执行端已受理",
    blocked: "校验已拦截",
    rejected: "执行已拒绝",
    error: "流程异常",
    waiting_ack: "等待回执",
    executing: "合成执行中",
    completed: "合成执行完成",
    failed: "执行失败",
    accepted: "已接收",
    recovering: "待人工对账",
    reconcile_required: "待审计恢复",
  })[state] || state;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    signal: signal ?? AbortSignal.timeout(30000),
    headers: {
      "X-Aeris-Request": "1",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("aeris:unauthorized"));
    throw new ApiError(
      typeof value.detail === "string"
        ? value.detail
        : Array.isArray(value.detail)
          ? value.detail.map((v: { msg: string }) => v.msg).join("；")
          : `服务暂不可用 (${response.status})`,
      response.status,
    );
  }
  return value as T;
}
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const message = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请重试";
export function safeTarget(value: string | null) {
  if (
    !value ||
    !/^\/(workspace|missions|airspace|fleet|analytics|identity|account|help)(\/|\?|$)/.test(
      value,
    ) ||
    value.includes("\\")
  )
    return "/workspace";
  return value;
}

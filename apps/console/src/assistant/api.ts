import type {
  AssistantContext,
  AssistantDraft,
  AssistantResult,
  Health,
  Packet,
  ToolTrace,
} from "./types";

export async function getHealth(signal: AbortSignal): Promise<Health> {
  const response = await fetch("/api/assistant/health", {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("助手服务未连接");
  const value = await response.json();
  if (
    value.status !== "ok" ||
    value.protocol !== "aeris-assistant-1" ||
    !["local", "maas"].includes(value.provider) ||
    value.dispatch_enabled !== false
  )
    throw new Error("助手服务协议不匹配");
  return value;
}

export function validDraft(value: unknown): value is AssistantDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as AssistantDraft;
  return (
    typeof d.name === "string" &&
    d.name.length > 0 &&
    d.name.length <= 80 &&
    [d.origin, d.destination].every(
      (x) => x === null || (typeof x === "string" && x.length <= 120),
    ) &&
    (d.payload_kg === null ||
      (Number.isFinite(d.payload_kg) &&
        d.payload_kg >= 0 &&
        d.payload_kg <= 100)) &&
    ["P1", "P2"].includes(d.priority)
  );
}

function validTrace(trace: ToolTrace) {
  return (
    trace &&
    typeof trace.id === "string" &&
    trace.id.length <= 200 &&
    typeof trace.name === "string" &&
    trace.name.length <= 128 &&
    ["running", "completed", "error"].includes(trace.status) &&
    (trace.source === undefined || typeof trace.source === "string") &&
    (trace.arguments === undefined ||
      (trace.arguments !== null &&
        typeof trace.arguments === "object" &&
        !Array.isArray(trace.arguments))) &&
    (trace.result === undefined ||
      (trace.result !== null &&
        typeof trace.result === "object" &&
        !Array.isArray(trace.result)))
  );
}
function validResult(result: AssistantResult) {
  if (
    !result ||
    result.dispatch_enabled !== false ||
    result.is_simulated !== true ||
    typeof result.text !== "string" ||
    result.text.length > 6000 ||
    !Array.isArray(result.traces) ||
    result.traces.length > 8 ||
    !result.traces.every(validTrace) ||
    typeof result.turn_id !== "string" ||
    !["local", "maas"].includes(result.provider) ||
    (result.draft !== null && !validDraft(result.draft))
  )
    return false;
  if (result.route?.status === "geometry_only") {
    const points = result.route.waypoints;
    if (
      !Array.isArray(points) ||
      points.length < 2 ||
      points.length > 5000 ||
      typeof result.route.route_id !== "string" ||
      typeof result.route.draft_digest !== "string" ||
      !Number.isFinite(result.route.length_m) ||
      result.route.waypoint_count !== points.length ||
      result.route.dispatch_enabled !== false ||
      !points.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          p.every((v) => Number.isFinite(v) && v >= 0 && v <= 3000),
      )
    )
      return false;
  }
  if (
    result.risk?.focus_point &&
    (!Array.isArray(result.risk.focus_point) ||
      result.risk.focus_point.length !== 2 ||
      !result.risk.focus_point.every(
        (v) => Number.isFinite(v) && v >= 0 && v <= 3000,
      ))
  )
    return false;
  return true;
}

export async function requestTurn(
  args: {
    text: string;
    history: { role: "user" | "assistant"; content: string }[];
    draft: AssistantDraft | null;
    context: AssistantContext;
  },
  signal: AbortSignal,
  onPacket: (packet: Packet) => void,
) {
  const response = await fetch("/api/assistant/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request_id: crypto.randomUUID(), ...args }),
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error(
      response.status === 429
        ? "助手正在处理其他请求，请稍后再试。"
        : response.status === 422
          ? "任务或页面数据格式不完整，请刷新后重试。"
          : "助手服务未连接。请先启动本地助手后端。",
    );
  if (!response.headers.get("content-type")?.includes("application/x-ndjson"))
    throw new Error("助手返回格式不匹配，请检查服务地址。");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    size = 0,
    result: AssistantResult | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const packet: Packet = JSON.parse(line);
    if (!packet || typeof packet !== "object")
      throw new Error("助手事件格式不合法。");
    if (
      packet.type === "tool_start" &&
      (typeof packet.id !== "string" || typeof packet.name !== "string")
    )
      throw new Error("助手工具状态格式不合法。");
    if (packet.type === "tool_result" && !validTrace(packet.trace))
      throw new Error("助手工具结果格式不合法。");
    if (packet.type === "error") throw new Error(packet.message);
    if (packet.type === "result") {
      if (!validResult(packet.result))
        throw new Error("助手响应数据不完整，已停止应用结果。");
      result = packet.result;
    }
    onPacket(packet);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new Error("助手响应超过大小上限。");
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    buffer += decoder.decode();
    consume(buffer);
    if (!result) throw new Error("连接提前结束，没有收到完整结果。");
    return result as AssistantResult;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

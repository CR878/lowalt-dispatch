import type { NavRoute } from "./engine";

export const ordinanceUrl =
  "https://www.gov.cn/zhengce/content/202306/content_6888799.htm";
export const checklist = [
  [
    "aircraft",
    "航空器与运行识别",
    "核对分类、实名登记、激活及适用的运行识别要求。不要在备注填写完整证件号码。",
    false,
  ],
  [
    "operator",
    "人员与运营资质",
    "按机型、运行类别和作业方式核对操控员与运营人资质；不适用时记录依据。",
    true,
  ],
  [
    "insurance",
    "责任保险",
    "经营性飞行及小型、中型、大型非经营性飞行的责任保险要求见条例第十二条。",
    true,
  ],
  [
    "airspace",
    "官方空域与临时管制",
    "核对 UOM、当地政府及空管公告的发布单位、版本、时效、水平范围和高度基准；厂商解禁不代替许可。",
    false,
  ],
  [
    "approval",
    "申请、批准与起飞前确认",
    "按具体运行条件核对是否需要申请、备案和起飞前确认；记录适用范围与依据，不把应急任务当作自动豁免。",
    true,
  ],
  [
    "equipment",
    "机体、链路与应急准备",
    "检查电池、桨叶、定位、返航点、失联动作、接管与备降预案；本页面不修改飞控参数。",
    false,
  ],
  [
    "environment",
    "天气与地面风险",
    "核对现场风雨、能见度、人员、建筑和线缆。夜间 / 低能见度另核对灯光；公开天气和 DEM 不能代替现场检查。",
    false,
  ],
  [
    "payload",
    "载荷、隐私与特殊作业",
    "核对危险品、投放、人群、超视距、中继、移动平台、分布式 / 集群操作及影像隐私等条件。",
    true,
  ],
] as const;
export type CheckId = (typeof checklist)[number][0];
export type CheckEntry = {
  status: "pending" | "recorded" | "na";
  note: string;
};
export type PreflightDraft = {
  aircraftClass: string;
  operation: string;
  flightFrom: string;
  flightUntil: string;
  airspaceSource: string;
  checkedAt: string;
  validFrom: string;
  validUntil: string;
  coverage: string;
  entries: Record<CheckId, CheckEntry>;
};
export type PreflightRecord = {
  schema: "aeris.preflight.v1";
  captured_at: string;
  time_zone: string;
  time_utc: Record<
    "flightFrom" | "flightUntil" | "checkedAt" | "validFrom" | "validUntil",
    string | null
  >;
  scope_key: string;
  route_id: string | null;
  task_id: string | null;
  plan_version: string | null;
  monitoring_mode: "live" | "rehearsal";
  is_simulated: boolean | null;
  draft: PreflightDraft;
  authorization: "not_determined";
  dispatch_enabled: false;
};
export function emptyPreflight(): PreflightDraft {
  return {
    aircraftClass: "unknown",
    operation: "",
    flightFrom: "",
    flightUntil: "",
    airspaceSource: "",
    checkedAt: "",
    validFrom: "",
    validUntil: "",
    coverage: "",
    entries: Object.fromEntries(
      checklist.map(([id]) => [id, { status: "pending", note: "" }]),
    ) as PreflightDraft["entries"],
  };
}
export const preflightScope = (route: NavRoute | null, liveMode: boolean) =>
  JSON.stringify({ route, liveMode });
export function createPreflight(
  draft: PreflightDraft,
  route: NavRoute | null,
  liveMode: boolean,
): PreflightRecord {
  return {
    schema: "aeris.preflight.v1",
    captured_at: new Date().toISOString(),
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    time_utc: Object.fromEntries(
      (
        [
          "flightFrom",
          "flightUntil",
          "checkedAt",
          "validFrom",
          "validUntil",
        ] as const
      ).map((key) => [
        key,
        Number.isFinite(Date.parse(draft[key]))
          ? new Date(draft[key]).toISOString()
          : null,
      ]),
    ) as PreflightRecord["time_utc"],
    scope_key: preflightScope(route, liveMode),
    route_id: route?.id ?? null,
    task_id: route?.task_id ?? null,
    plan_version: route?.plan_version ?? null,
    monitoring_mode: liveMode ? "live" : "rehearsal",
    is_simulated: liveMode ? (route?.is_simulated ?? null) : true,
    draft: structuredClone(draft),
    authorization: "not_determined",
    dispatch_enabled: false,
  };
}
export function assessPreflight(
  record: PreflightRecord | null,
  route: NavRoute | null,
  liveMode: boolean,
  now = Date.now(),
) {
  const issues: string[] = [];
  if (!record) return { issues: ["尚未保存飞前核对记录"], documented: 0 };
  const d = record.draft;
  if (record.scope_key !== preflightScope(route, liveMode))
    issues.push("航线、版本或监控模式已变化，请重新核对并保存");
  if (!route) issues.push("未绑定航线，仅为自由观察记录");
  if (record.is_simulated !== false)
    issues.push("演练或未确认真实来源；记录不能转作真实飞行依据");
  if (d.aircraftClass === "unknown") issues.push("航空器分类待人工核实");
  if (!d.operation.trim()) issues.push("运行方式与任务性质待填写");
  const from = Date.parse(d.flightFrom),
    until = Date.parse(d.flightUntil);
  const checked = Date.parse(d.checkedAt),
    validFrom = Date.parse(d.validFrom),
    validUntil = Date.parse(d.validUntil);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from)
    issues.push("计划飞行起止时间不完整或顺序不正确");
  else if (until <= now) issues.push("计划飞行时间已结束，请重新核对");
  if (!d.airspaceSource.trim() || !d.coverage.trim())
    issues.push("官方空域来源、版本或覆盖范围待记录");
  if (!Number.isFinite(checked) || checked > now)
    issues.push("空域核对时间缺失或晚于当前时间");
  if (
    !Number.isFinite(validFrom) ||
    !Number.isFinite(validUntil) ||
    validUntil <= validFrom
  )
    issues.push("空域资料有效起止时间不完整或顺序不正确");
  else {
    if (validUntil <= now)
      issues.push("空域资料已过期，需重新查询临时管制与有效范围");
    if (Number.isFinite(checked) && checked >= validUntil)
      issues.push("资料在所填核对时刻已失效");
    if (
      Number.isFinite(from) &&
      Number.isFinite(until) &&
      (validFrom > from || validUntil < until)
    )
      issues.push("空域资料有效期未覆盖全部计划飞行时间");
  }
  let documented = 0;
  for (const [id, title, , allowNa] of checklist) {
    const entry = d.entries[id];
    if (
      entry.note.trim() &&
      (entry.status === "recorded" || (entry.status === "na" && allowNa))
    )
      documented++;
    else issues.push(`${title}：待核对或缺少依据 / 不适用理由`);
  }
  if (
    route?.altitude_ref !== "agl" ||
    route.waypoints.some((p) => p.altitude == null)
  )
    issues.push("航线缺少完整离地高度，不能从海拔或相对起飞点高度判断真高限制");
  return { issues, documented };
}

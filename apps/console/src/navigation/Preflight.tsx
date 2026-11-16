import { useState } from "react";
import { ArrowDownToLine, ExternalLink, ShieldCheck } from "lucide-react";
import {
  checklist,
  createPreflight,
  ordinanceUrl,
  type CheckId,
} from "./compliance";
import type { NavigationController } from "./Navigation";

export default function Preflight({
  nav,
  download,
}: {
  nav: NavigationController;
  download: (value: unknown, name: string) => void;
}) {
  const draft = nav.preflightDraft,
    setDraft = nav.setPreflightDraft;
  const [expanded, setExpanded] = useState<CheckId | null>("airspace");
  const dirty =
    !nav.preflight ||
    JSON.stringify(draft) !== JSON.stringify(nav.preflight.draft);
  const field = (
    key: Exclude<keyof typeof draft, "entries">,
    title: string,
    type = "text",
    hint?: string,
  ) => (
    <label>
      {title}
      <input
        aria-label={title}
        type={type}
        value={draft[key]}
        maxLength={type === "text" ? 400 : undefined}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
  return (
    <section className="nav-preflight" aria-label="飞前核对记录">
      <div className="nav-section-heading">
        <div>
          <h3>先核对资料，再进入实际作业</h3>
          <p>
            当前航线：{nav.route?.title ?? "未选航线 · 自由观察"} ·{" "}
            {nav.route?.plan_version ?? "无任务版本"}
            。记录仅在本次会话保留，刷新前可导出。
          </p>
        </div>
        <ShieldCheck size={26} />
      </div>
      <div className="nav-compliance-notice">
        <strong>人工核对记录 · 不构成飞行许可</strong>
        <p>
          地图可定位、厂商解禁、低于 120
          米、应急任务或夜间界面均不能据此判断可以飞。导航只提供参考，实际飞行仍走现有审核与执行链路。未完成本清单不阻断遥测监控与紧急提示。
        </p>
        <a href="https://uom.caac.gov.cn/" target="_blank" rel="noreferrer">
          打开 UOM 查询 <ExternalLink size={12} />
        </a>
        <a href={ordinanceUrl} target="_blank" rel="noreferrer">
          查看条例原文 <ExternalLink size={12} />
        </a>
      </div>
      <div className="nav-preflight-fields">
        <label>
          航空器分类
          <select
            value={draft.aircraftClass}
            onChange={(e) =>
              setDraft({ ...draft, aircraftClass: e.target.value })
            }
          >
            {[
              ["unknown", "待核实"],
              ["micro", "微型"],
              ["light", "轻型"],
              ["small", "小型"],
              ["medium", "中型"],
              ["large", "大型"],
            ].map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <small>按产品参数和适用规则人工核实；不按重量一项自动分类。</small>
        </label>
        {field(
          "operation",
          "运行方式与任务性质",
          "text",
          "如：视距内巡检 / 超视距 / 载荷 / 中继；说明是否经营性。",
        )}
        {field("flightFrom", "计划飞行开始", "datetime-local")}
        {field("flightUntil", "计划飞行结束", "datetime-local")}
        {field(
          "airspaceSource",
          "官方空域来源与版本",
          "text",
          "发布单位、链接或公告编号；厂商电子围栏仅作补充。",
        )}
        {field(
          "coverage",
          "水平范围与高度基准核对",
          "text",
          "记录覆盖整条航线的区域、垂直范围、基准及适用对象。",
        )}
        {field("checkedAt", "实际查询核对时间", "datetime-local")}
        {field("validFrom", "空域资料有效开始", "datetime-local")}
        {field(
          "validUntil",
          "空域资料有效结束",
          "datetime-local",
          "按发布信息填写；无明确有效期时保留待核实，不自行延长。",
        )}
      </div>
      <p className="nav-note">
        所有时间均为本机时区（{Intl.DateTimeFormat().resolvedOptions().timeZone}
        ）；导出同时记录时区。仅填资料索引与核对结论，不填密码、完整执照号或个人身份证号。
      </p>
      <div className="nav-checklist">
        {checklist.map(([id, title, help, allowNa], i) => (
          <article key={id}>
            <button
              className="nav-checklist-heading"
              aria-expanded={expanded === id}
              onClick={() => setExpanded(expanded === id ? null : id)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <strong>{title}</strong>
              <small>
                {draft.entries[id].status === "pending"
                  ? "待核对"
                  : draft.entries[id].note.trim()
                    ? draft.entries[id].status === "na"
                      ? "已说明不适用"
                      : "已填写依据"
                    : "缺少依据"}
              </small>
            </button>
            {expanded === id && (
              <div className="nav-checklist-detail">
                <p>{help}</p>
                <label>
                  {title}状态
                  <select
                    value={draft.entries[id].status}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        entries: {
                          ...draft.entries,
                          [id]: {
                            ...draft.entries[id],
                            status: e.target.value as
                              | "pending"
                              | "recorded"
                              | "na",
                          },
                        },
                      })
                    }
                  >
                    <option value="pending">待核对</option>
                    <option value="recorded">已人工核对并记录依据</option>
                    {allowNa && (
                      <option value="na">不适用（需说明依据）</option>
                    )}
                  </select>
                </label>
                <label>
                  {title}依据
                  <textarea
                    value={draft.entries[id].note}
                    maxLength={800}
                    rows={2}
                    placeholder="来源 / 资料编号 / 适用范围，或不适用的具体理由"
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        entries: {
                          ...draft.entries,
                          [id]: { ...draft.entries[id], note: e.target.value },
                        },
                      })
                    }
                  />
                </label>
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="nav-preflight-result" role="status">
        <strong>
          {dirty
            ? "有未保存的核对内容"
            : `已记录 ${nav.preflightAssessment.documented} / ${checklist.length} 项 · 非飞行许可`}
        </strong>
        {!dirty && (
          <>
            <p>
              {nav.preflightAssessment.issues.length
                ? `${nav.preflightAssessment.issues.length} 项需关注`
                : "资料填写完整，真实性、适用性及最新临时限制仍由作业负责人复核。"}
            </p>
            <ul>
              {nav.preflightAssessment.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="nav-start-row">
        <p>发生异常时优先人工接管与应急处置，按适用要求及时报告并保留证据。</p>
        <div className="nav-inline">
          <button
            className="nav-button"
            disabled={!nav.preflight || dirty}
            onClick={() =>
              download(
                {
                  ...nav.preflight,
                  assessment: nav.preflightAssessment,
                  exported_at: new Date().toISOString(),
                },
                "preflight-self-check.json",
              )
            }
          >
            <ArrowDownToLine size={14} />
            导出核对记录
          </button>
          <button
            className="nav-button primary"
            onClick={() => {
              nav.setPreflight(createPreflight(draft, nav.route, nav.liveMode));
              nav.notify("核对记录已保存在本次会话；未授予飞行许可");
              nav.onEvent(
                "保存飞前人工核对记录",
                `${nav.route?.id ?? "自由观察"} / ${nav.route?.plan_version ?? "无版本"}；资料内容由填写者核对，未下发飞控。`,
              );
            }}
          >
            保存本次核对
          </button>
        </div>
      </div>
    </section>
  );
}

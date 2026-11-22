import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  Radio,
  TriangleAlert,
  CheckCheck,
  MapPin,
  Pause,
  Play,
  ChevronDown,
} from "lucide-react";
import type { EventItem } from "./types";

export function replayEvents(progress: number): EventItem[] {
  const schedule: [number, EventItem["type"], string, string][] = [
    [
      12,
      "info",
      "演示任务进入巡航",
      "回放脚本 · 飞行模式 AUTO.MISSION，非真实PX4回执",
    ],
    [
      45,
      "success",
      "演示链路状态更新",
      "回放脚本 · 云边心跳与版本显示示例，未连接消息通道",
    ],
    [
      95,
      "info",
      "演示感知扫描推进",
      "回放脚本 · 扫描扇区覆盖更新，非传感器数据",
    ],
    [
      145,
      "warning",
      "演示临时限制区提示",
      "回放脚本 · 建议复核航线与限制区有效时段",
    ],
    [
      195,
      "info",
      "演示备降检查节点",
      "回放脚本 · 最近备降点L2，能量与净空待独立校验",
    ],
    [
      215,
      "info",
      "演示巡航扫描更新",
      "回放脚本 · 雷达扫描与遥测读数随回放推进",
    ],
    [
      230,
      "warning",
      "演示地形复核提醒",
      "回放脚本 · 建议导入高程增量并分析剩余航段",
    ],
    [
      270,
      "success",
      "演示候选方案已整理",
      "回放脚本 · 方案卡可比较，不表示已下发飞控",
    ],
    [
      315,
      "warning",
      "演示链路抖动提示",
      "回放脚本 · 可查看本地备用方案及数据有效期",
    ],
    [
      360,
      "info",
      "演示目的地区域检查",
      "回放脚本 · 核对真实目的地坐标及着陆场条件",
    ],
    [
      410,
      "info",
      "演示飞行记录汇总节点",
      "回放脚本 · 可由调度助手生成本页事件摘要",
    ],
    [
      460,
      "success",
      "演示回放即将结束",
      "回放脚本 · 不代表真实配送完成，可导出本次快照",
    ],
  ];
  return schedule
    .filter(([s]) => s <= progress * 480)
    .reverse()
    .map(([s, type, title, detail]) => ({
      id: `replay-${s}`,
      time: `回放 ${Math.floor(s / 60)
        .toString()
        .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`,
      type,
      title,
      detail,
    }));
}

export default function EventFeed({
  events,
  expanded = false,
  onInspect,
}: {
  events: EventItem[];
  expanded?: boolean;
  onInspect?: (event: EventItem) => void;
}) {
  const [filter, setFilter] = useState("all"),
    [follow, setFollow] = useState(true),
    [hover, setHover] = useState(false),
    [unread, setUnread] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    previous = useRef(events[0]?.id);
  useEffect(() => {
    if (previous.current === events[0]?.id) return;
    previous.current = events[0]?.id;
    if (follow && !hover) {
      root.current?.scrollTo({
        top: 0,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      setUnread(0);
    } else setUnread((v) => v + 1);
  }, [events, follow, hover]);
  const visible = events.filter((e) => filter === "all" || e.type === filter);
  return (
    <div className={`event-feed ${expanded ? "expanded" : ""}`}>
      <div className="event-feed-controls">
        <div className="event-filters" aria-label="筛选事件">
          {[
            ["all", "全部"],
            ["warning", "告警"],
            ["success", "进展"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className={`event-follow ${follow ? "following" : ""}`}
          aria-pressed={follow}
          onClick={() => {
            setFollow(!follow);
            setUnread(0);
            root.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          {follow ? <Radio size={10} /> : <Pause size={10} />}{" "}
          {follow ? "跟随" : "已暂停"}
        </button>
      </div>
      <div
        ref={root}
        className="event-feed-scroll"
        aria-label="可滚动事件时间线"
        tabIndex={0}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onWheel={() => setFollow(false)}
        onTouchStart={() => setFollow(false)}
      >
        {visible.map((e, i) => (
          <details
            className={`event-row ${e.type} ${i === 0 ? "new-event" : ""}`}
            key={e.id}
          >
            <summary>
              <span className="event-time">{e.time}</span>
              <span className="event-symbol">
                {e.type === "warning" ? (
                  <TriangleAlert size={13} />
                ) : e.type === "success" ? (
                  <CheckCheck size={13} />
                ) : (
                  <Radio size={12} />
                )}
              </span>
              <span className="event-copy">
                <strong>{e.title}</strong>
                <small>{e.detail}</small>
              </span>
              <ChevronDown size={11} />
            </summary>
            <div className="event-expanded">
              <p>{e.detail}</p>
              <span>记录编号 {e.id.slice(0, 24)}</span>
              {onInspect && (
                <button onClick={() => onInspect(e)}>
                  <MapPin size={11} />
                  查看相关位置
                </button>
              )}
            </div>
          </details>
        ))}
        {!visible.length && <p className="event-empty">当前筛选下暂无事件</p>}
      </div>
      {unread > 0 && (
        <button
          className="event-unread"
          onClick={() => {
            setFollow(true);
            setUnread(0);
            root.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <ArrowDown size={11} />
          {unread}条更新 · 回到最新
        </button>
      )}
    </div>
  );
}

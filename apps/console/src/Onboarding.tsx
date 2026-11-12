import { useState } from "react";
import { MapPin, Layers3, Sparkles, ArrowRight, X, Check } from "lucide-react";
const steps = [
  {
    title: "先找到你要去的地方",
    text: "打开“地点定位”，允许浏览器定位，或者输入经纬度。也可以直接点击真实地图。",
    icon: MapPin,
  },
  {
    title: "给任务选择起点和终点",
    text: "选中地点后点击“设为起点 / 设为终点”。两点虚线用于核对位置，保存草稿后再交给规划模块。",
    icon: Layers3,
  },
  {
    title: "把复杂信息交给助手",
    text: "按 A 打开调度助手，查询状态、创建演示任务、分析地形变化或总结事件。可展开每次工具调用的依据。",
    icon: Sparkles,
  },
];
export default function Onboarding({
  onClose,
  onLocate,
}: {
  onClose: () => void;
  onLocate: () => void;
}) {
  const [step, setStep] = useState(0);
  const Item = steps[step].icon;
  return (
    <section className="onboarding glass" aria-label="新手分步引导">
      <button
        className="onboarding-close"
        onClick={onClose}
        aria-label="关闭新手引导"
      >
        <X size={14} />
      </button>
      <div className="onboarding-icon">
        <Item size={21} />
      </div>
      <span className="onboarding-step">快速上手 · {step + 1} / 3</span>
      <h3>{steps[step].title}</h3>
      <p>{steps[step].text}</p>
      <div className="onboarding-actions">
        <div>
          {steps.map((_, i) => (
            <button
              key={i}
              aria-label={`引导第${i + 1}步`}
              className={i === step ? "active" : ""}
              onClick={() => setStep(i)}
            />
          ))}
        </div>
        {step < 2 ? (
          <button
            className="button primary"
            onClick={() => setStep((s) => s + 1)}
          >
            下一步
            <ArrowRight size={12} />
          </button>
        ) : (
          <button
            className="button primary"
            onClick={() => {
              onClose();
              onLocate();
            }}
          >
            开始选点
            <Check size={12} />
          </button>
        )}
      </div>
    </section>
  );
}

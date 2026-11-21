import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: {
          [index: number]: { [index: number]: { transcript: string } };
        };
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
/** Push-to-talk fills a text field. It never executes a flight or UI command. */
export default function VoiceInput({
  onText,
  notify,
}: {
  onText: (text: string) => void;
  notify: (text: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const latest = useRef({ onText, notify });
  latest.current = { onText, notify };
  const supported = Boolean(
    (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition,
  );
  useEffect(
    () => () => {
      const active = recognition.current;
      if (active) {
        active.onend = null;
        active.onerror = null;
        active.onresult = null;
        active.abort();
      }
    },
    [],
  );
  function begin() {
    if (listening) {
      recognition.current?.abort();
      return;
    }
    const Constructor =
      (window as SpeechWindow).SpeechRecognition ||
      (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) return;
    const current = new Constructor();
    recognition.current = current;
    current.lang = "zh-CN";
    current.continuous = false;
    current.interimResults = false;
    current.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript
        ?.trim()
        .replace(/[。！？.!?]$/g, "");
      if (text) {
        latest.current.onText(text.slice(0, 100));
        latest.current.notify("语音已转为文字，请核对后点击执行视图操作");
      }
    };
    current.onerror = (event) =>
      latest.current.notify(
        event.error === "not-allowed"
          ? "麦克风权限被拒绝，可继续手动输入"
          : event.error === "aborted"
            ? "语音输入已取消"
            : "浏览器语音识别暂不可用，可继续手动输入",
      );
    current.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    try {
      current.start();
      setListening(true);
    } catch {
      setListening(false);
      latest.current.notify("无法启动语音识别，请手动输入");
    }
  }
  return (
    <button
      className="nav-button"
      type="button"
      disabled={!supported}
      aria-label={listening ? "停止语音输入" : "开始语音输入"}
      aria-pressed={listening}
      title={
        supported
          ? "点击后请求麦克风权限；由浏览器识别，可能使用其在线服务。仅填入文字，需核对后执行。"
          : "浏览器未提供语音识别，请手动输入"
      }
      onClick={begin}
    >
      {listening ? <Square size={14} /> : <Mic size={14} />}{" "}
      {listening ? "停止输入" : "语音输入"}
    </button>
  );
}

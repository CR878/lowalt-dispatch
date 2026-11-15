import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";
type Preference = Theme | "system";
const KEY = "aeris.theme.preference";
const valid = (value: string | null): value is Preference =>
  ["light", "dark", "system"].includes(value || "");
function readPreference(): Preference {
  try {
    const value = localStorage.getItem(KEY);
    return valid(value) ? value : "light";
  } catch {
    return "light";
  }
}
const Context = createContext<{
  theme: Theme;
  preference: Preference;
  setPreference: (value: Preference) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, update] = useState<Preference>(readPreference);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const theme: Theme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;
  function setPreference(value: Preference) {
    update(value);
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* The current tab still works with storage disabled. */
    }
  }
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0c1423" : "#ffffff");
  }, [theme]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media.matches);
    const storage = (event: StorageEvent) => {
      if (event.key === KEY || event.key === null) update(readPreference());
    };
    media.addEventListener("change", change);
    window.addEventListener("storage", storage);
    change();
    return () => {
      media.removeEventListener("change", change);
      window.removeEventListener("storage", storage);
    };
  }, []);
  return (
    <Context.Provider value={{ theme, preference, setPreference }}>
      {children}
    </Context.Provider>
  );
}

export function useTheme() {
  const context = useContext(Context);
  if (!context) throw new Error("ThemeProvider required");
  return context;
}

export function ThemeToggle() {
  const { theme, setPreference } = useTheme();
  const label = theme === "dark" ? "切换到日间模式" : "切换到夜间模式";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setPreference(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

export function ThemeOptions() {
  const { preference, setPreference } = useTheme();
  return (
    <section className="p-card theme-settings">
      <div>
        <span className="theme-settings-icon">
          <Sun size={22} />
        </span>
        <div>
          <h2>界面外观</h2>
          <p>此浏览器会记住你的选择；跟随系统会随设备外观自动切换。</p>
        </div>
      </div>
      <div className="theme-options" role="group" aria-label="界面外观">
        {(
          [
            { value: "light", label: "日间模式", icon: Sun },
            { value: "dark", label: "夜间模式", icon: Moon },
            { value: "system", label: "跟随系统", icon: Monitor },
          ] as const
        ).map((option) => (
          <button
            type="button"
            key={option.value}
            aria-pressed={preference === option.value}
            onClick={() => setPreference(option.value)}
          >
            <option.icon size={20} />
            <span>{option.label}</span>
            <i />
          </button>
        ))}
      </div>
    </section>
  );
}

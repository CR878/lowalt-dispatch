import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stopChild } from "./stop-child.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const candidates = [
  process.env.AERIS_PYTHON,
  resolve(root, ".venv/Scripts/python.exe"),
  resolve(root, ".venv/bin/python"),
  resolve(root, "../lowalt-dispatch/.venv/Scripts/python.exe"),
];
const python = candidates.find((p) => p && existsSync(p)) || "python";
const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "services.assistant.app:app",
    "--host",
    "127.0.0.1",
    "--port",
    "8012",
    ...(existsSync(resolve(root, "services/assistant/.env"))
      ? ["--env-file", resolve(root, "services/assistant/.env")]
      : []),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PYTHONUTF8: "1" },
    windowsHide: true,
  },
);
child.on("error", () => {
  console.error("无法启动Python。请设置AERIS_PYTHON为虚拟环境中的python路径。");
  process.exitCode = 1;
});
let closing = false;
child.on("exit", (code) => {
  if (!closing) process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void stopChild(child);
  });

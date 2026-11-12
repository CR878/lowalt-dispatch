import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stopChild } from "./stop-child.mjs";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [
  spawn(process.execPath, ["scripts/run-assistant.mjs"], {
    cwd: web,
    stdio: "inherit",
    windowsHide: true,
  }),
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5174",
      "--strictPort",
    ],
    { cwd: web, stdio: "inherit", windowsHide: true },
  ),
];
let closing = false;
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  process.exitCode = code;
  await Promise.all(children.map(stopChild));
}
for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    if (!closing) stop(code ?? 1);
  });
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());

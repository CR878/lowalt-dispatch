import { spawn } from "node:child_process";

// Windows does not propagate child.kill() to Python grandchildren.
// Scope termination to this launcher's own, still-running child process tree.
export async function stopChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return;
  }
  await new Promise((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", () => {
      child.kill("SIGTERM");
      resolve();
    });
    killer.once("exit", resolve);
  });
}

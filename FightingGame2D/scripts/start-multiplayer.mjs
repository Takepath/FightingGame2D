import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
// npm.cmdのWindows依存を避け、NodeからルームサーバーとViteを直接起動する。
const roomServer = spawn(process.execPath, ["server/room-server.mjs"], {
  cwd: projectDirectory,
  stdio: "inherit",
});
const vite = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"],
  {
    cwd: projectDirectory,
    stdio: "inherit",
  },
);

let stopping = false;

function stop(exitCode = 0) {
  /** Ctrl+Cまたは片方の終了時に、2つの子プロセスをまとめて停止する。 */
  if (stopping) return;
  stopping = true;
  roomServer.kill();
  vite.kill();
  process.exitCode = exitCode;
}

process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
vite.on("exit", (code) => {
  if (!stopping) stop(code ?? 1);
});
roomServer.on("exit", (code) => {
  if (!stopping) stop(code ?? 1);
});

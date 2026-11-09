// SPDX-License-Identifier: Apache-2.0
// What the tests' stand-ins for `specty` share: how Windows starts them, and how a test sees their
// `specty ui` stopped there, where no signal reaches it.
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The first line of a stand-in's script: as `specty ui`, it notes its process in `ui.pid`, before
 * anything else, so a test that waits for its call can already see whether it stopped.
 */
export const NOTE_UI_PID = `if (process.argv[2] === "ui") require("node:fs").writeFileSync(require("node:path").join(__dirname, "ui.pid"), String(process.pid));`;

/**
 * Writes the stand-in `specty` in `bin` and gives its path. Windows does not run a script by its
 * first line: there `specty.cmd`, next to it, starts it with Node, as npm installs `specty`.
 */
export async function writeSpecty(bin: string, script: string): Promise<string> {
  const command = join(bin, "specty");
  await writeFile(command, script, { mode: 0o755 });
  await writeFile(join(bin, "specty.cmd"), '@node "%~dp0specty" %*\r\n');
  return command;
}

/**
 * Whether the stand-in's `specty ui` in `bin` was stopped: outside Windows, by the mark it leaves
 * on SIGTERM; on Windows, which ends a process without a signal, because its process is gone.
 */
export function stoppedIn(bin: string, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== "win32") return existsSync(join(bin, "stopped"));
  const noted = join(bin, "ui.pid");
  return existsSync(noted) && !alive(Number(readFileSync(noted, "utf8")));
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

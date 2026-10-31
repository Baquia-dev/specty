// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";

/**
 * Returns the command line binary and argument list to open `url` in the default web browser on
 * `platform`.
 */
export function browserCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): [string, string[]] {
  if (platform === "darwin") return ["open", [url]];
  if (platform === "win32") {
    const cmd = env.ComSpec ?? "cmd.exe";
    return [cmd, ["/c", "start", '""', url]];
  }
  return ["xdg-open", [url]];
}

/**
 * Launches `url` in the default web browser. In test environments (Vitest / NODE_ENV=test), it is a
 * no-op to avoid popping windows during test suites.
 */
export function openInBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.VITEST !== undefined || env.NODE_ENV === "test") return;
  const [command, args] = browserCommand(url, platform, env);
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => undefined);
  child.unref();
}

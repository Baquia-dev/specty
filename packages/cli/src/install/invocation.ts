// SPDX-License-Identifier: Apache-2.0
import { realpath } from "node:fs/promises";
import { execute } from "../io/exec";
import type { Invocation } from "../session";

/**
 * How hooks should call this CLI: `specty` when that command resolves to this very script,
 * `npx -y @baquia-dev/specty` when running from the npx cache, otherwise the absolute script
 * path (machine-specific, so it only goes to local, non-versioned files).
 */
export async function resolveInvocation(
  script: string | undefined,
  cwd: string,
): Promise<Invocation> {
  if (script === undefined) return { command: "specty", portable: true };
  const self = await realpath(script).catch(() => script);
  if (self.includes("/_npx/")) return { command: "npx -y @baquia-dev/specty", portable: true };
  const which = await execute("sh", ["-c", "command -v specty"], { cwd });
  const onPath = which.code === 0 ? await realpath(which.stdout.trim()).catch(() => "") : "";
  if (onPath === self) return { command: "specty", portable: true };
  return { command: `node "${self}"`, portable: false, script: self };
}

// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export default function setup(): void {
  execFileSync("node", ["build.mjs"], { cwd: join(import.meta.dirname, ".."), stdio: "ignore" });
}

// SPDX-License-Identifier: Apache-2.0
import { ADAPTERS } from "../agents";
import type { InstallFiles } from "../install/files";
import type { Session } from "../session";

/**
 * The agents' end-of-turn hook for `specty check --install` (ADR 0012): next to Specty's guard,
 * with the same command, each agent that has an end of turn which sends it back to work gets
 * `specty hook agent-stop <agent>`, where and as its module says (`agents/`). An agent without
 * the guard gets nothing, and one that has the hook, nothing again.
 */

/** Plans the hook into `files`, the plan's files, for each agent whose guard is there. */
export async function agentStopHooks(session: Session, files: InstallFiles): Promise<void> {
  const { root } = session;
  const timeout = session.config.verify.timeoutSec;
  for (const { tool, stop } of Object.values(ADAPTERS)) {
    await stop?.plan({ root, files, timeout, tool });
  }
}

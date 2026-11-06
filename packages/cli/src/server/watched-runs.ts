// SPDX-License-Identifier: Apache-2.0
import type { Session } from "../session";
import { clearRun, readRuns } from "../store/runs";
import type { Run } from "./runs";

/** How often, in milliseconds, the server looks at the tasks' verifications in other processes. */
const TASKS_EVERY = 500;

/**
 * The tasks' verifications that `specty task done` keeps live in other processes, and the full
 * one of `specty accept` (`store/runs.ts`), looked at every half second: `heard` gets each one that moves, and
 * `undefined` once its file is gone. A file whose process no longer exists is removed unseen.
 * `forget` drops what it saw of a change, so that it does not end that change's run again.
 */
export function taskRuns(
  session: Session,
  heard: (id: string, run: Run | undefined) => void,
): { current(id: string): Run | undefined; forget(id: string): void; close(): void } {
  let runs = new Map<string, Run>();
  const said = new Map<string, string>();
  const look = async () => {
    const now = new Map<string, Run>();
    for (const [id, live] of await readRuns(session.git)) {
      if (!alive(live.pid)) {
        await clearRun(session.git, id);
        continue;
      }
      // Without a task it is the full one, which `specty accept` runs.
      const { pid: _pid, ...run } = live;
      now.set(id, run);
    }
    runs = now;
    for (const [id, run] of now) {
      const text = JSON.stringify(run);
      if (said.get(id) !== text) heard(id, run);
      said.set(id, text);
    }
    for (const id of [...said.keys()].filter((known) => !now.has(known))) {
      said.delete(id);
      heard(id, undefined);
    }
  };
  let looking = false;
  const timer = setInterval(() => {
    if (looking) return;
    looking = true;
    look()
      .catch(() => undefined)
      .finally(() => {
        looking = false;
      });
  }, TASKS_EVERY);
  timer.unref();
  return {
    current: (id) => runs.get(id),
    forget: (id) => said.delete(id),
    close: () => clearInterval(timer),
  };
}

/** Whether process `pid` still exists: one that only refuses signals from us does. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

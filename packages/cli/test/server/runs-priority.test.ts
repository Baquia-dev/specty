// SPDX-License-Identifier: Apache-2.0
// Nothing lowers a command once it has started, so the priority the UI's full verification shows
// is the one it was born with: `node:os` is wrapped for the whole file, so this file is apart.
import { getPriority } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { changeRuns, type Run } from "../../src/server/runs";
import {
  AGENT,
  APP,
  CHANGE,
  CONFIG,
  cli,
  read,
  SPEC,
  SPEC_PATH,
  tempRepo,
  writeFiles,
} from "../support";
import { implemented, sessionAt } from "./support";

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  setPriority: () => undefined,
}));

/**
 * Lower than this process's, as `internal.exec.priority` is lower than Specty's, and from 0 to 19
 * as the configuration takes it, even above the normal priority, as on GitHub's macOS runner (AC2).
 */
const LOWER = Math.min(Math.max(getPriority(), 0) + 5, 19);

/** A full verification whose first process, which the shell starts at once, writes its priority. */
const FULL = `node -e "require('fs').writeFileSync('.git/priority-ui', String(require('os').getPriority()))"; true`;

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Waits, in real time, until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (!done()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await wait(20);
  }
}

describe.skipIf(process.platform === "win32")(
  "the UI's full verification in Linux or macOS",
  () => {
    it("AC2: is born at the priority of internal.exec.priority", async () => {
      const config = `${CONFIG()}  full: ${JSON.stringify(FULL)}\ninternal:\n  exec:\n    priority: ${LOWER}\n`;
      const root = await tempRepo({ ...APP, ".specty/config.yaml": config });
      await cli(root, ["new", "Saludo personalizado"]);
      await writeFiles(root, { [SPEC_PATH]: SPEC });
      await cli(root, ["propose"]);
      await implemented(root, "1\n", "2\n");
      const session = await sessionAt(root, AGENT);
      const heard: (Run | undefined)[] = [];
      const runs = changeRuns(session, (id, run) => {
        if (id === CHANGE) heard.push(run);
      });
      try {
        await runs.start(CHANGE);
        // It ends with a `run` of none after its own.
        await until(() => {
          const from = heard.findIndex((run) => run?.command === FULL);
          return from >= 0 && heard.slice(from).includes(undefined);
        });
      } finally {
        runs.close();
      }
      expect(await read(root, ".git/priority-ui")).toBe(String(LOWER));
    });
  },
);

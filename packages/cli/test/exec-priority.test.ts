// SPDX-License-Identifier: Apache-2.0
// Nothing lowers a command once it has started, so the priority it shows is the one it was born
// with: in Linux, a shell that starts its command before it is lowered leaves it where it was.
import { getPriority, tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { execute } from "../src/io/exec";

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  setPriority: () => undefined,
}));

/** A shell line whose first process, which the shell starts at once, prints its priority. */
const PRINTS = `${JSON.stringify(process.execPath)} -e "process.stdout.write(String(require('node:os').getPriority()))"; true`;

/** Lower than this process's, as `internal.exec.priority` is lower than Specty's. */
const LOWER = Math.min(getPriority() + 5, 19);

/** What the first process of `PRINTS` says, run with less priority, at `priority`. */
async function printed(priority: number): Promise<string> {
  const result = await execute(PRINTS, [], {
    cwd: tmpdir(),
    shell: true,
    lowPriority: true,
    priority,
  });
  return result.stdout;
}

describe.skipIf(process.platform === "win32")("a verification in Linux or macOS", () => {
  it("AC1: is born at its priority, and so is a process its shell starts at once", async () => {
    expect(await printed(LOWER)).toBe(String(LOWER));
  });

  it("AC4: runs at Specty's priority when it asks for that one or a higher one", async () => {
    const own = getPriority();
    expect(await printed(own)).toBe(String(own));
    // A higher one even above the normal priority, as on GitHub's macOS runner, at -10 (AC1).
    expect(await printed(own - 5)).toBe(String(own));
  });
});

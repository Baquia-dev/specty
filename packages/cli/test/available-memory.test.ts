// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir, totalmem } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { execute } from "../src/io/exec";
import { availableMemory, vmStatMemory } from "../src/io/memory";

/** What `vm_stat` printed on an Apple silicon Mac, with 16 KiB pages. */
const APPLE = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                   259147.
Pages active:                                 350618.
Pages inactive:                               318001.
Pages speculative:                             30915.
Pages throttled:                                   0.
Pages wired down:                             232082.
Pages purgeable:                                5341.
"Translation faults":                    64665887443.
Pages copy-on-write:                      4958816743.
Pages zero filled:                       20916020070.
Pages reactivated:                        1668893066.
Pages purged:                              124110126.
File-backed pages:                            210672.
Anonymous pages:                              488862.
Pages stored in compressor:                  1656669.
Pages occupied by compressor:                 337276.
Decompressions:                           1637023842.
Compressions:                             1937604213.
Pageins:                                   648328423.
Pageouts:                                    1806124.
Swapins:                                    45553668.
Swapouts:                                   52624276.
`;

/** Its free, file-backed and purgeable pages, by its page size. */
const APPLE_BYTES = (259147 + 210672 + 5341) * 16384;

/** What `vm_stat` prints on an Intel Mac, with 4 KiB pages. */
const INTEL = `Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages free:                                    12000.
Pages active:                                 900000.
Pages inactive:                               400000.
Pages speculative:                              3000.
Pages purgeable:                                 700.
File-backed pages:                            300000.
Anonymous pages:                             1000000.
`;

/** What `process.availableMemory()` gives in the tests that simulate it. */
const SIMULATED = 3 * 1024 ** 3;

/** A folder whose `vm_stat` prints `output` and exits with `code`, and the environment with it first. */
async function fakeVmStat(output: string, code = 0): Promise<NodeJS.ProcessEnv> {
  const bin = join(await mkdtemp(join(tmpdir(), "specty-vm-stat-")), "bin");
  await mkdir(bin);
  const script = join(bin, "vm_stat");
  await writeFile(script, `#!/bin/sh\ncat <<'EOF'\n${output}EOF\nexit ${code}\n`);
  await chmod(script, 0o755);
  return { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ""}` };
}

/** An environment whose `PATH` has no `vm_stat`: an empty folder. */
async function withoutVmStat(): Promise<NodeJS.ProcessEnv> {
  return { ...process.env, PATH: await mkdtemp(join(tmpdir(), "specty-no-vm-stat-")) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the memory a verification counts on", () => {
  it("AC2: is, in vm_stat, the free, file-backed and purgeable pages by its page size", () => {
    expect(vmStatMemory(APPLE)).toBe(APPLE_BYTES);
    expect(vmStatMemory(INTEL)).toBe((12000 + 300000 + 700) * 4096);
  });

  it("AC2: is nothing when vm_stat lacks one of those figures or its page size", () => {
    const without = (line: string) =>
      APPLE.split("\n")
        .filter((each) => !each.startsWith(line))
        .join("\n");
    expect(vmStatMemory(without("Mach Virtual Memory Statistics"))).toBeUndefined();
    expect(vmStatMemory(without("Pages free"))).toBeUndefined();
    expect(vmStatMemory(without("File-backed pages"))).toBeUndefined();
    expect(vmStatMemory(without("Pages purgeable"))).toBeUndefined();
    expect(vmStatMemory("")).toBeUndefined();
    expect(vmStatMemory("vm_stat: command not found\n")).toBeUndefined();
  });

  it.skipIf(process.platform === "win32")(
    "AC2: on macOS, is what vm_stat says, run where it is asked with the environment it is given",
    async () => {
      vi.spyOn(process, "availableMemory").mockReturnValue(SIMULATED);
      const env = await fakeVmStat(APPLE);
      expect(await availableMemory(tmpdir(), env, "darwin")).toBe(APPLE_BYTES);
    },
  );

  it.skipIf(process.platform === "win32")(
    "AC2: on macOS, is process.availableMemory() when vm_stat fails or lacks those figures",
    async () => {
      vi.spyOn(process, "availableMemory").mockReturnValue(SIMULATED);
      expect(await availableMemory(tmpdir(), await withoutVmStat(), "darwin")).toBe(SIMULATED);
      expect(await availableMemory(tmpdir(), await fakeVmStat(APPLE, 1), "darwin")).toBe(SIMULATED);
      expect(await availableMemory(tmpdir(), await fakeVmStat("vm_stat: roto\n"), "darwin")).toBe(
        SIMULATED,
      );
    },
  );

  it("AC2: on another system, is process.availableMemory(), without running vm_stat", async () => {
    vi.spyOn(process, "availableMemory").mockReturnValue(SIMULATED);
    const env = process.platform === "win32" ? process.env : await fakeVmStat(APPLE);
    for (const platform of ["linux", "win32", "freebsd"] as const) {
      expect(await availableMemory(tmpdir(), env, platform), platform).toBe(SIMULATED);
    }
  });

  it.runIf(process.platform === "darwin")(
    "AC2: on this Mac, reads the real vm_stat as some of the machine's memory",
    async () => {
      const read = vmStatMemory((await execute("vm_stat", [], { cwd: tmpdir() })).stdout);
      expect(read).toBeGreaterThan(0);
      expect(read).toBeLessThanOrEqual(totalmem());
      const measured = await availableMemory(tmpdir(), process.env);
      expect(measured).toBeGreaterThan(0);
      expect(measured).toBeLessThanOrEqual(totalmem());
    },
  );
});

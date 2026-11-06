// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Vitest's `globalSetup` for the packages' tests. Everything a run creates with `tmpdir()`, also
 * in the processes its tests start, goes in a folder of its own (`specty-tests-<pid>-…`), which
 * the teardown removes, whether the tests pass or fail. A run that died without its teardown left
 * its folder behind: the next one removes it once that process no longer exists.
 *
 * What must outlive the run, such as the packages an E2E's agent downloads, goes in
 * `SPECTY_TESTS_CACHE`: `specty-tests-cache` in the system's temporary folder, which no run creates
 * nor removes, or the folder already set, as a run that a test starts inherits it.
 *
 * It lives next to `vitest.config.ts`, outside `src/` and `test/`: it is Node code for Vitest, not
 * part of the pure core nor a test. Every unit of `verify.units` that runs tests watches
 * `packages/core/**`, so a change here repeats them all.
 */

/** Where `os.tmpdir()` looks: `TMPDIR` on POSIX, `TEMP` and `TMP` on Windows. */
const KEYS = ["TMPDIR", "TMP", "TEMP"] as const;
const CACHE = "SPECTY_TESTS_CACHE";
const RUN = /^specty-tests-(\d+)-/;

export default function setup(): () => void {
  const system = tmpdir();
  removeAbandoned(system);
  const folder = mkdtempSync(join(system, `specty-tests-${process.pid}-`));
  const before = [...KEYS, CACHE].map((key) => [key, process.env[key]] as const);
  // Vitest starts its workers with the environment as the global setup leaves it.
  for (const key of KEYS) process.env[key] = folder;
  process.env[CACHE] ??= join(system, "specty-tests-cache");
  return () => {
    for (const [key, value] of before) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
    remove(folder);
  };
}

/** Removes the folders of the runs whose process no longer exists. */
function removeAbandoned(system: string): void {
  for (const name of readdirSync(system)) {
    const pid = RUN.exec(name)?.[1];
    if (pid !== undefined && !isRunning(Number(pid))) remove(join(system, name));
  }
}

/** True while `pid` exists, also when it belongs to another user (`EPERM`). */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

/** A process a test left running may still write in it: then the next run removes it. */
function remove(folder: string): void {
  try {
    rmSync(folder, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // Left for the next run, whose sweep finds this process ended.
  }
}

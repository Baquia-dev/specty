// SPDX-License-Identifier: Apache-2.0
// Windows refuses to rename a file over one that another handle has open for a moment, as the
// local server reading a live verification or an antivirus: `rename` is wrapped so its first tries
// fail with the code each test picks, so this file is apart.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { replaceFile } from "../src/io/files";

/** How many tries `rename` still refuses, with which code, and when each try came. */
const refuse = vi.hoisted(() => ({ times: 0, code: "EPERM", at: [] as number[] }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    rename: async (from: string, to: string) => {
      refuse.at.push(Date.now());
      if (refuse.times > 0) {
        refuse.times -= 1;
        throw Object.assign(new Error(`${refuse.code}: rename '${from}' -> '${to}'`), {
          code: refuse.code,
        });
      }
      return fs.rename(from, to);
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  Object.assign(refuse, { times: 0, code: "EPERM", at: [] });
});

/** A temporary file with the new text and the file it replaces, with the old one. */
async function files(): Promise<{ readonly from: string; readonly to: string }> {
  const folder = await mkdtemp(join(tmpdir(), "specty-replace-"));
  const from = join(folder, "estado.json.tmp");
  const to = join(folder, "estado.json");
  await writeFile(from, "nuevo", "utf8");
  await writeFile(to, "viejo", "utf8");
  return { from, to };
}

/**
 * Replaces `to` with `from` on `platform`, while `rename` refuses its first `times` tries with
 * `code`, with fake timers run to the end; gives the error it threw, if any.
 */
async function replacing(
  platform: NodeJS.Platform,
  times: number,
  code: string,
): Promise<{ readonly to: string; readonly error: unknown }> {
  const { from, to } = await files();
  Object.assign(refuse, { times, code });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const done = replaceFile(from, to, platform).then(
    () => undefined,
    (error: unknown) => error,
  );
  await vi.runAllTimersAsync();
  const error = await done;
  return { to, error };
}

/** The milliseconds between each try of `rename` and the one before. */
const gaps = () => refuse.at.slice(1).map((at, index) => at - (refuse.at[index] ?? at));

describe("a file replaced while another handle has it open", () => {
  it("AC1: on Windows, a rename refused with EPERM is tried again after 50, 100, 200, 400 and 800 ms, and the file ends with the new text", async () => {
    const { to, error } = await replacing("win32", 5, "EPERM");
    expect(error).toBeUndefined();
    expect(gaps()).toEqual([50, 100, 200, 400, 800]);
    expect(await readFile(to, "utf8")).toBe("nuevo");
  });

  it.each(["EACCES", "EBUSY"])(
    "AC1: on Windows, a rename refused with %s is tried again too",
    async (code) => {
      const { to, error } = await replacing("win32", 2, code);
      expect(error).toBeUndefined();
      expect(gaps()).toEqual([50, 100]);
      expect(await readFile(to, "utf8")).toBe("nuevo");
    },
  );

  it("AC1: on Windows, throws the last try's error when that one is refused too", async () => {
    const { to, error } = await replacing("win32", 6, "EBUSY");
    expect(error).toMatchObject({ code: "EBUSY" });
    expect(refuse.at).toHaveLength(6);
    expect(await readFile(to, "utf8")).toBe("viejo");
  });

  it.each(["linux", "darwin"] as const)(
    "AC2: on %s, a refused rename throws at once, without waiting",
    async (platform) => {
      const { to, error } = await replacing(platform, 1, "EPERM");
      expect(error).toMatchObject({ code: "EPERM" });
      expect(refuse.at).toHaveLength(1);
      expect(await readFile(to, "utf8")).toBe("viejo");
    },
  );

  it("AC2: on Windows, another error throws at once, without waiting", async () => {
    const { error } = await replacing("win32", 1, "ENOENT");
    expect(error).toMatchObject({ code: "ENOENT" });
    expect(refuse.at).toHaveLength(1);
  });
});

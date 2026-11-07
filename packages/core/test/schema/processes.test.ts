// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "../../src/schema/config";

/** The resolved `verify.processes` of a configuration whose `verify.processes` is `processes`. */
const processesOf = (processes: unknown) => {
  const result = resolveConfig({ version: 1, verify: { processes } });
  return result.ok ? result.config.verify.processes : undefined;
};

/** The keys of the issues of a configuration whose `verify.processes` is `processes`. */
const pathsOf = (processes: unknown) => {
  const result = resolveConfig({ version: 1, verify: { processes } });
  return result.ok ? [] : result.issues.map((issue) => issue.path);
};

describe("verify.processes in the configuration", () => {
  it("AC4: names no variable and counts 512 MiB per process without the keys", () => {
    expect(DEFAULT_CONFIG.verify.processes).toEqual({ env: [], memoryMiB: 512 });
    for (const verify of [undefined, {}, { processes: {} }]) {
      expect(resolveConfig({ version: 1, verify })).toMatchObject({
        ok: true,
        config: { verify: { processes: { env: [], memoryMiB: 512 } } },
      });
    }
    expect(processesOf({ memoryMiB: 768 })).toEqual({ env: [], memoryMiB: 768 });
    expect(processesOf({ env: ["JOBS"] })).toEqual({ env: ["JOBS"], memoryMiB: 512 });
  });

  it("AC4: keeps the variables in order, each a name of letters, digits and _ not starting with a digit", () => {
    const env = ["VITEST_MAX_WORKERS", "_JOBS2", "jobs", "JOBS"];
    expect(processesOf({ env, memoryMiB: 1 })).toEqual({ env, memoryMiB: 1 });
    expect(processesOf({ env: [] })).toEqual({ env: [], memoryMiB: 512 });
  });

  it("AC4: refuses a variable that is not such a name, and an env that is not a list, by its key", () => {
    for (const wrong of ["", "2JOBS", "MAX-WORKERS", "MAX WORKERS", "JOBS=2", "AÑO", 2]) {
      expect(pathsOf({ env: ["JOBS", wrong] }), String(wrong)).toEqual(["verify.processes.env.1"]);
    }
    for (const env of ["VITEST_MAX_WORKERS", 1, null, { JOBS: true }]) {
      expect(pathsOf({ env }), JSON.stringify(env)).toEqual(["verify.processes.env"]);
    }
  });

  it("AC4: refuses a memory per process that is not a whole number of 1 or more, by its key", () => {
    for (const memoryMiB of [0, -1, 1.5, "512", null]) {
      expect(pathsOf({ memoryMiB }), JSON.stringify(memoryMiB)).toEqual([
        "verify.processes.memoryMiB",
      ]);
    }
  });

  it("AC4: refuses another key inside verify.processes, and a processes that is not an object", () => {
    expect(pathsOf({ env: ["JOBS"], slots: 2 })).toEqual(["verify.processes"]);
    for (const processes of [["JOBS"], "JOBS", 4]) {
      expect(pathsOf(processes), JSON.stringify(processes)).toEqual(["verify.processes"]);
    }
  });
});

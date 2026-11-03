// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveConfig } from "../../src";

describe("memory in config.yaml", () => {
  it("AC4: orphanAfterMin is 60 minutes unless the config gives it", () => {
    expect(DEFAULT_CONFIG.memory.orphanAfterMin).toBe(60);
    const plain = resolveConfig({ version: 1 });
    expect(plain.ok && plain.config.memory.orphanAfterMin).toBe(60);
    const given = resolveConfig({ version: 1, memory: { orphanAfterMin: 30 } });
    expect(given.ok && given.config.memory.orphanAfterMin).toBe(30);
  });

  it("AC4: orphanAfterMin must be a positive whole number", () => {
    for (const orphanAfterMin of [0, -5, 1.5, "60"]) {
      const result = resolveConfig({ version: 1, memory: { orphanAfterMin } });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues.map((issue) => issue.path)).toContain("memory.orphanAfterMin");
      }
    }
  });

  it("AC4: memory takes no other key", () => {
    expect(resolveConfig({ version: 1, memory: { orphanAfter: 60 } }).ok).toBe(false);
  });
});

describe("the memory's branch in config.yaml", () => {
  it("AC7: is specty-memory unless the config gives another", () => {
    expect(DEFAULT_CONFIG.memory.branch).toBe("specty-memory");
    const plain = resolveConfig({ version: 1 });
    expect(plain.ok && plain.config.memory.branch).toBe("specty-memory");
    const given = resolveConfig({ version: 1, memory: { branch: "notas/memoria" } });
    expect(given.ok && given.config.memory.branch).toBe("notas/memoria");
  });

  it("AC7: must be a valid branch name outside specty/, where the changes' branches go", () => {
    for (const branch of ["specty/memoria", "con espacio", "a..b", "-x", "x.lock", "x/", "", 3]) {
      const result = resolveConfig({ version: 1, memory: { branch } });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.map((issue) => issue.path)).toContain("memory.branch");
    }
  });
});

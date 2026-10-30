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

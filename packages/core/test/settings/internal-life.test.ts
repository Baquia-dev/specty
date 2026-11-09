// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { SETTINGS, settingOf, settingText } from "../../src/light";
import { DEFAULT_CONFIG, resolveConfig } from "../../src/schema/config";

/** The keys of the issues of `internal`, or none when it is valid. */
const issuesOf = (internal: unknown) => {
  const result = resolveConfig({ version: 1, internal });
  return result.ok ? [] : result.issues.map((issue) => issue.path);
};

const QUEUE = "internal.waits.queueStaleSec";
const INDEXES = "internal.retention.indexHours";
const MARKS = "guarantee.waitMarks";

describe("the queue's and the temporary indexes' lives as internal settings", () => {
  it("AC3: default to today's 30 s and 1 h, with or without the key, and take a value within their limits", () => {
    expect(DEFAULT_CONFIG.internal.waits.queueStaleSec).toBe(30);
    expect(DEFAULT_CONFIG.internal.retention.indexHours).toBe(1);
    expect(resolveConfig({ version: 1, internal: { waits: {}, retention: {} } })).toMatchObject({
      ok: true,
      config: { internal: { waits: { queueStaleSec: 30 }, retention: { indexHours: 1 } } },
    });
    for (const [queueStaleSec, indexHours] of [
      [10, 1],
      [600, 168],
    ]) {
      expect(
        resolveConfig({
          version: 1,
          internal: { waits: { queueStaleSec }, retention: { indexHours } },
        }),
      ).toMatchObject({
        ok: true,
        config: { internal: { waits: { queueStaleSec }, retention: { indexHours } } },
      });
    }
  });

  it("AC3: refuses a queue's life outside 10 to 600 s, an index's outside 1 to 168 h, a fraction or a text, by its key", () => {
    for (const queueStaleSec of [0, 9, 601, 30.5, "30"]) {
      expect(issuesOf({ waits: { queueStaleSec } }), String(queueStaleSec)).toEqual([QUEUE]);
    }
    for (const indexHours of [0, 169, 1.5, "1"]) {
      expect(issuesOf({ retention: { indexHours } }), String(indexHours)).toEqual([INDEXES]);
    }
  });

  it("AC4: puts the two settings in «Interno», new, the queue's in s after `specty wait`'s interval and the indexes' in h after the record's days", () => {
    const keys = SETTINGS.map((setting) => setting.key);
    expect(keys[keys.indexOf("internal.waits.waitIntervalMs") + 1]).toBe(QUEUE);
    expect(keys[keys.indexOf("internal.retention.verifiedDays") + 1]).toBe(INDEXES);
    expect(SETTINGS.find((setting) => setting.key === QUEUE)).toEqual({
      key: QUEUE,
      section: "internal",
      kind: "number",
      unit: "s",
      new: true,
    });
    expect(SETTINGS.find((setting) => setting.key === INDEXES)).toEqual({
      key: INDEXES,
      section: "internal",
      kind: "number",
      unit: "h",
      new: true,
    });
    expect(settingOf(QUEUE.split("."))?.key).toBe(QUEUE);
    expect(settingOf(INDEXES.split("."))?.key).toBe(INDEXES);
  });

  it("AC4: shows the life of specty wait's mark as a guarantee fixed at 30 s, last in «Interno», with no key of config.yaml", () => {
    expect(SETTINGS.at(-1)).toEqual({
      key: MARKS,
      section: "internal",
      kind: "number",
      unit: "s",
      fixed: 30,
      guarantee: true,
    });
    expect(settingOf(MARKS.split("."))).toBeUndefined();
    expect(issuesOf({ waits: { markStaleSec: 60 } })).toEqual(["internal.waits"]);
    expect(settingText(MARKS, "es").description).toContain("30 s");
    expect(settingText(MARKS, "en").description).toContain("30 s");
  });

  it("AC5: names and describes the two settings and the guarantee in Spanish and in English", () => {
    for (const key of [QUEUE, INDEXES, MARKS]) {
      const es = settingText(key, "es");
      const en = settingText(key, "en");
      expect(es.name, key).not.toBe(key);
      expect(en.name, key).not.toBe(key);
      expect(es.name, key).not.toBe(en.name);
      expect(es.description.trim(), key).not.toBe("");
      expect(en.description.trim(), key).not.toBe("");
      expect(es.description, key).not.toBe(en.description);
    }
    expect(settingText(INDEXES, "es").description).toContain("specty prune");
    expect(settingText(INDEXES, "en").description).toContain("specty prune");
  });
});

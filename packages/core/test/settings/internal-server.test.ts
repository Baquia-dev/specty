// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { SETTING_SECTIONS, SETTINGS, settingOf, settingText } from "../../src/light";
import { DEFAULT_CONFIG, resolveConfig } from "../../src/schema/config";

/** The limits of the UI's server that were fixed in the CLI's code: today's value and range. */
const LIMITS = [
  { key: "changesEveryMs", today: 1000, min: 100, max: 60000, unit: "ms" },
  { key: "tasksEveryMs", today: 500, min: 100, max: 60000, unit: "ms" },
  { key: "runLines", today: 1000, min: 100, max: 10000, unit: undefined },
  { key: "runEveryMs", today: 250, min: 50, max: 10000, unit: "ms" },
  { key: "maxBodyKiB", today: 64, min: 64, max: 1024, unit: undefined },
] as const;

/** Today's values, by key of `internal.server`. */
const TODAY = Object.fromEntries(LIMITS.map(({ key, today }) => [key, today]));

/** The keys of the issues of `config.yaml` with `internal.server` as `server`. */
const issuesOf = (server: unknown) => {
  const result = resolveConfig({ version: 1, internal: { server } });
  return result.ok ? [] : result.issues.map((issue) => issue.path);
};

describe("the internal keys of the UI's server", () => {
  it("AC6: are today's values without the keys, and take a whole number within each one's limits", () => {
    expect(DEFAULT_CONFIG.internal.server).toEqual({ portsTried: 20, ...TODAY });
    expect(resolveConfig({ version: 1 })).toMatchObject({
      ok: true,
      config: { internal: { server: { portsTried: 20, ...TODAY } } },
    });
    for (const { key, min, max } of LIMITS) {
      for (const valid of [min, max]) {
        expect(issuesOf({ [key]: valid }), `${key} ${valid}`).toEqual([]);
        expect(
          resolveConfig({ version: 1, internal: { server: { [key]: valid } } }),
          `${key} ${valid}`,
        ).toMatchObject({
          ok: true,
          config: { internal: { server: { portsTried: 20, ...TODAY, [key]: valid } } },
        });
      }
    }
  });

  it("AC6: refuses a value below or above its limits, a fraction or a text, by its key", () => {
    for (const { key, min, max } of LIMITS) {
      for (const invalid of [min - 1, max + 1, min + 0.5, String(min)]) {
        expect(issuesOf({ [key]: invalid }), `${key} ${invalid}`).toEqual([
          `internal.server.${key}`,
        ]);
      }
    }
  });

  it("AC7: shows them in «Interno», the last section, after the ports the UI tries and in order, as new numbers, those of time in ms", () => {
    expect(SETTING_SECTIONS.at(-1)).toBe("internal");
    const internal = SETTINGS.filter((setting) => setting.section === "internal");
    expect(SETTINGS.slice(-internal.length)).toEqual(internal);
    const keys = internal.map((setting) => setting.key);
    const order = LIMITS.map(({ key }) => keys.indexOf(`internal.server.${key}`));
    expect(order[0]).toBeGreaterThan(keys.indexOf("internal.server.portsTried"));
    expect(order).toEqual([...order].sort((one, other) => one - other));
    for (const { key, unit } of LIMITS) {
      const full = `internal.server.${key}`;
      expect(internal.find((setting) => setting.key === full)).toEqual({
        key: full,
        section: "internal",
        kind: "number",
        ...(unit === undefined ? {} : { unit }),
        new: true,
      });
      expect(settingOf(["internal", "server", key])?.key, full).toBe(full);
    }
  });

  it("AC8: names and describes each of them in Spanish and in English, with its limits", () => {
    for (const { key, min, max } of LIMITS) {
      const full = `internal.server.${key}`;
      const es = settingText(full, "es");
      const en = settingText(full, "en");
      for (const text of [es, en]) {
        expect(text.name, full).not.toBe(full);
        expect(text.description, full).toContain(String(min));
        expect(text.description, full).toContain(String(max));
      }
      expect(es.name, full).not.toBe(en.name);
      expect(es.description, full).not.toBe(en.description);
    }
  });
});

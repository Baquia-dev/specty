// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { SETTING_SECTIONS, SETTINGS, settingText } from "../../src/light";
import { DEFAULT_CONFIG, resolveConfig } from "../../src/schema/config";

const KEY = "internal.hooks.antigravityTimeoutSec";

/** The paths of the issues of a configuration whose `internal.hooks` is `hooks`. */
const issuesOf = (hooks: unknown) => {
  const result = resolveConfig({ version: 1, internal: { hooks } });
  return result.ok ? [] : result.issues.map((issue) => issue.path);
};

describe("the time of Antigravity's hooks", () => {
  it("AC4: is 30 s without the key, takes a whole number from 10 to 300 and refuses anything else by its key", () => {
    expect(DEFAULT_CONFIG.internal.hooks.antigravityTimeoutSec).toBe(30);
    expect(resolveConfig({ version: 1 })).toMatchObject({
      ok: true,
      config: { internal: { hooks: { antigravityTimeoutSec: 30 } } },
    });
    expect(resolveConfig({ version: 1, internal: { hooks: {} } })).toMatchObject({
      ok: true,
      config: { internal: { hooks: { antigravityTimeoutSec: 30 } } },
    });
    expect(
      resolveConfig({ version: 1, internal: { hooks: { antigravityTimeoutSec: 60 } } }),
    ).toMatchObject({ ok: true, config: { internal: { hooks: { antigravityTimeoutSec: 60 } } } });
    for (const valid of [10, 30, 300]) {
      expect(issuesOf({ antigravityTimeoutSec: valid }), String(valid)).toEqual([]);
    }
    for (const invalid of [9, 0, -1, 301, 12.5, "30"]) {
      expect(issuesOf({ antigravityTimeoutSec: invalid }), String(invalid)).toEqual([KEY]);
    }
    expect(issuesOf({ claudeTimeoutSec: 30 })).toEqual(["internal.hooks"]);
  });

  it("AC5: shows in «Interno», the last section, as a new number of seconds after the ports the UI tries", () => {
    expect(SETTING_SECTIONS.at(-1)).toBe("internal");
    const internal = SETTINGS.filter((setting) => setting.section === "internal");
    expect(SETTINGS.slice(-internal.length)).toEqual(internal);
    expect(internal.find((setting) => setting.key === KEY)).toEqual({
      key: KEY,
      section: "internal",
      kind: "number",
      unit: "s",
      new: true,
    });
    const keys = internal.map((setting) => setting.key);
    expect(keys.indexOf(KEY)).toBe(keys.indexOf("internal.server.portsTried") + 1);
  });

  it("AC6: names it and says what it does, its limits and that init writes it, in Spanish and in English", () => {
    const es = settingText(KEY, "es");
    const en = settingText(KEY, "en");
    for (const text of [es, en]) {
      expect(text.name).not.toBe(KEY);
      expect(text.name).toContain("Antigravity");
      expect(text.description).toMatch(/10.*300/);
      expect(text.description).toContain("specty init");
    }
    expect(es.name).not.toBe(en.name);
    expect(es.description).not.toBe(en.description);
  });
});

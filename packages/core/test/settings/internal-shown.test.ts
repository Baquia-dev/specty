// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { SETTING_SECTIONS, SETTINGS, settingOf, settingText } from "../../src/light";

/** The settings of what commands and checks show, in the page's order, with their limits. */
const SHOWN = [
  ["internal.findings.perCommand", 10, 1000],
  ["internal.findings.lastLines", 1, 50],
  ["internal.findings.messageChars", 50, 2000],
  ["internal.commands.verifyLines", 5, 200],
  ["internal.commands.whyEntries", 1, 100],
] as const;
const KEYS = SHOWN.map(([key]) => key);

describe("the settings of what commands and checks show", () => {
  it("AC7: puts the five in «Interno», the last section, together and in order, as new numbers with no unit", () => {
    expect(SETTING_SECTIONS.at(-1)).toBe("internal");
    const internal = SETTINGS.filter((setting) => setting.section === "internal");
    expect(SETTINGS.slice(-internal.length)).toEqual(internal);
    const keys = internal.map((setting) => setting.key);
    const first = keys.indexOf(KEYS[0]);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(keys.slice(first, first + KEYS.length)).toEqual(KEYS);
    for (const key of KEYS) {
      expect(
        SETTINGS.find((setting) => setting.key === key),
        key,
      ).toEqual({ key, section: "internal", kind: "number", new: true });
      expect(settingOf(key.split("."))?.key, key).toBe(key);
    }
  });

  it("AC8: names and describes each of them in Spanish and in English, with its limits", () => {
    for (const [key, lowest, highest] of SHOWN) {
      const es = settingText(key, "es");
      const en = settingText(key, "en");
      for (const text of [es, en]) {
        expect(text.name, key).not.toBe(key);
        expect(text.description, key).toMatch(new RegExp(`\\b${lowest}\\b.*\\b${highest}\\b`));
      }
      expect(es.name, key).not.toBe(en.name);
      expect(es.description, key).not.toBe(en.description);
    }
  });
});
